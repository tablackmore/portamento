import { OAuthClient } from '../auth/oauth.js';
import { fetchJson, iso8601DurationToMs } from './http.js';
import { pickBest } from '../matching/score.js';
import type { MatchCandidate } from '../matching/score.js';
import type {
  ImportReport,
  PlaylistSummary,
  PortPlaylist,
  PortTrack,
  ProgressFn,
  ServiceAdapter,
  TrackMatch,
} from '../types.js';

const API = 'https://openapi.tidal.com/v2';
const JSON_API = 'application/vnd.api+json';

export interface TidalConfig {
  clientId: string;
  redirectUri: string;
}

/** Minimal JSON:API shapes for the slices of the TIDAL v2 API we touch. */
interface Resource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: Array<{ id: string; type: string }> | { id: string } }>;
}

interface JsonApiDoc {
  data?: Resource | Resource[];
  included?: Resource[];
  links?: { next?: string };
}

/**
 * TIDAL API v2 adapter (openapi.tidal.com, JSON:API). TIDAL supports direct
 * ISRC lookup — `GET /tracks?filter[isrc]=` — which makes Spotify→Tidal
 * transfers exact rather than fuzzy for almost every commercial release.
 */
export class TidalAdapter implements ServiceAdapter {
  readonly id = 'tidal' as const;
  readonly label = 'TIDAL';
  readonly canExport = true;
  readonly oauth: OAuthClient;
  private countryCode: string | undefined;

  constructor(cfg: TidalConfig) {
    this.oauth = new OAuthClient({
      serviceId: 'tidal',
      clientId: cfg.clientId,
      authorizeUrl: 'https://login.tidal.com/authorize',
      tokenUrl: 'https://auth.tidal.com/v1/oauth2/token',
      redirectUri: cfg.redirectUri,
      scopes: ['user.read', 'playlists.read', 'playlists.write', 'search.read'],
    });
  }

  isConnected(): boolean {
    return this.oauth.isConnected();
  }

  login(): Promise<void> {
    return this.oauth.beginLogin();
  }

  completeLoginRedirect(): Promise<boolean> {
    return this.oauth.completeLoginRedirect();
  }

  logout(): void {
    this.oauth.logout();
  }

  private async country(token: string): Promise<string> {
    if (this.countryCode) return this.countryCode;
    try {
      const me = await fetchJson<JsonApiDoc>(`${API}/users/me`, { accessToken: token });
      const attrs = (me.data as Resource | undefined)?.attributes;
      this.countryCode = typeof attrs?.country === 'string' ? attrs.country : 'US';
    } catch {
      this.countryCode = 'US';
    }
    return this.countryCode;
  }

  async listMyPlaylists(): Promise<PlaylistSummary[]> {
    const token = await this.oauth.getAccessToken();
    const cc = await this.country(token);
    const out: PlaylistSummary[] = [];
    let url: string | null = `${API}/playlists?countryCode=${cc}&filter[owners.id]=me`;
    while (url) {
      const doc: JsonApiDoc = await fetchJson(url, { accessToken: token });
      for (const p of asArray(doc.data)) {
        const a = p.attributes ?? {};
        out.push({
          id: p.id,
          name: typeof a.name === 'string' ? a.name : 'Untitled',
          trackCount: typeof a.numberOfItems === 'number' ? a.numberOfItems : 0,
          ...(typeof a.description === 'string' && a.description
            ? { description: a.description }
            : {}),
        });
      }
      url = nextUrl(doc);
    }
    return out;
  }

  async exportPlaylist(id: string): Promise<PortPlaylist> {
    const token = await this.oauth.getAccessToken();
    const cc = await this.country(token);

    const meta = await fetchJson<JsonApiDoc>(`${API}/playlists/${id}?countryCode=${cc}`, {
      accessToken: token,
    });
    const metaAttrs = (meta.data as Resource | undefined)?.attributes ?? {};

    const tracks: PortTrack[] = [];
    let url: string | null =
      `${API}/playlists/${id}/relationships/items?countryCode=${cc}&include=items,items.artists,items.albums`;
    while (url) {
      const doc: JsonApiDoc = await fetchJson(url, { accessToken: token });
      const included = doc.included ?? [];
      const byKey = new Map(included.map((r) => [`${r.type}:${r.id}`, r]));
      for (const ref of asArray(doc.data)) {
        const res = byKey.get(`${ref.type}:${ref.id}`) ?? byKey.get(`tracks:${ref.id}`);
        if (!res || res.type !== 'tracks') continue;
        tracks.push(tidalTrackToPort(res, byKey));
      }
      url = nextUrl(doc);
    }

    return {
      title: typeof metaAttrs.name === 'string' ? metaAttrs.name : 'Untitled',
      ...(typeof metaAttrs.description === 'string' && metaAttrs.description
        ? { description: metaAttrs.description }
        : {}),
      exportedFrom: 'tidal',
      exportedAt: new Date().toISOString(),
      tracks,
    };
  }

  async importPlaylist(playlist: PortPlaylist, onProgress?: ProgressFn): Promise<ImportReport> {
    const token = await this.oauth.getAccessToken();
    const cc = await this.country(token);
    const total = playlist.tracks.length;

    const matches: TrackMatch[] = [];
    for (const [i, track] of playlist.tracks.entries()) {
      matches.push(await this.matchTrack(track, token, cc));
      onProgress?.(i + 1, total, 'matching');
    }

    onProgress?.(0, 1, 'creating');
    const createBody = {
      data: {
        type: 'playlists',
        attributes: {
          name: playlist.title,
          description: playlist.description ?? 'Imported with Portamento',
          accessType: 'UNLISTED',
        },
      },
    };
    const created = await fetchJson<JsonApiDoc>(`${API}/playlists?countryCode=${cc}`, {
      method: 'POST',
      body: createBody,
      accessToken: token,
      contentType: JSON_API,
    });
    const playlistId = (created.data as Resource | undefined)?.id;
    if (!playlistId) throw new Error('TIDAL did not return an ID for the created playlist.');

    const ids = matches.filter((m) => m.targetId).map((m) => m.targetId!);
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      await fetchJson(`${API}/playlists/${playlistId}/relationships/items?countryCode=${cc}`, {
        method: 'POST',
        body: { data: chunk.map((id) => ({ type: 'tracks', id })) },
        accessToken: token,
        contentType: JSON_API,
      });
      onProgress?.(Math.min(i + 20, ids.length), ids.length, 'adding');
    }

    return {
      playlistId,
      playlistUrl: `https://listen.tidal.com/playlist/${playlistId}`,
      matches,
    };
  }

  private async matchTrack(track: PortTrack, token: string, cc: string): Promise<TrackMatch> {
    if (track.serviceIds.tidal) {
      return {
        track,
        method: 'service-id',
        targetId: track.serviceIds.tidal,
        matchedTitle: track.title,
        confidence: 1,
      };
    }

    if (track.isrc) {
      const doc = await fetchJson<JsonApiDoc>(
        `${API}/tracks?countryCode=${cc}&filter[isrc]=${encodeURIComponent(track.isrc)}&include=artists`,
        { accessToken: token },
      );
      const hit = asArray(doc.data)[0];
      if (hit) {
        return {
          track,
          method: 'isrc',
          targetId: hit.id,
          matchedTitle: describeTidal(hit, includedMap(doc)),
          confidence: 1,
        };
      }
    }

    const query = `${track.title} ${track.artists[0] ?? ''}`.trim();
    const doc = await fetchJson<JsonApiDoc>(
      `${API}/searchResults/${encodeURIComponent(query)}?countryCode=${cc}&include=tracks`,
      { accessToken: token },
    );
    const candidates = (doc.included ?? [])
      .filter((r) => r.type === 'tracks')
      .slice(0, 10)
      .map((r) => tidalCandidate(r));
    const best = pickBest(track, candidates);
    if (best) {
      return {
        track,
        method: 'search',
        targetId: best.candidate.id,
        matchedTitle: best.candidate.title,
        confidence: best.score,
      };
    }
    return { track, method: 'none', confidence: 0 };
  }
}

function asArray(data: JsonApiDoc['data']): Resource[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function nextUrl(doc: JsonApiDoc): string | null {
  const next = doc.links?.next;
  if (!next) return null;
  return next.startsWith('http') ? next : `${API}${next.startsWith('/') ? '' : '/'}${next}`;
}

function includedMap(doc: JsonApiDoc): Map<string, Resource> {
  return new Map((doc.included ?? []).map((r) => [`${r.type}:${r.id}`, r]));
}

function relatedNames(
  res: Resource,
  relation: string,
  type: string,
  byKey: Map<string, Resource>,
): string[] {
  const data = res.relationships?.[relation]?.data;
  const refs = Array.isArray(data) ? data : data ? [data] : [];
  const names: string[] = [];
  for (const ref of refs) {
    const attrs = byKey.get(`${type}:${ref.id}`)?.attributes;
    if (typeof attrs?.name === 'string') names.push(attrs.name);
    else if (typeof attrs?.title === 'string') names.push(attrs.title);
  }
  return names;
}

function tidalTrackToPort(res: Resource, byKey: Map<string, Resource>): PortTrack {
  const a = res.attributes ?? {};
  const durationMs = iso8601DurationToMs(typeof a.duration === 'string' ? a.duration : undefined);
  const artists = relatedNames(res, 'artists', 'artists', byKey);
  const albums = relatedNames(res, 'albums', 'albums', byKey);
  return {
    title: typeof a.title === 'string' ? a.title : 'Unknown',
    artists,
    ...(albums[0] ? { album: albums[0] } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(typeof a.isrc === 'string' && a.isrc ? { isrc: a.isrc.toUpperCase() } : {}),
    serviceIds: { tidal: res.id },
  };
}

function tidalCandidate(res: Resource): MatchCandidate {
  const a = res.attributes ?? {};
  const durationMs = iso8601DurationToMs(typeof a.duration === 'string' ? a.duration : undefined);
  return {
    id: res.id,
    title: typeof a.title === 'string' ? a.title : '',
    artists: [], // search include doesn't resolve artist names; scored neutrally
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

function describeTidal(res: Resource, byKey: Map<string, Resource>): string {
  const title = typeof res.attributes?.title === 'string' ? res.attributes.title : res.id;
  const artists = relatedNames(res, 'artists', 'artists', byKey);
  return artists.length ? `${title} — ${artists.join(', ')}` : title;
}

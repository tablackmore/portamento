import { OAuthClient } from '../auth/oauth.js';
import { fetchJson, ApiError } from './http.js';
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

const API = 'https://api.spotify.com/v1';

export interface SpotifyConfig {
  clientId: string;
  redirectUri: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album?: { name: string };
  duration_ms?: number;
  external_ids?: { isrc?: string };
}

interface Paged<T> {
  items: T[];
  next: string | null;
}

/**
 * Spotify Web API adapter. Note: since Spotify's Feb 2026 policy changes,
 * development-mode apps are capped at 5 authorized users and search results
 * at limit=10, and playlist item endpoints moved from /tracks to /items —
 * this adapter targets the new shapes with fallbacks for the old ones.
 */
export class SpotifyAdapter implements ServiceAdapter {
  readonly id = 'spotify' as const;
  readonly label = 'Spotify';
  readonly canExport = true;
  readonly oauth: OAuthClient;

  constructor(cfg: SpotifyConfig) {
    this.oauth = new OAuthClient({
      serviceId: 'spotify',
      clientId: cfg.clientId,
      authorizeUrl: 'https://accounts.spotify.com/authorize',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      redirectUri: cfg.redirectUri,
      scopes: [
        'playlist-read-private',
        'playlist-read-collaborative',
        'playlist-modify-public',
        'playlist-modify-private',
      ],
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

  async listMyPlaylists(): Promise<PlaylistSummary[]> {
    const token = await this.oauth.getAccessToken();
    const out: PlaylistSummary[] = [];
    let url: string | null = `${API}/me/playlists?limit=50`;
    while (url) {
      const page: Paged<{
        id: string;
        name: string;
        description?: string;
        tracks?: { total?: number };
      }> = await fetchJson(url, { accessToken: token });
      for (const p of page.items) {
        out.push({
          id: p.id,
          name: p.name,
          trackCount: p.tracks?.total ?? 0,
          ...(p.description ? { description: p.description } : {}),
        });
      }
      url = page.next;
    }
    return out;
  }

  async exportPlaylist(id: string): Promise<PortPlaylist> {
    const token = await this.oauth.getAccessToken();
    const meta = await fetchJson<{ name: string; description?: string }>(
      `${API}/playlists/${id}?fields=name,description`,
      { accessToken: token },
    );

    const tracks: PortTrack[] = [];
    let url: string | null = await this.itemsUrl(id, token);
    while (url) {
      const page: Paged<{ track: SpotifyTrack | null }> = await fetchJson(url, {
        accessToken: token,
      });
      for (const item of page.items) {
        // Local files and regionally unavailable tracks come back null/id-less.
        if (!item.track?.id) continue;
        tracks.push(toPortTrack(item.track));
      }
      url = page.next;
    }

    return {
      title: meta.name,
      ...(meta.description ? { description: meta.description } : {}),
      exportedFrom: 'spotify',
      exportedAt: new Date().toISOString(),
      tracks,
    };
  }

  async importPlaylist(playlist: PortPlaylist, onProgress?: ProgressFn): Promise<ImportReport> {
    const token = await this.oauth.getAccessToken();
    const total = playlist.tracks.length;

    const matches: TrackMatch[] = [];
    for (const [i, track] of playlist.tracks.entries()) {
      matches.push(await this.matchTrack(track, token));
      onProgress?.(i + 1, total, 'matching');
    }

    onProgress?.(0, 1, 'creating');
    const created = await this.createPlaylist(playlist, token);

    const ids = matches.filter((m) => m.targetId).map((m) => m.targetId!);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await this.addItems(created.id, chunk, token);
      onProgress?.(Math.min(i + 100, ids.length), ids.length, 'adding');
    }

    return {
      playlistId: created.id,
      playlistUrl: `https://open.spotify.com/playlist/${created.id}`,
      matches,
    };
  }

  private async matchTrack(track: PortTrack, token: string): Promise<TrackMatch> {
    if (track.serviceIds.spotify) {
      return {
        track,
        method: 'service-id',
        targetId: track.serviceIds.spotify,
        matchedTitle: track.title,
        confidence: 1,
      };
    }

    if (track.isrc) {
      const found = await this.searchTracks(`isrc:${track.isrc}`, token);
      const exact = found.find((t) => t.external_ids?.isrc?.toUpperCase() === track.isrc);
      if (exact) {
        return {
          track,
          method: 'isrc',
          targetId: exact.id,
          matchedTitle: describe(exact),
          confidence: 1,
        };
      }
    }

    const query = `${track.title} ${track.artists[0] ?? ''}`.trim();
    const found = await this.searchTracks(query, token);
    const best = pickBest(track, found.map(toCandidate));
    if (best) {
      const matched = found.find((t) => t.id === best.candidate.id)!;
      return {
        track,
        method: 'search',
        targetId: best.candidate.id,
        matchedTitle: describe(matched),
        confidence: best.score,
      };
    }
    return { track, method: 'none', confidence: 0 };
  }

  private async searchTracks(q: string, token: string): Promise<SpotifyTrack[]> {
    // limit=10 is the development-mode maximum since Feb 2026.
    const url = `${API}/search?type=track&limit=10&q=${encodeURIComponent(q)}`;
    const res = await fetchJson<{ tracks?: { items?: SpotifyTrack[] } }>(url, {
      accessToken: token,
    });
    return res.tracks?.items ?? [];
  }

  private async createPlaylist(playlist: PortPlaylist, token: string): Promise<{ id: string }> {
    const body = {
      name: playlist.title,
      description: playlist.description ?? 'Imported with Portamento',
      public: false,
    };
    try {
      return await fetchJson<{ id: string }>(`${API}/me/playlists`, {
        method: 'POST',
        body,
        accessToken: token,
      });
    } catch (e) {
      // Older API surface: create under the explicit user ID.
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        const me = await fetchJson<{ id: string }>(`${API}/me`, { accessToken: token });
        return fetchJson<{ id: string }>(`${API}/users/${me.id}/playlists`, {
          method: 'POST',
          body,
          accessToken: token,
        });
      }
      throw e;
    }
  }

  private async addItems(playlistId: string, ids: string[], token: string): Promise<void> {
    const body = { uris: ids.map((id) => `spotify:track:${id}`) };
    try {
      await fetchJson(`${API}/playlists/${playlistId}/items`, {
        method: 'POST',
        body,
        accessToken: token,
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        await fetchJson(`${API}/playlists/${playlistId}/tracks`, {
          method: 'POST',
          body,
          accessToken: token,
        });
        return;
      }
      throw e;
    }
  }

  private async itemsUrl(playlistId: string, token: string): Promise<string> {
    // Probe the post-2026 /items endpoint; fall back to the classic /tracks.
    const modern = `${API}/playlists/${playlistId}/items?limit=100`;
    try {
      await fetchJson(`${API}/playlists/${playlistId}/items?limit=1`, { accessToken: token });
      return modern;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        return `${API}/playlists/${playlistId}/tracks?limit=100`;
      }
      throw e;
    }
  }
}

function toPortTrack(t: SpotifyTrack): PortTrack {
  return {
    title: t.name,
    artists: t.artists.map((a) => a.name),
    ...(t.album?.name ? { album: t.album.name } : {}),
    ...(t.duration_ms !== undefined ? { durationMs: t.duration_ms } : {}),
    ...(t.external_ids?.isrc ? { isrc: t.external_ids.isrc.toUpperCase() } : {}),
    serviceIds: { spotify: t.id },
  };
}

function toCandidate(t: SpotifyTrack): MatchCandidate {
  return {
    id: t.id,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    ...(t.duration_ms !== undefined ? { durationMs: t.duration_ms } : {}),
  };
}

function describe(t: SpotifyTrack): string {
  return `${t.name} — ${t.artists.map((a) => a.name).join(', ')}`;
}

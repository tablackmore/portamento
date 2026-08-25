import { OAuthClient } from '../auth/oauth.js';
import { fetchJson, ApiError, iso8601DurationToMs } from './http.js';
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
import { QuotaExceededError } from '../types.js';

const API = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeConfig {
  clientId: string;
  redirectUri: string;
}

interface SearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
}

interface VideoItem {
  id: string;
  snippet?: { title?: string; channelTitle?: string };
  contentDetails?: { duration?: string };
}

/**
 * YouTube Data API v3 adapter — import only (matching noisy YouTube videos
 * back to songs is a lost cause, so Portamento never exports from here).
 *
 * Quota reality: search.list gets its own tiny daily bucket (~100 calls) and
 * each playlist insert costs 50 units of a 10k pool, so a default Google
 * Cloud project imports roughly two 50-track playlists per day. That's why
 * the app asks each user for their own (free) Google client ID.
 *
 * Auth uses Google's implicit flow: short-lived tokens, no refresh — fine for
 * an interactive import, and the adapter surfaces expiry as a reconnect.
 */
export class YouTubeAdapter implements ServiceAdapter {
  readonly id = 'youtube' as const;
  readonly label = 'YouTube';
  readonly canExport = false;
  readonly oauth: OAuthClient;

  constructor(cfg: YouTubeConfig) {
    this.oauth = new OAuthClient({
      serviceId: 'youtube',
      clientId: cfg.clientId,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      redirectUri: cfg.redirectUri,
      scopes: ['https://www.googleapis.com/auth/youtube'],
      extraAuthParams: { include_granted_scopes: 'true' },
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

  listMyPlaylists(): Promise<PlaylistSummary[]> {
    return Promise.reject(new Error('YouTube is import-only in Portamento.'));
  }

  exportPlaylist(): Promise<PortPlaylist> {
    return Promise.reject(new Error('YouTube is import-only in Portamento.'));
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
    const created = await this.call<{ id: string }>(`${API}/playlists?part=snippet,status`, {
      method: 'POST',
      accessToken: token,
      body: {
        snippet: {
          title: playlist.title,
          description: playlist.description ?? 'Imported with Portamento',
        },
        status: { privacyStatus: 'private' },
      },
    });

    const ids = matches.filter((m) => m.targetId).map((m) => m.targetId!);
    for (const [i, videoId] of ids.entries()) {
      await this.call(`${API}/playlistItems?part=snippet`, {
        method: 'POST',
        accessToken: token,
        body: {
          snippet: {
            playlistId: created.id,
            resourceId: { kind: 'youtube#video', videoId },
          },
        },
      });
      onProgress?.(i + 1, ids.length, 'adding');
    }

    return {
      playlistId: created.id,
      playlistUrl: `https://www.youtube.com/playlist?list=${created.id}`,
      matches,
    };
  }

  private async matchTrack(track: PortTrack, token: string): Promise<TrackMatch> {
    if (track.serviceIds.youtube) {
      return {
        track,
        method: 'service-id',
        targetId: track.serviceIds.youtube,
        matchedTitle: track.title,
        confidence: 1,
      };
    }

    // No ISRC lookup on YouTube — text search is all there is.
    const query = `${track.title} ${track.artists.join(' ')}`.trim();
    const search = await this.call<{ items?: SearchItem[] }>(
      `${API}/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}`,
      { accessToken: token },
    );
    const videoIds = (search.items ?? []).map((i) => i.id?.videoId).filter((v): v is string => !!v);
    if (videoIds.length === 0) return { track, method: 'none', confidence: 0 };

    // One cheap videos.list call turns noisy search rows into scoreable
    // candidates with real durations (1 quota unit vs search's whole call).
    const details = await this.call<{ items?: VideoItem[] }>(
      `${API}/videos?part=snippet,contentDetails&id=${videoIds.join(',')}`,
      { accessToken: token },
    );
    const candidates: MatchCandidate[] = (details.items ?? []).map((v) => ({
      id: v.id,
      title: v.snippet?.title ?? '',
      // "Artist - Topic" channels are YouTube's auto-generated official audio.
      artists: v.snippet?.channelTitle ? [v.snippet.channelTitle.replace(/ - Topic$/, '')] : [],
      ...(iso8601DurationToMs(v.contentDetails?.duration) !== undefined
        ? { durationMs: iso8601DurationToMs(v.contentDetails?.duration) }
        : {}),
    }));

    // YouTube titles bundle artist + title + noise ("Official Video", etc.),
    // so also try scoring against "artist title" as the candidate title basis.
    const best =
      pickBest(track, candidates) ??
      pickBest({ ...track, title: `${track.artists[0] ?? ''} ${track.title}`.trim() }, candidates);

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

  private async call<T>(url: string, init: Parameters<typeof fetchJson<T>>[1]): Promise<T> {
    try {
      return await fetchJson<T>(url, init);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && /quota/i.test(e.body)) {
        throw new QuotaExceededError('youtube');
      }
      throw e;
    }
  }
}

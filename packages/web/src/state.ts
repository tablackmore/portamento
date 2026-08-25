import {
  SpotifyAdapter,
  TidalAdapter,
  YouTubeAdapter,
  parsePlaylist,
  serializePlaylist,
} from '@portamento/core';
import type { PortPlaylist, ServiceAdapter, ServiceId } from '@portamento/core';

/** Everything Portamento persists lives in the browser: settings in
 *  localStorage, in-flight flow state (surviving OAuth redirects) in
 *  sessionStorage. There is no backend to remember anything. */

export interface Settings {
  spotifyClientId: string;
  tidalClientId: string;
  youtubeClientId: string;
}

const SETTINGS_KEY = 'portamento:settings';
const RESUME_KEY = 'portamento:resume';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw)
      return { spotifyClientId: '', tidalClientId: '', youtubeClientId: '', ...JSON.parse(raw) };
  } catch {
    /* fall through to defaults */
  }
  return { spotifyClientId: '', tidalClientId: '', youtubeClientId: '' };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** The page's own URL, which doubles as the OAuth redirect URI users register. */
export function redirectUri(): string {
  return location.origin + location.pathname;
}

export function buildAdapters(settings: Settings): ServiceAdapter[] {
  const uri = redirectUri();
  return [
    new SpotifyAdapter({ clientId: settings.spotifyClientId, redirectUri: uri }),
    new TidalAdapter({ clientId: settings.tidalClientId, redirectUri: uri }),
    new YouTubeAdapter({ clientId: settings.youtubeClientId, redirectUri: uri }),
  ];
}

export function clientIdFor(settings: Settings, id: ServiceId): string {
  if (id === 'spotify') return settings.spotifyClientId;
  if (id === 'tidal') return settings.tidalClientId;
  if (id === 'youtube') return settings.youtubeClientId;
  return '';
}

/** Flow state that must survive a full-page OAuth round-trip. */
export interface ResumeState {
  view: 'export' | 'import' | 'transfer';
  serviceId?: ServiceId;
  targetId?: ServiceId;
  /** Serialized JSPF, so a playlist loaded from a file/link survives the redirect. */
  playlistJspf?: string;
}

export function saveResume(state: ResumeState & { playlist?: PortPlaylist }): void {
  const { playlist, ...rest } = state;
  const stored: ResumeState = {
    ...rest,
    ...(playlist ? { playlistJspf: serializePlaylist(playlist) } : {}),
  };
  sessionStorage.setItem(RESUME_KEY, JSON.stringify(stored));
}

export function takeResume(): (ResumeState & { playlist?: PortPlaylist }) | null {
  const raw = sessionStorage.getItem(RESUME_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(RESUME_KEY);
  try {
    const stored = JSON.parse(raw) as ResumeState;
    const { playlistJspf, ...rest } = stored;
    return { ...rest, ...(playlistJspf ? { playlist: parsePlaylist(playlistJspf) } : {}) };
  } catch {
    return null;
  }
}

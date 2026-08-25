import type { PortPlaylist, PortTrack, ServiceId } from '../types.js';

/**
 * Portamento's portable playlist file is JSPF — the JSON rendering of the open
 * XSPF playlist standard (https://xspf.org/jspf). Standard fields carry what
 * any XSPF-aware tool can read (title, creator, album, duration, canonical
 * track URLs); a Portamento extension block per track carries the identity
 * metadata that makes exact cross-service matching possible (ISRC + native
 * service IDs).
 */

export const TRACK_EXT_NS = 'https://github.com/portamento/ns/track/1';
export const PLAYLIST_EXT_NS = 'https://github.com/portamento/ns/playlist/1';

export interface JspfTrack {
  location?: string[];
  identifier?: string[];
  title?: string;
  creator?: string;
  album?: string;
  /** Milliseconds, per the XSPF spec. */
  duration?: number;
  extension?: Record<string, unknown[]>;
}

export interface JspfPlaylistBody {
  title?: string;
  creator?: string;
  annotation?: string;
  date?: string;
  track?: JspfTrack[];
  extension?: Record<string, unknown[]>;
}

export interface JspfDocument {
  playlist: JspfPlaylistBody;
}

interface TrackExt {
  isrc?: string;
  artists?: string[];
  serviceIds?: Partial<Record<ServiceId, string>>;
}

interface PlaylistExt {
  exportedFrom?: ServiceId;
  exportedAt?: string;
}

export class JspfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JspfError';
  }
}

const CANONICAL_URL: Record<ServiceId, (id: string) => string> = {
  spotify: (id) => `https://open.spotify.com/track/${id}`,
  tidal: (id) => `https://tidal.com/track/${id}`,
  youtube: (id) => `https://www.youtube.com/watch?v=${id}`,
  apple: (id) => `https://music.apple.com/song/${id}`,
  amazon: (id) => `https://music.amazon.com/tracks/${id}`,
};

const URL_PATTERNS: Array<[ServiceId, RegExp]> = [
  ['spotify', /open\.spotify\.com\/track\/([A-Za-z0-9]+)/],
  ['tidal', /tidal\.com\/(?:browse\/)?track\/(\d+)/],
  ['youtube', /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/],
  ['apple', /music\.apple\.com\/(?:[a-z]{2}\/)?song\/(?:[^/]+\/)?(\d+)/],
  ['amazon', /music\.amazon\.com\/tracks\/([A-Z0-9]+)/],
];

export function toJspf(playlist: PortPlaylist): JspfDocument {
  const playlistExt: PlaylistExt = {};
  if (playlist.exportedFrom) playlistExt.exportedFrom = playlist.exportedFrom;
  if (playlist.exportedAt) playlistExt.exportedAt = playlist.exportedAt;

  return {
    playlist: {
      title: playlist.title,
      ...(playlist.description ? { annotation: playlist.description } : {}),
      ...(playlist.exportedAt ? { date: playlist.exportedAt } : {}),
      creator: 'Portamento',
      ...(Object.keys(playlistExt).length
        ? { extension: { [PLAYLIST_EXT_NS]: [playlistExt] } }
        : {}),
      track: playlist.tracks.map(trackToJspf),
    },
  };
}

function trackToJspf(track: PortTrack): JspfTrack {
  const identifiers = (Object.entries(track.serviceIds) as Array<[ServiceId, string]>).map(
    ([service, id]) => CANONICAL_URL[service](id),
  );
  const ext: TrackExt = {};
  if (track.isrc) ext.isrc = track.isrc;
  if (track.artists.length > 1) ext.artists = track.artists;
  if (Object.keys(track.serviceIds).length) ext.serviceIds = track.serviceIds;

  return {
    title: track.title,
    ...(track.artists.length ? { creator: track.artists.join(', ') } : {}),
    ...(track.album ? { album: track.album } : {}),
    ...(track.durationMs !== undefined ? { duration: Math.round(track.durationMs) } : {}),
    ...(identifiers.length ? { identifier: identifiers } : {}),
    ...(Object.keys(ext).length ? { extension: { [TRACK_EXT_NS]: [ext] } } : {}),
  };
}

export function fromJspf(doc: unknown): PortPlaylist {
  if (typeof doc !== 'object' || doc === null || !('playlist' in doc)) {
    throw new JspfError('Not a JSPF document: missing top-level "playlist" object.');
  }
  const body = (doc as JspfDocument).playlist;
  if (typeof body !== 'object' || body === null) {
    throw new JspfError('Not a JSPF document: "playlist" is not an object.');
  }
  const rawTracks = body.track ?? [];
  if (!Array.isArray(rawTracks)) {
    throw new JspfError('Invalid JSPF: "playlist.track" must be an array.');
  }

  const playlistExt = readExt<PlaylistExt>(body.extension, PLAYLIST_EXT_NS) ?? {};

  return {
    title: typeof body.title === 'string' && body.title.trim() ? body.title : 'Untitled playlist',
    ...(typeof body.annotation === 'string' && body.annotation
      ? { description: body.annotation }
      : {}),
    ...(playlistExt.exportedFrom ? { exportedFrom: playlistExt.exportedFrom } : {}),
    ...(playlistExt.exportedAt ? { exportedAt: playlistExt.exportedAt } : {}),
    tracks: rawTracks.map((t, i) => trackFromJspf(t, i)),
  };
}

function trackFromJspf(raw: unknown, index: number): PortTrack {
  if (typeof raw !== 'object' || raw === null) {
    throw new JspfError(`Invalid JSPF: track #${index + 1} is not an object.`);
  }
  const t = raw as JspfTrack;
  if (typeof t.title !== 'string' || !t.title.trim()) {
    throw new JspfError(`Invalid JSPF: track #${index + 1} has no title.`);
  }

  const ext = readExt<TrackExt>(t.extension, TRACK_EXT_NS) ?? {};

  // Recover native IDs from canonical identifier URLs, so files written by
  // other tools (or by hand) still match exactly when they carry track links.
  const serviceIds: Partial<Record<ServiceId, string>> = { ...(ext.serviceIds ?? {}) };
  for (const url of [...(t.identifier ?? []), ...(t.location ?? [])]) {
    if (typeof url !== 'string') continue;
    for (const [service, pattern] of URL_PATTERNS) {
      const m = pattern.exec(url);
      if (m?.[1] && !serviceIds[service]) serviceIds[service] = m[1];
    }
  }

  const artists =
    ext.artists && ext.artists.length
      ? ext.artists
      : typeof t.creator === 'string' && t.creator.trim()
        ? [t.creator]
        : [];

  return {
    title: t.title,
    artists,
    ...(typeof t.album === 'string' && t.album ? { album: t.album } : {}),
    ...(typeof t.duration === 'number' && t.duration > 0 ? { durationMs: t.duration } : {}),
    ...(typeof ext.isrc === 'string' && ext.isrc ? { isrc: ext.isrc.toUpperCase() } : {}),
    serviceIds,
  };
}

function readExt<T>(extension: Record<string, unknown[]> | undefined, ns: string): T | undefined {
  const entries = extension?.[ns];
  if (Array.isArray(entries) && typeof entries[0] === 'object' && entries[0] !== null) {
    return entries[0] as T;
  }
  return undefined;
}

/** Serialize to pretty-printed JSPF JSON, ready to save as a .jspf file. */
export function serializePlaylist(playlist: PortPlaylist): string {
  return JSON.stringify(toJspf(playlist), null, 2) + '\n';
}

/** Parse text into a PortPlaylist, throwing JspfError with a friendly message on bad input. */
export function parsePlaylist(text: string): PortPlaylist {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new JspfError('That file is not valid JSON.');
  }
  return fromJspf(doc);
}

/** A safe, descriptive filename for a playlist file. */
export function suggestFilename(playlist: PortPlaylist): string {
  const slug =
    playlist.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'playlist';
  return `${slug}.jspf`;
}

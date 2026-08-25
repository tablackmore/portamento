/**
 * The streaming services Portamento's file format knows about. Adapters exist
 * for spotify/tidal/youtube today; 'apple' and 'amazon' are reserved so files
 * can already carry their track IDs (Apple needs a paid developer token,
 * Amazon's API is partner-gated — see the roadmap in the README).
 */
export type ServiceId = 'spotify' | 'tidal' | 'youtube' | 'apple' | 'amazon';

/**
 * A track in service-neutral form. This is what travels inside a .jspf file:
 * enough identity metadata (ISRC above all) to re-find the same recording on
 * another service without guessing.
 */
export interface PortTrack {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  /** International Standard Recording Code — the key to exact cross-service matching. */
  isrc?: string;
  /** Native IDs on services where this track has already been seen. */
  serviceIds: Partial<Record<ServiceId, string>>;
}

/** A playlist in service-neutral form. */
export interface PortPlaylist {
  title: string;
  description?: string;
  exportedFrom?: ServiceId;
  /** ISO 8601 timestamp of the export. */
  exportedAt?: string;
  tracks: PortTrack[];
}

/** A row in a "pick a playlist" listing. */
export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  description?: string;
}

/** How a track was resolved on the destination service. */
export type MatchMethod = 'service-id' | 'isrc' | 'search' | 'none';

export interface TrackMatch {
  track: PortTrack;
  method: MatchMethod;
  /** The destination service's ID for the matched track; absent when method is 'none'. */
  targetId?: string;
  /** Human-readable description of what was matched, for review UIs. */
  matchedTitle?: string;
  /** 1 for exact (ID/ISRC) matches; the similarity score for search matches. */
  confidence: number;
}

/** The outcome of an import: the created playlist plus a per-track account of matching. */
export interface ImportReport {
  playlistId: string;
  playlistUrl?: string;
  matches: TrackMatch[];
}

export type ImportStage = 'matching' | 'creating' | 'adding';
export type ProgressFn = (done: number, total: number, stage: ImportStage) => void;

/**
 * One streaming service, seen through Portamento's eyes.
 *
 * A direct service-to-service transfer is just
 * `target.importPlaylist(await source.exportPlaylist(id))` — the portable
 * playlist is the only thing that crosses the boundary.
 */
export interface ServiceAdapter {
  readonly id: ServiceId;
  readonly label: string;
  /** YouTube is import-only; Spotify and Tidal support both directions. */
  readonly canExport: boolean;
  isConnected(): boolean;
  /** Starts the OAuth flow. Navigates away from the page; the app completes it on reload. */
  login(): Promise<void>;
  /** Finishes a login round-trip on app boot; true when one was completed for this service. */
  completeLoginRedirect(): Promise<boolean>;
  logout(): void;
  listMyPlaylists(): Promise<PlaylistSummary[]>;
  exportPlaylist(id: string): Promise<PortPlaylist>;
  importPlaylist(playlist: PortPlaylist, onProgress?: ProgressFn): Promise<ImportReport>;
}

/** Thrown when an API call needs the user to (re)connect the service. */
export class AuthRequiredError extends Error {
  constructor(serviceId: ServiceId) {
    super(`Not connected to ${serviceId} — please connect the service and try again.`);
    this.name = 'AuthRequiredError';
  }
}

/** Thrown when a service rejects a call with a quota/rate-limit error that retrying won't fix today. */
export class QuotaExceededError extends Error {
  constructor(serviceId: ServiceId, detail?: string) {
    super(
      `${serviceId} daily API quota exhausted${detail ? `: ${detail}` : ''}. ` +
        'Try again tomorrow, or use your own API credentials in Settings.',
    );
    this.name = 'QuotaExceededError';
  }
}

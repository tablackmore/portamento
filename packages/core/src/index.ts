export * from './types.js';
export {
  toJspf,
  fromJspf,
  parsePlaylist,
  serializePlaylist,
  suggestFilename,
  JspfError,
  TRACK_EXT_NS,
  PLAYLIST_EXT_NS,
} from './format/jspf.js';
export type { JspfDocument, JspfTrack } from './format/jspf.js';
export { OAuthClient } from './auth/oauth.js';
export type { OAuthConfig } from './auth/oauth.js';
export { randomString, pkceChallenge, base64UrlEncode } from './auth/pkce.js';
export { scoreCandidate, pickBest, MATCH_THRESHOLD } from './matching/score.js';
export type { MatchCandidate, BestMatch } from './matching/score.js';
export {
  normalize,
  coreTitle,
  textSimilarity,
  diceCoefficient,
  tokenSet,
} from './matching/normalize.js';
export { ApiError, iso8601DurationToMs } from './services/http.js';
export { SpotifyAdapter } from './services/spotify.js';
export type { SpotifyConfig } from './services/spotify.js';
export { TidalAdapter } from './services/tidal.js';
export type { TidalConfig } from './services/tidal.js';
export { YouTubeAdapter } from './services/youtube.js';
export type { YouTubeConfig } from './services/youtube.js';
export {
  playlistToShareFragment,
  playlistToShareUrl,
  playlistFromShareFragment,
  SHARE_URL_COMFORT_LIMIT,
} from './format/share.js';

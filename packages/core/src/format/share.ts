import { fromJspf, toJspf, JspfError } from './jspf.js';
import { base64UrlEncode } from '../auth/pkce.js';
import type { PortPlaylist } from '../types.js';

/**
 * Backend-free playlist sharing: the whole playlist rides inside the URL
 * fragment, deflate-compressed and base64url-encoded. Fragments are never
 * sent to any server, so the link IS the data — nothing is stored anywhere.
 *
 * Fragment shape: `#p=1.<base64url(deflate-raw(JSPF JSON))>` — the leading
 * `1` is a format version so future encodings can coexist.
 */

const FRAGMENT_PARAM = 'p';
const VERSION = '1';

/** Links longer than this are flagged so UIs can suggest the file instead. */
export const SHARE_URL_COMFORT_LIMIT = 30_000;

export async function playlistToShareFragment(playlist: PortPlaylist): Promise<string> {
  const json = JSON.stringify(toJspf(playlist));
  const compressed = await deflate(new TextEncoder().encode(json));
  return `${FRAGMENT_PARAM}=${VERSION}.${base64UrlEncode(compressed)}`;
}

/** Full shareable URL for a playlist, on top of the app's own URL. */
export async function playlistToShareUrl(playlist: PortPlaylist, appUrl: string): Promise<string> {
  const base = appUrl.replace(/#.*$/, '');
  return `${base}#${await playlistToShareFragment(playlist)}`;
}

/**
 * Decode a playlist from a location.hash (with or without the leading '#').
 * Returns null when the hash simply isn't a share link; throws JspfError when
 * it is one but is corrupted.
 */
export async function playlistFromShareFragment(hash: string): Promise<PortPlaylist | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const value = params.get(FRAGMENT_PARAM);
  if (!value) return null;

  const dot = value.indexOf('.');
  const version = dot === -1 ? '' : value.slice(0, dot);
  if (version !== VERSION) {
    throw new JspfError(
      `This share link uses format version "${version || '?'}", which this build cannot read.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(value.slice(dot + 1));
  } catch {
    throw new JspfError('This share link is damaged (invalid encoding).');
  }
  let json: string;
  try {
    json = new TextDecoder().decode(await inflate(bytes));
  } catch {
    throw new JspfError('This share link is damaged (corrupt compressed data).');
  }
  try {
    return fromJspf(JSON.parse(json));
  } catch (e) {
    if (e instanceof JspfError) throw e;
    throw new JspfError('This share link is damaged (invalid playlist data).');
  }
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(data, new CompressionStream('deflate-raw'));
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(data, new DecompressionStream('deflate-raw'));
}

async function pipeThrough(
  data: Uint8Array,
  transform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(transform);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

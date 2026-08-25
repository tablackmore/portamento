/** Fetch helper shared by all adapters: JSON in/out, useful errors, polite 429 retry. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`API request failed (${status}) for ${url}${body ? `: ${body.slice(0, 300)}` : ''}`);
    this.name = 'ApiError';
  }
}

export interface JsonRequestInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  accessToken?: string;
  /** Content type for the body; JSON:API endpoints (Tidal) need a vendor type. */
  contentType?: string;
}

const MAX_429_RETRIES = 2;

export async function fetchJson<T>(url: string, init: JsonRequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { ...init.headers };
    if (init.accessToken) headers['Authorization'] = `Bearer ${init.accessToken}`;
    if (init.body !== undefined) headers['Content-Type'] = init.contentType ?? 'application/json';

    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 1);
      await sleep(Math.min(retryAfter, 10) * 1000);
      continue;
    }
    if (!res.ok) {
      throw new ApiError(res.status, url, await res.text().catch(() => ''));
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse an ISO 8601 duration ("PT3M52S") into milliseconds; undefined when unparseable. */
export function iso8601DurationToMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!m) return undefined;
  const [, h, min, s] = m;
  if (!h && !min && !s) return undefined;
  return Math.round((Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0)) * 1000);
}

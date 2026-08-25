import { pkceChallenge, randomString } from './pkce.js';
import { AuthRequiredError } from '../types.js';
import type { ServiceId } from '../types.js';

export interface OAuthConfig {
  serviceId: ServiceId;
  clientId: string;
  authorizeUrl: string;
  /** Token endpoint for the code+PKCE flow. Omit to use the implicit (token-in-fragment) flow. */
  tokenUrl?: string;
  scopes: string[];
  redirectUri: string;
  extraAuthParams?: Record<string, string>;
}

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms after which accessToken is stale. */
  expiresAt: number;
}

interface PendingLogin {
  serviceId: ServiceId;
  state: string;
  verifier?: string;
}

const PENDING_KEY = 'portamento:oauth:pending';

/**
 * Browser-side OAuth for a static site: code+PKCE when a token endpoint is
 * configured (Spotify, Tidal), implicit flow otherwise (Google). Login
 * navigates away; call `completeLoginRedirect` on app boot to finish.
 */
export class OAuthClient {
  private readonly storageKey: string;

  constructor(private readonly cfg: OAuthConfig) {
    this.storageKey = `portamento:token:${cfg.serviceId}`;
  }

  /** Which service, if any, has a login round-trip in flight. */
  static pendingServiceId(): ServiceId | null {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as PendingLogin).serviceId;
    } catch {
      return null;
    }
  }

  async beginLogin(): Promise<void> {
    if (!this.cfg.clientId) {
      throw new Error(`No client ID configured for ${this.cfg.serviceId}.`);
    }
    const state = randomString(24);
    const pending: PendingLogin = { serviceId: this.cfg.serviceId, state };

    const url = new URL(this.cfg.authorizeUrl);
    url.searchParams.set('client_id', this.cfg.clientId);
    url.searchParams.set('redirect_uri', this.cfg.redirectUri);
    url.searchParams.set('scope', this.cfg.scopes.join(' '));
    url.searchParams.set('state', state);

    if (this.cfg.tokenUrl) {
      const verifier = randomString(64);
      pending.verifier = verifier;
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('code_challenge', await pkceChallenge(verifier));
    } else {
      url.searchParams.set('response_type', 'token');
    }
    for (const [k, v] of Object.entries(this.cfg.extraAuthParams ?? {})) {
      url.searchParams.set(k, v);
    }

    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    location.assign(url.toString());
  }

  /**
   * Finish a login round-trip if the current URL carries one for this service.
   * Returns true when a login was completed. Cleans the URL either way.
   */
  async completeLoginRedirect(): Promise<boolean> {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    let pending: PendingLogin;
    try {
      pending = JSON.parse(raw) as PendingLogin;
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
      return false;
    }
    if (pending.serviceId !== this.cfg.serviceId) return false;

    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const params = this.cfg.tokenUrl ? query : fragment;

    const state = params.get('state');
    const error = params.get('error');
    if (!state && !error) return false; // not our redirect

    sessionStorage.removeItem(PENDING_KEY);
    cleanRedirectParamsFromUrl();

    if (error) throw new Error(`${this.cfg.serviceId} login failed: ${error}`);
    if (state !== pending.state) {
      throw new Error(`${this.cfg.serviceId} login failed: state mismatch (possible CSRF).`);
    }

    if (this.cfg.tokenUrl) {
      const code = params.get('code');
      if (!code || !pending.verifier) {
        throw new Error(`${this.cfg.serviceId} login failed: no authorization code returned.`);
      }
      await this.exchangeCode(code, pending.verifier);
    } else {
      const accessToken = params.get('access_token');
      const expiresIn = Number(params.get('expires_in') ?? 3600);
      if (!accessToken) {
        throw new Error(`${this.cfg.serviceId} login failed: no access token returned.`);
      }
      this.store({ accessToken, expiresAt: Date.now() + expiresIn * 1000 });
    }
    return true;
  }

  private async exchangeCode(code: string, verifier: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
      client_id: this.cfg.clientId,
      code_verifier: verifier,
    });
    const token = await this.tokenRequest(body);
    this.store(token);
  }

  private async tokenRequest(body: URLSearchParams): Promise<StoredToken> {
    const res = await fetch(this.cfg.tokenUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${this.cfg.serviceId} token request failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: json.access_token,
      ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
      // Refresh a minute early so in-flight requests never race expiry.
      expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000,
    };
  }

  /** A currently-valid access token, refreshing behind the scenes when possible. */
  async getAccessToken(): Promise<string> {
    const token = this.load();
    if (!token) throw new AuthRequiredError(this.cfg.serviceId);
    if (Date.now() < token.expiresAt) return token.accessToken;

    if (token.refreshToken && this.cfg.tokenUrl) {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: this.cfg.clientId,
      });
      try {
        const fresh = await this.tokenRequest(body);
        // Some providers rotate refresh tokens, some omit them on refresh.
        if (!fresh.refreshToken && token.refreshToken) fresh.refreshToken = token.refreshToken;
        this.store(fresh);
        return fresh.accessToken;
      } catch {
        this.logout();
        throw new AuthRequiredError(this.cfg.serviceId);
      }
    }
    this.logout();
    throw new AuthRequiredError(this.cfg.serviceId);
  }

  isConnected(): boolean {
    const token = this.load();
    return !!token && (Date.now() < token.expiresAt || !!token.refreshToken);
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
  }

  private store(token: StoredToken): void {
    localStorage.setItem(this.storageKey, JSON.stringify(token));
  }

  private load(): StoredToken | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredToken;
    } catch {
      return null;
    }
  }
}

function cleanRedirectParamsFromUrl(): void {
  history.replaceState(
    null,
    '',
    location.pathname +
      (location.hash && !location.hash.includes('access_token') ? location.hash : ''),
  );
}

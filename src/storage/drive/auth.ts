// driveAuth — the GIS token-model auth spine (RESEARCH ## Pattern 1, ## Security Domain V3).
//
// The single most sensitive runtime secret is the Drive access token. The non-negotiable
// rules this module enforces:
//   1. IN-MEMORY ONLY — the token lives in a module variable, NEVER in IndexedDB/localStorage.
//      There is no refresh token and no PKCE for a pure SPA; re-acquisition on a user gesture
//      IS the model, not a fallback (T-06-01).
//   2. drive.file SCOPE ONLY — least privilege; the app can only touch files it created.
//      Never broad `drive`, never `appDataFolder` (T-06-02).
//   3. NON-DESTRUCTIVE EXPIRY — `getValidToken()` returns null inside a 60s skew of expiry and
//      callers must NOT auto-pop consent mid-write; on 401/expiry the UI shows a Reconnect
//      prompt and re-requests only on the user's click (T-06-03).
//
// The GIS global (`window.google.accounts.oauth2`) is installed by the gsi/client script in
// index.html. In tests it is mocked; when absent at runtime, `connect()` rejects with a clear
// "GIS not loaded" error rather than throwing an opaque TypeError.

import type {
  GisErrorResponse,
  GisTokenClient,
  GisTokenResponse,
} from './gis';

/** The ONLY OAuth scope this app ever requests — least privilege (T-06-02). */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Skew (ms) before the real expiry at which we treat the token as already stale. */
const EXPIRY_SKEW_MS = 60_000;

/** Thrown by the REST layer on a 401; drives the non-destructive Reconnect flow. */
export class TokenExpiredError extends Error {
  constructor(message = 'Drive access token expired or invalid (401)') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

interface InMemoryToken {
  value: string;
  /** Epoch ms at which the token expires. */
  expiresAt: number;
}

/** Listener invoked whenever the token transitions to "needs reconnect" (expiry/401/revoke). */
type ExpiryListener = () => void;

// --- Module-scoped, IN-MEMORY ONLY state. Never persisted. --------------------------------
let token: InMemoryToken | null = null;
let tokenClient: GisTokenClient | null = null;
const expiryListeners = new Set<ExpiryListener>();

/** Resolve the GIS oauth2 object or throw a clear error if the script hasn't loaded. */
function gisOAuth2() {
  const oauth2 = globalThis.window?.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error(
      'Google Identity Services not loaded — the gsi/client script is unavailable.',
    );
  }
  return oauth2;
}

/** Read the configured OAuth Client ID from the build-time env (may be undefined in dev/CI). */
export function getClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

/** True when a Client ID is configured (SETUP.md prerequisite satisfied). */
export function isConfigured(): boolean {
  return !!getClientId();
}

/** Lazily build (once) the GIS token client bound to drive.file scope only. */
function ensureTokenClient(onToken: (resp: GisTokenResponse) => void, onError: (err: GisErrorResponse) => void): GisTokenClient {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured — see SETUP.md.');
  }
  // Rebuild each connect so the latest callbacks (tied to the current promise) are used.
  tokenClient = gisOAuth2().initTokenClient({
    client_id: clientId,
    scope: DRIVE_FILE_SCOPE,
    callback: onToken,
    error_callback: onError,
  });
  return tokenClient;
}

/**
 * Acquire an access token. MUST be called from a user gesture (button click) — GIS requires
 * it for the consent popup. Resolves with the token value, rejects if the user dismisses the
 * popup or no grant is given. The token is stored in memory only.
 *
 * `silent: true` passes `prompt: ''` to attempt a re-grant without re-showing consent while a
 * grant is still active (RESEARCH A1 — not a guaranteed background refresh; still gesture-driven).
 */
export function connect(options: { silent?: boolean } = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const client = ensureTokenClient(
      (resp) => {
        if (settled) return;
        settled = true;
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'No access token granted'));
          return;
        }
        const expiresIn = typeof resp.expires_in === 'number' ? resp.expires_in : 3599;
        token = { value: resp.access_token, expiresAt: Date.now() + expiresIn * 1000 };
        resolve(resp.access_token);
      },
      (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(err.message || err.type || 'Drive authorization was cancelled'));
      },
    );
    client.requestAccessToken(options.silent ? { prompt: '' } : undefined);
  });
}

/**
 * Return the current token value ONLY if it is present and not within the expiry skew window;
 * otherwise null. Callers treat null as "must reconnect" and MUST NOT auto-pop consent.
 */
export function getValidToken(): string | null {
  if (!token) return null;
  if (Date.now() >= token.expiresAt - EXPIRY_SKEW_MS) return null;
  return token.value;
}

/** True when a usable (non-stale) token is held in memory. */
export function isConnected(): boolean {
  return getValidToken() !== null;
}

/**
 * Drop the in-memory token and notify expiry listeners. Called by the REST layer on a 401 and
 * by `connect()`'s expiry handling. Does NOT revoke server-side — that is `revoke()`.
 */
export function markExpired(): void {
  token = null;
  for (const listener of expiryListeners) listener();
}

/** Subscribe to token-expiry transitions (the Reconnect banner uses this). Returns an unsubscribe. */
export function onExpiry(listener: ExpiryListener): () => void {
  expiryListeners.add(listener);
  return () => expiryListeners.delete(listener);
}

/**
 * Revoke the token server-side (GIS) and clear it from memory. Used on explicit Disconnect.
 * Resolves once GIS confirms (or immediately if there is nothing to revoke).
 */
export function revoke(): Promise<void> {
  return new Promise<void>((resolve) => {
    const current = token?.value;
    token = null;
    if (!current) {
      resolve();
      return;
    }
    try {
      gisOAuth2().revoke(current, () => resolve());
    } catch {
      // Even if GIS is unavailable, the token is already cleared from memory.
      resolve();
    }
  });
}

/** Test-only: reset all module state between cases. Not used by production code. */
export function __resetForTests(): void {
  token = null;
  tokenClient = null;
  expiryListeners.clear();
}

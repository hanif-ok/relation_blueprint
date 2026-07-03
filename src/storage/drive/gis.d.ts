// Minimal ambient types for the Google Identity Services (GIS) token-model global that the
// `https://accounts.google.com/gsi/client` script (loaded in index.html) installs on
// `window`. We type ONLY the token-client surface we use (RESEARCH ## Pattern 1) — the OAuth
// token model, never the deprecated `gapi.auth2` / Sign-In legacy API.

/** The token response GIS hands the `callback` after a successful grant. */
export interface GisTokenResponse {
  access_token?: string;
  /** Seconds until the token expires (~3599). */
  expires_in?: number;
  scope?: string;
  token_type?: string;
  /** Present (instead of `access_token`) when something went wrong. */
  error?: string;
  error_description?: string;
}

/** The error object passed to `error_callback` when the user closes the popup / denies. */
export interface GisErrorResponse {
  type?: string;
  message?: string;
}

export interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (resp: GisTokenResponse) => void;
  error_callback?: (err: GisErrorResponse) => void;
}

export interface GisTokenClient {
  /**
   * The interactive grant (no overrides) MUST be invoked from a user gesture and opens the consent
   * popup. `prompt: 'none'` is the non-interactive path — a hidden-iframe re-grant with NO popup,
   * safe to call without a gesture; it errors (via `error_callback`) instead of prompting.
   */
  requestAccessToken(overrides?: { prompt?: string }): void;
}

export interface GisOAuth2 {
  initTokenClient(config: GisTokenClientConfig): GisTokenClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GisOAuth2;
      };
    };
  }
}

export {};

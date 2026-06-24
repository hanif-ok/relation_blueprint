/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * The Google OAuth 2.0 Client ID (a public client identifier, not a secret) used by the
   * GIS token client. Unset in dev/CI until the human completes the SETUP.md prerequisite;
   * the Connect UI degrades to a clear "not configured" state rather than crashing.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /**
   * `'true'` only in the dedicated E2E preview build (`vite build --mode e2e`). Gates
   * `installTestBridge()` so the mutable window.__rb DB bridge is tree-shaken out of production
   * (WR-01). Unset/any-other-value in dev and production builds.
   */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

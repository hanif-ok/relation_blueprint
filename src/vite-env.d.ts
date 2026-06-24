/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * The Google OAuth 2.0 Client ID (a public client identifier, not a secret) used by the
   * GIS token client. Unset in dev/CI until the human completes the SETUP.md prerequisite;
   * the Connect UI degrades to a clear "not configured" state rather than crashing.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// providerFactory — the single point where the app picks its active StorageProvider.
//
// In Phase 1 there is exactly one real backend (Google Drive). The factory exists so that
// nothing downstream (the sync engine, the connect UI) ever imports a concrete provider
// directly: they ask the factory and program to the StorageProvider interface only.
//
// PHASE-6 SEAM: Mega.nz arrives as a second provider behind THIS factory (megajs browser
// build). When it lands, `getActiveProvider` switches on the user's selected provider — a
// persisted preference — and returns a `MegaProvider` that implements the same interface.
// Until then, Drive is the only option and the function takes no argument.

import type { StorageProvider } from './StorageProvider';
import { DriveProvider } from './drive/DriveProvider';

/** The provider kinds the factory can return. Mega is added in Phase 6. */
export type ProviderKind = 'drive' /* | 'mega' (Phase 6) */;

// A single shared instance is sufficient — the provider holds no per-call state (the access
// token lives in the `auth` module, not the provider).
let driveProvider: DriveProvider | null = null;

/**
 * Return the active StorageProvider. In Phase 1 this is always the DriveProvider. The optional
 * `kind` argument is the Phase-6 seam (defaults to 'drive').
 */
export function getActiveProvider(kind: ProviderKind = 'drive'): StorageProvider {
  switch (kind) {
    case 'drive':
    default:
      if (!driveProvider) driveProvider = new DriveProvider();
      return driveProvider;
    // case 'mega': return getMegaProvider();   // Phase 6
  }
}

/** Test-only: clear the cached instance between cases. */
export function __resetForTests(): void {
  driveProvider = null;
}

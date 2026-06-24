import { useCallback, useState } from 'react';

/**
 * usePersistentStorage — requests persistent local storage AFTER a meaningful user action
 * (RESEARCH ## Code Examples / Pitfall 5), captures the boolean result, and surfaces an
 * eviction warning when persistence is NOT granted.
 *
 * Why "after a user action" and not on load: `navigator.storage.persist()` is best-effort
 * and browsers weight the grant on engagement signals; calling it on module load wastes the
 * request and ignores the result (Pitfall 5). The hook exposes `requestPersistence()` which
 * the app calls from a real action — e.g. the first person created or the first Drive
 * connect — and then reports `granted` + the warning note.
 *
 * The warning note copy is the UI-SPEC S6 line shown when persistence is denied:
 *   "Your device may clear offline data when storage is low. Export backups regularly."
 */

const EVICTION_WARNING =
  'Your device may clear offline data when storage is low. Export backups regularly.';

export type StorageEstimate = {
  /** Bytes currently used by this origin, if the browser reports it. */
  usage?: number;
  /** Total bytes available to this origin, if the browser reports it. */
  quota?: number;
};

export type PersistentStorageState = {
  /**
   * `null` until `requestPersistence()` has run; then the boolean result of
   * `navigator.storage.persist()` (or `false` when the API is unavailable).
   */
  granted: boolean | null;
  /**
   * The eviction-warning note to display, or `null` when persistence is granted (or not
   * yet requested). Surfaced as a one-time muted note (UI-SPEC S6).
   */
  warning: string | null;
  /** Latest result of `navigator.storage.estimate()`, or `null` if unavailable. */
  estimate: StorageEstimate | null;
  /**
   * Request persistent storage. MUST be called from a meaningful user action. Returns the
   * granted boolean. Safe to call when the API is missing (resolves `false`). Handles
   * `QuotaExceededError` gracefully.
   */
  requestPersistence: () => Promise<boolean>;
};

export function usePersistentStorage(): PersistentStorageState {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);

  const requestPersistence = useCallback(async (): Promise<boolean> => {
    // Feature-detect: older browsers / non-secure contexts lack the Storage Manager.
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      setGranted(false);
      setWarning(EVICTION_WARNING);
      return false;
    }

    let isGranted = false;
    try {
      isGranted = await navigator.storage.persist();
    } catch (err) {
      // QuotaExceededError (or any failure) is non-fatal: treat as not-granted and warn.
      // The cloud sync + export are the backstops if eviction happens anyway (Pitfall 5).
      if (!(err instanceof DOMException && err.name === 'QuotaExceededError')) {
        // Surface unexpected errors for diagnosis without breaking the flow.
        console.warn('storage.persist() failed', err);
      }
      isGranted = false;
    }

    setGranted(isGranted);
    setWarning(isGranted ? null : EVICTION_WARNING);

    // Opportunistically capture a quota estimate for the storage note (best-effort).
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        setEstimate({ usage: est.usage, quota: est.quota });
      } catch {
        // estimate() is informational only; ignore failures.
        setEstimate(null);
      }
    }

    return isGranted;
  }, []);

  return { granted, warning, estimate, requestPersistence };
}

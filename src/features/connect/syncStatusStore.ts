// syncStatusStore — the single observable source of the Drive connection/sync state the UI
// chrome reflects (UI-SPEC ## Semantic sync states). It is deliberately tiny and framework-
// agnostic (a subscribe/get store) so `useSyncStatus` can wrap it with useSyncExternalStore
// and so the connect flow / sync loop can push transitions into it without React imports.
//
// The six semantic states (UI-SPEC S9):
//   not-connected | syncing | synced | offline | reconnect | error
//
// Derivation rule (computed in `useSyncStatus`, not stored): offline (navigator.onLine===false)
// dominates the informational view, but a pending reconnect/error is preserved so the banner
// and pill stay actionable the moment connectivity returns.

export type SyncPhase =
  | 'not-connected'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'reconnect'
  | 'error';

export interface SyncStatusState {
  /** Whether a valid in-memory token + active provider exist. */
  connected: boolean;
  /** A push/reconcile is in flight. */
  syncing: boolean;
  /** Token expired / 401 — a non-destructive Reconnect is required. */
  needsReconnect: boolean;
  /** Last sync error message (non-auth), if any. */
  error: string | null;
  /** Epoch ms of the last successful sync (for the "synced 2m ago" tooltip). */
  lastSyncedAt: number | null;
}

const initial: SyncStatusState = {
  connected: false,
  syncing: false,
  needsReconnect: false,
  error: null,
  lastSyncedAt: null,
};

let state: SyncStatusState = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Subscribe to state changes. Returns an unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current immutable snapshot (stable reference until the next `set`). */
export function getSnapshot(): SyncStatusState {
  return state;
}

/** Merge a partial update and notify. */
export function set(patch: Partial<SyncStatusState>): void {
  state = { ...state, ...patch };
  emit();
}

// --- Intent-revealing transitions the connect flow / sync loop call -------------------------

export function markConnected(): void {
  set({ connected: true, needsReconnect: false, error: null });
}

export function markDisconnected(): void {
  set({ connected: false, syncing: false, needsReconnect: false, error: null, lastSyncedAt: null });
}

export function markSyncing(): void {
  set({ syncing: true, error: null });
}

export function markSynced(): void {
  set({ syncing: false, error: null, lastSyncedAt: Date.now() });
}

/** Token expiry / 401 — non-destructive; the app stays usable offline. */
export function markNeedsReconnect(): void {
  set({ syncing: false, needsReconnect: true });
}

export function markError(message: string): void {
  set({ syncing: false, error: message });
}

/** Test-only reset. */
export function __resetForTests(): void {
  state = initial;
  listeners.clear();
}

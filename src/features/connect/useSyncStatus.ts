// useSyncStatus — React hook that resolves the raw connection/sync store into ONE of the six
// UI-SPEC semantic states (S9) plus the data the pill/banner render. It composes three inputs:
//   1. the syncStatusStore (connected / syncing / needsReconnect / error / lastSyncedAt)
//   2. driveAuth.onExpiry (a 401/expiry flips needsReconnect even if the store missed it)
//   3. navigator.onLine (offline is shown when there is no connectivity and no pending action)
//
// Priority of the resolved phase (most urgent first):
//   reconnect > error > offline > syncing > synced > not-connected
// Reconnect/error stay actionable while offline so the banner and pill don't vanish the moment
// the network drops — the user can still see "your work is saved locally".

import { useEffect, useSyncExternalStore } from 'react';
import { onExpiry } from '@/storage/drive/auth';
import {
  getSnapshot,
  markNeedsReconnect,
  subscribe,
  type SyncPhase,
  type SyncStatusState,
} from './syncStatusStore';

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true,
  );
}

export interface SyncStatus extends SyncStatusState {
  /** The single resolved semantic state the UI renders. */
  phase: SyncPhase;
  online: boolean;
}

/** Resolve the store + online state into the single semantic phase. */
function resolvePhase(s: SyncStatusState, online: boolean): SyncPhase {
  if (s.needsReconnect) return 'reconnect';
  if (s.error) return 'error';
  if (!s.connected) return 'not-connected';
  if (!online) return 'offline';
  if (s.syncing) return 'syncing';
  return 'synced';
}

export function useSyncStatus(): SyncStatus {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const online = useOnline();

  // A 401/expiry from anywhere (a deep REST call) must surface as Reconnect even if the call
  // site didn't touch the store. driveAuth.onExpiry is the single fan-in for that signal.
  useEffect(() => {
    return onExpiry(() => {
      markNeedsReconnect();
    });
  }, []);

  return { ...state, online, phase: resolvePhase(state, online) };
}

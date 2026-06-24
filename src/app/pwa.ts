/**
 * Service-worker registration + controlled update flow (RESEARCH ## Pattern 4 / Pitfall 7).
 *
 * `registerType: 'prompt'` (see vite.config.ts) means a freshly-deployed SW WAITS instead
 * of activating. This module wires the `virtual:pwa-register` lifecycle into the React UI:
 *   - onNeedRefresh  -> a new version is waiting; surface the UpdateToast (S7).
 *   - onOfflineReady -> the shell is precached; surface a quiet "ready offline" toast.
 *
 * The actual activation (`updateSW(true)`) is performed by the UpdateToast component ONLY
 * when no write is in flight, so we never swap assets under an in-flight Drive sync.
 */
import { registerSW } from 'virtual:pwa-register';

/** Activates the waiting service worker. `true` reloads the page after activation. */
export type UpdateSW = (reload?: boolean) => Promise<void>;

type PwaListener = {
  onNeedRefresh: (updateSW: UpdateSW) => void;
  onOfflineReady: () => void;
};

const listeners = new Set<PwaListener>();

// Captured once registerPwa() runs; replayed to late subscribers so a toast mounted after
// the SW event still receives it.
let pendingUpdateSW: UpdateSW | null = null;
let offlineReadyFired = false;

/**
 * Subscribe to PWA lifecycle events. Returns an unsubscribe fn.
 * Replays any event that already fired before this listener subscribed.
 */
export function subscribePwa(listener: PwaListener): () => void {
  listeners.add(listener);
  if (pendingUpdateSW) listener.onNeedRefresh(pendingUpdateSW);
  if (offlineReadyFired) listener.onOfflineReady();
  return () => {
    listeners.delete(listener);
  };
}

let registered = false;

/**
 * Register the service worker in prompt mode. Call once from main.tsx.
 * No-op (idempotent) if called more than once.
 */
export function registerPwa(): void {
  if (registered) return;
  registered = true;

  const updateSW: UpdateSW = registerSW({
    onNeedRefresh() {
      pendingUpdateSW = updateSW;
      for (const l of listeners) l.onNeedRefresh(updateSW);
    },
    onOfflineReady() {
      offlineReadyFired = true;
      for (const l of listeners) l.onOfflineReady();
    },
  });
}

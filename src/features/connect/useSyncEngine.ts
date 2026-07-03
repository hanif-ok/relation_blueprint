// useSyncEngine — boots and drives the atomic SyncEngine across the Drive-connect lifecycle.
//
// This is the missing wire between the connect UI and the storage spine. The SyncEngine
// (src/sync/syncEngine.ts) is fully implemented and proven against InMemoryProvider +
// FaultInjectingProvider, but nothing in the running app instantiated it. This hook is the
// production seam that `useConnectDrive({ onConnected, onDisconnected })` plugs into:
//
//   onConnected(folderId):
//     1. build the active StorageProvider + a Dexie-backed RepositoryPort + the SyncEngine
//     2. reconcileOnOpen() once — pull any cloud shards newer than the local watermark (LWW)
//     3. subscribe to repository onChange events and DEBOUNCE a push() so a burst of edits
//        coalesces into a single atomic commit (STOR-02 / STOR-04 background sync)
//
//   onDisconnected()/unmount:
//     tear down the subscription + any pending debounced push, and drop the engine.
//
// Every sync call is guarded: a failure surfaces through the shared sync-status store (so the
// StatusPill reflects it) but NEVER throws into render or blocks the offline-usable app —
// IndexedDB stays the source of truth no matter what the cloud does (RESEARCH Pitfall 4).

import { useCallback, useEffect, useRef } from 'react';
import { db } from '@/db/schema';
import { onChange } from '@/db/repository';
import {
  SyncEngine,
  createDexieRepoPort,
  MEDIA_FOLDER,
  SYNCED_MEDIA_KEY,
  type RepositoryPort,
} from '@/sync/syncEngine';
import { getActiveProvider } from '@/storage/providerFactory';
import type { StorageProvider } from '@/storage/StorageProvider';
import { markSyncing, markSynced, markError } from './syncStatusStore';

/** Debounce window (ms) so a burst of edits coalesces into one atomic push. */
const PUSH_DEBOUNCE_MS = 800;

/**
 * Pull media blobs the cloud has but this device lacks into local Dexie, BEFORE the entity
 * reconcile so photos are present when the pulled entities render (the media hooks — useEntityThumb
 * / useMapImage — resolve a hash ONCE and don't retry, so a late pull would leave images broken
 * until a manual refresh). Writes db.media DIRECTLY (no repository `emit` → no re-push loop) and
 * marks each pulled hash synced so the next push never re-uploads it as a DUPLICATE cloud file.
 * Per-file failures are swallowed — a single missing photo must never block sync. Eager: downloads
 * ALL missing media on connect; a lazy on-demand fetch is the future scale optimization.
 * (DEBUG oauth-prompt-every-refresh: "sync works but images don't load" on a second browser.)
 */
async function reconcileMedia(provider: StorageProvider, folderId: string): Promise<void> {
  const mediaFolder = await provider.ensureFolder(MEDIA_FOLDER, folderId);
  const entries = await provider.list(mediaFolder);
  if (entries.length === 0) return;
  const localHashes = new Set((await db.media.toArray()).map((m) => m.hash));

  const pulled: { hash: string; bytes: ArrayBuffer; mime: string }[] = [];
  for (const entry of entries) {
    // Cloud media files are named `media/<hash>` (the prefix is part of the name) — recover the hash.
    const hash = entry.name.startsWith(`${MEDIA_FOLDER}/`)
      ? entry.name.slice(MEDIA_FOLDER.length + 1)
      : entry.name;
    if (!hash || localHashes.has(hash)) continue;
    try {
      const blob = await provider.readFile(entry.id);
      pulled.push({
        hash,
        bytes: await blob.arrayBuffer(),
        mime: blob.type || 'application/octet-stream',
      });
    } catch (err) {
      console.error(`[sync] media pull failed for ${hash}:`, err);
    }
  }
  if (pulled.length === 0) return;

  // One transaction: write the blobs + extend the synced-media watermark so they are never
  // re-uploaded. No `emit` — these blobs are already in the cloud, so no push must be triggered.
  await db.transaction('rw', [db.media, db.meta], async () => {
    for (const p of pulled) await db.media.put(p);
    const row = await db.meta.get(SYNCED_MEDIA_KEY);
    const synced = new Set<string>(Array.isArray(row?.value) ? (row.value as string[]) : []);
    for (const p of pulled) synced.add(p.hash);
    await db.meta.put({ key: SYNCED_MEDIA_KEY, value: [...synced] });
  });
}

export interface UseSyncEngineOptions {
  /**
   * Override the StorageProvider the engine commits to. Defaults to the app's active provider
   * (Drive in Phase 1). Tests inject an InMemoryProvider here to drive the wiring without live
   * OAuth.
   */
  provider?: StorageProvider;
  /** Override the RepositoryPort. Defaults to a Dexie-backed port over the app `db`. */
  repo?: RepositoryPort;
  /** Debounce window for coalescing pushes (ms). Tests shrink this to keep them fast. */
  debounceMs?: number;
}

export interface SyncEngineWiring {
  /** Pass to `useConnectDrive` — boots the engine + reconcile + change-driven push on connect. */
  onConnected: (folderId: string) => void;
  /** Pass to `useConnectDrive` — tears the engine + subscription down on disconnect. */
  onDisconnected: () => void;
}

/**
 * Wire the SyncEngine into the connect lifecycle. Returns the `onConnected`/`onDisconnected`
 * callbacks to hand to `useConnectDrive`. Stable identities (no re-subscription churn).
 */
export function useSyncEngine(options: UseSyncEngineOptions = {}): SyncEngineWiring {
  const { provider, repo, debounceMs = PUSH_DEBOUNCE_MS } = options;

  // The live engine + its repository-change unsubscribe + the pending debounce timer.
  const engineRef = useRef<SyncEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a push that resolves after disconnect/unmount touching stale status.
  const activeRef = useRef(false);

  // Latest option values, read inside the stable callbacks without re-creating them.
  const providerRef = useRef(provider);
  const repoRef = useRef(repo);
  const debounceRef = useRef(debounceMs);
  providerRef.current = provider;
  repoRef.current = repo;
  debounceRef.current = debounceMs;

  /** Run an atomic push, reflecting progress/outcome in the shared status store. Never throws. */
  const runPush = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !activeRef.current) return;
    markSyncing();
    try {
      await engine.push();
      if (activeRef.current) markSynced();
    } catch (err) {
      // A failed cloud write must not crash the app — surface it and keep working offline.
      // Also log to the console: markError only feeds the UI store, so without this a sync
      // failure is invisible to anyone reading the console (observability gap, DEBUG oauth-...).
      console.error('[sync] push failed:', err);
      if (activeRef.current) {
        markError(err instanceof Error ? err.message : 'Sync failed');
      }
    }
  }, []);

  /** Schedule a debounced push so a burst of edits coalesces into one commit. */
  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void runPush();
    }, debounceRef.current);
  }, [runPush]);

  /** Tear down the subscription, pending timer, and engine. Idempotent. */
  const teardown = useCallback(() => {
    activeRef.current = false;
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    engineRef.current = null;
  }, []);

  const onConnected = useCallback(
    (folderId: string) => {
      // Replace any prior engine (re-connect) cleanly before booting a fresh one.
      teardown();
      activeRef.current = true;

      const provider = providerRef.current ?? getActiveProvider();
      const engine = new SyncEngine({
        provider,
        folderId,
        repo: repoRef.current ?? createDexieRepoPort(db),
      });
      engineRef.current = engine;

      // 1. Establish/locate the manifest (discover an existing one, else bootstrap a fresh v0),
      // 2. reconcile cloud → local once on open (LWW), then 3. subscribe for change-driven push.
      // prepareOnOpen() runs INSIDE the try so any failure still routes to markError below; it
      // is the missing init step — without it an empty-DB connect reconciles a never-bootstrapped
      // engine and throws "manifest not initialized" (GAP 1 / 01-09).
      void (async () => {
        markSyncing();
        try {
          await engine.prepareOnOpen();
          // Pull media BEFORE the entity reconcile so photos are local by the time the pulled
          // entities render — the media hooks resolve a hash once and don't retry (DEBUG oauth-...).
          await reconcileMedia(provider, folderId);
          await engine.reconcileOnOpen();
          // Initial push: upload any pre-existing local dirty data (created before connecting, or
          // while sync was down). Without this, local data only uploads on a FUTURE edit (onChange),
          // so a second browser could never pull it (DEBUG oauth-...: "sync doesn't bring back
          // elements" cross-browser). Runs AFTER reconcile so the pull-then-push order preserves
          // LWW — the pushed shard is the MERGED local set (pulled cloud data + local additions),
          // never a stale snapshot that would clobber another device's records.
          await engine.push();
          if (activeRef.current) markSynced();
        } catch (err) {
          // Log before surfacing: markError only feeds the UI store, so the actual Drive REST
          // status/body would otherwise never reach the console (observability gap, DEBUG oauth-...).
          console.error('[sync] connect sync (reconcile + initial push) failed:', err);
          if (activeRef.current) {
            markError(err instanceof Error ? err.message : 'Sync failed');
          }
        }
      })();

      // Any repository write (create/update/delete/media) schedules a debounced push.
      unsubscribeRef.current = onChange(() => schedulePush());
    },
    [schedulePush, teardown],
  );

  const onDisconnected = useCallback(() => {
    teardown();
  }, [teardown]);

  // Clean up on unmount so a backgrounded tab leaves no dangling timer/subscription.
  useEffect(() => teardown, [teardown]);

  return { onConnected, onDisconnected };
}

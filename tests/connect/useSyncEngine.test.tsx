// Regression test for the SyncEngine wiring gap (Phase 01 verification — STOR-02 / STOR-04).
//
// The SyncEngine was fully implemented and unit-tested, but it was NEVER instantiated in the
// running app: App.tsx called `useConnectDrive()` with no `onConnected` callback, so after a
// Drive connect, push()/reconcileOnOpen() never ran and local dirty entities never synced.
//
// This test drives the production wiring seam — `useSyncEngine` feeding `onConnected` — against
// an InMemoryProvider (NO live Google OAuth required), and asserts the two behaviours the gap
// broke:
//   (a) reconcileOnOpen() runs on connect (cloud → local reconcile), and
//   (b) a real repository write triggers a debounced SyncEngine.push() that writes the entity
//       shard to the provider, with the local record marked clean afterwards.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSyncEngine } from '@/features/connect/useSyncEngine';
import { SyncEngine } from '@/sync/syncEngine';
import { deserializeShards, SHARD_NAMES } from '@/sync/serializer';
import { readManifest } from '@/sync/manifest';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import { __resetWriteStatus } from '@/sync/writeStatus';
import {
  __resetForTests as resetSyncStatus,
  getSnapshot,
} from '@/features/connect/syncStatusStore';
import { createPerson } from '@/db/repository';
import { db } from '@/db/schema';

const APP_FOLDER = 'Relation Blueprint';
// Keep the debounce tiny so the change-driven push fires quickly under the test clock.
const TEST_DEBOUNCE_MS = 10;

async function clearDb(): Promise<void> {
  await db.transaction('rw', db.people, db.maps, db.markers, db.media, db.meta, async () => {
    await db.people.clear();
    await db.maps.clear();
    await db.markers.clear();
    await db.media.clear();
    await db.meta.clear();
  });
}

beforeEach(async () => {
  resetSyncStatus();
  __resetWriteStatus();
  await clearDb();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await clearDb();
});

describe('useSyncEngine wiring (regression: SyncEngine is actually booted on connect)', () => {
  it('runs reconcileOnOpen() once when onConnected fires', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);
    const reconcileSpy = vi.spyOn(SyncEngine.prototype, 'reconcileOnOpen');

    const { result } = renderHook(() =>
      useSyncEngine({ provider, debounceMs: TEST_DEBOUNCE_MS }),
    );

    await act(async () => {
      result.current.onConnected(folderId);
    });

    // The engine reconciles cloud → local exactly once on connect.
    await waitFor(() => expect(reconcileSpy).toHaveBeenCalledTimes(1));
  });

  it('reaches a clean synced state on an EMPTY-DB connect (GAP 1: no markError)', async () => {
    // The bug: onConnected reconciled on a never-bootstrapped engine, so manifestFileId() threw
    // and markError fired ("sync failed, please retry"). prepareOnOpen() must establish the
    // manifest first so the empty connect resolves to 'synced' (error===null, lastSyncedAt set).
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);

    const { result } = renderHook(() =>
      useSyncEngine({ provider, debounceMs: TEST_DEBOUNCE_MS }),
    );

    await act(async () => {
      result.current.onConnected(folderId);
    });

    // markSynced ran (lastSyncedAt set, syncing cleared) and markError did NOT (error stays null).
    await waitFor(() => {
      const s = getSnapshot();
      expect(s.error).toBeNull();
      expect(s.syncing).toBe(false);
      expect(s.lastSyncedAt).not.toBeNull();
    });

    // prepareOnOpen bootstrapped exactly one canonical manifest for the empty DB.
    const entries = await provider.list(folderId);
    expect(entries.filter((e) => e.name === 'manifest.json')).toHaveLength(1);
  });

  it('re-adopts an existing cloud DB on reconnect without duplicating manifest.json', async () => {
    // A second connect against a folder that already holds a manifest must ADOPT it, never
    // re-bootstrap a second manifest over the canonical one (T-01-09-01 tampering mitigation).
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);

    const { result } = renderHook(() =>
      useSyncEngine({ provider, debounceMs: TEST_DEBOUNCE_MS }),
    );

    // First connect: establishes the manifest, then disconnect.
    await act(async () => {
      result.current.onConnected(folderId);
    });
    await waitFor(() => {
      const s = getSnapshot();
      expect(s.error).toBeNull();
      expect(s.lastSyncedAt).not.toBeNull();
    });
    await act(async () => {
      result.current.onDisconnected();
    });

    // Reset status, then a fresh connect against the SAME folder must re-adopt, not re-bootstrap.
    resetSyncStatus();
    await act(async () => {
      result.current.onConnected(folderId);
    });
    await waitFor(() => {
      const s = getSnapshot();
      expect(s.error).toBeNull();
      expect(s.lastSyncedAt).not.toBeNull();
    });

    // Still exactly one canonical manifest — no duplicate created by the second connect.
    const entries = await provider.list(folderId);
    expect(entries.filter((e) => e.name === 'manifest.json')).toHaveLength(1);
  });

  it('pushes a local repository write to the provider as a shard (STOR-04)', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);
    const pushSpy = vi.spyOn(SyncEngine.prototype, 'push');

    const { result } = renderHook(() =>
      useSyncEngine({ provider, debounceMs: TEST_DEBOUNCE_MS }),
    );

    // Connect: boots the engine + subscribes to repository change events.
    await act(async () => {
      result.current.onConnected(folderId);
    });
    // Let the reconcile-on-open settle so the subscription is active.
    await waitFor(() => expect(provider.list(folderId)).resolves.toBeDefined());

    // A real local write through the repository (dirty=true) must trigger a debounced push.
    await act(async () => {
      await createPerson({ name: 'Alice' });
    });

    await waitFor(() => expect(pushSpy).toHaveBeenCalled(), { timeout: 2000 });

    // The push must have committed the people shard to the provider with the new person.
    // Resolve the canonical manifest by name, then verify the people shard contains Alice.
    await waitFor(
      async () => {
        const entries = await provider.list(folderId);
        const manifestEntry = entries.find((e) => e.name === 'manifest.json');
        expect(manifestEntry).toBeDefined();
        const manifest = await readManifest(provider, manifestEntry!.id);
        const peopleBlob = await provider.readFile(manifest.shards.people.fileId);
        const restored = await deserializeShards({ [SHARD_NAMES.people]: peopleBlob });
        expect(restored.people.map((p) => p.name)).toContain('Alice');
      },
      { timeout: 2000 },
    );

    // ...and the local record is marked clean once the commit succeeds.
    await waitFor(async () => {
      const people = await db.people.toArray();
      expect(people).toHaveLength(1);
      expect(people[0].dirty).toBe(false);
    });
  });

  it('pushes PRE-EXISTING local dirty data on connect, with no further edit (issue 2B cross-browser)', async () => {
    // The gap: onConnected reconciled (pull) but never pushed existing local data, so anything
    // created BEFORE connecting only uploaded on a later edit — a second browser could never pull
    // it. The initial push after reconcile closes that: pre-existing dirty data reaches the cloud
    // on connect. Runs after reconcile so pull-then-push preserves LWW.
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);

    // Data created BEFORE connecting (dirty, never pushed) — the cross-browser scenario.
    await createPerson({ name: 'Zoe' });
    expect((await db.people.toArray())[0].dirty).toBe(true);

    const { result } = renderHook(() =>
      useSyncEngine({ provider, debounceMs: TEST_DEBOUNCE_MS }),
    );
    await act(async () => {
      result.current.onConnected(folderId);
    });

    // On connect (NO subsequent edit), the pre-existing person is committed to the cloud shard.
    await waitFor(async () => {
      const entries = await provider.list(folderId);
      const manifestEntry = entries.find((e) => e.name === 'manifest.json');
      expect(manifestEntry).toBeDefined();
      const manifest = await readManifest(provider, manifestEntry!.id);
      const peopleBlob = await provider.readFile(manifest.shards.people.fileId);
      const restored = await deserializeShards({ [SHARD_NAMES.people]: peopleBlob });
      expect(restored.people.map((p) => p.name)).toContain('Zoe');
    });

    // ...and the local record is marked clean by the initial push.
    await waitFor(async () => {
      expect((await db.people.toArray())[0].dirty).toBe(false);
    });
  });

  it('tears down the change subscription on disconnect so writes stop pushing', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);

    const { result } = renderHook(() =>
      useSyncEngine({ provider, debounceMs: TEST_DEBOUNCE_MS }),
    );

    await act(async () => {
      result.current.onConnected(folderId);
    });
    await waitFor(() => expect(provider.list(folderId)).resolves.toBeDefined());

    // Disconnect tears down the engine + subscription.
    await act(async () => {
      result.current.onDisconnected();
    });

    const pushSpy = vi.spyOn(SyncEngine.prototype, 'push');

    // A write after disconnect must NOT trigger a push (subscription removed).
    await act(async () => {
      await createPerson({ name: 'Bob' });
    });
    // Wait past the debounce window; no push should have fired.
    await new Promise((r) => setTimeout(r, TEST_DEBOUNCE_MS * 5));
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

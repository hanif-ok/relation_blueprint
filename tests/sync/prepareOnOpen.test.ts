// GAP 1 (01-09): SyncEngine.prepareOnOpen() — the connect-time initialization step that
// reconcileOnOpen() requires. It must discover an EXISTING manifest.json in the app folder
// first (silent re-adoption of an existing cloud DB) and only bootstrap when none is found
// (the empty-first-connect path). It must never overwrite or duplicate the canonical manifest.

import { describe, expect, it } from 'vitest';
import { SyncEngine } from '@/sync/syncEngine';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import { makeMemoryPort } from './_memoryPort';

const APP_FOLDER = 'Relation Blueprint';
const emptySet = { people: [], maps: [], markers: [] };

describe('SyncEngine.prepareOnOpen (GAP 1: establish the manifest before reconcile)', () => {
  it('bootstraps an empty folder and lets reconcileOnOpen no-op (empty-first-connect)', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);
    const engine = new SyncEngine({ provider, folderId, repo: makeMemoryPort(emptySet) });

    // No manifest exists yet → prepareOnOpen bootstraps the v0 manifest + 3 empty shards.
    await engine.prepareOnOpen();

    const entries = await provider.list(folderId);
    expect(entries.filter((e) => e.name === 'manifest.json')).toHaveLength(1);
    // The manifest id is now resolved; reconcileOnOpen must NOT throw and is a clean no-op.
    await expect(engine.reconcileOnOpen()).resolves.toBeUndefined();
  });

  it('adopts an existing manifest.json WITHOUT bootstrapping (silent re-adoption)', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);

    // "First device": establish a manifest in the folder.
    const first = new SyncEngine({ provider, folderId, repo: makeMemoryPort(emptySet) });
    await first.bootstrap();
    const firstManifestId = first.manifestFileId();
    const before = await provider.list(folderId);

    // "Second device": a fresh engine with NO manifestFileId must ADOPT the existing manifest.
    const second = new SyncEngine({ provider, folderId, repo: makeMemoryPort(emptySet) });
    await second.prepareOnOpen();

    // It adopted the same canonical manifest id and wrote NOTHING new.
    expect(second.manifestFileId()).toBe(firstManifestId);
    const after = await provider.list(folderId);
    expect(after.filter((e) => e.name === 'manifest.json')).toHaveLength(1);
    expect(after.map((e) => e.id).sort()).toEqual(before.map((e) => e.id).sort());
  });

  it('is idempotent / a no-op when constructed with a manifestFileId', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder(APP_FOLDER);
    const engine = new SyncEngine({
      provider,
      folderId,
      repo: makeMemoryPort(emptySet),
      manifestFileId: 'preset-id',
    });

    await engine.prepareOnOpen();

    // No provider writes happened; the provided id is preserved.
    expect(engine.manifestFileId()).toBe('preset-id');
    expect(await provider.list(folderId)).toHaveLength(0);
  });
});

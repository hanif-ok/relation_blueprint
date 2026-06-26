// DATA-03 cloud-sync BLOCKER regression (audit lines 220-231).
//
// Custom-field DEFINITIONS (`db.fieldDefs`) serialize into `field-defs-000.json` but, before
// this phase, were never threaded through the cloud manifest path: `ENTITY_TYPES` listed only
// the five entity families, so `getDirtyTypes`/`commit`/`reconcileOnOpen`/`markSynced` all
// skipped field-defs and the manifest carried no `field-defs` pointer. On a second device the
// custom VALUES arrived with no DEFINITIONS to render them.
//
// These tests prove the fix: a dirty FieldDef pushed on device A round-trips through the cloud
// manifest and is restored clean on a fresh-Dexie `reconcileOnOpen` (device B). Plus the
// backward-compat edge: an OLD manifest with no field-defs pointer is a safe no-op.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyncEngine, createDexieRepoPort } from '@/sync/syncEngine';
import { readManifest } from '@/sync/manifest';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import { db } from '@/db/schema';
import type { FieldDef } from '@/domain/types';

function fieldDef(id: string, updatedAt: number, dirty = false): FieldDef {
  return {
    id,
    entityType: 'people',
    label: `field-${id}`,
    type: 'text',
    required: false,
    order: 0,
    deleted: false,
    updatedAt,
    dirty,
  };
}

async function clearDb(): Promise<void> {
  await db.transaction(
    'rw',
    [db.people, db.maps, db.markers, db.groups, db.relationshipLinks, db.fieldDefs, db.media, db.meta],
    async () => {
      await db.people.clear();
      await db.maps.clear();
      await db.markers.clear();
      await db.groups.clear();
      await db.relationshipLinks.clear();
      await db.fieldDefs.clear();
      await db.media.clear();
      await db.meta.clear();
    },
  );
}

beforeEach(clearDb);
afterEach(clearDb);

describe('SyncEngine field-defs cloud round-trip (DATA-03 BLOCKER closed)', () => {
  it('round-trips a FieldDef: push on A → fresh Dexie → reconcileOnOpen on B pulls it', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    // Device A: a dirty field definition pushed to the cloud.
    await db.fieldDefs.put(fieldDef('f1', 500, true));
    const engineA = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db) });
    await engineA.bootstrap();
    await engineA.push();
    const manifestFileId = engineA.manifestFileId();

    // The local definition was marked clean after the successful push.
    expect((await db.fieldDefs.get('f1'))?.dirty).toBe(false);

    // Device B: simulate a fresh device — wipe local fieldDefs AND the shard watermarks (held in
    // `meta`), exactly as a brand-new Dexie would have them, so reconcile actually pulls.
    await db.fieldDefs.clear();
    await db.meta.clear();
    const engineB = new SyncEngine({
      provider,
      folderId,
      repo: createDexieRepoPort(db),
      manifestFileId,
    });
    await engineB.reconcileOnOpen();

    const pulled = await db.fieldDefs.get('f1');
    expect(pulled?.label).toBe('field-f1'); // the DEFINITION arrived → custom values are renderable
    expect(pulled?.dirty).toBe(false);
  });

  it('writes a field-defs shard pointer into the committed manifest (STOR-02)', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    await db.fieldDefs.put(fieldDef('f1', 500, true));
    const engine = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db) });
    await engine.bootstrap();
    await engine.push();

    const manifest = await readManifest(provider, engine.manifestFileId());
    expect(manifest.shards['field-defs']).toBeDefined();
    expect(manifest.shards['field-defs']?.fileId).toBeTruthy();
  });

  it("getDirtyTypes() includes 'field-defs' when a field def is dirty; markSynced clears it", async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    await db.fieldDefs.put(fieldDef('f1', 500, true));
    const port = createDexieRepoPort(db);
    expect(await port.getDirtyTypes()).toContain('field-defs');

    const engine = new SyncEngine({ provider, folderId, repo: port });
    await engine.bootstrap();
    await engine.push();

    // After push, markSynced cleared the local dirty flag.
    expect((await db.fieldDefs.get('f1'))?.dirty).toBe(false);
  });

  it('reconcileOnOpen against an OLD manifest (no field-defs pointer) is a safe no-op', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    // Establish a committed database with NO dirty field defs — the first push writes only the
    // five entity shards plus the bootstrap field-defs shard. To simulate a genuinely OLD
    // manifest (predating this phase) we strip the field-defs pointer back out of the manifest
    // and re-write it, then assert reconcile no-ops without throwing.
    await db.people.put({
      id: 'p1',
      name: 'Alice',
      tags: [],
      gallery: [],
      custom: {},
      updatedAt: 100,
      dirty: true,
    });
    const engineA = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db) });
    await engineA.bootstrap();
    await engineA.push();
    const manifestFileId = engineA.manifestFileId();

    // Hand-build an OLD-style manifest whose shards object omits the field-defs pointer.
    const current = await readManifest(provider, manifestFileId);
    const legacyShards = { ...current.shards };
    delete (legacyShards as Record<string, unknown>)['field-defs'];
    const legacyManifest = { version: current.version, updatedAt: current.updatedAt, shards: legacyShards };
    await provider.overwriteFile(
      manifestFileId,
      new Blob([JSON.stringify(legacyManifest)], { type: 'application/json' }),
      'application/json',
    );

    await db.fieldDefs.clear();
    await db.meta.clear();
    const engineB = new SyncEngine({
      provider,
      folderId,
      repo: createDexieRepoPort(db),
      manifestFileId,
    });

    // Must NOT throw on the missing field-defs pointer (the second-device reconnect scenario).
    await expect(engineB.reconcileOnOpen()).resolves.toBeUndefined();
  });
});

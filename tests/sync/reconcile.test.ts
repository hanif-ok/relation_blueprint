// STOR-04 — background sync with last-write-wins for a single curator.
//
// Two directions, both LWW by `updatedAt`:
//   PUSH:  a locally-newer record is serialized and committed to the cloud.
//   OPEN:  a cloud shard whose manifest.updatedAt is newer than the local shard meta is pulled
//          and upserted into Dexie; a shard that is NOT newer is left alone (local will push).
// There is exactly one curator, so no merge UI — newest `updatedAt` wins.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyncEngine, createDexieRepoPort } from '@/sync/syncEngine';
import { deserializeShards, SHARD_NAMES } from '@/sync/serializer';
import { readManifest } from '@/sync/manifest';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import { db } from '@/db/schema';
import type { Person } from '@/domain/types';

function person(id: string, name: string, updatedAt: number, dirty = false): Person {
  return { id, name, tags: [], gallery: [], custom: {}, updatedAt, dirty };
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

describe('SyncEngine push (STOR-04: local-newer record is committed)', () => {
  it('serializes dirty records and commits them to the cloud', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    await db.people.put(person('p1', 'Alice', 100, true));

    const engine = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db) });
    await engine.bootstrap();
    await engine.push();

    const manifest = await readManifest(provider, engine.manifestFileId());
    const peopleShard = await provider.readFile(manifest.shards.people.fileId);
    const restored = await deserializeShards({ [SHARD_NAMES.people]: peopleShard });
    expect(restored.people.map((p) => p.name)).toEqual(['Alice']);

    // Pushed records are marked clean locally.
    const local = await db.people.get('p1');
    expect(local?.dirty).toBe(false);
  });
});

describe('SyncEngine reconcileOnOpen (STOR-04: newer cloud shard pulled, LWW)', () => {
  it('pulls a cloud shard newer than local and upserts it into Dexie', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    // Curator A commits a person at updatedAt=500 to the cloud.
    await db.people.put(person('p1', 'Alice', 500, true));
    const engineA = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db) });
    await engineA.bootstrap();
    await engineA.push();
    const manifestFileId = engineA.manifestFileId();

    // Simulate a fresh local DB (as if reopening on another device) with an OLDER local copy.
    await clearDb();
    await db.people.put(person('p1', 'Alice STALE', 100));

    const engineB = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db), manifestFileId });
    await engineB.reconcileOnOpen();

    // The newer cloud record (updatedAt=500) wins over the stale local (updatedAt=100).
    const local = await db.people.get('p1');
    expect(local?.name).toBe('Alice');
    expect(local?.updatedAt).toBe(500);
  });

  it('leaves a local record that is newer than the cloud shard (it will be pushed)', async () => {
    const provider = new InMemoryProvider();
    const folderId = await provider.ensureFolder('Relation Blueprint');

    // Cloud has Alice@200.
    await db.people.put(person('p1', 'Alice cloud', 200, true));
    const engineA = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db) });
    await engineA.bootstrap();
    await engineA.push();
    const manifestFileId = engineA.manifestFileId();

    // Local now has a NEWER edit (updatedAt=900) that has not been pushed.
    await db.people.put(person('p1', 'Alice local newer', 900, true));

    const engineB = new SyncEngine({ provider, folderId, repo: createDexieRepoPort(db), manifestFileId });
    await engineB.reconcileOnOpen();

    // The newer LOCAL record is preserved (LWW) — reconcile did not clobber it with the cloud.
    const local = await db.people.get('p1');
    expect(local?.name).toBe('Alice local newer');
    expect(local?.updatedAt).toBe(900);
  });
});

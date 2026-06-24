// EXPT-02 — the round-trip property test. THE safety net of the whole phase: the cloud is
// the only durable copy, so a restore that silently drops data is catastrophic. This is the
// automated assertion RESEARCH Pitfall 6 ("export theater") demands — NOT a smoke test.
//
//   export -> clear IndexedDB -> import   MUST yield:
//     • deep-equality of every entity (people / maps / markers), and
//     • byte-equality of every photo blob (ArrayBuffer comparison).
//
// Plus the security property (T-07-01): importing a foreign/corrupt file is rejected by zod
// and the existing DB is left completely untouched.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { getMedia } from '@/db/repository';
import { exportDb } from '@/features/backup/exportDb';
import { importDb } from '@/features/backup/importDb';
import { generateDbFixture } from '../_fixtures/generateDbFixture';

async function snapshotEntities() {
  const [people, maps, markers] = await Promise.all([
    db.people.orderBy('id').toArray(),
    db.maps.orderBy('id').toArray(),
    db.markers.orderBy('id').toArray(),
  ]);
  return { people, maps, markers };
}

async function bytesOf(hash: string): Promise<ArrayBuffer> {
  const blob = await getMedia(hash);
  if (!blob) throw new Error(`no media for hash ${hash}`);
  return blob.arrayBuffer();
}

function expectByteEqual(a: ArrayBuffer, b: ArrayBuffer) {
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  expect(av.length).toBe(bv.length);
  for (let i = 0; i < av.length; i++) {
    if (av[i] !== bv[i]) throw new Error(`byte mismatch at index ${i}: ${av[i]} !== ${bv[i]}`);
  }
}

beforeEach(async () => {
  await generateDbFixture(8);
});

describe('export -> wipe -> import round trip (EXPT-02)', () => {
  it('reconstitutes every entity deep-equal and every photo byte-equal', async () => {
    const before = await snapshotEntities();
    const mediaHashes = (await db.media.toArray()).map((m) => m.hash);
    const bytesBefore = new Map<string, ArrayBuffer>();
    for (const h of mediaHashes) bytesBefore.set(h, await bytesOf(h));

    const backup = await exportDb();

    // Wipe IndexedDB completely (simulate a fresh device / cleared storage).
    await Promise.all([
      db.people.clear(),
      db.maps.clear(),
      db.markers.clear(),
      db.media.clear(),
      db.meta.clear(),
    ]);
    expect(await db.people.count()).toBe(0);
    expect(await db.media.count()).toBe(0);

    await importDb(backup);

    // Entities: deep equal.
    const after = await snapshotEntities();
    expect(after.people).toEqual(before.people);
    expect(after.maps).toEqual(before.maps);
    expect(after.markers).toEqual(before.markers);

    // Media: byte-for-byte equal for every hash, and no media lost/added.
    const hashesAfter = (await db.media.toArray()).map((m) => m.hash).sort();
    expect(hashesAfter).toEqual([...mediaHashes].sort());
    for (const h of mediaHashes) {
      expectByteEqual(await bytesOf(h), bytesBefore.get(h)!);
    }
  });

  it('preserves the original sample-photo bytes exactly through the round trip', async () => {
    // Re-seed deterministically to capture the raw sample bytes.
    const { photoRefs, photoBytes } = await generateDbFixture(3);

    const backup = await exportDb();
    await Promise.all([db.people.clear(), db.maps.clear(), db.markers.clear(), db.media.clear()]);
    await importDb(backup);

    for (let i = 0; i < photoRefs.length; i++) {
      const restored = new Uint8Array(await bytesOf(photoRefs[i].hash));
      expect(Array.from(restored)).toEqual(Array.from(photoBytes[i]));
    }
  });
});

describe('import rejects a foreign/corrupt bundle without touching current data (T-07-01)', () => {
  it('throws on `{}` and leaves the existing DB completely unchanged', async () => {
    const before = await snapshotEntities();
    const mediaBefore = await db.media.count();

    const corrupt = new Blob([JSON.stringify({})], { type: 'application/json' });
    await expect(importDb(corrupt)).rejects.toThrow();

    const after = await snapshotEntities();
    expect(after).toEqual(before);
    expect(await db.media.count()).toBe(mediaBefore);
  });

  it('throws on non-JSON garbage and leaves the DB unchanged', async () => {
    const before = await snapshotEntities();
    const garbage = new Blob(['this is not json'], { type: 'text/plain' });
    await expect(importDb(garbage)).rejects.toThrow();
    expect(await snapshotEntities()).toEqual(before);
  });
});

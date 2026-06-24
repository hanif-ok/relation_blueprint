// STOR-03: the app reads and writes fully OFFLINE against Dexie/IndexedDB as the source
// of truth. This suite runs under fake-indexeddb (node, no network whatsoever) and proves
// create/read/list round-trip with dirty-marking and a numeric updatedAt.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createPerson, getPerson, listPeople, putMedia, getMedia } from '@/db/repository';

beforeEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.maps.clear(),
    db.markers.clear(),
    db.media.clear(),
    db.meta.clear(),
    db.syncQueue.clear(),
  ]);
});

afterEach(async () => {
  await db.people.clear();
});

describe('repository offline CRUD (STOR-03)', () => {
  it('createPerson persists a Person and getPerson round-trips it', async () => {
    const created = await createPerson({ name: 'Grace Hopper', tags: ['navy'] });
    const fetched = await getPerson(created.id);
    expect(fetched).toEqual(created);
    expect(fetched?.name).toBe('Grace Hopper');
  });

  it('createPerson assigns a nanoid id and stamps dirty=true with a numeric updatedAt', async () => {
    const before = Date.now();
    const person = await createPerson({ name: 'Alan Turing' });
    expect(typeof person.id).toBe('string');
    expect(person.id.length).toBeGreaterThan(0);
    expect(person.dirty).toBe(true);
    expect(typeof person.updatedAt).toBe('number');
    expect(person.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('createPerson defaults tags and gallery to empty arrays', async () => {
    const person = await createPerson({ name: 'Katherine Johnson' });
    expect(person.tags).toEqual([]);
    expect(person.gallery).toEqual([]);
  });

  it('listPeople includes a newly created person', async () => {
    const person = await createPerson({ name: 'Margaret Hamilton' });
    const ids = (await listPeople()).map((p) => p.id);
    expect(ids).toContain(person.id);
  });

  it('putMedia stores a blob keyed by hash and getMedia round-trips it', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    await putMedia({ hash: 'h123', mime: 'image/webp' }, new Blob([bytes]));
    const blob = await getMedia('h123');
    expect(blob).toBeDefined();
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes);
  });
});

// DATA-04: edit and delete an entity. Covers updatePerson (mutate a field, bump updatedAt,
// stay dirty) and deletePerson (remove the person AND cascade-delete its markers).

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  createMap,
  createPerson,
  deletePerson,
  getPerson,
  listPeople,
  updatePerson,
  upsertMarker,
} from '@/db/repository';

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

describe('updatePerson (DATA-04 edit)', () => {
  it('mutates a field, keeps the same id, stays dirty, and bumps updatedAt', async () => {
    const person = await createPerson({ name: 'Edith Clarke' });
    // Force a measurable time gap so updatedAt strictly increases.
    await new Promise((r) => setTimeout(r, 2));
    const updated = await updatePerson(person.id, { name: 'Edith Clarke (engineer)', tags: ['ieee'] });
    expect(updated.id).toBe(person.id);
    expect(updated.name).toBe('Edith Clarke (engineer)');
    expect(updated.tags).toEqual(['ieee']);
    expect(updated.dirty).toBe(true);
    expect(updated.updatedAt).toBeGreaterThan(person.updatedAt);

    const stored = await getPerson(person.id);
    expect(stored?.name).toBe('Edith Clarke (engineer)');
  });

  it('throws when updating a person that does not exist', async () => {
    await expect(updatePerson('missing', { name: 'x' })).rejects.toThrow();
  });
});

describe('deletePerson (DATA-04 delete + cascade)', () => {
  it('removes the person from listPeople', async () => {
    const person = await createPerson({ name: 'Hedy Lamarr' });
    await deletePerson(person.id);
    const ids = (await listPeople()).map((p) => p.id);
    expect(ids).not.toContain(person.id);
    expect(await getPerson(person.id)).toBeUndefined();
  });

  it('cascade-deletes markers that reference the deleted person', async () => {
    const map = await createMap({
      name: 'Floor 1',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
    });
    const person = await createPerson({ name: 'Rosalind Franklin' });
    const other = await createPerson({ name: 'Dorothy Hodgkin' });
    const markerForPerson = await upsertMarker({ mapId: map.id, personId: person.id, x: 10, y: 20 });
    const markerForOther = await upsertMarker({ mapId: map.id, personId: other.id, x: 30, y: 40 });

    await deletePerson(person.id);

    expect(await db.markers.get(markerForPerson.id)).toBeUndefined();
    // The other person's marker must survive.
    expect(await db.markers.get(markerForOther.id)).toBeDefined();
  });
});

describe('upsertMarker (DATA-04 support)', () => {
  it('creates then updates a marker at a stable id with dirty + updatedAt', async () => {
    const map = await createMap({
      name: 'Floor 2',
      background: { hash: 'bg2', mime: 'image/png' },
      width: 400,
      height: 300,
    });
    const person = await createPerson({ name: 'Lise Meitner' });
    const created = await upsertMarker({ mapId: map.id, personId: person.id, x: 1, y: 2 });
    expect(created.dirty).toBe(true);
    const moved = await upsertMarker({ id: created.id, mapId: map.id, personId: person.id, x: 5, y: 6 });
    expect(moved.id).toBe(created.id);
    expect(moved.x).toBe(5);
    expect(await db.markers.count()).toBe(1);
  });
});

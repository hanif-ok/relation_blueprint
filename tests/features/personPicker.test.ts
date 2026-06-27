// MAP-05 — the PersonPicker placement contract (canonical-Person / N-Marker-rows, D-11/D-13).
//
// The map-side PersonPicker places an EXISTING person on the active map by calling the SAME
// `upsertMarker({ kind:'person', mapId, personId, x, y, layerId })` the picker's `onPick` fires —
// with NO `id`, so every pick is a NEW Marker row. This pins, with data only (no renderer), the
// multi-placement model proven at the data layer in 03-01 (RESEARCH Pattern 4):
//   (1) pick = one person-kind Marker row for the personId on the active map (no duplicate Person)
//   (2) placing the SAME person on a SECOND map = TWO markers for ONE canonical Person (criterion 4)
//   (3) a person placed twice (even on one map) never forks the canonical Person record

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, createPerson, upsertMarker } from '@/db/repository';

const bg = { hash: 'bg', mime: 'image/png' };

/** Seed a map with the given name and return its id (background spine is a throwaway ref). */
async function seedMap(name: string): Promise<string> {
  const map = await createMap({ name, background: bg, width: 800, height: 600 });
  return map.id;
}

beforeEach(async () => {
  await Promise.all([db.maps.clear(), db.markers.clear(), db.people.clear()]);
});

describe('MAP-05 — PersonPicker places an existing person as a new Marker row (D-11)', () => {
  it('picking a person on a map writes ONE person-kind Marker row for that personId', async () => {
    const a = await seedMap('A');
    const person = await createPerson({ name: 'Ada Lovelace' });

    // The pick path: the picker's onPick → upsertMarker with NO id → a NEW row on the active map.
    const layerId = 'layer-0';
    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 120, y: 80, layerId });

    const rows = await db.markers.where('personId').equals(person.id).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('person');
    expect(rows[0].mapId).toBe(a);
    expect(rows[0].personId).toBe(person.id);
    expect(rows[0].x).toBe(120);
    expect(rows[0].y).toBe(80);
    expect(rows[0].layerId).toBe(layerId);
    // The canonical Person record is untouched (still exactly one).
    expect(await db.people.count()).toBe(1);
  });

  it('placing the SAME person on a SECOND map yields two markers for one canonical Person (D-13, criterion 4)', async () => {
    const a = await seedMap('A');
    const b = await seedMap('B');
    const person = await createPerson({ name: 'Grace Hopper' });

    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 10, y: 10 });
    await upsertMarker({ kind: 'person', mapId: b, personId: person.id, x: 20, y: 20 });

    // Two placements, ONE canonical record — the MAP-05 contract (RESEARCH Pattern 4).
    expect(await db.markers.where('personId').equals(person.id).count()).toBe(2);
    expect(await db.people.count()).toBe(1);

    // Each marker carries the correct mapId + kind==='person'.
    const onA = await db.markers.where('mapId').equals(a).toArray();
    const onB = await db.markers.where('mapId').equals(b).toArray();
    expect(onA).toHaveLength(1);
    expect(onB).toHaveLength(1);
    expect(onA[0].kind).toBe('person');
    expect(onB[0].kind).toBe('person');
    expect(onA[0].personId).toBe(person.id);
    expect(onB[0].personId).toBe(person.id);
    // The two placements have independent positions (per-placement x/y).
    expect(onA[0].x).toBe(10);
    expect(onB[0].x).toBe(20);
  });

  it('placing a person twice never forks the canonical Person record', async () => {
    const a = await seedMap('A');
    const person = await createPerson({ name: 'Edith Clarke' });

    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 1, y: 1 });
    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 2, y: 2 });

    // Two distinct marker rows (no shared id → no upsert-collision), one Person.
    expect(await db.markers.where('personId').equals(person.id).count()).toBe(2);
    expect(await db.people.count()).toBe(1);
  });
});

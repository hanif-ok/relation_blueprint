// MAP-05 / criterion 4 — the profile "Appears on:" grouping + canonical-record propagation.
//
// A person's profile lists every map they are placed on, built from
// `db.markers.where('personId').equals(id)` grouped by `mapId` (one row per map). Because identity
// is a SINGLE canonical Person record while each placement is its own Marker row (D-13), editing the
// person (name/photo) propagates to every placement automatically — only per-placement x/y/size are
// stored on the marker. This pins, with data only:
//   (1) two placements on two maps → two map groups (drives the "Appears on" list)
//   (2) a person with zero placements → an empty grouping (drives the "Not placed…" empty state)
//   (3) renaming the canonical Person leaves ONE Person record + both markers still referencing it,
//       with their per-placement x/y unchanged (criterion 4 propagation)

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, createPerson, updatePerson, upsertMarker } from '@/db/repository';
import { groupPlacementsByMap } from '@/features/profile/ProfileSidebar';

const bg = { hash: 'bg', mime: 'image/png' };

async function seedMap(name: string): Promise<string> {
  const map = await createMap({ name, background: bg, width: 800, height: 600 });
  return map.id;
}

beforeEach(async () => {
  await Promise.all([db.maps.clear(), db.markers.clear(), db.people.clear()]);
});

describe('MAP-05 — "Appears on" groups a person\'s placements by map (D-12)', () => {
  it('a person placed on two maps groups into two map groups', async () => {
    const a = await seedMap('A');
    const b = await seedMap('B');
    const person = await createPerson({ name: 'Ada' });

    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 10, y: 10 });
    await upsertMarker({ kind: 'person', mapId: b, personId: person.id, x: 20, y: 20 });

    const markers = await db.markers.where('personId').equals(person.id).toArray();
    const groups = groupPlacementsByMap(markers);

    expect(groups).toHaveLength(2);
    const mapIds = groups.map((g) => g.mapId).sort();
    expect(mapIds).toEqual([a, b].sort());
    // Each group carries at least one marker id (the jump target).
    for (const g of groups) {
      expect(g.markerIds.length).toBeGreaterThan(0);
    }
  });

  it('two placements on the SAME map collapse into one group with both marker ids', async () => {
    const a = await seedMap('A');
    const person = await createPerson({ name: 'Grace' });
    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 1, y: 1 });
    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 2, y: 2 });

    const markers = await db.markers.where('personId').equals(person.id).toArray();
    const groups = groupPlacementsByMap(markers);
    expect(groups).toHaveLength(1);
    expect(groups[0].mapId).toBe(a);
    expect(groups[0].markerIds).toHaveLength(2);
  });

  it('a person with zero placements yields an empty grouping (drives the empty state)', async () => {
    const person = await createPerson({ name: 'Unplaced Person' });
    const markers = await db.markers.where('personId').equals(person.id).toArray();
    expect(groupPlacementsByMap(markers)).toHaveLength(0);
  });

  it('ignores non-person markers (e.g. portals) when grouping placements', async () => {
    const a = await seedMap('A');
    const b = await seedMap('B');
    const person = await createPerson({ name: 'Edith' });
    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 1, y: 1 });
    // A portal on A targeting B — it carries no personId, so it must not appear in the grouping.
    await upsertMarker({ kind: 'portal', mapId: a, targetMapId: b, x: 5, y: 5 });

    const markers = await db.markers.where('personId').equals(person.id).toArray();
    const groups = groupPlacementsByMap(markers);
    expect(groups).toHaveLength(1);
    expect(groups[0].mapId).toBe(a);
  });
});

describe('criterion 4 — editing the canonical Person propagates to every placement', () => {
  it('renaming the person leaves ONE Person record + both markers, per-placement x/y unchanged', async () => {
    const a = await seedMap('A');
    const b = await seedMap('B');
    const person = await createPerson({ name: 'Old Name' });

    await upsertMarker({ kind: 'person', mapId: a, personId: person.id, x: 11, y: 12 });
    await upsertMarker({ kind: 'person', mapId: b, personId: person.id, x: 33, y: 34 });

    // Edit the canonical record (identity is shared across placements).
    await updatePerson(person.id, { name: 'New Name' });

    // Exactly one Person record survives, now renamed.
    expect(await db.people.count()).toBe(1);
    expect((await db.people.get(person.id))!.name).toBe('New Name');

    // Both markers still reference the same personId, with their per-placement positions intact.
    const markers = await db.markers.where('personId').equals(person.id).toArray();
    expect(markers).toHaveLength(2);
    for (const m of markers) {
      expect(m.personId).toBe(person.id);
    }
    const onA = markers.find((m) => m.mapId === a)!;
    const onB = markers.find((m) => m.mapId === b)!;
    expect({ x: onA.x, y: onA.y }).toEqual({ x: 11, y: 12 });
    expect({ x: onB.x, y: onB.y }).toEqual({ x: 33, y: 34 });
  });
});

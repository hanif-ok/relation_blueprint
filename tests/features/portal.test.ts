// MAP-06 + MAP-07 (descend half) — the portal placement + descend-hierarchy data model.
//
// A portal is a Marker variant (RESEARCH Pattern 5a, discriminated `kind:'portal'`): it rides the
// markers shard and is placed/updated through the SAME `upsertMarker` as a person marker, but it
// carries a `targetMapId` (its destination) instead of a `personId`. The descend hierarchy (MAP-07)
// is established by the create-or-pick CHILD flow: the new child map's `parentId` is set to the map
// the portal lives on (via `updateMap`), so the breadcrumb from 03-02 walks parent ▸ child. This
// pins, with data only (no renderer):
//   (1) placement: upsertMarker({ kind:'portal', targetMapId }) writes a portal row — kind==='portal',
//       targetMapId set, NO personId
//   (2) create-or-pick child: a created child's parentId points at the current map AND the portal
//       targets the child (so A▸C is reachable + the portal descends to C)
//   (3) cancel: a placed-then-cancelled portal is removed via deleteMarker (no target-less portal left)
//   (4) deleted target: a portal whose targetMapId points at a removed map is DETECTABLE (the map
//       lookup returns undefined) so the UI can show the "destination deleted" message (T-03-10)

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  createMap,
  updateMap,
  upsertMarker,
  deleteMarker,
  deleteEntity,
} from '@/db/repository';

const bg = { hash: 'bg', mime: 'image/png' };

/** Seed a map with the given name and return its id (background spine is a throwaway ref). */
async function seedMap(name: string): Promise<string> {
  const map = await createMap({ name, background: bg, width: 800, height: 600 });
  return map.id;
}

beforeEach(async () => {
  await Promise.all([db.maps.clear(), db.markers.clear(), db.people.clear()]);
});

describe('MAP-06 — portal placement (a Marker variant)', () => {
  it('places a portal via upsertMarker: kind==="portal", targetMapId set, no personId', async () => {
    const a = await seedMap('A');
    const b = await seedMap('B');

    const portal = await upsertMarker({ kind: 'portal', mapId: a, targetMapId: b, x: 100, y: 120 });

    const row = await db.markers.get(portal.id);
    expect(row).toBeDefined();
    expect(row!.kind).toBe('portal');
    expect(row!.targetMapId).toBe(b);
    expect(row!.personId).toBeUndefined();
    // It lives on the map it was dropped on (the markers shard, addressable by mapId).
    expect(row!.mapId).toBe(a);
  });

  it('a portal dropped without a target yet carries no targetMapId (set later by the picker)', async () => {
    const a = await seedMap('A');
    const portal = await upsertMarker({ kind: 'portal', mapId: a, x: 10, y: 10 });

    let row = await db.markers.get(portal.id);
    expect(row!.kind).toBe('portal');
    expect(row!.targetMapId).toBeUndefined();

    // The picker later sets the target by re-upserting the SAME id.
    const b = await seedMap('B');
    await upsertMarker({ id: portal.id, kind: 'portal', mapId: a, targetMapId: b, x: 10, y: 10 });
    row = await db.markers.get(portal.id);
    expect(row!.targetMapId).toBe(b);
    // No duplicate row was created (upsert by id).
    expect(await db.markers.where('mapId').equals(a).count()).toBe(1);
  });
});

describe('MAP-07 (descend) — create-or-pick child sets the parent→child hierarchy', () => {
  it('creating a child target sets child.parentId = current map AND points the portal at the child', async () => {
    const a = await seedMap('A'); // the current map the portal lives on
    // The picker's "Create a new map…" flow: create child C, set its parentId to A.
    const c = await seedMap('C');
    await updateMap(c, { parentId: a });
    // Then drop a portal on A targeting C.
    const portal = await upsertMarker({ kind: 'portal', mapId: a, targetMapId: c, x: 50, y: 50 });

    const child = await db.maps.get(c);
    const row = await db.markers.get(portal.id);
    // The descend hierarchy: A contains C (breadcrumb A▸C from 03-02 will resolve via parentId).
    expect(child!.parentId).toBe(a);
    // The portal descends to C.
    expect(row!.targetMapId).toBe(c);
  });

  it('picking an EXISTING map as target does not change that map\'s parentId', async () => {
    const a = await seedMap('A');
    const existing = await seedMap('Existing'); // a top-level map (no parent)
    await upsertMarker({ kind: 'portal', mapId: a, targetMapId: existing, x: 0, y: 0 });

    // Picking an existing target is a pure target set — it must NOT reparent the existing map.
    const target = await db.maps.get(existing);
    expect(target!.parentId).toBeUndefined();
  });
});

describe('MAP-06 — cancel removes the target-less portal', () => {
  it('a placed-then-cancelled portal is removed (deleteMarker), leaving no target-less portal', async () => {
    const a = await seedMap('A');
    const portal = await upsertMarker({ kind: 'portal', mapId: a, x: 5, y: 5 });
    expect(await db.markers.get(portal.id)).toBeDefined();

    // Cancel = deleteMarker(portalId).
    await deleteMarker(portal.id);

    expect(await db.markers.get(portal.id)).toBeUndefined();
    // No portal (target-less or otherwise) remains on the map.
    expect(await db.markers.where('mapId').equals(a).count()).toBe(0);
  });
});

describe('MAP-06 — deleted target is detectable (T-03-10)', () => {
  it('a portal whose target map was deleted resolves to undefined so the UI can show the message', async () => {
    const a = await seedMap('A');
    const b = await seedMap('B');
    const portal = await upsertMarker({ kind: 'portal', mapId: a, targetMapId: b, x: 1, y: 1 });

    // Delete the target map (cascade delete of the Location).
    await deleteEntity('maps', b);

    const row = await db.markers.get(portal.id);
    // The portal row survives (it is a Marker on A, not cascaded by the target's delete)…
    expect(row).toBeDefined();
    expect(row!.targetMapId).toBe(b);
    // …but the target lookup is now undefined → the UI renders "destination deleted" + a muted glyph.
    const target = row!.targetMapId ? await db.maps.get(row!.targetMapId) : undefined;
    expect(target).toBeUndefined();
  });
});

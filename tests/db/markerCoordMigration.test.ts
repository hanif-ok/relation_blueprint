// RESEARCH A1 — THE load-bearing migration test of Phase 3. The coordinate-model
// reinterpretation (marker x/y become IMAGE-space, composed onto a per-map backgroundTransform)
// is the single most dangerous change in the phase: if the version(4) upgrade rewrote existing
// marker coordinates, every Phase-1/2 marker would visibly jump on first open. This test pins
// the invariant: the upgrade backfills `kind`/transform/layers DEFAULTS but NEVER moves a marker.
//
// It seeds the on-disk IndexedDB at the real Phase-1 `version(1)` schema (markers + maps with NO
// kind/transform/layers, stage-space x/y), then opens the real app database (versions 1->2->3->4)
// so Dexie runs the version(4) upgrade, and asserts the backfill + the coordinate invariant. It
// must run BEFORE the singleton `db` opens, so it seeds at v1 first and only then imports schema.

import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';

describe('Dexie v4 upgrade — backfill marker kind + map transform/layers without moving markers', () => {
  it('upgrades legacy v1 markers/maps: kind=person, identity transform, default layer, x/y UNCHANGED', async () => {
    // 1. Seed the DB at version(1) — the exact Phase-01 store shape, before Phase-3 fields.
    const legacy = new Dexie('relation-blueprint');
    legacy.version(1).stores({
      people: 'id, name, updatedAt, dirty',
      maps: 'id, name, updatedAt, dirty',
      markers: 'id, mapId, personId, updatedAt, dirty',
      media: 'hash',
      meta: 'key',
      syncQueue: '++seq, entityType, entityId',
    });
    await legacy.open();
    // A Phase-01 map: no backgroundTransform / shapes / layers, plus the Phase-2 custom map.
    await legacy.table('maps').add({
      id: 'm-legacy',
      name: 'HQ',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
      gallery: [],
      custom: {},
      updatedAt: 1,
      dirty: false,
    });
    // Two Phase-01 markers with stage-space coordinates and NO `kind`.
    await legacy.table('markers').add({
      id: 'mk-1',
      mapId: 'm-legacy',
      personId: 'p-1',
      x: 123,
      y: 456,
      updatedAt: 1,
      dirty: false,
    });
    await legacy.table('markers').add({
      id: 'mk-2',
      mapId: 'm-legacy',
      personId: 'p-2',
      x: 7,
      y: 8,
      updatedAt: 1,
      dirty: false,
    });
    legacy.close();

    // 2. Open the real app DB (versions 1 -> 2 -> 3 -> 4). Dexie runs the v4 upgrade backfill.
    const { db } = await import('@/db/schema');
    const markers = await db.markers.orderBy('id').toArray();
    const map = await db.maps.get('m-legacy');

    // (1) Every existing marker is now a person marker, x/y BYTE-UNCHANGED.
    expect(markers).toHaveLength(2);
    const m1 = markers.find((m) => m.id === 'mk-1')!;
    const m2 = markers.find((m) => m.id === 'mk-2')!;
    expect(m1.kind).toBe('person');
    expect(m1.x).toBe(123);
    expect(m1.y).toBe(456);
    expect(m2.kind).toBe('person');
    expect(m2.x).toBe(7);
    expect(m2.y).toBe(8);

    // (2) The map now carries an identity backgroundTransform + a default "Markers" layer.
    expect(map).toBeDefined();
    expect(map?.backgroundTransform).toEqual({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
    expect(map?.shapes).toEqual([]);
    expect(map?.layers).toHaveLength(1);
    const layer = map!.layers[0];
    expect(layer.name).toBe('Markers');
    expect(layer.visible).toBe(true);
    expect(layer.locked).toBe(false);
    expect(layer.order).toBe(0);
    expect(typeof layer.id).toBe('string');
    expect(layer.id.length).toBeGreaterThan(0);

    // (3) Composing the IDENTITY background transform onto an old marker's x/y yields the SAME
    //     point — i.e. the upgrade caused no visible move. (coords.ts ships in a later plan; assert
    //     the identity-composition arithmetic inline: offset 0, scale 1, rotation 0 -> output==input.)
    const t = map!.backgroundTransform!;
    const composeIdentity = (x: number, y: number) => {
      const cos = Math.cos(t.rotation);
      const sin = Math.sin(t.rotation);
      return {
        x: t.offsetX + (x * cos - y * sin) * t.scale,
        y: t.offsetY + (x * sin + y * cos) * t.scale,
      };
    };
    expect(composeIdentity(m1.x, m1.y)).toEqual({ x: 123, y: 456 });
    expect(composeIdentity(m2.x, m2.y)).toEqual({ x: 7, y: 8 });
  });
});

// Regression: legacy v1 records (created in Phase 01, before the `custom` map existed) must be
// backfilled with `custom = {}` when the DB upgrades to the Phase-02 schema. Without the backfill,
// `entity.custom` is `undefined`, and the profile read path (CustomFieldRows -> `custom[def.id]`)
// throws a TypeError the moment a field definition exists — a white-screen crash (02-UAT test 2).
//
// This test seeds the on-disk IndexedDB at the real Phase-01 `version(1)` schema (a person row with
// NO `custom`), then opens the real app database (versions 1->2->3) so Dexie runs the upgrade, and
// asserts the legacy record now carries `custom = {}`. It must run BEFORE the singleton `db` opens,
// so it does the v1 seed first and only then imports `@/db/schema`.

import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';

describe('Dexie v3 upgrade — backfill custom on legacy v1 records', () => {
  it('a person stored at schema v1 (no custom map) gets custom={} after the upgrade', async () => {
    // 1. Seed the DB at version(1) — the exact Phase-01 store shape, before `custom` existed.
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
    // A Phase-01 person record: note the ABSENT `custom` key — the shape that white-screens.
    await legacy.table('people').add({
      id: 'p-legacy',
      name: 'Ada Lovelace',
      photo: { hash: 'h', mime: 'image/png' },
      phone: '',
      description: '',
      tags: [],
      gallery: [],
      notes: '',
      updatedAt: 1,
      dirty: false,
    });
    // And a Phase-01 location, which is also a v1 table that pre-dates `custom`.
    await legacy.table('maps').add({
      id: 'm-legacy',
      name: 'HQ',
      width: 800,
      height: 600,
      updatedAt: 1,
      dirty: false,
    });
    legacy.close();

    // 2. Open the real app DB (versions 1 -> 2 -> 3). Dexie runs the v3 upgrade backfill.
    const { db } = await import('@/db/schema');
    const person = await db.people.get('p-legacy');
    const map = await db.maps.get('m-legacy');

    expect(person).toBeDefined();
    expect(person?.custom).toEqual({});
    expect(map).toBeDefined();
    expect(map?.custom).toEqual({});

    // The rest of the record is carried forward untouched.
    expect(person?.name).toBe('Ada Lovelace');
    expect(map?.name).toBe('HQ');
  });
});

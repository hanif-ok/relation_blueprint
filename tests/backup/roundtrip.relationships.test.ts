// REL-02: relationship endpoint fields + label/date/notes survive the export→import round-trip,
// and the untrusted-at-rest import gate (BackupSchema) REJECTS a Location-typed endpoint (V5,
// T-04-02) BEFORE any DB write. Mirrors the roundtrip.entities harness. References endpoint fields
// that do NOT exist before this phase — the round-trip case is RED until Task 2.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createGroup, createPerson, createRelationshipLink } from '@/db/repository';
import { exportDb } from '@/features/backup/exportDb';
import { importDb } from '@/features/backup/importDb';

async function clearAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.people, db.maps, db.markers, db.groups, db.relationshipLinks, db.fieldDefs, db.media, db.meta],
    async () => {
      await Promise.all([
        db.people.clear(),
        db.maps.clear(),
        db.markers.clear(),
        db.groups.clear(),
        db.relationshipLinks.clear(),
        db.fieldDefs.clear(),
        db.media.clear(),
        db.meta.clear(),
      ]);
    },
  );
}

beforeEach(clearAll);

describe('relationship endpoints survive export→import (REL-02)', () => {
  it('reconstructs endpoints + label/date/notes identically', async () => {
    const a = await createPerson({ name: 'A' });
    const g = await createGroup({ name: 'G' });
    const link = await createRelationshipLink({
      name: 'member',
      label: 'core member',
      date: '2026-02-02',
      notes: 'joined at founding',
      fromType: 'people',
      fromId: a.id,
      toType: 'groups',
      toId: g.id,
      directed: true,
    });

    const before = await db.relationshipLinks.get(link.id);

    const backup = await exportDb();
    await clearAll();
    expect(await db.relationshipLinks.count()).toBe(0);

    await importDb(backup);
    const after = await db.relationshipLinks.get(link.id);

    // Whole record deep-equal (endpoints + label/date/notes + spine ride the shard as plain JSON).
    expect(after).toEqual(before);
    expect(after?.fromType).toBe('people');
    expect(after?.fromId).toBe(a.id);
    expect(after?.toType).toBe('groups');
    expect(after?.toId).toBe(g.id);
    expect(after?.directed).toBe(true);
    expect(after?.label).toBe('core member');
    expect(after?.date).toBe('2026-02-02');
    expect(after?.notes).toBe('joined at founding');
  });
});

describe('import gate rejects a Location endpoint (V5 / T-04-02)', () => {
  it('BackupSchema rejects a relationship-link whose fromType is maps, before any write', async () => {
    const emptyPointer = { fileId: '', hash: '', updatedAt: 0 };
    const bundle = {
      schemaVersion: 1,
      manifest: {
        version: 0,
        updatedAt: 0,
        shards: {
          people: { ...emptyPointer },
          maps: { ...emptyPointer },
          markers: { ...emptyPointer },
          groups: { ...emptyPointer },
          'relationship-links': { ...emptyPointer },
        },
      },
      entities: {
        people: [],
        maps: [],
        markers: [],
        groups: [],
        'relationship-links': [
          {
            id: 'r1',
            name: 'bad',
            gallery: [],
            custom: {},
            // A Location endpoint — the closed people|groups enum must reject this at import.
            fromType: 'maps',
            fromId: 'm1',
            toType: 'people',
            toId: 'p1',
            updatedAt: 0,
            dirty: false,
          },
        ],
      },
      fieldDefs: [],
      media: {},
    };
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });

    await expect(importDb(blob)).rejects.toThrow();
    // The rejection happens BEFORE the write transaction — the DB stays untouched.
    expect(await db.relationshipLinks.count()).toBe(0);
  });
});

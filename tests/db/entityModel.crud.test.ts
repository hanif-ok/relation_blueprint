// Phase 2 (DATA-01/03, D-05/D-07/D-08/D-09): repository CRUD for the full entity model.
// Group, Relationship-link, and rich Location create/update through the single mutation path;
// the field-definition store create/reorder/soft-delete/list behaves per D-02/D-05; and a
// custom value written onto an entity persists through Dexie.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  createFieldDef,
  createGroup,
  createMap,
  createRelationshipLink,
  getGroup,
  getRelationshipLink,
  listFieldDefs,
  reorderFieldDefs,
  softDeleteFieldDef,
  updateMap,
} from '@/db/repository';

beforeEach(async () => {
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
});

describe('createGroup (D-09 spine)', () => {
  it('returns a Group with a nanoid id, empty custom/gallery, dirty + stamped updatedAt', async () => {
    const group = await createGroup({ name: 'The Founders' });
    expect(group.id).toBeTruthy();
    expect(group.custom).toEqual({});
    expect(group.gallery).toEqual([]);
    expect(group.dirty).toBe(true);
    expect(group.updatedAt).toBeGreaterThan(0);

    const stored = await getGroup(group.id);
    expect(stored?.name).toBe('The Founders');
  });

  it('persists a custom-value map onto the group', async () => {
    const group = await createGroup({ name: 'Crew', custom: { 'f-1': 'value', 'f-2': 42 } });
    const stored = await getGroup(group.id);
    expect(stored?.custom).toEqual({ 'f-1': 'value', 'f-2': 42 });
  });
});

describe('createRelationshipLink (D-08 data-bearing shell)', () => {
  it('persists a shell record with label/date/notes and no endpoints', async () => {
    const link = await createRelationshipLink({
      name: 'Mentorship',
      label: 'mentor',
      date: '2026-01-15',
      notes: 'Started in January',
    });
    expect(link.id).toBeTruthy();
    expect(link.dirty).toBe(true);

    const stored = await getRelationshipLink(link.id);
    expect(stored?.label).toBe('mentor');
    expect(stored?.date).toBe('2026-01-15');
    expect(stored?.notes).toBe('Started in January');
    // No endpoints field exists on the shell this phase.
    expect((stored as unknown as Record<string, unknown>).endpoints).toBeUndefined();
  });
});

describe('updateMap (D-07 rich Location edit)', () => {
  it('enriches an existing Phase-1 map without losing background/width/height', async () => {
    const map = await createMap({
      name: 'HQ',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
    });

    const updated = await updateMap(map.id, {
      photo: { hash: 'thumb', mime: 'image/png' },
      notes: 'Headquarters',
      custom: { 'loc-1': 'open' },
    });

    expect(updated.background).toEqual({ hash: 'bg', mime: 'image/png' });
    expect(updated.width).toBe(800);
    expect(updated.height).toBe(600);
    expect(updated.photo).toEqual({ hash: 'thumb', mime: 'image/png' });
    expect(updated.notes).toBe('Headquarters');
    expect(updated.custom).toEqual({ 'loc-1': 'open' });
    expect(updated.dirty).toBe(true);
  });
});

describe('field-definition store (D-02/D-05)', () => {
  it('createFieldDef stamps a stable id, deleted:false, and an appended order', async () => {
    const first = await createFieldDef({ entityType: 'people', label: 'Employer', type: 'link-to-entity', targetType: 'groups' });
    expect(first.id).toBeTruthy();
    expect(first.deleted).toBe(false);
    expect(first.order).toBe(0);
    expect(first.targetType).toBe('groups');

    const second = await createFieldDef({ entityType: 'people', label: 'Age', type: 'number' });
    expect(second.order).toBe(1);

    const list = await listFieldDefs('people');
    expect(list.map((d) => d.id)).toEqual([first.id, second.id]);
  });

  it('listFieldDefs scopes by entity type (D-03)', async () => {
    await createFieldDef({ entityType: 'people', label: 'Employer', type: 'text' });
    await createFieldDef({ entityType: 'groups', label: 'Founded', type: 'date' });
    const peopleDefs = await listFieldDefs('people');
    const groupDefs = await listFieldDefs('groups');
    expect(peopleDefs).toHaveLength(1);
    expect(groupDefs).toHaveLength(1);
    expect(peopleDefs[0].label).toBe('Employer');
  });

  it('softDeleteFieldDef sets deleted:true (NOT a row delete) and hides it by default', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Temp', type: 'text' });
    await softDeleteFieldDef(def.id);

    // The row still exists in the table — values are retained (D-05).
    const row = await db.fieldDefs.get(def.id);
    expect(row).toBeDefined();
    expect(row?.deleted).toBe(true);

    // Hidden from the default list, visible with includeDeleted.
    expect(await listFieldDefs('people')).toHaveLength(0);
    expect(await listFieldDefs('people', { includeDeleted: true })).toHaveLength(1);
  });

  it('reorderFieldDefs rewrites order so listFieldDefs returns the new sequence', async () => {
    const a = await createFieldDef({ entityType: 'people', label: 'A', type: 'text' });
    const b = await createFieldDef({ entityType: 'people', label: 'B', type: 'text' });
    expect((await listFieldDefs('people')).map((d) => d.id)).toEqual([a.id, b.id]);

    await reorderFieldDefs('people', [b.id, a.id]);
    const reordered = await listFieldDefs('people');
    expect(reordered.map((d) => d.id)).toEqual([b.id, a.id]);
    expect(reordered.map((d) => d.order)).toEqual([0, 1]);
  });
});

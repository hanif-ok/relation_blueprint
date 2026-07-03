// REL-01: relationship endpoints (people|groups only + per-link direction), the reverse-lookup
// index (`listRelationshipsFor`), and cascade-on-delete. Endpoints are the Phase-4 extension of
// the Phase-2 data-bearing RelationshipLink shell (D-01 per-link direction, D-04 single canonical
// link queried from both ends, D-07 people|groups endpoints only). These reference endpoint fields
// and `listRelationshipsFor` that do NOT exist before this phase — the suite is RED until Task 2.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  createGroup,
  createPerson,
  createRelationshipLink,
  deleteEntity,
  listRelationshipsFor,
} from '@/db/repository';
import type { RelationshipEndpointType } from '@/domain/types';

beforeEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.maps.clear(),
    db.markers.clear(),
    db.groups.clear(),
    db.relationshipLinks.clear(),
    db.fieldDefs.clear(),
    db.media.clear(),
    db.meta.clear(),
    db.syncQueue.clear(),
  ]);
});

describe('createRelationshipLink endpoints (REL-01 / D-01 / D-07)', () => {
  it('persists a person↔person link with all endpoint fields + directed', async () => {
    const a = await createPerson({ name: 'Ada' });
    const b = await createPerson({ name: 'Grace' });
    const link = await createRelationshipLink({
      name: 'mentor',
      fromType: 'people',
      fromId: a.id,
      toType: 'people',
      toId: b.id,
      directed: true,
    });
    const stored = await db.relationshipLinks.get(link.id);
    expect(stored?.fromType).toBe('people');
    expect(stored?.fromId).toBe(a.id);
    expect(stored?.toType).toBe('people');
    expect(stored?.toId).toBe(b.id);
    expect(stored?.directed).toBe(true);
  });

  it('persists person↔group and group↔group links (endpoints people|groups only)', async () => {
    const p = await createPerson({ name: 'Ada' });
    const g1 = await createGroup({ name: 'IEEE' });
    const g2 = await createGroup({ name: 'Bell Labs' });
    const pg = await createRelationshipLink({
      name: 'member',
      fromType: 'people',
      fromId: p.id,
      toType: 'groups',
      toId: g1.id,
    });
    const gg = await createRelationshipLink({
      name: 'allied',
      fromType: 'groups',
      fromId: g1.id,
      toType: 'groups',
      toId: g2.id,
    });
    expect((await db.relationshipLinks.get(pg.id))?.toType).toBe('groups');
    expect((await db.relationshipLinks.get(gg.id))?.fromType).toBe('groups');
  });

  it('rejects a Location (maps) endpoint at the write path (D-07 enum gate)', async () => {
    const p = await createPerson({ name: 'Ada' });
    // A 'maps' endpoint is untrusted runtime input the closed enum must reject; cast past the
    // compile-time enum to exercise the RUNTIME validation gate (RelationshipLinkSchema.parse).
    await expect(
      createRelationshipLink({
        name: 'bad',
        fromType: 'maps' as unknown as RelationshipEndpointType,
        fromId: 'somewhere',
        toType: 'people',
        toId: p.id,
      }),
    ).rejects.toThrow();
  });
});

describe('listRelationshipsFor reverse lookup (REL-01 / D-04)', () => {
  it('returns links where the entity is the from OR the to endpoint, excluding unrelated', async () => {
    const a = await createPerson({ name: 'A' });
    const b = await createPerson({ name: 'B' });
    const c = await createPerson({ name: 'C' });
    // A is the FROM end.
    const fromLink = await createRelationshipLink({
      name: 'x',
      fromType: 'people',
      fromId: a.id,
      toType: 'people',
      toId: b.id,
    });
    // A is the TO end.
    const toLink = await createRelationshipLink({
      name: 'y',
      fromType: 'people',
      fromId: c.id,
      toType: 'people',
      toId: a.id,
    });
    // Unrelated to A (B↔C).
    await createRelationshipLink({
      name: 'z',
      fromType: 'people',
      fromId: b.id,
      toType: 'people',
      toId: c.id,
    });

    const found = await listRelationshipsFor(a.id);
    const ids = found.map((l) => l.id).sort();
    expect(ids).toEqual([fromLink.id, toLink.id].sort());
  });
});

describe('cascade relationship-links on entity delete (REL-01 integrity / T-04-03)', () => {
  it('deleteEntity(people) removes every link the person is an endpoint of (no orphan)', async () => {
    const a = await createPerson({ name: 'A' });
    const b = await createPerson({ name: 'B' });
    const fromLink = await createRelationshipLink({
      name: 'x',
      fromType: 'people',
      fromId: a.id,
      toType: 'people',
      toId: b.id,
    });
    const toLink = await createRelationshipLink({
      name: 'y',
      fromType: 'people',
      fromId: b.id,
      toType: 'people',
      toId: a.id,
    });

    await deleteEntity('people', a.id);

    expect(await db.relationshipLinks.get(fromLink.id)).toBeUndefined();
    expect(await db.relationshipLinks.get(toLink.id)).toBeUndefined();
  });

  it("deleteEntity(groups) cascades the group's relationship-links", async () => {
    const g = await createGroup({ name: 'G' });
    const p = await createPerson({ name: 'P' });
    const link = await createRelationshipLink({
      name: 'member',
      fromType: 'people',
      fromId: p.id,
      toType: 'groups',
      toId: g.id,
    });

    await deleteEntity('groups', g.id);

    expect(await db.relationshipLinks.get(link.id)).toBeUndefined();
  });
});

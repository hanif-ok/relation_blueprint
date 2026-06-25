// Phase 2: the sharded serializer round-trips the NEW entity types (groups, relationship-links,
// field definitions) and a per-entity custom-value map exactly, with the established `-000`
// bucket naming. This is the storage-threading proof for DATA-01 custom values + D-08/D-09.

import { describe, expect, it } from 'vitest';
import { serializeShards, deserializeShards, type EntitySet } from '@/sync/serializer';
import type { FieldDef, Group, RelationshipLink } from '@/domain/types';

function group(id: string): Group {
  return {
    id,
    name: `group-${id}`,
    gallery: [],
    custom: { 'g-field': 'value', 'g-num': 7, 'g-tags': ['x', 'y'] },
    updatedAt: 100,
    dirty: false,
  };
}

function relationshipLink(id: string): RelationshipLink {
  return {
    id,
    name: `link-${id}`,
    gallery: [],
    label: 'mentor',
    date: '2026-01-01',
    custom: { 'r-photo': { hash: 'h1', mime: 'image/png' } },
    updatedAt: 100,
    dirty: false,
  };
}

function fieldDef(id: string, order: number): FieldDef {
  return {
    id,
    entityType: 'people',
    label: `field-${id}`,
    type: 'text',
    required: false,
    order,
    deleted: false,
    updatedAt: 100,
    dirty: false,
  };
}

function emptyExcept(partial: Partial<EntitySet>): EntitySet {
  return {
    people: [],
    maps: [],
    markers: [],
    groups: [],
    relationshipLinks: [],
    fieldDefs: [],
    ...partial,
  };
}

describe('serializeShards / deserializeShards — new entity types', () => {
  it('round-trips groups, relationship-links, and field definitions exactly', async () => {
    const entities = emptyExcept({
      groups: [group('g1'), group('g2')],
      relationshipLinks: [relationshipLink('r1')],
      fieldDefs: [fieldDef('f1', 0), fieldDef('f2', 1)],
    });

    const shards = serializeShards(entities);
    const restored = await deserializeShards(shards);

    expect(restored).toEqual(entities);
  });

  it('names the new shards groups-000.json / relationship-links-000.json / field-defs-000.json', () => {
    const shards = serializeShards(emptyExcept({}));
    const names = Object.keys(shards);
    expect(names).toContain('groups-000.json');
    expect(names).toContain('relationship-links-000.json');
    expect(names).toContain('field-defs-000.json');
  });

  it('round-trips a custom-value map (string/number/tags/photo) on an entity unchanged', async () => {
    const g = group('g1');
    const entities = emptyExcept({ groups: [g] });
    const restored = await deserializeShards(serializeShards(entities));
    expect(restored.groups[0].custom).toEqual(g.custom);
  });
});

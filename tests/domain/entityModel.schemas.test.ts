// Phase 2 (DATA-01/03, D-01/D-05/D-07/D-08/D-09): the zod trust boundary for the full
// entity model. These assert the new schemas accept well-formed shapes and REJECT malformed
// ones — a Group/Relationship-link/rich-Location spine, the per-entity custom-value map, and
// the field-definition store. The `satisfies` locks (compiled by `tsc --noEmit`) guarantee
// each schema's `z.infer` matches its hand-written interface; these tests cover runtime parse.

import { describe, expect, it } from 'vitest';
import {
  CustomValuesSchema,
  FieldDefSchema,
  GroupSchema,
  ManifestSchema,
  MapDocSchema,
  RelationshipLinkSchema,
} from '@/domain/schemas';
import type { FieldType } from '@/domain/types';

function validGroup() {
  return {
    id: 'g1',
    name: 'The Founders',
    gallery: [],
    custom: {},
    updatedAt: 1_700_000_000_000,
    dirty: true,
  };
}

describe('GroupSchema (D-09 spine)', () => {
  it('accepts a minimal group with empty gallery + custom map', () => {
    expect(GroupSchema.safeParse(validGroup()).success).toBe(true);
  });

  it('accepts a group carrying photo, notes, and a custom-value map', () => {
    const group = {
      ...validGroup(),
      photo: { hash: 'abc', mime: 'image/webp' },
      notes: 'Quarterly meetup crew',
      custom: { 'field-1': 'value', 'field-2': 42, 'field-3': ['a', 'b'] },
    };
    expect(GroupSchema.safeParse(group).success).toBe(true);
  });

  it('rejects a group missing the required `name`', () => {
    const { name: _omit, ...withoutName } = validGroup();
    void _omit;
    expect(GroupSchema.safeParse(withoutName).success).toBe(false);
  });
});

describe('RelationshipLinkSchema (D-08 data-bearing shell)', () => {
  it('accepts a shell record with optional label/date/notes and no endpoints', () => {
    const link = {
      id: 'r1',
      name: 'Mentorship',
      label: 'mentor',
      date: '2026-01-15',
      notes: 'Started in January',
      gallery: [],
      custom: {},
      updatedAt: 1_700_000_000_000,
      dirty: true,
    };
    expect(RelationshipLinkSchema.safeParse(link).success).toBe(true);
  });

  it('accepts a minimal relationship-link with only name + spine', () => {
    const link = {
      id: 'r2',
      name: 'Link',
      gallery: [],
      custom: {},
      updatedAt: 1,
      dirty: false,
    };
    expect(RelationshipLinkSchema.safeParse(link).success).toBe(true);
  });
});

describe('MapDocSchema extended to rich Location (D-07)', () => {
  function phase1Map() {
    return {
      id: 'm1',
      name: 'Floor 1',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
      gallery: [],
      custom: {},
      updatedAt: 1,
      dirty: false,
    };
  }

  it('still accepts a Phase-1 map enriched with the new spine defaults', () => {
    expect(MapDocSchema.safeParse(phase1Map()).success).toBe(true);
  });

  it('accepts a map with photo/gallery/notes/custom', () => {
    const map = {
      ...phase1Map(),
      photo: { hash: 'p', mime: 'image/png' },
      gallery: [{ hash: 'g1', mime: 'image/png' }],
      notes: 'Headquarters',
      custom: { 'loc-field': 'open' },
    };
    expect(MapDocSchema.safeParse(map).success).toBe(true);
  });
});

describe('FieldDefSchema (D-02/D-05/D-06)', () => {
  function validFieldDef(type: FieldType) {
    return {
      id: 'fd1',
      entityType: 'people' as const,
      label: 'Employer',
      type,
      required: false,
      order: 0,
      deleted: false,
      updatedAt: 1,
      dirty: true,
    };
  }

  it('accepts each of the 7 DATA-03 field types', () => {
    const types: FieldType[] = ['text', 'number', 'date', 'phone', 'tags', 'link-to-entity', 'photo'];
    for (const type of types) {
      expect(FieldDefSchema.safeParse(validFieldDef(type)).success).toBe(true);
    }
  });

  it('accepts an optional options array (Tags/Select) and a targetType (Link-to-entity)', () => {
    const def = {
      ...validFieldDef('link-to-entity'),
      options: ['a', 'b'],
      targetType: 'groups' as const,
    };
    expect(FieldDefSchema.safeParse(def).success).toBe(true);
  });

  it('rejects an unknown field type', () => {
    const bad = { ...validFieldDef('text'), type: 'rich-text' };
    expect(FieldDefSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-integer order', () => {
    const bad = { ...validFieldDef('text'), order: 1.5 };
    expect(FieldDefSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ManifestSchema field-defs pointer (DATA-03 cloud-sync backward-compat)', () => {
  const pointer = { fileId: 'file-1', hash: 'h', updatedAt: 100 };
  function manifestWithoutFieldDefs() {
    return {
      version: 1,
      updatedAt: 100,
      shards: {
        people: pointer,
        maps: pointer,
        markers: pointer,
        groups: pointer,
        'relationship-links': pointer,
      },
    };
  }

  it('accepts an OLD manifest whose shards omit the field-defs pointer (no crash on reconnect)', () => {
    // The exact second-device scenario this phase fixes: a manifest written before the field-defs
    // shard was threaded through the cloud path must still validate (the pointer is .optional()).
    expect(ManifestSchema.safeParse(manifestWithoutFieldDefs()).success).toBe(true);
  });

  it('accepts a NEW manifest carrying a well-formed field-defs pointer', () => {
    const manifest = {
      ...manifestWithoutFieldDefs(),
      shards: { ...manifestWithoutFieldDefs().shards, 'field-defs': pointer },
    };
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects a manifest whose PRESENT field-defs pointer is malformed (gate stays strict)', () => {
    // A present pointer is still fully validated by ShardPointerSchema (threat T-02.1-01): a
    // malformed one (missing fileId) is rejected, so the optional key does not weaken the gate.
    const manifest = {
      ...manifestWithoutFieldDefs(),
      shards: { ...manifestWithoutFieldDefs().shards, 'field-defs': { hash: 'h', updatedAt: 1 } },
    };
    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe('CustomValuesSchema (D-01 per-entity value map)', () => {
  it('accepts the union of allowed value shapes keyed by fieldId', () => {
    const values = {
      'f-text': 'hello',
      'f-number': 7,
      'f-tags': ['x', 'y'],
      'f-photo': { hash: 'h', mime: 'image/png' },
      'f-empty': null,
    };
    expect(CustomValuesSchema.safeParse(values).success).toBe(true);
  });

  it('tolerates an empty map (no keys)', () => {
    expect(CustomValuesSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a value of a disallowed shape', () => {
    const bad = { 'f-bad': { unexpected: true } };
    expect(CustomValuesSchema.safeParse(bad).success).toBe(false);
  });
});

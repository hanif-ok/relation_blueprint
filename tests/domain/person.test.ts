// DATA-02 + threat T-02-01: the zod schemas are the trust boundary for data read back
// from the cloud or an import bundle. These tests assert the schemas accept well-formed
// shapes and REJECT malformed ones — a missing `name`, a non-array `tags`, a manifest
// missing a shard pointer's fileId.

import { describe, expect, it } from 'vitest';
import { ManifestSchema, PersonSchema } from '@/domain/schemas';
import type { Manifest, Person } from '@/domain/types';

function validPerson(): Person {
  return {
    id: 'p1',
    name: 'Ada Lovelace',
    phone: '+44 20 7946 0958',
    description: 'Mathematician',
    tags: ['friend', 'london'],
    notes: 'Met at the symposium',
    gallery: [],
    updatedAt: 1_700_000_000_000,
    dirty: true,
  };
}

function validManifest(): Manifest {
  const pointer = { fileId: 'f', hash: 'h', updatedAt: 1 };
  return {
    version: 1,
    updatedAt: 1,
    shards: { people: pointer, maps: pointer, markers: pointer },
  };
}

describe('PersonSchema (DATA-02)', () => {
  it('accepts a valid Person carrying all DATA-02 fields', () => {
    const result = PersonSchema.safeParse(validPerson());
    expect(result.success).toBe(true);
  });

  it('accepts a Person with an optional photo MediaRef', () => {
    const person = { ...validPerson(), photo: { hash: 'abc', mime: 'image/webp' } };
    expect(PersonSchema.safeParse(person).success).toBe(true);
  });

  it('rejects a Person missing the required `name` field', () => {
    const { name: _omit, ...withoutName } = validPerson();
    void _omit;
    const result = PersonSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it('rejects a Person whose `tags` is not an array', () => {
    const bad = { ...validPerson(), tags: 'friend' };
    expect(PersonSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ManifestSchema (T-02-01)', () => {
  it('accepts a well-formed manifest', () => {
    expect(ManifestSchema.safeParse(validManifest()).success).toBe(true);
  });

  it('rejects a manifest with a shard pointer missing its fileId', () => {
    const manifest = validManifest();
    // Strip fileId from the people shard pointer.
    const broken = {
      ...manifest,
      shards: {
        ...manifest.shards,
        people: { hash: 'h', updatedAt: 1 },
      },
    };
    expect(ManifestSchema.safeParse(broken).success).toBe(false);
  });
});

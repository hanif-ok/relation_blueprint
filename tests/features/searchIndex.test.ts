// SRCH-01 — the MiniSearch index service. This pins, over plain in-memory documents (no Dexie
// needed — buildIndex/search are pure over a Person[]):
//   (1) prefix match: 'smi' surfaces 'Smith' (D-06 prefix:true)
//   (2) fuzzy tolerance: a single-edit typo still surfaces 'Smith' (D-06 fuzzy:0.2)
//   (3) field restriction: querying only a field the term is NOT in drops the hit (the scoping
//       seam plan 02's checkboxes drive)
//   (4) two-char threshold: a 1-char query returns [] (D-08)
//   (5) empty-fields guard: [] fields returns [] (no scope selected)
//   (6) boost ordering: a NAME match outranks a NOTES-only match (D-07 name-boosted ranking)

import { describe, expect, it } from 'vitest';
import type { Person } from '@/domain/types';
import {
  BUILTIN_FIELD_BOOSTS,
  BUILTIN_FIELD_KEYS,
  buildIndex,
  search,
} from '@/features/search/searchIndex';

/** A minimal Person with the required spine fields; override any built-in per test. */
function person(over: Partial<Person> & { id: string; name: string }): Person {
  return {
    tags: [],
    gallery: [],
    custom: {},
    updatedAt: Date.now(),
    dirty: false,
    ...over,
  };
}

/** The full built-in key list — what SearchView passes for this slice (all fields on). */
const ALL_FIELDS = [...BUILTIN_FIELD_KEYS];

describe('SRCH-01 — MiniSearch index service over People built-in fields', () => {
  it('prefix-matches "smi" to a person named "Smith" (and not "Jones")', () => {
    const index = buildIndex([
      person({ id: 'p1', name: 'Smith' }),
      person({ id: 'p2', name: 'Jones' }),
    ]);
    const hits = search(index, 'smi', ALL_FIELDS);
    const ids = hits.map((h) => h.id);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2');
  });

  it('fuzzy-matches a single-edit typo ("smyth") to "Smith" within the 0.2 tolerance', () => {
    const index = buildIndex([
      person({ id: 'p1', name: 'Smith' }),
      person({ id: 'p2', name: 'Jones' }),
    ]);
    const ids = search(index, 'smyth', ALL_FIELDS).map((h) => h.id);
    expect(ids).toContain('p1');
  });

  it('restricts the query to the supplied fields (the scoping seam)', () => {
    // Smith's name is "Smith"; his NOTES do not contain "smith".
    const index = buildIndex([person({ id: 'p1', name: 'Smith', notes: 'a blacksmith by trade' })]);

    // Restricted to Name → Smith matches.
    expect(search(index, 'Smith', ['builtin:name']).map((h) => h.id)).toContain('p1');

    // Restricted to Notes only → the term "smith" is not a NOTES token, so no Smith hit.
    expect(search(index, 'Smith', ['builtin:notes']).map((h) => h.id)).not.toContain('p1');
  });

  it('returns [] below the 2-char threshold (D-08)', () => {
    const index = buildIndex([person({ id: 'p1', name: 'Smith' })]);
    expect(search(index, 's', ALL_FIELDS)).toEqual([]);
  });

  it('returns [] when no fields are selected (empty scope)', () => {
    const index = buildIndex([person({ id: 'p1', name: 'Smith' })]);
    expect(search(index, 'smith', [])).toEqual([]);
  });

  it('ranks a NAME match above a NOTES-only match (D-07 name boost)', () => {
    // The name key must be the highest-boosted built-in.
    expect(BUILTIN_FIELD_BOOSTS['builtin:name']).toBeGreaterThan(BUILTIN_FIELD_BOOSTS['builtin:notes']);

    const index = buildIndex([
      person({ id: 'named', name: 'Smith' }),
      person({ id: 'noted', name: 'Alex Green', notes: 'often works with smith' }),
    ]);
    const hits = search(index, 'smith', ALL_FIELDS);
    const ids = hits.map((h) => h.id);
    expect(ids).toContain('named');
    expect(ids).toContain('noted');
    // The name match ranks first (higher score → earlier in the results array).
    expect(ids.indexOf('named')).toBeLessThan(ids.indexOf('noted'));
  });
});

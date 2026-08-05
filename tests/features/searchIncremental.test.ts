// SRCH-01 criterion 3 — incremental index freshness. This pins the pure `applyChange` path that
// keeps the index in sync with the repository change signal WITHOUT a full rebuild: the index is
// built ONCE at setup, and every create/update/delete afterwards flows through `applyChange` alone
// (add / replace / discard). It also pins that a FIELD-SCHEMA change alters the searchable field
// set (the coarse rebuild the hook owns — proven here by building with vs. without the field).

import { describe, expect, it } from 'vitest';
import type { FieldDef, Person } from '@/domain/types';
import { BUILTIN_FIELD_KEYS, applyChange, buildIndex, search } from '@/features/search/searchIndex';

/** A minimal Person with the required spine fields; override any built-in per test. */
function person(over: Partial<Person> & { id: string; name: string }): Person {
  return { tags: [], gallery: [], custom: {}, updatedAt: Date.now(), dirty: false, ...over };
}

/** All built-in field keys — what SearchView passes when every field is on. */
const ALL = [...BUILTIN_FIELD_KEYS];

describe('applyChange — the index stays fresh via the change signal (criterion 3)', () => {
  it('add on create: a new person becomes searchable WITHOUT rebuilding the index', async () => {
    // buildIndex is invoked EXACTLY ONCE (here); every mutation below is applyChange only.
    const { index, fieldTextById } = await buildIndex([person({ id: 's', name: 'Smith' })]);
    expect(search(index, 'jon', ALL).map((h) => h.id)).not.toContain('j');

    const jones = person({ id: 'j', name: 'Jones' });
    await applyChange(
      index,
      fieldTextById,
      { entityType: 'people', entityId: 'j', op: 'create' },
      new Map([['j', jones]]),
      [],
    );

    expect(search(index, 'jon', ALL).map((h) => h.id)).toContain('j');
    expect(fieldTextById.get('j')?.['builtin:name']).toBe('Jones');
  });

  it('replace on update: the stale document is dropped (old name stops matching, new matches)', async () => {
    const { index, fieldTextById } = await buildIndex([person({ id: 's', name: 'Smith' })]);
    expect(search(index, 'smith', ALL).map((h) => h.id)).toContain('s');

    await applyChange(
      index,
      fieldTextById,
      { entityType: 'people', entityId: 's', op: 'update' },
      new Map([['s', person({ id: 's', name: 'Baker' })]]),
      [],
    );

    expect(search(index, 'smith', ALL).map((h) => h.id)).not.toContain('s');
    expect(search(index, 'baker', ALL).map((h) => h.id)).toContain('s');
    expect(fieldTextById.get('s')?.['builtin:name']).toBe('Baker');
  });

  it('discard on delete: the person is no longer returned and its fieldText entry is dropped', async () => {
    const { index, fieldTextById } = await buildIndex([person({ id: 's', name: 'Smith' })]);
    await applyChange(
      index,
      fieldTextById,
      { entityType: 'people', entityId: 's', op: 'delete' },
      new Map(),
      [],
    );

    expect(search(index, 'smith', ALL)).toEqual([]);
    expect(fieldTextById.has('s')).toBe(false);
  });

  it('guards the not-yet-indexed case: an update for an unknown id falls back to add', async () => {
    const { index, fieldTextById } = await buildIndex([]);
    await applyChange(
      index,
      fieldTextById,
      { entityType: 'people', entityId: 'j', op: 'update' },
      new Map([['j', person({ id: 'j', name: 'Jones' })]]),
      [],
    );
    expect(search(index, 'jon', ALL).map((h) => h.id)).toContain('j');
  });

  it('ignores non-people change events (only the people entity type drives the per-row path)', async () => {
    const { index, fieldTextById } = await buildIndex([person({ id: 's', name: 'Smith' })]);
    await applyChange(
      index,
      fieldTextById,
      { entityType: 'groups', entityId: 'g', op: 'create' },
      new Map(),
      [],
    );
    expect(search(index, 'smith', ALL).map((h) => h.id)).toContain('s'); // unchanged
  });

  it('a soft-deleted custom field drops out of the searchable set (the coarse rebuild path)', async () => {
    const jobDef: FieldDef = {
      id: 'fld_job',
      entityType: 'people',
      label: 'Job',
      type: 'text',
      required: false,
      order: 0,
      deleted: false,
      updatedAt: Date.now(),
      dirty: false,
    };
    const alex = person({ id: 'p', name: 'Alex Black', custom: { fld_job: 'blacksmith' } });

    // With the Job field active, "smith" matches via the custom Job value (the signature behavior).
    const active = await buildIndex([alex], [jobDef]);
    expect(search(active.index, 'smith', ['fld_job']).map((h) => h.id)).toContain('p');

    // A soft-delete changes the searchable SET — a rebuild no longer indexes Job, so it stops matching.
    const removed = await buildIndex([alex], [{ ...jobDef, deleted: true }]);
    expect(search(removed.index, 'smith', ['fld_job'])).toEqual([]);
  });
});

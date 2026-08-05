// SRCH-02 — the persisted, subtractive field-scope selection (D-04 default-ON, D-05 rename-stable).
// This pins, over the pure resolver + a real Dexie `meta` round-trip:
//   (1) no stored map → EVERY candidate key active (default ON, D-04)
//   (2) un-checking one field omits its key but keeps every built-in (subtractive)
//   (3) a RENAME (same FieldDef.id, new label) keeps the stored `false` honored (D-05)
//   (4) a SOFT-DELETED def is not a candidate → its stored `false` is ignored, built-ins untouched
//   (5) a BRAND-NEW def (absent from the map) defaults ON
//   (6) every candidate `false` → resolveActiveFields returns [] (the all-fields-off condition)
//   (7) setFieldChecked persists under exactly the `searchFieldScope` meta key, subtractively

import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db/schema';
import type { FieldDef } from '@/domain/types';
import {
  SCOPE_META_KEY,
  applyScopeChange,
  isFieldChecked,
  resolveActiveFields,
  useScopeSelection,
} from '@/features/search/useScopeSelection';

/** The five built-in scope keys (mirrors BUILTIN_FIELD_KEYS — kept literal so the test is self-contained). */
const BUILTINS = [
  'builtin:name',
  'builtin:phone',
  'builtin:description',
  'builtin:tags',
  'builtin:notes',
];

/** A minimal People custom FieldDef; override per test. */
function fieldDef(over: Partial<FieldDef> & { id: string; label: string }): FieldDef {
  return {
    entityType: 'people',
    type: 'text',
    required: false,
    order: 0,
    deleted: false,
    updatedAt: Date.now(),
    dirty: false,
    ...over,
  };
}

beforeEach(async () => {
  await db.meta.clear();
});

describe('SRCH-02 — resolveActiveFields (subtractive, default-ON)', () => {
  const jobDef = fieldDef({ id: 'fld_job', label: 'Job' });

  it('with no stored map returns ALL candidate keys (default ON, D-04)', () => {
    const active = resolveActiveFields(BUILTINS, [jobDef], undefined);
    expect(active).toEqual([...BUILTINS, 'fld_job']);
  });

  it('un-checking a field omits its key but keeps every built-in (subtractive)', () => {
    const active = resolveActiveFields(BUILTINS, [jobDef], { fld_job: false });
    expect(active).not.toContain('fld_job');
    for (const key of BUILTINS) expect(active).toContain(key);
  });

  it('honors a stored false after a RENAME — the key is the id, not the label (D-05)', () => {
    const renamed = fieldDef({ id: 'fld_job', label: 'Occupation' }); // same id, new label
    const active = resolveActiveFields(BUILTINS, [renamed], { fld_job: false });
    expect(active).not.toContain('fld_job');
    expect(active).toEqual([...BUILTINS]);
  });

  it('ignores a soft-deleted def (not a candidate) and leaves built-ins active', () => {
    const deleted = fieldDef({ id: 'fld_job', label: 'Job', deleted: true });
    const active = resolveActiveFields(BUILTINS, [deleted], { fld_job: false });
    expect(active).toEqual([...BUILTINS]); // no fld_job candidate at all; built-ins unaffected
  });

  it('a brand-new custom def (absent from the stored map) defaults ON', () => {
    const fresh = fieldDef({ id: 'fld_new', label: 'Employer' });
    const active = resolveActiveFields(BUILTINS, [fresh], { fld_job: false });
    expect(active).toContain('fld_new');
  });

  it('every candidate false → returns [] (the all-fields-off condition)', () => {
    const stored = Object.fromEntries([...BUILTINS, 'fld_job'].map((k) => [k, false]));
    expect(resolveActiveFields(BUILTINS, [jobDef], stored)).toEqual([]);
  });
});

describe('SRCH-02 — isFieldChecked (absent/true = checked)', () => {
  it('treats an absent key and a true key as checked, only false as off', () => {
    expect(isFieldChecked('fld_job', undefined)).toBe(true);
    expect(isFieldChecked('fld_job', {})).toBe(true);
    expect(isFieldChecked('fld_job', { fld_job: true })).toBe(true);
    expect(isFieldChecked('fld_job', { fld_job: false })).toBe(false);
  });
});

describe('SRCH-02 — applyScopeChange (records only un-checks)', () => {
  it('un-checking records false; re-checking removes the entry (stays subtractive)', () => {
    const off = applyScopeChange(undefined, 'fld_job', false);
    expect(off).toEqual({ fld_job: false });
    const backOn = applyScopeChange(off, 'fld_job', true);
    expect(backOn).toEqual({}); // the un-check entry is dropped, not set to true
  });

  it('does not mutate the input map', () => {
    const input = { fld_a: false };
    const next = applyScopeChange(input, 'fld_b', false);
    expect(input).toEqual({ fld_a: false });
    expect(next).toEqual({ fld_a: false, fld_b: false });
  });
});

describe('SRCH-02 — useScopeSelection persists under the searchFieldScope meta key', () => {
  it('setFieldChecked writes a subtractive map to the searchFieldScope row and reads it back live', async () => {
    const { result } = renderHook(() => useScopeSelection());

    // Live read resolves to an empty map on a clean DB.
    await waitFor(() => expect(result.current.stored).toEqual({}));

    // Un-check the Job field → the row records exactly { fld_job: false } under the stable key.
    await act(async () => {
      await result.current.setFieldChecked('fld_job', false);
    });
    const row = await db.meta.get(SCOPE_META_KEY);
    expect(row?.value).toEqual({ fld_job: false });
    await waitFor(() => expect(result.current.stored).toEqual({ fld_job: false }));

    // Re-check → the un-check entry is dropped (subtractive), leaving an empty map.
    await act(async () => {
      await result.current.setFieldChecked('fld_job', true);
    });
    const cleared = await db.meta.get(SCOPE_META_KEY);
    expect(cleared?.value).toEqual({});
  });
});

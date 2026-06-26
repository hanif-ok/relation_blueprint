// Regression (02-UAT test 2): rendering an entity whose `custom` map is undefined (a legacy v1
// record) must NOT crash once a custom field definition exists. The profile read rows
// (CustomFieldRows) and the edit-form inputs (CustomFieldInputs) both index `custom[def.id]`; with
// zero defs the map never runs, so the bug is dormant until the first field is added — exactly the
// "add a field, click a person -> white screen" repro. EntityForm.tsx:117 already guards this shape;
// these two read/input sites must guard it too.

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { db } from '@/db/schema';
import { createFieldDef } from '@/db/repository';
import { CustomFieldRows } from '@/features/profile/CustomFieldRows';
import { CustomFieldInputs } from '@/features/entity-form/CustomFieldInputs';
import type { CustomValues } from '@/domain/types';

// The crashing shape: an entity with NO custom map at all.
const LEGACY_NO_CUSTOM = undefined as unknown as CustomValues;

beforeEach(async () => {
  await db.fieldDefs.clear();
});

describe('legacy entity with undefined custom map + a field def present', () => {
  it('CustomFieldInputs (edit form) renders the input without crashing', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Employer', type: 'text' });

    render(
      <CustomFieldInputs entityType="people" custom={LEGACY_NO_CUSTOM} onChange={() => {}} />,
    );

    // The input rendering proves the def loaded AND the previously-crashing `custom[def.id]`
    // read executed — with an empty value, not a thrown TypeError.
    const input = await screen.findByTestId(`custom-input-${def.id}`);
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('CustomFieldRows (profile read path) renders without crashing and omits the empty row', async () => {
    await createFieldDef({ entityType: 'people', label: 'Employer', type: 'text' });

    const { container } = render(
      <CustomFieldRows entityType="people" custom={LEGACY_NO_CUSTOM} />,
    );

    // Let the live def query resolve and re-render (the moment the old code dereferenced
    // undefined and white-screened).
    await waitFor(async () => {
      expect(await db.fieldDefs.where('entityType').equals('people').count()).toBe(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // No throw; an empty value's row is omitted (consistent with the built-ins).
    expect(container.querySelector('[data-testid="custom-row"]')).toBeNull();
  });
});

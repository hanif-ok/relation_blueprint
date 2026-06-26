// F-1: a custom Number field shows a muted "Numbers only" hint so a rejected text entry is not a
// silent mystery. F-2: when the entity carries a quarantined value for a field, the edit form
// surfaces the set-aside note right under that field.

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { db } from '@/db/schema';
import { createFieldDef, quarantineKey } from '@/db/repository';
import { CustomFieldInputs } from '@/features/entity-form/CustomFieldInputs';

beforeEach(async () => {
  await db.fieldDefs.clear();
});

describe('CustomFieldInputs — number hint (F-1) + set-aside note (F-2)', () => {
  it('shows a "Numbers only" hint under a Number field', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Age', type: 'number' });
    render(<CustomFieldInputs entityType="people" custom={{}} onChange={() => {}} />);

    await screen.findByTestId(`custom-input-${def.id}`);
    expect(screen.getByText('Numbers only')).toBeTruthy();
  });

  it('does NOT show the "Numbers only" hint for a Text field', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Note', type: 'text' });
    render(<CustomFieldInputs entityType="people" custom={{}} onChange={() => {}} />);

    await screen.findByTestId(`custom-input-${def.id}`);
    expect(screen.queryByText('Numbers only')).toBeNull();
  });

  it('surfaces a set-aside note when the entity has a quarantined value for the field', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Age', type: 'number' });
    const custom = { [def.id]: null, [quarantineKey(def.id, 'text')]: 'hello' };
    render(<CustomFieldInputs entityType="people" custom={custom} onChange={() => {}} />);

    await screen.findByTestId(`custom-input-${def.id}`);
    expect(screen.getByTestId('set-aside-note').textContent).toContain('hello');
  });
});

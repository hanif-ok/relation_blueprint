// CR-01 / DATA-03 / D-05 — the WIRED type-change coercion path through real Dexie.
//
// Unlike tests/fields/customValue.test.ts (which covers the PURE coerceOnTypeChange function in
// isolation), this spec drives applyFieldTypeChange end-to-end: it seeds real People rows via the
// repository, runs a field type change, and asserts the persisted result — convertible values kept,
// non-convertible originals quarantined (set aside, not deleted), restored on revert, and stamped
// dirty/updatedAt so the coerced rows sync to the cloud. This proves the BLOCKER wiring, not the
// already-covered pure function.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  applyFieldTypeChange,
  createFieldDef,
  createPerson,
  getPerson,
  quarantineKey,
  updatePerson,
} from '@/db/repository';

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

describe('applyFieldTypeChange (CR-01 / D-05 wired coercion)', () => {
  it('quarantines a non-convertible original and clears the live value (text -> number)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Ada', custom: { [def.id]: 'hello' } });

    await new Promise((r) => setTimeout(r, 2));
    const updatedDef = await applyFieldTypeChange('people', def.id, {
      label: 'Code',
      type: 'number',
      required: false,
    });

    expect(updatedDef.type).toBe('number');

    const stored = await getPerson(person.id);
    // The live value is no longer the un-convertible string (a number input must not render it).
    expect(stored?.custom[def.id]).toBeNull();
    // The original is set aside under the reserved quarantine key — NOT deleted.
    expect(stored?.custom[quarantineKey(def.id)]).toBe('hello');
    // Persisted with sync metadata bumped.
    expect(stored?.dirty).toBe(true);
    expect(stored?.updatedAt).toBeGreaterThan(person.updatedAt);
  });

  it('keeps a convertible value (the numeric string "42" becomes the number 42)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Grace', custom: { [def.id]: '42' } });

    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'number', required: false });

    const stored = await getPerson(person.id);
    expect(stored?.custom[def.id]).toBe(42);
    expect(stored?.custom[quarantineKey(def.id)]).toBeUndefined();
  });

  it('restores a quarantined original on revert back to a fitting type (D-05 re-addable)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Ada', custom: { [def.id]: 'hello' } });

    // text -> number quarantines "hello"
    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'number', required: false });
    const mid = await getPerson(person.id);
    expect(mid?.custom[quarantineKey(def.id)]).toBe('hello');

    // number -> text restores "hello" to the live value and clears the quarantine slot
    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'text', required: false });
    const after = await getPerson(person.id);
    expect(after?.custom[def.id]).toBe('hello');
    expect(after?.custom[quarantineKey(def.id)]).toBeUndefined();
  });

  it('leaves an entity with no value for the field untouched (no quarantine slot created)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Edith' });
    // Force a measurable time gap so a spurious bump would be detectable.
    await new Promise((r) => setTimeout(r, 2));

    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'number', required: false });

    const stored = await getPerson(person.id);
    expect(stored?.custom[def.id]).toBeUndefined();
    expect(stored?.custom[quarantineKey(def.id)]).toBeUndefined();
    // The untouched row is not re-stamped.
    expect(stored?.updatedAt).toBe(person.updatedAt);
  });

  it('persists the def type change and the value rewrite together (one logical unit)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Klara', custom: { [def.id]: 'world' } });
    // A second person whose value converts cleanly.
    const numericPerson = await createPerson({ name: 'Joan' });
    await updatePerson(numericPerson.id, { custom: { [def.id]: '7' } });

    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'number', required: false });

    const storedDef = await db.fieldDefs.get(def.id);
    expect(storedDef?.type).toBe('number');

    const quarantined = await getPerson(person.id);
    expect(quarantined?.custom[quarantineKey(def.id)]).toBe('world');

    const kept = await getPerson(numericPerson.id);
    expect(kept?.custom[def.id]).toBe(7);
  });
});

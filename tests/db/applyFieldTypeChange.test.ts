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
    // The original is set aside under the SOURCE-type reserved key (text) — NOT deleted.
    expect(stored?.custom[quarantineKey(def.id, 'text')]).toBe('hello');
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
    expect(stored?.custom[quarantineKey(def.id, 'text')]).toBeUndefined();
  });

  it('restores a quarantined original on revert back to a fitting type (D-05 re-addable)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Ada', custom: { [def.id]: 'hello' } });

    // text -> number quarantines "hello" under the text source-type key
    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'number', required: false });
    const mid = await getPerson(person.id);
    expect(mid?.custom[quarantineKey(def.id, 'text')]).toBe('hello');

    // number -> text restores "hello" to the live value and clears the quarantine slot
    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'text', required: false });
    const after = await getPerson(person.id);
    expect(after?.custom[def.id]).toBe('hello');
    expect(after?.custom[quarantineKey(def.id, 'text')]).toBeUndefined();
  });

  it('leaves an entity with no value for the field untouched (no quarantine slot created)', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Edith' });
    // Force a measurable time gap so a spurious bump would be detectable.
    await new Promise((r) => setTimeout(r, 2));

    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'number', required: false });

    const stored = await getPerson(person.id);
    expect(stored?.custom[def.id]).toBeUndefined();
    expect(stored?.custom[quarantineKey(def.id, 'text')]).toBeUndefined();
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
    expect(quarantined?.custom[quarantineKey(def.id, 'text')]).toBe('world');

    const kept = await getPerson(numericPerson.id);
    expect(kept?.custom[def.id]).toBe(7);
  });

  // CR-01 BLOCKER regression: TWO successive quarantining type changes with distinct
  // non-convertible originals must preserve BOTH — the second quarantine (number) must NOT
  // overwrite the first (text). Pre-fix, both shared one reserved slot per field and "hello" was
  // silently destroyed when 5 was set aside. This is the exact data-loss case the single-cycle
  // 02-06 test missed.
  it('preserves BOTH originals across two successive quarantines and restores each on revert', async () => {
    const def = await createFieldDef({ entityType: 'people', label: 'Code', type: 'text' });
    const person = await createPerson({ name: 'Ada', custom: { [def.id]: 'hello' } });

    const textKey = quarantineKey(def.id, 'text');
    const numberKey = quarantineKey(def.id, 'number');

    // (1) text -> number: "hello" cannot become a number → quarantined under the text key.
    await new Promise((r) => setTimeout(r, 2));
    const afterToNumber = await getPerson(person.id);
    {
      await applyFieldTypeChange('people', def.id, {
        label: 'Code',
        type: 'number',
        required: false,
      });
    }
    const step1 = await getPerson(person.id);
    expect(step1?.custom[def.id]).toBeNull();
    expect(step1?.custom[textKey]).toBe('hello');
    expect(step1?.dirty).toBe(true);
    expect(step1!.updatedAt).toBeGreaterThan(afterToNumber!.updatedAt);

    // (2) curator enters a real number value into the now-number field.
    await new Promise((r) => setTimeout(r, 2));
    await updatePerson(person.id, { custom: { ...step1!.custom, [def.id]: 5 } });
    const step2 = await getPerson(person.id);
    expect(step2?.custom[def.id]).toBe(5);
    // The text original is still set aside, untouched by the live-value edit.
    expect(step2?.custom[textKey]).toBe('hello');

    // (3) number -> date: 5 is not a parseable date → quarantined under the NUMBER key, while the
    // text key STILL holds "hello" (the BLOCKER assertion — pre-fix "hello" was clobbered here).
    await new Promise((r) => setTimeout(r, 2));
    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'date', required: false });
    const step3 = await getPerson(person.id);
    expect(step3?.custom[def.id]).toBeNull();
    expect(step3?.custom[numberKey]).toBe(5);
    expect(step3?.custom[textKey]).toBe('hello'); // <- preserve-both proof
    expect(step3?.dirty).toBe(true);
    expect(step3!.updatedAt).toBeGreaterThan(step2!.updatedAt);

    // (4) revert date -> number: the number original (5) is restored from the number key; the text
    // key is left alone.
    await new Promise((r) => setTimeout(r, 2));
    await applyFieldTypeChange('people', def.id, {
      label: 'Code',
      type: 'number',
      required: false,
    });
    const step4 = await getPerson(person.id);
    expect(step4?.custom[def.id]).toBe(5);
    expect(step4?.custom[numberKey]).toBeUndefined();
    expect(step4?.custom[textKey]).toBe('hello');
    expect(step4?.dirty).toBe(true);
    expect(step4!.updatedAt).toBeGreaterThan(step3!.updatedAt);

    // (5) revert number -> text: the live 5 first coerces to the string "5" (number->text keeps),
    // then the RESTORE step overwrites the live value with "hello" from the text key and clears it.
    // The headline D-05 guarantee — "hello" comes back when the field returns to text — holds.
    await new Promise((r) => setTimeout(r, 2));
    await applyFieldTypeChange('people', def.id, { label: 'Code', type: 'text', required: false });
    const step5 = await getPerson(person.id);
    expect(step5?.custom[def.id]).toBe('hello');
    expect(step5?.custom[textKey]).toBeUndefined();
    expect(step5?.dirty).toBe(true);
    expect(step5!.updatedAt).toBeGreaterThan(step4!.updatedAt);
  });
});

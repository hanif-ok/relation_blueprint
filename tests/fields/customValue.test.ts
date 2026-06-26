// DATA-03 / D-06 — the custom-value validation + type-change coercion contract.
//
// validateCustomValue is the ONLY validation in v1: a zod type-check per FieldType plus the
// per-field `required` toggle. There is intentionally NO min/max/length/regex rule engine.
// coerceOnTypeChange implements D-05's keep-or-quarantine semantics: a value that still fits
// the new type is kept; one that does not is quarantined (returned untouched), never discarded.

import { describe, expect, it } from 'vitest';
import { coerceOnTypeChange, validateCustomValue } from '@/features/fields/customValue';
import type { FieldDef, FieldType, MediaRef } from '@/domain/types';

/** A minimal FieldDef for a given type; `required` defaults false. */
function def(type: FieldType, overrides: Partial<FieldDef> = {}): FieldDef {
  return {
    id: 'f1',
    entityType: 'people',
    label: 'Field',
    type,
    required: false,
    order: 0,
    deleted: false,
    updatedAt: 0,
    dirty: false,
    ...overrides,
  };
}

const photo: MediaRef = { hash: 'abc123', mime: 'image/webp' };

describe('validateCustomValue — per-type valid cases', () => {
  it('accepts a string for text', () => {
    expect(validateCustomValue(def('text'), 'hello')).toEqual({ ok: true });
  });

  it('accepts a string for phone', () => {
    expect(validateCustomValue(def('phone'), '+1 555 0100')).toEqual({ ok: true });
  });

  it('accepts a finite number for number', () => {
    expect(validateCustomValue(def('number'), 42)).toEqual({ ok: true });
  });

  it('accepts a parseable date string for date', () => {
    expect(validateCustomValue(def('date'), '2026-06-25')).toEqual({ ok: true });
  });

  it('accepts a string[] for tags', () => {
    expect(validateCustomValue(def('tags'), ['a', 'b'])).toEqual({ ok: true });
  });

  it('accepts a hash-bearing MediaRef for photo', () => {
    expect(validateCustomValue(def('photo'), photo)).toEqual({ ok: true });
  });

  it('accepts a string id for link-to-entity', () => {
    expect(validateCustomValue(def('link-to-entity'), 'entity-id-1')).toEqual({ ok: true });
  });
});

describe('validateCustomValue — required toggle (D-06)', () => {
  it('returns the required error for an empty value when required is true', () => {
    expect(validateCustomValue(def('text', { required: true }), '')).toEqual({
      ok: false,
      message: 'This field is required.',
    });
  });

  it('treats null as empty for a required field', () => {
    expect(validateCustomValue(def('text', { required: true }), null)).toEqual({
      ok: false,
      message: 'This field is required.',
    });
  });

  it('treats an empty tag array as empty for a required field', () => {
    expect(validateCustomValue(def('tags', { required: true }), [])).toEqual({
      ok: false,
      message: 'This field is required.',
    });
  });

  it('returns ok for an empty value when required is false', () => {
    expect(validateCustomValue(def('text'), '')).toEqual({ ok: true });
    expect(validateCustomValue(def('number'), null)).toEqual({ ok: true });
    expect(validateCustomValue(def('tags'), [])).toEqual({ ok: true });
  });
});

describe('validateCustomValue — type errors (the two typed messages)', () => {
  it('returns the number error for a non-number in a number field', () => {
    expect(validateCustomValue(def('number'), 'not a number')).toEqual({
      ok: false,
      message: 'Enter a number.',
    });
  });

  it('returns the number error for NaN in a number field', () => {
    expect(validateCustomValue(def('number'), Number.NaN)).toEqual({
      ok: false,
      message: 'Enter a number.',
    });
  });

  it('returns the date error for an unparseable date string', () => {
    expect(validateCustomValue(def('date'), 'not a date')).toEqual({
      ok: false,
      message: 'Enter a valid date.',
    });
  });

  it('rejects a non-string-array for tags', () => {
    const result = validateCustomValue(def('tags'), 'oops' as unknown as string[]);
    expect(result.ok).toBe(false);
  });

  it('rejects a value without a hash for photo', () => {
    const result = validateCustomValue(def('photo'), { mime: 'image/png' } as unknown as MediaRef);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-string for link-to-entity', () => {
    const result = validateCustomValue(def('link-to-entity'), 5 as unknown as string);
    expect(result.ok).toBe(false);
  });
});

describe('coerceOnTypeChange — keep vs quarantine (D-05)', () => {
  it('keeps a number when converting number -> text', () => {
    expect(coerceOnTypeChange('number', 'text', 42)).toEqual({ kept: '42' });
  });

  it('keeps a numeric string when converting text -> number', () => {
    expect(coerceOnTypeChange('text', 'number', '42')).toEqual({ kept: 42 });
  });

  it('quarantines a non-numeric string when converting text -> number', () => {
    expect(coerceOnTypeChange('text', 'number', 'hello')).toEqual({ quarantined: 'hello' });
  });

  it('keeps a same-type value unchanged', () => {
    expect(coerceOnTypeChange('text', 'text', 'hello')).toEqual({ kept: 'hello' });
  });

  it('quarantines a photo when converting photo -> text (not convertible)', () => {
    const ref: MediaRef = { hash: 'h', mime: 'image/webp' };
    expect(coerceOnTypeChange('photo', 'text', ref)).toEqual({ quarantined: ref });
  });

  it('keeps an empty value across any type change (never quarantines empty)', () => {
    expect(coerceOnTypeChange('text', 'number', null)).toEqual({ kept: null });
    expect(coerceOnTypeChange('number', 'date', null)).toEqual({ kept: null });
  });

  it('quarantines a tag array when converting tags -> number (not convertible)', () => {
    expect(coerceOnTypeChange('tags', 'number', ['a', 'b'])).toEqual({ quarantined: ['a', 'b'] });
  });
});

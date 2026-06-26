// customValue — the DATA-03 custom-value validation + type-change coercion logic (D-05/D-06).
//
// This is the ONLY validation surface in v1: a per-`FieldType` type-check plus the field's
// optional `required` toggle. There is intentionally NO min/max/length/regex rule engine —
// those rules are explicitly deferred (D-06). Every error string here is exact UI-SPEC copy.
//
// `coerceOnTypeChange` implements D-05's soft type-conversion: a value that still fits the new
// type is KEPT (possibly reshaped, e.g. number -> "42"); a value that does not is QUARANTINED
// (returned untouched under `quarantined`), NEVER discarded — so a type change can be undone.

import type { CustomValue, FieldDef, FieldType, MediaRef } from '@/domain/types';

/** Validation outcome: ok, or a single user-facing error message. */
export type ValidationResult = { ok: true } | { ok: false; message: string };

/** True when a value counts as "empty" for the required check (absent / blank / empty list). */
function isEmpty(value: CustomValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** True when a value looks like a content-addressed MediaRef (carries a string `hash`). */
function isMediaRef(value: unknown): value is MediaRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { hash?: unknown }).hash === 'string'
  );
}

/**
 * Validate a custom value against its field definition (D-06): zod-style type-check + the
 * `required` toggle ONLY. Returns `{ ok: true }` or `{ ok: false, message }` with exact copy.
 * An empty value is allowed unless `def.required` is set; a present value must match the type.
 */
export function validateCustomValue(def: FieldDef, value: CustomValue): ValidationResult {
  if (isEmpty(value)) {
    return def.required ? { ok: false, message: 'This field is required.' } : { ok: true };
  }

  switch (def.type) {
    case 'text':
    case 'phone':
    case 'link-to-entity':
      // A non-empty value must be a string id / text.
      return typeof value === 'string'
        ? { ok: true }
        : { ok: false, message: 'Enter a value.' };

    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { ok: true }
        : { ok: false, message: 'Enter a number.' };

    case 'date': {
      const ok = typeof value === 'string' && !Number.isNaN(Date.parse(value));
      return ok ? { ok: true } : { ok: false, message: 'Enter a valid date.' };
    }

    case 'tags':
      return Array.isArray(value) && value.every((t) => typeof t === 'string')
        ? { ok: true }
        : { ok: false, message: 'Enter one or more tags.' };

    case 'photo':
      return isMediaRef(value)
        ? { ok: true }
        : { ok: false, message: 'Add a photo.' };

    default:
      return { ok: false, message: 'Enter a value.' };
  }
}

/** Result of a soft type conversion: the value is kept (maybe reshaped) or set aside. */
export type CoercionResult = { kept: CustomValue } | { quarantined: CustomValue };

/**
 * Coerce a stored value when a field's type changes (D-05). Keeps the value when it safely
 * converts to the new type (e.g. number<->numeric-string), otherwise quarantines the original
 * UNCHANGED so it can be restored — values are never silently discarded. An empty value is
 * always kept (there is nothing to lose). Same-type changes keep the value verbatim.
 */
export function coerceOnTypeChange(
  oldType: FieldType,
  newType: FieldType,
  value: CustomValue,
): CoercionResult {
  if (oldType === newType || isEmpty(value)) return { kept: value };

  // Convert TO text: any scalar renders as a string.
  if (newType === 'text' || newType === 'phone' || newType === 'link-to-entity') {
    if (typeof value === 'string') return { kept: value };
    if (typeof value === 'number') return { kept: String(value) };
    return { quarantined: value };
  }

  // Convert TO number: only a numeric string (or an existing number) survives.
  if (newType === 'number') {
    if (typeof value === 'number') return { kept: value };
    if (typeof value === 'string') {
      const n = Number(value.trim());
      if (value.trim() !== '' && Number.isFinite(n)) return { kept: n };
    }
    return { quarantined: value };
  }

  // Convert TO date: a parseable date string survives.
  if (newType === 'date') {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return { kept: value };
    return { quarantined: value };
  }

  // Convert TO tags: an existing string[] survives; a single string becomes a one-item list.
  if (newType === 'tags') {
    if (Array.isArray(value) && value.every((t) => typeof t === 'string')) return { kept: value };
    if (typeof value === 'string') return { kept: [value] };
    return { quarantined: value };
  }

  // Convert TO photo: only an existing MediaRef survives; anything else is set aside.
  if (newType === 'photo') {
    if (isMediaRef(value)) return { kept: value };
    return { quarantined: value };
  }

  return { quarantined: value };
}

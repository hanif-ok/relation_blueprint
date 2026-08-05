// useScopeSelection — the persisted field-scope selection for the Search view (SRCH-02, D-04/D-05).
//
// The selection is a LOCAL Dexie-`meta` preference (one `searchFieldScope` row), NOT a synced
// entity: it never routes through the repository / serializer / SyncEngine (B8 — no new
// exfiltration surface, threat T-05-NS). It mirrors the privacy-flag meta pattern in App.tsx and
// the one-row projection pattern in graph/positionCache.ts.
//
// The stored map is SUBTRACTIVE and DEFAULT-ON (D-04): an ABSENT key means the field is ON, so the
// map records ONLY the user's explicit un-checks. That is what makes a newly-added field default ON
// and a soft-deleted field's stale `false` harmless — the resolver simply drops any key that is no
// longer a live candidate. Keys are STABLE (built-in `builtin:*` ids and custom `FieldDef.id`,
// never labels) so a field RENAME never resets the selection (D-05).

import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { FieldDef } from '@/domain/types';

/** The single stable Dexie `meta` key under which the whole scope map lives (local, un-synced). */
export const SCOPE_META_KEY = 'searchFieldScope';

/** The persisted scope map: `fieldKey -> false` for every un-checked field. Absent = ON (D-04). */
export type ScopeSelection = Record<string, boolean>;

/**
 * PURE resolver — the currently-ACTIVE scope keys. Candidates are the built-in keys plus every
 * NON-deleted custom def's id; a candidate is active unless the stored map records it as `false`.
 * A soft-deleted def is not a candidate, so its stale `false` is ignored (and does not touch the
 * built-ins); a brand-new def (absent from the map) defaults ON (D-04 subtractive). Returns `[]`
 * only when every candidate is un-checked — the all-fields-off condition the guard state reads.
 */
export function resolveActiveFields(
  builtinKeys: string[],
  customDefs: FieldDef[],
  stored: ScopeSelection | undefined,
): string[] {
  const candidates = [
    ...builtinKeys,
    ...customDefs.filter((def) => !def.deleted).map((def) => def.id),
  ];
  return candidates.filter((key) => stored?.[key] !== false);
}

/** The panel's "is this checkbox checked" predicate: absent / `true` = checked, only `false` = off. */
export function isFieldChecked(fieldKey: string, stored: ScopeSelection | undefined): boolean {
  return stored?.[fieldKey] !== false;
}

/**
 * PURE next-map computation for a single toggle. Checking a field REMOVES its entry (so the map
 * keeps recording only un-checks, D-04); un-checking records `false`. Never mutates the input.
 */
export function applyScopeChange(
  stored: ScopeSelection | undefined,
  fieldKey: string,
  checked: boolean,
): ScopeSelection {
  const next: ScopeSelection = { ...(stored ?? {}) };
  if (checked) delete next[fieldKey];
  else next[fieldKey] = false;
  return next;
}

export interface UseScopeSelection {
  /** The live stored scope map (`{}` once resolved with no un-checks; `undefined` while loading). */
  stored: ScopeSelection | undefined;
  /** Read-modify-write one field's checked state into the `searchFieldScope` meta row. */
  setFieldChecked: (fieldKey: string, checked: boolean) => Promise<void>;
}

/** Live-read the scope map + a stable writer. Local-only — no repository/serializer involvement. */
export function useScopeSelection(): UseScopeSelection {
  const stored = useLiveQuery(
    async () => ((await db.meta.get(SCOPE_META_KEY))?.value as ScopeSelection | undefined) ?? {},
    [],
  );

  const setFieldChecked = useCallback(async (fieldKey: string, checked: boolean) => {
    // Serialize the read-modify-write in a single rw transaction so rapid concurrent toggles (e.g.
    // clicking several checkboxes in quick succession) each compose over the LATEST persisted map
    // instead of a stale snapshot — without it, overlapping toggles would lose un-checks.
    await db.transaction('rw', db.meta, async () => {
      const current = (await db.meta.get(SCOPE_META_KEY))?.value as ScopeSelection | undefined;
      await db.meta.put({ key: SCOPE_META_KEY, value: applyScopeChange(current, fieldKey, checked) });
    });
  }, []);

  return { stored, setFieldChecked };
}

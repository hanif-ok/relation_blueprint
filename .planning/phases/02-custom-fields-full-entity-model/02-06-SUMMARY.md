---
phase: 02-custom-fields-full-entity-model
plan: 06
subsystem: database
tags: [dexie, zod, custom-fields, coercion, react, indexeddb]

# Dependency graph
requires:
  - phase: 02-custom-fields-full-entity-model
    provides: coerceOnTypeChange pure function (customValue.ts), repository single-mutation path, CustomValues map + CustomValuesSchema, FieldEditor type-change UI + caution copy
provides:
  - applyFieldTypeChange repository mutation wiring coerceOnTypeChange over all entity values in one rw transaction
  - quarantineKey helper + QUARANTINE_KEY_PREFIX namespace (reserved-key quarantine, zero schema change)
  - FieldEditor.handleSave invokes applyFieldTypeChange on a type change (caution copy now truthful)
  - WR-01 NaN guard, WR-02 tel: sanitization, WR-04 stale-closure fix, WR-06 ChangeEvent contract fix
affects: [phase-04-relationships, phase-05-search, sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reserved namespaced key inside the existing custom map for D-05 quarantine (zero schema/serializer/backup change)"
    - "One rw transaction over [entity table + fieldDefs] for a def patch + per-entity value rewrite, emit after commit"

key-files:
  created:
    - tests/db/applyFieldTypeChange.test.ts
  modified:
    - src/db/repository.ts
    - src/features/fields/FieldEditor.tsx
    - src/features/entity-form/CustomFieldInputs.tsx
    - src/features/profile/CustomFieldRows.tsx
    - src/features/fields/FieldManager.tsx

key-decisions:
  - "Quarantine original rides inside the existing custom map under a reserved __quarantine: key — no change to types/schemas/serializer/backup"
  - "applyFieldTypeChange routes per-entity-type via the existing DELETABLE_TABLES map + a switch for the typed schema put (avoids union-table .put() never-typing)"
  - "Restore-on-revert is folded into the same coercion pass: a quarantined original that fits the new type is restored and the slot cleared"

patterns-established:
  - "Pattern: single-source quarantineKey(fieldId) + QUARANTINE_KEY_PREFIX so a future Phase-5 search indexer can skip reserved keys by prefix"
  - "Pattern: emit one ChangeEvent per touched record id (never the entityType string) to honor the record-id ChangeEvent contract"

requirements-completed: [DATA-03]

# Metrics
duration: 11min
completed: 2026-06-26
status: complete
---

# Phase 02 Plan 06: Wire coerceOnTypeChange into the field type-change save path Summary

**applyFieldTypeChange now runs coerceOnTypeChange over every existing entity value on a custom-field type change — keeping convertible values, quarantining non-convertible originals under a reserved key (zero schema change), restoring them on revert, and persisting dirty/updatedAt — plus four co-located warning fixes (WR-01/02/04/06).**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-26T06:41:58Z
- **Completed:** 2026-06-26T06:53:12Z
- **Tasks:** 7
- **Files modified:** 5 (4 modified + 1 created)

## Accomplishments
- Closed the CR-01 BLOCKER (DATA-03 / SC-2 / D-05): `coerceOnTypeChange` now has a real production caller. Changing a custom field's type via the FieldEditor Save path coerces ALL existing entity values — convertible kept (possibly reshaped), non-convertible quarantined (set aside, restorable), persisted with `dirty=true`/`updatedAt` so they sync to the cloud.
- Implemented quarantine with ZERO schema/serializer/backup change: the original rides inside the existing `custom` map under a reserved `__quarantine:<id>` key, valid under `CustomValuesSchema`.
- Fixed four verifier-curated WARNING anti-patterns (WR-01 NaN→null, WR-02 tel: sanitization, WR-04 stale-closure reorder, WR-06 ChangeEvent record-id contract).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add applyFieldTypeChange repository mutation + quarantine helpers** - `f888325` (feat)
2. **Task 2: Test the WIRED coercion path** - `79e3110` (test)
3. **Task 3: Wire FieldEditor.handleSave to applyFieldTypeChange** - `ca86766` (feat)
4. **Task 4: WR-01 guard NaN out of the number custom-field input** - `e1b92f4` (fix)
5. **Task 5: WR-02 sanitize the tel: href for phone custom values** - `e7d1e2a` (fix)
6. **Task 6: WR-04 fix FieldManager.move stale-closure reorder** - `52aa6c4` (fix)
7. **Task 7: WR-06 fix reorderFieldDefs ChangeEvent entityId contract** - `64d6962` (fix)

_TDD note: Tasks 1–3 carried `tdd="true"`. Task 1 implemented the mutation; Task 2 is the dedicated RED→GREEN spec for the wired path (it passed on first run because Task 1 — its implementation — landed first, as the plan structures it). Task 3 wires the UI; its behavior is covered by the Task 2 wired-path test plus the full suite._

## Files Created/Modified
- `src/db/repository.ts` - Added `QUARANTINE_KEY_PREFIX`, `quarantineKey()`, `coerceEntityCustom()` helper, and `applyFieldTypeChange()`; fixed `reorderFieldDefs` to emit per-field-id ChangeEvents (WR-06).
- `tests/db/applyFieldTypeChange.test.ts` - New Vitest spec proving keep / quarantine / restore-on-revert / untouched-empty / persist through real Dexie.
- `src/features/fields/FieldEditor.tsx` - `handleSave` branches to `applyFieldTypeChange` on a type change (narrowed `EntityType`→`DeletableEntityType`); caution copy retained.
- `src/features/entity-form/CustomFieldInputs.tsx` - Number-case onChange stores `null` instead of `NaN` (WR-01).
- `src/features/profile/CustomFieldRows.tsx` - `tel:` href stripped to dialable chars; visible text unchanged React child (WR-02).
- `src/features/fields/FieldManager.tsx` - `move()` captures moved field + label before the await (WR-04 stale-closure fix).

## Decisions Made
- **Quarantine storage (preferred path taken):** reserved key inside the existing `custom` map — no change to `types.ts`, `schemas.ts`, `schema.ts`, serializer, or backup. Round-trips automatically through `CustomValuesSchema` (any string key).
- **Per-entity-type put via switch:** the union of Dexie table handles cannot be `.put()`-typed generically (TS narrows the param to `never`), so the touched-row put routes through a `switch (entityType)` selecting the correct `Schema.parse` + table — keeping the validate-then-stamp invariant with no raw un-stamped put.
- **Helper extraction:** the coerce/quarantine/restore logic for one entity is factored into `coerceEntityCustom()` to keep `applyFieldTypeChange` readable and the schema-routing switch flat.

## Deviations from Plan

None - plan executed exactly as written. All 7 tasks implemented per their `<action>` specs; no auto-fix (Rule 1–3) or architectural (Rule 4) deviations were required.

## Issues Encountered
- **Union-table `.put()` typing (Task 1):** the initial implementation used a `{ table, schema }` lookup map, which failed `tsc` because the four zod schemas are structurally distinct and the union table handle's `.put()` narrows to `never`. Resolved by routing the put through a `switch (entityType)` with each schema/table pair statically known — types compile cleanly. Resolved within the task; not a plan deviation.

## Known Stubs
None. No placeholder/empty-value stubs introduced; `applyFieldTypeChange` is fully wired and exercised by the new spec.

## Threat Flags
None. No new network endpoint, auth path, file-access pattern, or trust-boundary schema change was introduced. The plan REMOVES one unsanitized-URL surface (WR-02) and adds no external surface. All threat-register `mitigate` dispositions (T-02-06-01 re-validation through zod before put, T-02-06-02 tel: sanitization, T-02-06-03 React-child rendering / no `dangerouslySetInnerHTML` usage) are honored.

_Note on the T-03-01 acceptance grep: `grep -c dangerouslySetInnerHTML src/features/profile/CustomFieldRows.tsx` returns 1, but the single match is a pre-existing explanatory security comment ("…never dangerouslySetInnerHTML…"), not a JSX usage. There are zero actual `dangerouslySetInnerHTML` usages; the T-03-01 invariant (all user text rendered as React children) is fully preserved._

## Next Phase Readiness
- The D-05 keep/quarantine/restore guarantee now executes end-to-end; the FieldEditor caution copy is truthful. Phase-2 verification BLOCKER CR-01 is closed.
- `QUARANTINE_KEY_PREFIX` is exported for a future Phase-5 search indexer to skip reserved keys by prefix.
- No schema/serializer/backup migration is required; quarantined originals round-trip with existing sync/export.

## Self-Check: PASSED

- All 6 touched files exist on disk (5 modified + 1 created).
- All 7 task commits present in git history (`f888325`, `79e3110`, `ca86766`, `e1b92f4`, `e7d1e2a`, `52aa6c4`, `64d6962`).
- `npx tsc --noEmit` exits 0; `npx vitest run` exits 0 (24 files / 154 tests passing, including the new wired-path spec).

---
*Phase: 02-custom-fields-full-entity-model*
*Completed: 2026-06-26*

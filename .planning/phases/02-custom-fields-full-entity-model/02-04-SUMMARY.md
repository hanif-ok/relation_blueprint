---
phase: 02-custom-fields-full-entity-model
plan: 04
subsystem: ui
tags: [react, dexie, zod, custom-fields, radix, typescript, e2e]

# Dependency graph
requires:
  - phase: 02-01
    provides: FieldDef/CustomValue types, fieldDefs store (create/update/reorder/softDelete/listFieldDefs), per-entity custom map
  - phase: 02-03
    provides: generalized EntityForm + ProfileSidebar + ViewSwitcher (onOpenFields) + browse lists
provides:
  - Per-type field manager (FieldManager S13) + field editor (FieldEditor S14) with drag/keyboard reorder and neutral soft-delete
  - validateCustomValue + coerceOnTypeChange module (type-check + required only, keep-or-quarantine)
  - CustomFieldInputs (S16) typed inputs in entity forms, keyed by stable field id, validated on save
  - CustomFieldRows (S15) read rendering by type with one-way link-to-entity + "(removed)" handling
  - link-to-entity profile navigation wired through App.onOpenEntity
affects: [phase-05-search, phase-04-relationships]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom values keyed by stable FieldDef.id (never label) on each entity's custom map"
    - "Type-paired live entity read in ProfileSidebar prevents stale cross-type narrowing"
    - "Validation lives in a pure module (customValue.ts); the form runs it on save and renders per-field errors"

key-files:
  created:
    - src/features/fields/customValue.ts
    - src/features/fields/FieldManager.tsx
    - src/features/fields/FieldManager.module.css
    - src/features/fields/FieldEditor.tsx
    - src/features/entity-form/CustomFieldInputs.tsx
    - src/features/profile/CustomFieldRows.tsx
    - tests/fields/customValue.test.ts
    - e2e/custom-fields.spec.ts
  modified:
    - src/features/entity-form/EntityForm.tsx
    - src/features/entity-form/EntityForm.module.css
    - src/features/profile/ProfileSidebar.tsx
    - src/features/profile/ProfileSidebar.module.css
    - src/app/App.tsx
    - src/db/testBridge.ts

key-decisions:
  - "Re-add restores values by un-deleting the SAME def (deleted:false); + Add field always mints a new id (keeps id stability for D-05 + Phase 5 search)"
  - "Validation runs in EntityForm.handleSave (reads live defs) and passes per-field errors down to CustomFieldInputs, rather than each input self-validating"
  - "Required-empty check treats null / blank string / empty array as empty"

patterns-established:
  - "Pure validate/coerce module + form-driven save validation with per-field error map"
  - "Live target resolution + type-check for one-way link-to-entity, muted '(removed)' for missing/wrong-type targets"

requirements-completed: [DATA-03]

# Metrics
duration: 27min
completed: 2026-06-26
status: complete
---

# Phase 02 Plan 04: Custom Fields (DATA-03 keystone) Summary

**Per-type custom-field system end-to-end: a field manager that creates/edits/reorders/soft-deletes the 7 DATA-03 typed fields, a pure validate/coerce module (type + required only), and typed inputs in entity forms plus typed read rows in profiles — with link-to-entity as a graceful one-way pointer.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-06-26T01:34:49Z
- **Completed:** 2026-06-26T02:02Z
- **Tasks:** 2
- **Files modified:** 14 (8 created, 6 modified)

## Accomplishments
- `customValue.ts`: `validateCustomValue` (zod-style type-check + per-field `required` only, D-06 — no min/max/length/regex) and `coerceOnTypeChange` (keep-or-quarantine, D-05 — never discards). 24 unit cases green.
- `FieldManager` (S13): locked built-in spine (D-04), ordered custom list with pointer drag + keyboard reorder (↑/↓ on the grip, `aria-live` announce — U10), neutral "+ Add field", live per-mutation persistence (U9). Opened from the nav "Fields" item for the active type.
- `FieldEditor` (S14): name (required → "Give the field a name."), the 7 types, Required toggle, Tags options chip editor, link-to-entity target select, type-change caution, neutral soft-delete confirm calling `softDeleteFieldDef`.
- `CustomFieldInputs` (S16): typed inputs after built-ins, keyed by stable `def.id`; `EntityForm` validates on save (blocks save + shows "This field is required." / "Enter a number." / "Enter a valid date.") and carries the `custom` map in every payload.
- `CustomFieldRows` (S15): read rendering by type — `tel:` phone link, human date with raw-ISO `title`, tag chips, one-way link-to-entity rendering the target name with live resolution + muted "(removed)" for a missing/wrong-type target (D-10/T-03-06), single photo thumbnail. All values render as React children (T-03-01).

## Task Commits

1. **Task 1 (RED): failing custom-value test** - `07ec7b9` (test)
2. **Task 1 (GREEN): custom-value module + field manager/editor** - `43246a8` (feat)
3. **Task 2: custom-field inputs + read rows + wiring + E2E** - `10a3425` (feat)

## Files Created/Modified
- `src/features/fields/customValue.ts` - validate/coerce logic (the only v1 validation surface)
- `src/features/fields/FieldManager.tsx` / `.module.css` - per-type schema editor dialog (S13)
- `src/features/fields/FieldEditor.tsx` - add/edit a field definition (S14)
- `src/features/entity-form/CustomFieldInputs.tsx` - typed inputs in entity forms (S16)
- `src/features/entity-form/EntityForm.tsx` / `.module.css` - mount inputs, validate on save, carry `custom`
- `src/features/profile/CustomFieldRows.tsx` - typed read rows in profiles (S15)
- `src/features/profile/ProfileSidebar.tsx` / `.module.css` - append custom rows; type-paired entity read fix
- `src/app/App.tsx` - open FieldManager from nav; link-to-entity profile navigation
- `src/db/testBridge.ts` - expose group/link create, deleteEntity, field-def helpers to E2E
- `tests/fields/customValue.test.ts` - 24 validate/coerce cases
- `e2e/custom-fields.spec.ts` - define → fill → render → (removed) → soft-delete keeps value; required blocks save

## Decisions Made
- "Re-add" of a soft-deleted field restores its values by un-deleting the SAME def id (the E2E drives this via the repository, mirroring D-05 keep semantics). The "+ Add field" UI mints a fresh id by design — keeping ids stable is what Phase 5 search and D-05 depend on.
- Save-time validation lives in `EntityForm` (reads live defs once) and flows errors into `CustomFieldInputs`, rather than each input self-validating — keeps a single block-on-save gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale cross-type entity narrowing in ProfileSidebar**
- **Found during:** Task 2 (profile rendering of a person created after a group profile was open)
- **Issue:** `useLiveQuery` returns the PREVIOUS record while re-running after the profile switches families (group → person). The old `entity` was narrowed against the NEW `type` prop, so a group was cast as a `Person` and crashed on `person.tags.length`. This is a latent pre-existing bug that the new custom-field navigation flow exposed (profiles now switch across entity families).
- **Fix:** The entity query now returns `{ type, entity }` together; render derives `type` from the query result so the rendered record and the type it is narrowed against always move in lockstep.
- **Files modified:** src/features/profile/ProfileSidebar.tsx
- **Verification:** Repro pageerror eliminated; custom-fields E2E green; all 10 existing profile/browse/delete E2E still green.
- **Committed in:** `10a3425` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary correctness fix that the plan's link-to-entity navigation surfaced. No scope creep.

## Issues Encountered
- Initial E2E hung on the post-create profile render due to the stale-narrowing bug above; diagnosed via the Playwright trace `pageError` and fixed (Rule 1).

## Known Stubs
None. The Photo custom field renders a plain thumbnail tile this plan; the full lightbox (S18) is plan 02-05 per the UI-SPEC — this is the planned hand-off, not a stub of DATA-03.

## Deferred Issues
Pre-existing `react-hooks/set-state-in-effect` lint errors in `EntityForm.tsx` and `ProfileSidebar.tsx` (present at the wave base, unrelated to this plan) were left in place per the scope boundary and logged in `deferred-items.md`. All files created by this plan lint clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DATA-03 is delivered end-to-end: all 7 types define, validate, and render; soft-delete retains values; link-to-entity is a one-way pointer with "(removed)" handling.
- Plan 02-05 (photo lightbox + gallery reorder) can mount the lightbox on the custom Photo thumbnail (the tile is already in place).
- Phase 5 search can rely on stable field ids and the per-type schema.

## Self-Check: PASSED

All created files present on disk; all three task commits (`07ec7b9`, `43246a8`, `10a3425`) present in git history.

---
*Phase: 02-custom-fields-full-entity-model*
*Completed: 2026-06-26*

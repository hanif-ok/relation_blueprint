---
phase: 02-custom-fields-full-entity-model
plan: 07
subsystem: database
tags: [dexie, zod, custom-fields, type-change, quarantine, data-integrity, react]

# Dependency graph
requires:
  - phase: 02-custom-fields-full-entity-model (plan 06)
    provides: applyFieldTypeChange + coerceEntityCustom quarantine wiring (single reserved key per field)
provides:
  - Source-type-keyed quarantine (quarantineKey(fieldId, sourceType)) — successive quarantines from distinct source types coexist without overwrite (CR-01 BLOCKER closed)
  - Restore-by-target-type semantics removing the in-flight from->to fitness ambiguity (WARNING closed)
  - Multi-hop regression test proving two successive quarantines preserve BOTH originals and each restores on revert
  - Array.isArray guard on the profile tags read path (non-array value renders no chips instead of crashing — WARNING closed)
affects: [phase-05-search (must skip QUARANTINE_KEY_PREFIX-prefixed keys), any future field-type-change work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reserved-key quarantine keyed by SOURCE field-type inside the existing custom map (zero schema/serializer/backup change)"
    - "Restore resolves from the TARGET type's reserved key — fits by construction, no in-flight type-pair fitness guess"

key-files:
  created: []
  modified:
    - src/db/repository.ts
    - tests/db/applyFieldTypeChange.test.ts
    - src/features/profile/CustomFieldRows.tsx

key-decisions:
  - "Key quarantined originals by source field-type (quarantineKey(fieldId, sourceType)) so at most one original exists per (field, sourceType) pair — a later quarantine from a different source type writes a different key and cannot clobber an earlier original."
  - "Restore reads from quarantineKey(fieldId, toType): the original set aside when the field last WAS toType fits toType by construction, so it is restored verbatim (no coerceOnTypeChange fitness call on the restore branch)."
  - "No legacy bare-key migration: the quarantine feature shipped in 02-06 within this same un-released milestone, so no real DB holds a legacy __quarantine:<fieldId> key (dead scope)."

patterns-established:
  - "Source-type-keyed quarantine: __quarantine:<fieldId>:<sourceType>, still a single CustomValue per key valid under CustomValuesSchema"
  - "Defense-in-depth at the render boundary: Array.isArray guard before .map on a tags custom value"

requirements-completed: [DATA-03]

# Metrics
duration: ~12min
completed: 2026-06-26
status: complete
---

# Phase 02 Plan 07: Re-key Quarantine by Source Field-Type Summary

**Source-type-keyed custom-field quarantine that lets two successive quarantining type changes preserve BOTH non-convertible originals (closing the CR-01 data-loss BLOCKER) with zero schema change, plus a multi-hop regression test and a non-array guard on the profile tags read path.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-26T07:10Z (approx)
- **Completed:** 2026-06-26T07:23Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Closed the CR-01 BLOCKER: `quarantineKey` now takes `(fieldId, sourceType)`, and `coerceEntityCustom` stores a non-convertible original under its FROM-type key and restores from the TO-type key. A second quarantine from a different source type can no longer overwrite the first — the D-05 "set aside, NOT deleted, restorable on revert" guarantee now holds across multi-hop histories.
- Closed the restore-ambiguity WARNING: restore resolves from the target type's reserved key (fits by construction) instead of judging fitness off the in-flight `from->to` pair.
- Added the multi-hop regression test that the single-cycle 02-06 test missed: "hello" (text→number) survives a SECOND quarantine of `5` (number→date) under a distinct key, then each original restores on revert to its source type, with `dirty`/`updatedAt` asserted at every touched step.
- Closed the unguarded-cast WARNING: the profile tags read path renders no chips for a non-array value instead of throwing on `.map`.
- Full suite green (24 files / 155 tests); `npx tsc --noEmit` exits 0. Zero schema/serializer/backup change.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-key quarantine by source field-type** - `171bce5` (fix)
2. **Task 2: Multi-hop regression test (preserve-both + restore-each)** - `b0379f2` (test)
3. **Task 3: Guard the profile tags read path against a non-array value** - `5ef3a42` (fix)

_Tasks 1 and 2 form the RED/GREEN pair for the quarantine re-keying: Task 1 lands the source-type-keyed implementation, Task 2 lands the multi-hop regression that proves it and would fail against the pre-fix single-slot scheme._

## Files Created/Modified
- `src/db/repository.ts` - `quarantineKey(fieldId, sourceType)` (colon-suffixed reserved key, prefix-skip contract preserved); `coerceEntityCustom` rewritten to store under the from-type key and restore from the to-type key (param `qKey` dropped, `fromType`/`toType` passed); precomputed `qKey` removed from `applyFieldTypeChange`; IN-01 reference-identity dirty-flag contract pinned with a comment. Transaction boundary, per-entity-type schema-parse+stamp put, and emit-after-commit ordering unchanged.
- `tests/db/applyFieldTypeChange.test.ts` - existing single-cycle assertions updated to the 2-arg `quarantineKey`; new multi-hop preserve-both + restore-each test (the CR-01 guard) added against the real Dexie / fake-indexeddb harness.
- `src/features/profile/CustomFieldRows.tsx` - tags case maps over `(Array.isArray(value) ? value : [])`; chip markup, keys, classNames, and `data-testid="custom-tags"` unchanged.

## Decisions Made
- Followed the plan's source-type-keyed design exactly. Restore is now a plain verbatim assignment from the target key (no `coerceOnTypeChange` call on the restore branch), because a value keyed by `toType` fits `toType` by construction — this is what removes the in-flight-pair fitness ambiguity the WARNING flagged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Task 3 acceptance grep nuance (not a defect):** The criterion `grep -c "dangerouslySetInnerHTML" src/features/profile/CustomFieldRows.tsx` is expected to be `0`, but it returns `1`. The single match is the pre-existing file-header security comment (lines 10-12) that documents the T-03-01 "never use `dangerouslySetInnerHTML` here" invariant — there is NO actual `dangerouslySetInnerHTML` JSX usage anywhere in the file (verified by filtering out comment lines). The substantive intent of the criterion (no XSS sink; T-03-01 preserved) is fully satisfied; the literal count is a false positive from the term appearing in an explanatory comment. No code change made to the comment, as deleting the security note to satisfy a literal grep would be counterproductive.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CR-01 BLOCKER closed; phase 02 verification can re-run with the data-loss gap resolved.
- Reminder for Phase 5 search: skip any custom-map key beginning with `QUARANTINE_KEY_PREFIX` (`__quarantine:`) — the new `:<sourceType>` suffix does not change this prefix-skip contract.

## Self-Check: PASSED
- `src/db/repository.ts` — FOUND (modified, committed in 171bce5)
- `tests/db/applyFieldTypeChange.test.ts` — FOUND (modified, committed in b0379f2)
- `src/features/profile/CustomFieldRows.tsx` — FOUND (modified, committed in 5ef3a42)
- Commit 171bce5 — FOUND
- Commit b0379f2 — FOUND
- Commit 5ef3a42 — FOUND
- `npx tsc --noEmit` exits 0; `npx vitest run` 155/155 passing

---
*Phase: 02-custom-fields-full-entity-model*
*Completed: 2026-06-26*

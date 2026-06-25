---
phase: 02-custom-fields-full-entity-model
plan: 02
subsystem: data + profile
tags: [delete, cascade, media-gc, profile-sidebar, D-12, S21]
status: complete
requires:
  - "02-01: Group/RelationshipLink types + db.groups/db.relationshipLinks tables + EntityType union"
  - "src/db/repository.ts deletePerson cascade + content-addressed media GC (Phase 1)"
  - "src/features/common/ConfirmDialog.tsx (reusable destructive dialog, focuses Cancel)"
provides:
  - "deleteMarker(id): marker-only delete (map-level 'Remove from map', neutral, no cascade/GC)"
  - "deleteEntity(type, id): generalized cascade across people/maps/groups/relationship-links + all-types media GC incl. custom Photo values"
  - "deletePerson(id): thin delegate to deleteEntity('people', id) (back-compat)"
  - "ProfileSidebar openedFrom/markerId props — single contextual destructive action (S21)"
affects:
  - "src/db/repository.ts"
  - "src/features/profile/ProfileSidebar.tsx"
  - "src/app/App.tsx"
tech-stack:
  added: []
  patterns:
    - "Single rw transaction over all entity tables + markers + media for the cascade + GC sweep"
    - "collectEntityMediaHashes() shared by candidate + still-referenced passes (no drift)"
    - "Dexie transaction array form (['rw', [tables], cb]) for >5 tables"
    - "Contextual single-action UI: exactly one destructive button by openedFrom"
key-files:
  created:
    - "tests/db/delete.cascade.test.ts"
    - "e2e/delete-vs-remove.spec.ts"
  modified:
    - "src/db/repository.ts"
    - "src/features/profile/ProfileSidebar.tsx"
    - "src/features/profile/ProfileSidebar.module.css"
    - "src/app/App.tsx"
    - "e2e/profile.spec.ts"
decisions:
  - "deleteMarker carries NO cascade and NO media GC — the entity stays in the DB and its browse list (the user-flagged correctness fix, D-12)"
  - "deleteEntity is the single generalized cascade; deletePerson delegates to it so Phase-1 callers/tests are unchanged"
  - "Media GC still-referenced sweep scans all five entity families' photo/gallery/background AND custom Photo-field values, so a shared blob is never wrongly collected"
  - "ProfileSidebar shows exactly ONE destructive action by context; brick reserved for the cascade, neutral (ink-muted) for Remove from map"
  - "Updated the existing profile.spec.ts (which encoded the buggy marker-context cascade) to assert the corrected Remove-from-map behavior; the list-context cascade E2E lands in plan 02-03"
metrics:
  duration_min: 6
  completed: 2026-06-25
  tasks: 2
  files_changed: 7
---

# Phase 2 Plan 02: Delete-vs-Remove Correctness Fix Summary

Split the always-cascading `deletePerson` into a marker-only `deleteMarker` (the neutral map-level "Remove from map") and a generalized `deleteEntity` cascade whose media GC spans all five entity types and custom Photo-field values, then wired the ProfileSidebar to show exactly one contextual destructive action — fixing the user-flagged bug where removing a person from the map deleted them from the database.

## What Was Built

**Task 1 — `deleteMarker` + generalized `deleteEntity` (TDD):**
- `deleteMarker(id)`: deletes one marker row and emits `markers/delete`. No cascade, no GC — the referenced entity and any other markers survive.
- `deleteEntity(type, id)`: one rw transaction that deletes the entity, cascade-deletes its markers (people by `personId`, maps by `mapId`; groups/relationship-links have none), then refcount-sweeps media. A candidate hash is GC'd only when no surviving entity of any type still references it.
- `collectEntityMediaHashes(entity)`: a single source of truth (photo + gallery + map background + any MediaRef custom value) used by both the candidate pass and the still-referenced sweep so the two can never drift.
- `deletePerson(id)` now delegates to `deleteEntity('people', id)`.
- `tests/db/delete.cascade.test.ts`: 7 cases (marker-only survival, solo-vs-shared GC, custom-Photo-value still-referenced guard, group/relationship-link/map cascades, deletePerson back-compat).

**Task 2 — dual-action ProfileSidebar + App wiring + E2E:**
- `ProfileSidebar` gains `openedFrom: 'marker' | 'list'` (default `'marker'`) and `markerId?`. Marker context renders the neutral "Remove from map" → `deleteMarker`; list context renders brick "Delete person" → `deleteEntity('people', id)`. Exactly one shows; never both.
- A neutral `.remove` button style (`--ink-muted`) added; brick stays only on `.delete`.
- `App.tsx` resolves the selected person's marker id via a live `db.markers.where('personId')` query and passes `openedFrom="marker"` + `markerId`.
- `e2e/delete-vs-remove.spec.ts`: the user-flagged regression guard — Remove from map deletes the marker but the person survives across a reload.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated `e2e/profile.spec.ts` which encoded the buggy behavior**
- **Found during:** Task 2
- **Issue:** The existing `create → profile → edit → delete with cascade` E2E opened the profile from a marker and asserted the cascade deleted both the person and marker — exactly the bug this plan fixes. After the change, the marker-context sidebar correctly shows "Remove from map", so the old test's `profile-delete` selector and copy no longer applied.
- **Fix:** Renamed the test to `… → remove from map (entity survives)` and rewrote its delete section to click `profile-remove`, assert the "Remove from this map?" copy, and verify `people=1, markers=0` after removal. The list-context cascade E2E is deferred to plan 02-03 (per the plan's own note — browse rows provide the list context).
- **Files modified:** e2e/profile.spec.ts
- **Commit:** c8c4c66

**2. [Rule 3 - Blocking] Dexie `transaction` overload exceeded with 6 table args**
- **Found during:** Task 1
- **Issue:** `db.transaction('rw', t1..t6, cb)` failed tsc (TS2554: max 5 positional tables before the callback).
- **Fix:** Used the array form `db.transaction('rw', [t1..t6], cb)`, which accepts any number of tables.
- **Files modified:** src/db/repository.ts
- **Commit:** ae2265a

## Verification

- `npx tsc --noEmit` — exits 0.
- `npx vitest run` — 125 passed (22 files), including `tests/db/delete.cascade.test.ts` (7) and `tests/db/repository.crud.test.ts`.
- `npx playwright test e2e/delete-vs-remove.spec.ts e2e/profile.spec.ts` — 6 passed.

## Acceptance Criteria

- [x] "Remove from map" (marker context) deletes only the marker; the person stays in the DB.
- [x] "Delete person" (list context) removes the entity + all its markers + GCs unreferenced media.
- [x] The GC sweep keeps a blob alive if any surviving entity (any type, incl. custom Photo value) references it.
- [x] Deleting a Group / Location / Relationship-link cascades correctly through the generalized path.
- [x] No `dangerouslySetInnerHTML`; entity names render as React children.

## Notes for Downstream Plans

- **Plan 02-03 (browse/view switcher):** pass `openedFrom="list"` from browse rows to surface the brick "Delete {entity}" cascade; the prop + brick path already exist. The list-context cascade E2E lands there.
- `deleteEntity`/`deleteMarker` are not yet on the `window.__rb` test bridge; the E2E drives them through the UI and asserts survival via `db.people`/`db.markers`. Add them to the bridge if a future plan needs to call them directly from a spec.
- The "Delete person" copy is currently hardcoded to "person"; the plan notes parameterizing `{type}` for Location/Group/Relationship-link deletion when those profiles open from a list (02-03+).

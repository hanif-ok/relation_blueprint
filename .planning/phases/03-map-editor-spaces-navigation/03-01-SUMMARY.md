---
phase: 03-map-editor-spaces-navigation
plan: 01
subsystem: database
tags: [dexie, zod, typescript, indexeddb, image-space-coords, migration, tokens]

# Dependency graph
requires:
  - phase: 02-entity-model
    provides: "type/schema/Dexie triple, single-mutation repository path, backup export/import round-trip harness"
provides:
  - "Marker transform/portal fields (kind/targetMapId/width/height/rotation), personId now optional, x/y reinterpreted as image-space"
  - "MapDoc sub-objects: parentId, backgroundTransform, shapes[], layers[] (all optional-with-default)"
  - "New domain interfaces + zod schemas: BackgroundTransform, Layer, Shape, MarkerKind"
  - "Dexie version(4) backfill upgrade (marker kind, map identity transform + default Markers layer) that does NOT move existing markers"
  - "Extended upsertMarker accepting the transform/portal fields"
  - "portal hue token (#3E6B8C) + five zone presets in tokens.ts"
  - "syntheticMarkers fixture for the later perf spike"
affects: [map editor canvas, portal navigation, layers panel, shape/zone drawing, coords.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Image-space coordinate model: marker x/y stored in background-image space, composed onto MapDoc.backgroundTransform at render (identity = no rewrite on upgrade)"
    - "Optional-with-default schema fields so pre-Phase-3 cloud shards/backups still validate"
    - "Zone = a Shape carrying a non-empty label (no separate Zone entity / EntityType widening)"

key-files:
  created:
    - tests/domain/mapEditorSchema.test.ts
    - tests/db/markerCoordMigration.test.ts
    - tests/db/multiPlacement.test.ts
    - tests/features/markerTransform.roundtrip.test.ts
    - tests/features/bgTransform.anchor.test.ts
    - tests/_fixtures/syntheticMarkers.ts
  modified:
    - src/domain/types.ts
    - src/domain/schemas.ts
    - src/app/tokens.ts
    - src/db/schema.ts
    - src/db/repository.ts
    - src/features/person-map/AvatarMarker.tsx
    - tests/sync/serializer.test.ts
    - tests/sync/atomicity.test.ts

key-decisions:
  - "x/y reinterpreted as image-space in place (no rename, no per-marker rewrite); identity backgroundTransform makes old stage-space coords valid as image-space (RESEARCH Pattern 7 / A1)"
  - "Zones are shapes-with-a-label (D-02); no separate Zone interface/array; EntityType union left unchanged to avoid field-defs blast radius"
  - "Shape geometry split: rect/ellipse use optional x/y/width/height box; line/polygon use optional points[] — single Shape interface covers all four kinds"
  - "All new MapDoc/Marker fields optional-with-default so a pre-Phase-3 backup still parses (RESEARCH Pitfall 7)"

patterns-established:
  - "Pattern: background-transform composition (offset + rotate + uniform scale) asserted inline in tests until coords.ts ships in a later plan"
  - "Pattern: Dexie version(N) idempotent backfill via toCollection().modify, stores({}) (no index change, no ORM push)"

requirements-completed: [MAP-02, MAP-03, MAP-05, MAP-06, MAP-07]

# Metrics
duration: 14min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 01: Map-Editor Data Foundation Summary

**Extended the Marker/MapDoc type↔schema↔Dexie triple with image-space transform + portal fields and a version(4) backfill that reinterprets coordinates without moving any existing marker — proven by the load-bearing migration round-trip test.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-27T06:40:00Z
- **Completed:** 2026-06-27T06:50:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 14 (6 created, 8 modified)

## Accomplishments
- Marker gains `kind`/`targetMapId`/`width`/`height`/`rotation`; `personId` now optional; `x`/`y` documented as image-space (no rename).
- MapDoc gains `parentId`/`backgroundTransform`/`shapes[]`/`layers[]`, all optional-with-default; new `BackgroundTransform`/`Layer`/`Shape`/`MarkerKind` types + mirroring zod schemas + `satisfies` locks.
- Dexie `version(4)` upgrade backfills marker `kind='person'`, map identity `backgroundTransform`, empty `shapes`, and a default "Markers" layer — and provably leaves marker `x`/`y` byte-unchanged.
- `upsertMarker` accepts the transform/portal fields; `UpdateMapPatch` already covers the new MapDoc sub-objects (no new repository function).
- Portal hue (`#3E6B8C`) + five zone presets added as named tokens.
- The phase-gating tests pass: migration round-trip (RESEARCH A1), multi-placement (MAP-05), and both transform round-trips. Full suite: 199 tests green, zero regressions.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 (RED): schema/token failing tests** - `26ccc30` (test)
2. **Task 1 (GREEN): extend type/schema/token triple** - `465fb6f` (feat)
3. **Task 2 (RED): migration/multi-placement/transform tests** - `2642b6e` (test)
4. **Task 2 (GREEN): version(4) backfill + extend upsertMarker** - `f33e1df` (feat)

_No REFACTOR commits needed — implementation was clean._

## Files Created/Modified
- `src/domain/types.ts` - Marker transform/portal fields, MapDoc sub-objects, Shape/Layer/BackgroundTransform/MarkerKind
- `src/domain/schemas.ts` - mirroring zod schemas, all new fields optional-with-default, new satisfies locks
- `src/app/tokens.ts` - portal hue + zonePresets
- `src/db/schema.ts` - Dexie version(4) idempotent backfill upgrade
- `src/db/repository.ts` - extended UpsertMarkerInput/upsertMarker; UpdateMapPatch comment
- `src/features/person-map/AvatarMarker.tsx` - use person.id for the (now-optional) marker personId
- `tests/domain/mapEditorSchema.test.ts` - schema + token behavior tests
- `tests/db/markerCoordMigration.test.ts` - the load-bearing v4 migration test (RESEARCH A1)
- `tests/db/multiPlacement.test.ts` - MAP-05 one-person-two-maps
- `tests/features/markerTransform.roundtrip.test.ts` - transform fields survive export/import
- `tests/features/bgTransform.anchor.test.ts` - backgroundTransform round-trip + composition
- `tests/_fixtures/syntheticMarkers.ts` - perf-spike fixture
- `tests/sync/serializer.test.ts`, `tests/sync/atomicity.test.ts` - fixture factories updated for widened types

## Decisions Made
- See `key-decisions` frontmatter. Summary: in-place x/y reinterpretation (no rewrite), zone = labeled shape, single Shape interface for all four primitives, optional-with-default everywhere.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened-type fallout in app + sync test fixtures**
- **Found during:** Task 1 (GREEN, after `tsc --noEmit`)
- **Issue:** Making `Marker.personId` optional and `MapDoc.shapes`/`layers` required broke compilation in three spots: `AvatarMarker.tsx` (assigned optional `marker.personId` to a required `upsertMarker` field) and the `tests/sync/serializer.test.ts` + `tests/sync/atomicity.test.ts` literal factories (missing `kind`/`shapes`/`layers`).
- **Fix:** `AvatarMarker` now passes `person.id` (the authoritative non-null id for a person marker, no `kind` field until Task 2 extended the input); both sync test factories now emit `kind: 'person'` + empty `shapes`/`layers`.
- **Files modified:** src/features/person-map/AvatarMarker.tsx, tests/sync/serializer.test.ts, tests/sync/atomicity.test.ts
- **Verification:** `npx tsc --noEmit` exits 0; full suite 199 tests green
- **Committed in:** `465fb6f` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Necessary to keep the build/type-check green after the planned type widening. No scope creep — the changes are the minimal call-site/fixture updates the widened types force.

## Issues Encountered
None. The TDD cycle ran cleanly; the schema-gate Dexie false-positive and vitest fork-timeout memory notes were heeded (used `--no-file-parallelism`; no migration-push task), and neither tripped.

## Known Stubs
None. All symbols are wired and exercised by tests; no placeholder data paths introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The full map-editor data foundation (types, schemas, Dexie v4, repository) is in place and gated by passing tests; later plans can build the Konva editor on these symbols.
- `coords.ts` does NOT yet exist — the background-transform composition arithmetic is asserted inline in the migration/anchor tests and should be centralized into `coords.ts` when a later plan introduces it (the two inline `compose` helpers are the reference implementation).

## Self-Check: PASSED

All 6 created files exist on disk; all 5 commits (26ccc30, 465fb6f, 2642b6e, f33e1df, 564a11a) present in git history. tsc clean; full suite 199/199 green.

---
*Phase: 03-map-editor-spaces-navigation*
*Completed: 2026-06-27*

---
phase: 04-relationships-graph
plan: 01
subsystem: database
tags: [dexie, zod, relationships, indexeddb, backup, cascade-delete]

# Dependency graph
requires:
  - phase: 02-entities-fields
    provides: "RelationshipLink data-bearing shell (D-08), sharded relationship-links sync path, BackupSchema import gate"
  - phase: 03-map-editor
    provides: "deleteEntity generalized cascade + media-GC pattern, optional-with-default Marker precedent"
provides:
  - "RelationshipEndpointType ('people'|'groups') + optional endpoint fields (fromType/fromId/toType/toId/directed) on RelationshipLink (type↔zod)"
  - "Dexie version(5) index-only upgrade adding fromId/toId indexes to relationshipLinks"
  - "listRelationshipsFor(entityId) reverse-lookup (indexed fromId/toId union)"
  - "Cascade-delete of relationship-links when a Person/Group is deleted (no orphan edges)"
  - "Proven endpoint round-trip through backup + import-boundary rejection of Location endpoints"
affects: [04-02-relationship-authoring, 04-03-map-connectors, 04-04-graph-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-with-runtime-enum endpoints: closed z.enum gate at BOTH write path and import boundary, no data migration"
    - "Dexie index-only version(n) upgrade (no .upgrade() callback) for adding query indexes to existing records"
    - "Indexed reverse-lookup via .where(a).equals(x).or(b).equals(x) instead of full-table filter"

key-files:
  created:
    - tests/db/repository.relationships.test.ts
    - tests/backup/roundtrip.relationships.test.ts
  modified:
    - src/domain/types.ts
    - src/domain/schemas.ts
    - src/db/schema.ts
    - src/db/repository.ts

key-decisions:
  - "Endpoint fields are OPTIONAL (mirror Marker.kind precedent) so pre-Phase-4 shells + old backups validate with zero migration"
  - "version(5) is index-only (fromId/toId) with NO .upgrade() callback — Dexie skips undefined keys; this is a Dexie schema, not a Drizzle migration (no push step)"
  - "Cascade relationship-links inside the EXISTING deleteEntity rw transaction (relationshipLinks table already in the txn list) for people|groups only"
  - "z.enum(['people','groups']) is the single T-04-02 control — rejects a maps/Location endpoint at the write path AND the BackupSchema import gate"

patterns-established:
  - "Runtime-enum endpoint validation doubles as the untrusted-at-rest import gate (no separate boundary check needed)"
  - "New Phase-4 symbols (endpoints, listRelationshipsFor) excluded from source-drift verification — they did not exist pre-plan"

requirements-completed: [REL-01, REL-02]

# Metrics
duration: 9min
completed: 2026-07-03
status: complete
---

# Phase 4 Plan 01: Relationship Data Foundation Summary

**Extended the endpoint-less RelationshipLink shell with an ordered people|groups endpoint pair + directed flag, added the fromId/toId reverse-lookup index, cascade-on-delete, and proved endpoints round-trip through backup with a Location-endpoint import gate.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-03T07:53:34Z
- **Completed:** 2026-07-03T07:58Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `RelationshipEndpointType` + five optional endpoint fields threaded through the type↔zod↔Dexie triple and `createRelationshipLink`, with the `satisfies` mirror-lock held (tsc clean).
- `listRelationshipsFor(entityId)` answers the D-04 reverse lookup as a single indexed `fromId`/`toId` union via the new Dexie `version(5)` index-only upgrade.
- `deleteEntity('people'|'groups', id)` now cascades every relationship-link the entity is an endpoint of, inside the existing rw transaction (T-04-03 dangling-edge prevention).
- Confirmed endpoint fields survive the export→import round-trip with ZERO new sync plumbing (serializer's `relationship-links` branch already spreads the full record), and the `BackupSchema` import gate rejects a `fromType:'maps'` endpoint before any DB write (T-04-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing Wave-0 tests (RED)** - `31f50a1` (test)
2. **Task 2: Extend the triple + repository endpoints/reverse-lookup/cascade (GREEN)** - `b562790` (feat)
3. **Task 3: Confirm backup round-trip + import-boundary** - no commit (verification-only; serializer confirmed unchanged, tests already GREEN under Task 2's schema changes)

_No REFACTOR commit needed — the GREEN implementation was already minimal and clean._

## Files Created/Modified
- `tests/db/repository.relationships.test.ts` - REL-01 unit coverage: endpoint create (person/person, person/group, group/group), Location-endpoint rejection, "reverse lookup", "cascade".
- `tests/backup/roundtrip.relationships.test.ts` - REL-02: endpoints+label/date/notes survive export/restore; import gate rejects a maps endpoint.
- `src/domain/types.ts` - `RelationshipEndpointType` + optional `fromType`/`fromId`/`toType`/`toId`/`directed` on `RelationshipLink`.
- `src/domain/schemas.ts` - `RelationshipEndpointTypeSchema` (z.enum) + the five optional endpoint fields on `RelationshipLinkSchema`.
- `src/db/schema.ts` - `version(5)` index-only upgrade adding `fromId`/`toId` (no `.upgrade()` callback).
- `src/db/repository.ts` - endpoint fields on `CreateRelationshipLinkInput` threaded through the validated parse; `listRelationshipsFor`; cascade branch in `deleteEntity`.

## Decisions Made
- Kept endpoints OPTIONAL and normalized `directed` at read (per the plan) so no data migration is required — matches the Marker optional-with-default precedent.
- Left `src/sync/serializer.ts` untouched: the `relationship-links` branch already serializes/deserializes the full record via `.map(clean)`, so the new plain-JSON fields ride through with no plumbing (confirmed by the green round-trip test).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED confirmed all 8 tests failing for the right reasons (dropped endpoint fields, missing `listRelationshipsFor`, no cascade, no import rejection); GREEN turned them all green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The data spine for all three Phase-4 vertical slices is in place: 04-02 (authoring UI), 04-03 (map connectors), and 04-04 (graph view) all read endpoints via `listRelationshipsFor`.
- T-04-10 (endpoint pointing at a deleted/missing id) is deliberately deferred to the projection plans (orphan-guard rendering: "(deleted person/group)").

## Verification
- `npx vitest run tests/db/repository.relationships.test.ts tests/backup/roundtrip.relationships.test.ts` — 8/8 green.
- `npx tsc --noEmit` — clean (type↔zod `satisfies` parity preserved).
- `npx vitest run tests/backup tests/sync` — 36/36 green (no serializer/backup regression).
- Full unit suite `npx vitest run` — 290/290 across 49 files green.

## Self-Check: PASSED

All 6 created/modified source+test files exist on disk; both task commits (`31f50a1` test, `b562790` feat) present in git history.

---
*Phase: 04-relationships-graph*
*Completed: 2026-07-03*

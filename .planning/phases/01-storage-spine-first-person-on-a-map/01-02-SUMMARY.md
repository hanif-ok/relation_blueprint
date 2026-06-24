---
phase: 01-storage-spine-first-person-on-a-map
plan: 02
subsystem: database
tags: [dexie, indexeddb, zod, nanoid, typescript, storage-provider, offline-first]

# Dependency graph
requires:
  - phase: 01-01
    provides: Vite + TypeScript-strict scaffold, Vitest + fake-indexeddb harness, @/* path alias
provides:
  - "Domain model: Person, MapDoc, Marker, MediaRef, Manifest, ShardPointer, Backup types"
  - "zod schemas (PersonSchema, MapDocSchema, MarkerSchema, ManifestSchema, BackupSchema) validating untrusted-at-rest data"
  - "StorageProvider interface (ensureFolder/list/readFile/writeFile/overwriteFile/delete/stat) locked against InMemoryProvider fake"
  - "RelationBlueprintDB Dexie schema (people/maps/markers/media/meta/syncQueue)"
  - "Offline-first repository with dirty-marking, schema-validated CRUD, cascade delete, and a change-event emitter"
affects: [01-05-sync-engine, 01-06-drive-adapter, 01-07-export-restore, 01-04-profile-ui, 01-03-media-thumbnails]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider-agnostic StorageProvider seam locked by an in-memory conformance fake"
    - "Dirty-flag + updatedAt on every repository write (sync change-detection convention)"
    - "Content-addressed media stored as ArrayBuffer (not Blob) for structured-clone portability"
    - "zod schema validation at the persistence boundary (trust boundary T-02-01)"

key-files:
  created:
    - src/domain/types.ts
    - src/domain/schemas.ts
    - src/storage/StorageProvider.ts
    - src/storage/memory/InMemoryProvider.ts
    - src/db/schema.ts
    - src/db/repository.ts
    - tests/domain/person.test.ts
    - tests/_fakes/InMemoryProvider.test.ts
    - tests/db/repository.offline.test.ts
    - tests/db/repository.crud.test.ts
  modified: []

key-decisions:
  - "Media blobs stored in Dexie as ArrayBuffer + mime (not Blob) so they round-trip through structured clone in both real browsers and the fake-indexeddb test env; repository converts Blob<->ArrayBuffer at the boundary"
  - "Repository singular entry point for all mutations: validate via zod, stamp dirty=true + updatedAt=now, emit a change event"
  - "Person carries gallery: MediaRef[] now (PROF-02 forward-compat) alongside the six DATA-02 fields"
  - "deletePerson cascades to markers inside a Dexie rw transaction (referential integrity without FKs)"

patterns-established:
  - "Interface lock: a fake (InMemoryProvider) implements StorageProvider and a conformance test pins the contract before any real backend exists"
  - "Compile-time schema/type correspondence via `z.infer ... satisfies T` assertions in schemas.ts"
  - "Test isolation: clear all Dexie tables in beforeEach (fake-indexeddb persists across a process)"

requirements-completed: [STOR-03, DATA-02, DATA-04]

# Metrics
duration: 6min
completed: 2026-06-24
status: complete
---

# Phase 01 Plan 02: Storage Spine Data Backbone Summary

**Domain model + zod schemas, a StorageProvider interface locked against an InMemoryProvider fake, and an offline-first Dexie repository with dirty-marking, schema-validated CRUD and cascade delete.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-24T13:55:20Z
- **Completed:** 2026-06-24T14:01:40Z
- **Tasks:** 2
- **Files modified:** 10 created

## Accomplishments
- Domain types (`Person`, `MapDoc`, `Marker`, `MediaRef`, `Manifest`, `ShardPointer`, `Backup`) — Person ships exactly the DATA-02 fields plus `gallery`, `updatedAt`, `dirty`.
- zod schemas validate every shape before it enters the DB (trust boundary T-02-01); compile-time `satisfies` locks schema↔type correspondence.
- `StorageProvider` interface defined with the exact Plan-05/06 signatures and locked by a 14-test `InMemoryProvider` conformance suite (idempotent ensureFolder, immutable writeFile, in-place overwriteFile, byte round-trip).
- `RelationBlueprintDB` Dexie schema (people/maps/markers/media/meta/syncQueue) with the `media` table keyed by `hash` only (unindexed bytes column).
- Offline-first repository: schema-validated CRUD with `dirty=true`/`updatedAt=now` on every write, cascade delete of markers, and a change-event emitter for the future sync engine — all proven under fake-indexeddb with no network.

## Task Commits

Each task was committed atomically (TDD: tests written with implementation, single GREEN commit per task):

1. **Task 1: Domain model + zod schemas + locked StorageProvider interface** - `b4e93d5` (feat)
2. **Task 2: Dexie schema + offline-first dirty-marking repository** - `db227cf` (feat)

## Files Created/Modified
- `src/domain/types.ts` - Person/MapDoc/Marker/MediaRef/Manifest/ShardPointer/Backup TypeScript types
- `src/domain/schemas.ts` - zod schemas mirroring the domain, with compile-time `satisfies` locks
- `src/storage/StorageProvider.ts` - provider-agnostic file-store interface + FileEntry
- `src/storage/memory/InMemoryProvider.ts` - in-memory fake implementing StorageProvider (interface lock)
- `src/db/schema.ts` - RelationBlueprintDB Dexie subclass + table record types
- `src/db/repository.ts` - typed CRUD with dirty-marking, zod validation, cascade delete, change events
- `tests/domain/person.test.ts` - PersonSchema/ManifestSchema accept/reject cases (DATA-02, T-02-01)
- `tests/_fakes/InMemoryProvider.test.ts` - StorageProvider conformance suite (interface lock)
- `tests/db/repository.offline.test.ts` - create/read/list + media round-trip with no network (STOR-03)
- `tests/db/repository.crud.test.ts` - edit + delete + marker cascade + marker upsert (DATA-04)

## Decisions Made
- **Media stored as ArrayBuffer, not Blob.** See Deviations — a fake-indexeddb/jsdom structured-clone limitation drove this, and it is also the more portable production choice. The repository's public API still speaks `Blob`.
- **Person includes `gallery: MediaRef[]` now** (the plan's action specified including it for PROF-02) even though only the six DATA-02 default fields are required this plan.
- **No new dependencies** — dexie, zod, nanoid were already installed by Plan 01-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / Rule 1 - Correctness] Media persisted as ArrayBuffer instead of Blob**
- **Found during:** Task 2 (offline repository — `putMedia`/`getMedia` test)
- **Issue:** The plan/RESEARCH said "store Blobs directly." Under the test environment (Vitest + jsdom + fake-indexeddb), the structured-clone algorithm does NOT preserve `Blob` — a stored `Blob` round-trips as a plain `Object` with no `.arrayBuffer()`, so `getMedia` could not return faithful bytes. Verified directly: `structuredClone(new Blob(...))` yields `ctor=Object, isBlob=false` in this env. This blocked the STOR-03 media round-trip test and would silently corrupt media bytes anywhere structured clone lacks Blob support.
- **Fix:** Changed `MediaRecord` to store `bytes: ArrayBuffer` + `mime: string`. `putMedia` does `await blob.arrayBuffer()` before persisting; `getMedia` reconstructs a faithful `new Blob([bytes], { type: mime })`. The repository's public API is unchanged (still Blob in / Blob out); the `media` table is still keyed by `hash` only with the bytes column unindexed. ArrayBuffer is universally structured-clonable, so this is both the test-env fix and the more robust production representation.
- **Files modified:** src/db/schema.ts, src/db/repository.ts
- **Verification:** `tests/db/repository.offline.test.ts` media round-trip asserts byte-equality and passes; full `npx vitest run` 24/24 green; `npx tsc --noEmit` clean.
- **Committed in:** db227cf (Task 2 commit)

**2. [Rule 3 - Blocking] Replaced `db.transaction('rw', ...6 tables, cb)` with parallel `clear()` in test setup**
- **Found during:** Task 2 (tsc verification)
- **Issue:** Dexie's typed `transaction(mode, ...tables, cb)` overload caps the table-argument count; passing six tables exceeded it, producing TS2554 "Expected 3-7 arguments, but got 8."
- **Fix:** Test `beforeEach` now clears all tables via `Promise.all([...clear()])` (independent clears need no shared transaction). The repository's own cascade still uses a proper `rw` transaction over its two tables.
- **Files modified:** tests/db/repository.offline.test.ts, tests/db/repository.crud.test.ts
- **Verification:** `npx tsc --noEmit` exits 0; tests green.
- **Committed in:** db227cf (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking; #1 also a correctness fix)
**Impact on plan:** Both fixes were necessary to make the planned behavior actually work under the project's chosen test harness; no scope creep. The StorageProvider interface, Dexie tables, dirty/updatedAt convention, and all acceptance greps remain exactly as specified.

## Issues Encountered
- The fake-indexeddb Blob limitation (above) — resolved by the ArrayBuffer representation. No other problems.

## User Setup Required
None - no external service configuration required. (The Google OAuth Client ID checkpoint from Plan 01-01 remains deferred to Plan 01-06; nothing in this plan touches Drive.)

## Threat Surface
- T-02-01 (Tampering — untrusted-at-rest data): mitigated. `PersonSchema`/`MapDocSchema`/`MarkerSchema` are invoked before every persist in the repository; `ManifestSchema`/`BackupSchema` are ready for the sync/restore plans to validate cloud/import payloads.
- T-02-02 (data loss on partial sync): mitigated. Dexie is the durable local source of truth; every write is dirty-marked + timestamped so the sync engine never silently drops a change.
- T-02-03 (media at rest, no app-level encryption): accepted per v1 boundary (unchanged).

No new threat surface introduced beyond the plan's threat model.

## Next Phase Readiness
- The `StorageProvider` contract and the `Manifest`/`ShardPointer` shapes are locked — Plan 01-05 (sync engine) and Plan 01-06 (Drive adapter) can target a stable seam.
- The repository's `onChange` emitter is the subscription point for the Plan 01-05 sync flush.
- `BackupSchema` + the repository CRUD are ready for Plan 01-07 export/restore.
- No blockers.

## Self-Check: PASSED

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24*

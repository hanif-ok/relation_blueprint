---
phase: 01-storage-spine-first-person-on-a-map
plan: 09
subsystem: storage
tags: [sync, drive, manifest, bootstrap, reconcile, regression, tdd]

# Dependency graph
requires:
  - phase: 01-storage-spine-first-person-on-a-map (Plan 05)
    provides: SyncEngine atomic manifest-swap + bootstrap()/reconcileOnOpen()
  - phase: 01-storage-spine-first-person-on-a-map (Plan 06)
    provides: useSyncEngine connect-lifecycle wiring + InMemoryProvider seam
provides:
  - SyncEngine.prepareOnOpen() — discover-existing-manifest-or-bootstrap connect-time init step
  - onConnected establishes the manifest before reconcileOnOpen() (fixes empty-DB first-connect error)
  - Silent re-adoption of an existing cloud DB on reconnect (no duplicate/overwritten manifest)
  - Regression coverage asserting empty-DB connect reaches synced with no markError
affects: [drive-sync, multi-device-reconnect, storage-spine-trust]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discover-then-bootstrap: list the app folder for manifest.json, adopt it if present, only bootstrap when absent — non-destructive read + idempotent bootstrap, commit sequence untouched"

key-files:
  created:
    - tests/sync/prepareOnOpen.test.ts
  modified:
    - src/sync/syncEngine.ts
    - src/features/connect/useSyncEngine.ts
    - tests/connect/useSyncEngine.test.tsx

key-decisions:
  - "prepareOnOpen() is the connect-time init step reconcileOnOpen() requires: discover an existing manifest.json first (silent re-adoption), bootstrap only when none exists — never a second commit point"
  - "Re-adoption path writes nothing (adopts the existing manifest file id), so a second-device connect can never overwrite or duplicate the canonical manifest (T-01-09-01)"

patterns-established:
  - "Discover-then-bootstrap connect initialization: provider.list() → adopt existing manifest.json, else idempotent bootstrap()"

requirements-completed: [STOR-01, STOR-02, STOR-04, STOR-05]

# Metrics
duration: 3min
completed: 2026-06-25
status: complete
---

# Phase 01 Plan 09: Empty-DB First-Sync Gap Closure Summary

**SyncEngine.prepareOnOpen() (discover-existing-manifest-or-bootstrap) called before reconcileOnOpen() in onConnected, so a clean empty-DB Drive connect reaches 'synced' instead of erroring, and a reconnect re-adopts an existing cloud DB without duplicating its manifest.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-25T04:15:16Z
- **Completed:** 2026-06-25T04:18:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Added `SyncEngine.prepareOnOpen()` — discovers an existing `manifest.json` in the app folder and adopts its id (silent re-adoption), or bootstraps a v0 manifest + empty shards when none exists; idempotent when a manifestFileId is already set.
- Wired `prepareOnOpen()` into `useSyncEngine.onConnected` before `reconcileOnOpen()` (inside the same try, so failures still route to `markError`), fixing GAP 1: the empty-DB first connect no longer throws "manifest not initialized" / shows "sync failed, please retry".
- Strengthened the regression suite: empty-DB connect now asserts `error===null` + `lastSyncedAt!==null` (synced, no markError), and reconnect asserts exactly one `manifest.json` (no re-bootstrap over an existing cloud DB).
- Full green gate: `npx tsc --noEmit` clean, `npx vitest run` 89/89 pass (was 81 baseline + new assertions/tests), `npm run build` succeeds.

## Task Commits

Each task was committed atomically (TDD: test → implementation):

1. **Task 1: Add SyncEngine.prepareOnOpen() (RED)** - `69ff106` (test)
2. **Task 1: Add SyncEngine.prepareOnOpen() (GREEN)** - `4ddd191` (feat)
3. **Task 2: Strengthen connect regression test (RED)** - `9504dba` (test)
4. **Task 2: Call prepareOnOpen() before reconcile in onConnected (GREEN)** - `dae3191` (fix)

_TDD RED commits intentionally failed before the matching GREEN implementation._

## Files Created/Modified
- `src/sync/syncEngine.ts` - Added the public `prepareOnOpen()` method (discover-then-bootstrap); `bootstrap()`, `manifestFileId()`, and the commit sequence are unchanged. Reuses the existing module-level `MANIFEST_NAME` constant for the filename match.
- `src/features/connect/useSyncEngine.ts` - `onConnected` now `await engine.prepareOnOpen()` before `await engine.reconcileOnOpen()`, both inside the existing try → markError catch; updated the inline step comment.
- `tests/sync/prepareOnOpen.test.ts` - New: bootstraps-empty-then-reconcile-no-ops, adopts-existing-manifest-without-bootstrapping, idempotent-when-manifestFileId-set.
- `tests/connect/useSyncEngine.test.tsx` - Added empty-DB-connect-reaches-synced (no markError) and reconnect-re-adopts-without-duplicate-manifest tests; original three tests left intact.

## Decisions Made
- Implemented the PREFERRED fix direction from the diagnosis (discover an existing manifest before bootstrapping) rather than the minimal "always bootstrap" — this simultaneously fixes the empty-first-connect error AND enables silent re-adoption of an existing cloud DB on a second device, without adding a second commit point.

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the prescribed TDD RED→GREEN gates; no auto-fixes (Rules 1–4) were needed.

## Issues Encountered
None. The `__resetForTests()` reset in the reconnect test clears the syncStatusStore listener set, but the new tests read state via `getSnapshot()` directly (not through a React subscription), so the reset does not affect the assertions.

## User Setup Required
None - no external service configuration required. (The gap is in the in-engine init contract, upstream of any live Drive call; reproducible/fixable against InMemoryProvider without OAuth.)

## Next Phase Readiness
- The storage-spine trust regression is closed: a first connect before any data succeeds quietly, and reconnecting to a populated folder adopts the existing DB.
- The atomic manifest-swap remains the sole commit point; `bootstrap()` still only creates files when none exist.
- Plan 01-10 (silent reconnect) remains the last incomplete plan in this phase.

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-25*

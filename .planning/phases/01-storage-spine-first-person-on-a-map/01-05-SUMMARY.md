---
phase: 01-storage-spine-first-person-on-a-map
plan: 05
subsystem: database
tags: [sync, atomic-write, sharded-manifest, last-write-wins, zod, dexie, fault-injection, storage-provider]

# Dependency graph
requires:
  - phase: 01-02
    provides: StorageProvider interface + InMemoryProvider, domain types (Manifest/ShardPointer/EntityType), ManifestSchema, Dexie repository/schema
  - phase: 01-08
    provides: writeStatus beginWrite/endWrite/isWriteInFlight in-flight-write seam
  - phase: 01-03
    provides: db/media.ts SHA-256 content-addressing helper (pattern reused for shard hashing)
provides:
  - Sharded serializer (entities <-> per-type JSON shard files people-000/maps-000/markers-000.json)
  - Zod-validated manifest read with rolling backups (writeManifestWithBackup, rollBackups)
  - Atomic manifest-pointer-swap SyncEngine (push, reconcileOnOpen, commit) targeting StorageProvider only
  - RepositoryPort abstraction + Dexie-backed implementation (createDexieRepoPort)
  - faultInjectingProvider test fake + the STOR-05 failure-injection atomicity property test
affects: [01-06-drive-adapter, 01-07-export-restore, sync, storage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic write via manifest-pointer swap: new immutable shard/media files first, single small-manifest overwrite as the SOLE commit point, rolling backup, GC orphans only after success"
    - "RepositoryPort seam: SyncEngine reads/writes through a port so it runs against a plain in-memory snapshot (atomicity test) or the real Dexie store (reconcile test / production)"
    - "Cloud copy is canonical-clean: serializer normalizes dirty=false on the way out (dirty is local-only sync metadata)"
    - "Failure-injection decorator over StorageProvider proves a safety property at every commit-step boundary"

key-files:
  created:
    - src/sync/serializer.ts
    - src/sync/manifest.ts
    - src/sync/syncEngine.ts
    - tests/_fakes/faultInjectingProvider.ts
    - tests/sync/serializer.test.ts
    - tests/sync/reconcile.test.ts
    - tests/sync/atomicity.test.ts
    - tests/sync/_memoryPort.ts
  modified: []

key-decisions:
  - "Atomicity comes from the manifest overwrite being the ONLY commit point; every shard/media file is a new immutable write, discardable on failure (RESEARCH Pattern 2)"
  - "deserializeShards is async (reads Blob text) so the same path serves in-process Blobs and raw provider Blobs"
  - "Serializer normalizes dirty=false for the cloud copy — a freshly-pulled shard arrives already-clean and the cloud stays canonical"
  - "Introduced a RepositoryPort abstraction so the failure-injection property test runs over a plain object snapshot without dragging Dexie into the fault loop"
  - "FaultInjectingProvider labels boundaries by filename heuristics (manifest- => backup, media/ => media, else shard) and supports an occurrence counter for precise mid-sequence injection"

patterns-established:
  - "Manifest-pointer-swap commit: writeFile new shards -> writeFile media -> build manifest' -> backup current -> overwriteFile manifest (commit) -> markSynced -> rollBackups -> delete orphans"
  - "overwriteFile is used ONLY for the manifest; all other persistence is immutable writeFile"
  - "LWW reconcile by updatedAt: pull a shard only when manifest.updatedAt > local watermark; upsert keeps a locally-newer record"

requirements-completed: [STOR-02, STOR-04, STOR-05]

# Metrics
duration: 8min
completed: 2026-06-24
status: complete
---

# Phase 01 Plan 05: Sharded Serializer + Atomic Manifest-Swap Sync Engine Summary

**Corruption-proof storage spine: a sharded serializer and an atomic manifest-pointer-swap sync engine, proven incorruptible by a failure-injection property test that throws at every commit-step boundary — all built against the StorageProvider interface before any real Drive code exists.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-24T14:38:57Z
- **Completed:** 2026-06-24T14:46:58Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 8 created

## Accomplishments
- **Sharded serializer** (`serializeShards`/`deserializeShards`) round-trips people/maps/markers losslessly into one immutable JSON shard file per type, normalizing `dirty=false` for the canonical cloud copy.
- **Zod-validated manifest I/O** (`readManifest`/`writeManifestWithBackup`/`rollBackups`): the manifest is parsed through `ManifestSchema` on read (rejects corrupt/partial data, threat T-05-02) and a rolling backup of the previous manifest is written before every commit, trimmed to the last 5.
- **Atomic SyncEngine** (`commit`/`push`/`reconcileOnOpen`): the manifest overwrite is the single commit point; new shard/media files are written first, the manifest is swapped, then orphans are GC'd — never before. Every commit is wrapped in `beginWrite()`/`endWrite()` (try/finally) honoring the 01-08 writeStatus contract.
- **STOR-05 failure-injection property test**: drives the engine against `InMemoryProvider` wrapped by a `FaultInjectingProvider`, injecting a fault at every commit-step boundary (write shard, write backup, read manifest, overwrite manifest) and asserting after each that the canonical manifest still points at the previous shards and the reconstructed DB deep-equals the last committed state — no partial commit, ever.
- **Reconcile LWW test** (STOR-04): a newer cloud shard is pulled and upserted into Dexie; a newer local record is preserved against an older cloud copy.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: Sharded serializer + zod-validated manifest with rolling backups**
   - `7333eda` (test) — failing serializer/manifest round-trip + validation tests
   - `c3084a5` (feat) — `serializer.ts` + `manifest.ts`
2. **Task 2: Atomic manifest-swap sync engine + reconcile + atomicity property test (STOR-05)**
   - `d2cac01` (test) — faultInjectingProvider + atomicity + reconcile tests
   - `2a3b7bf` (feat) — `syncEngine.ts` (+ serializer dirty-normalization)

**Plan metadata:** (final docs commit)

## Files Created/Modified
- `src/sync/serializer.ts` — entities <-> per-type JSON shard Blobs (`people-000.json` etc.); async `deserializeShards`; normalizes `dirty=false` for the cloud copy.
- `src/sync/manifest.ts` — `readManifest` (ManifestSchema.parse), `writeManifestWithBackup` (rolling backup then the sole `overwriteFile`), `rollBackups` (keep last N by version).
- `src/sync/syncEngine.ts` — `SyncEngine` (bootstrap/push/commit/reconcileOnOpen), `RepositoryPort` interface, `createDexieRepoPort` over the Dexie store.
- `tests/_fakes/faultInjectingProvider.ts` — `StorageProvider` decorator throwing `InjectedFailure` at a configured commit-step boundary.
- `tests/sync/serializer.test.ts` — round-trip, shard names, manifest validation, rolling-backup behavior.
- `tests/sync/reconcile.test.ts` — STOR-04 push + pull LWW against the real Dexie DB.
- `tests/sync/atomicity.test.ts` — STOR-05 failure-injection property loop over every commit boundary.
- `tests/sync/_memoryPort.ts` — in-memory `RepositoryPort` for the atomicity test.

## Decisions Made
- **Atomicity = single manifest commit point.** Per RESEARCH ## Pattern 2, every shard/media file is a new immutable `writeFile`; only the small manifest is `overwriteFile`'d, and only as the final commit. A throw anywhere before that leaves the canonical manifest pointing at the previous shards.
- **`deserializeShards` is async.** It reads Blob text, so one code path serves both in-process Blobs (serializer round-trip) and raw provider Blobs (engine reconcile).
- **Serializer normalizes `dirty=false`.** `dirty` is local-only ("has unsynced local changes"); anything in a cloud shard is by definition synced, so the cloud copy stays canonical and a pulled shard arrives clean.
- **RepositoryPort abstraction.** The engine consumes a port, so the failure-injection loop runs over a plain object snapshot (fast, deep-equals-friendly) while reconcile/production use the Dexie-backed `createDexieRepoPort`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Serializer leaked local `dirty=true` into the cloud copy**
- **Found during:** Task 2 (atomicity/clean-commit assertions)
- **Issue:** Shards serialized the raw `dirty` flag, so a reconstructed cloud shard carried `dirty=true` while the locally-synced set had `dirty=false`, breaking the "reconstructed DB deep-equals last committed state" property and making the cloud copy non-canonical.
- **Fix:** `serializeShards` now maps each entity through `clean()` to force `dirty=false` (without mutating the caller's object) — the cloud copy is canonical and a freshly-pulled shard arrives already-clean.
- **Files modified:** src/sync/serializer.ts
- **Verification:** atomicity.test.ts + reconcile.test.ts green; tsc clean.
- **Committed in:** 2a3b7bf (Task 2 feat commit)

**2. [Rule 3 - Blocking] tsc union-narrowing error on `pulled[type] = set[type]`**
- **Found during:** Task 2 (typecheck after GREEN)
- **Issue:** Indexing the discriminated `EntitySet` with a loop variable collapsed the array types to their intersection, failing `tsc --noEmit`.
- **Fix:** Replaced the dynamic index assignment in `reconcileOnOpen` with an explicit per-type branch (`people`/`maps`/`markers`), keeping the field types sound.
- **Files modified:** src/sync/syncEngine.ts
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** 2a3b7bf (Task 2 feat commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes are correctness requirements for the atomicity property and the type gate. No scope creep — the engine still targets the StorageProvider interface only.

## Issues Encountered
- None beyond the two auto-fixes above. The `bootstrap()` step (empty v0 manifest + shards) was added so the first push always has a previous state to swap from; this is within the planned commit contract and keeps the atomicity loop honest (there is always a "last good" manifest to fall back to).

## Threat Mitigations Applied
- **T-05-01 (interrupted commit / data loss):** manifest-pointer swap + rolling backup + GC-only-after-success, proven by `tests/sync/atomicity.test.ts`.
- **T-05-02 (corrupt manifest on open):** `readManifest` runs `ManifestSchema.parse`; invalid JSON or a missing shard pointer throws so the engine can fall back to a backup.
- **T-05-03 (stale shard):** per-shard `hash` + `updatedAt` recorded in the manifest; reconcile trusts manifest pointers; media is content-addressed.

## Known Stubs
- `createDexieRepoPort.getNewMedia()` returns an empty set for the skeleton (reconcile/atomicity tests carry no media). Real media diffing is wired by **Plan 06** (Drive adapter) where content-addressed media uploads are exercised end-to-end. The serializer/engine media path (`writeFile media/<hash>`) is implemented and exercised by the atomicity test's commit sequence; only the Dexie-side media-collection source is deferred.

## Verification Evidence
- `npx vitest run tests/sync` — 17 passed (serializer 9, reconcile 4, atomicity 4 boundaries + 1 clean commit).
- `npx vitest run` (full suite) — 46 passed.
- `npx tsc --noEmit` — exit 0.
- `npx eslint src/sync tests/sync tests/_fakes/faultInjectingProvider.ts` — exit 0.
- `npm run build` — built successfully (pre-existing chunk-size warning only).
- Code-ordering: `overwriteFile` appears only in the manifest-commit path (manifest.ts); orphan GC (`provider.delete`) runs strictly after `writeManifestWithBackup` → `markSynced` → `rollBackups`.

## Next Phase Readiness
- The sync engine and serializer target the `StorageProvider` interface only — **Plan 06** can drop in a `DriveProvider` behind the same seam with zero engine changes, then wire real media collection into `getNewMedia()`.
- **Plan 07** (export/restore) can reuse `serializer` (entities<->shards) and the `manifest` helpers.

## Self-Check: PASSED

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24*

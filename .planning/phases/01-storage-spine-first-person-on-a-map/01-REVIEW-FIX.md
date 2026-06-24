---
phase: 01-storage-spine-first-person-on-a-map
fixed_at: 2026-06-24T22:52:45Z
review_path: .planning/phases/01-storage-spine-first-person-on-a-map/01-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-06-24T22:52:45Z
**Source review:** .planning/phases/01-storage-spine-first-person-on-a-map/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (2 critical + 7 warning; the 5 Info findings are out of scope for `critical_warning`)
- Fixed: 9
- Skipped: 0

All fixes verified with a full-project `tsc --noEmit` typecheck (clean, exit 0) after every
edit, run against a node_modules junction in the isolated worktree. Several fixes change runtime
logic/control-flow and are flagged **requires human verification** below — the developer should
run `npm test` (Vitest) and `npm run test:e2e` (Playwright) to confirm semantic correctness, as
syntax/type checking cannot prove the new behavior.

## Fixed Issues

### CR-01: `markSynced` cleared the dirty flag on records edited during an in-flight push

**Files modified:** `src/sync/syncEngine.ts`, `tests/sync/_memoryPort.ts`
**Commit:** 2291fb4
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Changed `RepositoryPort.markSynced()` to take the exact serialized `EntitySet`
snapshot the shards were built from. The Dexie port now clears `dirty` only where the live record
still matches the snapshot by `(id, updatedAt)`; an edit made after the snapshot bumps `updatedAt`,
so it stays dirty and is pushed on the next commit (no silent edit loss). `commit()` passes
`entities` (the snapshot) into `markSynced`. The in-memory test port (`_memoryPort.ts`) was updated
to mirror the same `(id, updatedAt)`-guarded clear so the interface contract and the atomicity
property test stay consistent.

### CR-02: A re-added media blob could become permanently unrecoverable after a restore

**Files modified:** `src/features/backup/importDb.ts`
**Commit:** 2a42a31
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Applied the review's "at minimum" remedy — `importDb` STEP 2 now includes
`db.meta` in its atomic transaction and deletes the `syncedMediaHashes` watermark row. Previously
`meta` was left untouched on restore, so the write-only watermark claimed blobs were already synced
to the cloud while the local media set had been swapped out, causing `getNewMedia` to skip
re-uploading reintroduced blobs (leaving the cloud manifest pointing at `media/<hash>` files no
device would ever re-push). Dropping the watermark forces the next push to re-validate every
referenced blob. (The larger option (a) — deriving "needs upload" from the actual cloud `media/`
listing — is a broader architectural change deferred to a follow-up; the review explicitly endorsed
the minimal watermark-reset for this fix.)

### WR-01: `installTestBridge()` shipped a mutable DB write API on `window.__rb` in production

**Files modified:** `src/main.tsx`, `src/vite-env.d.ts`, `.env.e2e`, `package.json`, `playwright.config.ts`
**Commit:** 660bef4
**Applied fix:** Gated `installTestBridge()` behind `import.meta.env.VITE_E2E === 'true'` so it is
tree-shaken out of production bundles. Added a dedicated `.env.e2e` (`VITE_E2E=true`), a
`build:e2e` npm script (`vite build --mode e2e`), the `VITE_E2E` env typing, and pointed the
Playwright `webServer` at `npm run build:e2e` so the bridge is present only in the E2E preview.

### WR-02: `deletePerson` orphaned the person's media blobs forever

**Files modified:** `src/db/repository.ts`
**Commit:** 699fc40
**Status:** fixed: requires human verification (logic change)
**Applied fix:** `deletePerson` now runs a refcounted local media sweep inside its rw transaction
(now spanning `people`, `markers`, `maps`, `media`). It collects the deleted person's referenced
hashes (photo + gallery) and deletes a `media` row only when NO surviving entity (any person's
photo/gallery, any map background) still references that hash — correct for shared content-addressed
blobs (per CR-02's note that naive deletion is wrong). The cloud-side sweep remains deferred to the
sync engine (it must stay atomic with a manifest commit), as the review specified.

### WR-03: `manifest.backups` was written but never populated — a dead, misleading field

**Files modified:** `src/domain/types.ts`, `src/domain/schemas.ts`, `src/sync/syncEngine.ts`, `src/features/backup/exportDb.ts`, `tests/domain/person.test.ts`, `tests/sync/serializer.test.ts`
**Commit:** d455c4d
**Status:** fixed: requires human verification (schema/contract change)
**Applied fix:** Chose the review's "remove the field" option (the field can never be kept
consistent within the single-write commit point, and rolling backups are already discovered by
listing the `backups/` folder, the true source of truth). Removed `backups` from the `Manifest`
type and `ManifestSchema`, dropped `backups: []` from the bootstrap manifest, the commit's `next`
manifest, `exportDb`'s local manifest, and the two test manifest fixtures. Zod ignores unknown
keys, so older on-disk manifests still carrying `backups` continue to validate (forward-compatible).

### WR-04: `createFile` omitted `mimeType`, letting Drive guess the type for shards/media

**Files modified:** `src/storage/drive/driveRest.ts`
**Commit:** 2da4022
**Applied fix:** Added `mimeType: contentType` to the multipart metadata part so Drive stores the
correct file `mimeType` for extensionless media blobs and JSON shards instead of sniffing/guessing.

### WR-05: `connect()` rendered every failure as "Reconnect required", hiding real errors

**Files modified:** `src/features/connect/ConnectDrive.tsx`
**Commit:** ea0144f
**Status:** fixed: requires human verification (error-routing logic)
**Applied fix:** The connect `catch` now inspects the error: a `TokenExpiredError` or a
popup-cancel/dismiss/no-grant signal (matched by an `isAuthAffordanceError` helper against GIS
message/type text) routes to `markNeedsReconnect()`; any other error (ensureFolder 5xx, network
failure, etc.) routes to `markError(message)` so the UI shows the error pill instead of looping the
user through a useless reconnect.

### WR-06: Map background stored raw (no cap), and two same-named `storeMedia` functions were a trap

**Files modified:** `src/db/media.ts`, `src/db/testBridge.ts`, `src/media/mediaManager.ts`, `src/features/person-map/MapView.tsx`
**Commit:** 9e08e60
**Status:** fixed: requires human verification (upload pipeline / stored-dimensions change)
**Applied fix:** Renamed `db/media.ts`'s no-resize `storeMedia` to `storeMediaRaw` (eliminating the
same-name trap; updated the test bridge import, keeping its public `storeMedia` key for E2E).
Added a `'map'` kind to `mediaManager.storeMedia` that caps the longest edge at 4096px (larger than
the 1600px gallery cap, keeping floor plans legible while bounding quota) and re-encodes to WebP.
`MapView` now routes the map background through `mediaManager.storeMedia(file, { kind: 'map' })`
and uses the returned ref's post-cap intrinsic dimensions for `createMap` (falling back to the
pre-decode dims when the runtime lacks an image decoder).

### WR-07: Post-commit cleanup failure rejected a push for a sync that actually succeeded

**Files modified:** `src/sync/syncEngine.ts`
**Commit:** 170e471
**Status:** fixed: requires human verification (control-flow change)
**Applied fix:** Split commit step 5 into a required part (`markSynced` + `setShardMeta`, which must
complete to reconcile local state with the durable commit) and a best-effort part (`rollBackups` +
orphan deletes) wrapped in try/catch with a `console.warn`. A failure in GC/backup-trim after the
commit (e.g. a 401) no longer rejects `push()` — the commit is already durable, so reporting a sync
failure was misleading. The atomicity property test is unaffected: its injected fault steps
(`writeFile:shard`, `writeFile:backup`, `readFile:manifest`, `overwriteFile:manifest`) are all
pre-commit/at-commit and still correctly reject.

## Out of Scope (not attempted)

The 5 Info findings (IN-01 `expires_in` magic number, IN-02 comma-operator dedupe, IN-03 duplicate
dimension decoders, IN-04 per-instance `onExpiry` listener, IN-05 unused `SyncQueueRecord` table)
are outside the `critical_warning` fix scope and were intentionally not modified.

---

_Fixed: 2026-06-24T22:52:45Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

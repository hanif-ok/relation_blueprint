---
phase: 01-storage-spine-first-person-on-a-map
plan: 07
subsystem: backup
tags: [export, restore, zod, dexie, base64, radix, round-trip, indexeddb]

# Dependency graph
requires:
  - phase: 01-02
    provides: Dexie tables (people/maps/markers/media) + BackupSchema + repository putMedia/getMedia
  - phase: 01-04
    provides: content-addressed media (hashBlob/buildMediaRef) for the sample-photo fixtures
  - phase: 01-05
    provides: serializer/manifest shape reused for the bundled local manifest
provides:
  - "exportDb(): self-contained JSON+base64 backup Blob of every entity + every media blob"
  - "importDb(blob): zod-validated all-or-nothing restore (clear+bulkPut in one rw transaction)"
  - "BackupMenu: overflow ⋯ Export/Restore UI with destructive restore confirm + toasts"
  - "Round-trip property test: export->wipe->import deep-equals entities + byte-equals every photo"
affects: [restore, migration, schema-version, mega-provider, search-rebuild]

# Tech tracking
tech-stack:
  added: ["@radix-ui/react-dropdown-menu (overflow menu)"]
  patterns:
    - "Validate-before-write: BackupSchema.parse runs before any table touch; corrupt/foreign file leaves DB untouched"
    - "All-or-nothing restore: clear + bulkPut all tables in a single Dexie rw transaction (rollback on failure)"
    - "Self-contained backup bundle: schemaVersion + manifest + entities + base64 media in one JSON file"
    - "Round-trip as automated property assertion (deep-equal entities + byte-equal photos), not export theater"

key-files:
  created:
    - src/features/backup/exportDb.ts
    - src/features/backup/importDb.ts
    - src/features/backup/base64.ts
    - src/features/backup/BackupMenu.tsx
    - src/features/backup/BackupMenu.module.css
    - tests/_fixtures/generateDbFixture.ts
    - tests/_fixtures/sample-photo-a.png
    - tests/_fixtures/sample-photo-b.png
    - tests/backup/export.test.ts
    - tests/backup/roundtrip.test.ts
  modified:
    - src/app/App.tsx

key-decisions:
  - "Export bundles a minimal v0 local manifest (empty-string shard pointers) so the bundle is schema-complete and importable on a never-synced device — entities travel inline, not via cloud shards"
  - "Media mime recovered from entity MediaRefs on restore (the bundle stores only hash->base64); bytes restored byte-for-byte regardless of mime"
  - "Restore-invalid (zod fail) surfaces a dedicated error dialog with the exact UI-SPEC copy; DB untouched because validation runs before the transaction"

patterns-established:
  - "Validate-before-write at the import trust boundary (T-07-01 mitigation)"
  - "Single-transaction replace-all restore (T-07-02 mitigation)"
  - "base64 codec with chunked encode for lossless large-photo round-trip"

requirements-completed: [EXPT-01, EXPT-02]

# Metrics
duration: 8min
completed: 2026-06-24
status: complete
---

# Phase 01 Plan 07: Export / Restore Safety Net Summary

**Self-contained JSON+base64 database export with a zod-validated, all-or-nothing Dexie restore, proven by a round-trip property test that deep-equals every entity and byte-equals every photo — plus an overflow-menu Export/Restore UI with a destructive restore confirmation.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-24T15:27:17Z
- **Completed:** 2026-06-24T15:35:00Z
- **Tasks:** 2
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments
- `exportDb()` bundles `schemaVersion`, the manifest, all people/maps/markers, and every media blob (base64) into one portable JSON Blob; suggested filename `relation-blueprint-backup-YYYY-MM-DD.json`.
- `importDb(blob)` zod-validates with `BackupSchema` BEFORE any write, then clears + `bulkPut`s all tables inside a single `db.transaction('rw', ...)` — a corrupt/foreign file (or mid-restore failure) leaves the existing DB completely untouched.
- The MANDATORY round-trip property test (`tests/backup/roundtrip.test.ts`): export → wipe IndexedDB → import yields deep-equal entities AND byte-equal photo blobs (ArrayBuffer comparison over two real PNG fixtures), plus corrupt-file (`{}`) and non-JSON rejection cases.
- `BackupMenu` (Radix DropdownMenu) exposes Export/Restore from the overflow ⋯, with "Preparing backup…" spinner, "Backup saved."/"Backup restored." toasts, the exact UI-SPEC destructive restore confirm (brick "Restore"), and the restore-invalid error dialog.

## Task Commits

1. **Task 1 (RED): failing export/round-trip tests + photo fixtures** - `e4e6aa1` (test)
2. **Task 1 (GREEN): export bundler + zod-validated all-or-nothing restore** - `74df427` (feat)
3. **Task 2: export/restore overflow menu + destructive confirm** - `9075c44` (feat)

_TDD task (Task 1) produced the RED test commit then the GREEN implementation commit._

## Files Created/Modified
- `src/features/backup/exportDb.ts` - Bundles entities + base64 media into a self-contained backup Blob (`schemaVersion: 1`, `backupFilename()`).
- `src/features/backup/importDb.ts` - `BackupSchema.parse` then a single-transaction clear+bulkPut replace-all restore; recovers media mime from entity MediaRefs.
- `src/features/backup/base64.ts` - Chunked, lossless base64 <-> ArrayBuffer codec for photo bytes.
- `src/features/backup/BackupMenu.tsx` - Radix DropdownMenu overflow Export/Restore with spinner, toasts, destructive ConfirmDialog, and restore-invalid error dialog.
- `src/features/backup/BackupMenu.module.css` - Menu/toast/dialog-error styling on shell tokens.
- `tests/_fixtures/generateDbFixture.ts` - Seeds N people/map/markers + 2 content-addressed sample photos; returns refs + raw bytes for byte-equality.
- `tests/_fixtures/sample-photo-a.png`, `sample-photo-b.png` - Two distinct real 1x1 PNGs for byte-equal assertions.
- `tests/backup/export.test.ts` - EXPT-01 bundle-shape assertions (schemaVersion + entities + base64 media).
- `tests/backup/roundtrip.test.ts` - EXPT-02 round-trip deep/byte equality + corrupt-file rejection.
- `src/app/App.tsx` - Replaced the placeholder overflow button with `<BackupMenu />`.

## Decisions Made
- **Local v0 manifest in the export bundle:** a local export carries a minimal manifest with empty-string shard pointers so the bundle satisfies `BackupSchema` and imports on a never-synced device; entities travel inline in `entities`, not via cloud shard files.
- **Media mime recovery on restore:** the bundle stores only `hash -> base64` (bytes are the identity), so `importDb` rebuilds each blob's mime from the MediaRefs on the restored entities (default `application/octet-stream` if unreferenced). Bytes are always restored byte-for-byte.
- **Restore-invalid UX:** zod failure surfaces a dedicated error dialog with the exact UI-SPEC message; safe because validation runs before the transaction, so current data is never touched.

## Deviations from Plan

None - plan executed exactly as written. (One minor implementation adjustment inside the planned files: the fixture reads the sample PNGs via `process.cwd()` join instead of `import.meta.url`, because Vitest on Windows resolved `import.meta.url` to a `C:\` root — not a scope change.)

## Issues Encountered
- `import.meta.url`-based fixture path resolved to `C:\tests\_fixtures\...` under Vitest on Windows. Resolved by joining from `process.cwd()` (Vitest runs at repo root). Tests then passed.
- tsc flagged `Uint8Array<ArrayBufferLike>` not assignable to `BlobPart` for the fs-read sample bytes. Resolved by copying into a fresh plain `Uint8Array<ArrayBuffer>` before constructing the Blob.

## Verification
- `npx vitest run tests/backup` - 6/6 green (export contents + round-trip deep/byte equality + corrupt-file + non-JSON rejection).
- `npx vitest run` - full suite 81/81 green (75 prior + 6 new... reported as 81 total).
- `npx tsc --noEmit` - clean.
- `npx playwright test` - 13/13 e2e green with `BackupMenu` mounted (production build + preview succeeded).
- Grep checks: `BackupSchema.parse` (importDb.ts:47) runs before `db.transaction` (importDb.ts:58); `schemaVersion: 1`; filename `relation-blueprint-backup-YYYY-MM-DD.json`.

## Threat Model Coverage
- **T-07-01 (Tampering / foreign import):** mitigated — `BackupSchema.parse` validates the whole bundle before any write; corrupt-file test asserts DB untouched.
- **T-07-02 (Partial restore / data loss):** mitigated — restore runs in one `rw` transaction (all-or-nothing rollback).
- **T-07-03 (Accidental destructive restore):** mitigated — destructive ConfirmDialog with the "export first" nudge (UI-SPEC A11).
- **T-07-04 (Unencrypted export):** accepted per v1 boundary (provider/file security only; app-level encryption deferred to v2 / SEC-01).

## Known Stubs
None — export/restore is fully wired (real Dexie reads/writes, real photo bytes), not placeholder data.

## Next Phase Readiness
- The tested safety net (lossless export/restore) now exists, satisfying the phase precondition that a tested restore must exist before real data goes in.
- This is the final plan of Phase 01 (Plan 01 is the planning/skeleton entry; Plans 02–08 implementation are complete). Phase 01 storage spine is end-to-end with a proven backup escape hatch.

## Self-Check: PASSED

All 11 created/modified files exist on disk; all 3 task commits (`e4e6aa1`, `74df427`, `9075c44`) are present in git history.

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24*

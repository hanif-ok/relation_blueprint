---
phase: 01-storage-spine-first-person-on-a-map
verified: 2026-06-24T15:48:57Z
status: human_needed
score: 4/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "App syncs local changes to the connected cloud in the background (single-curator, last-write-wins by updatedAt) — SyncEngine now booted on connect via useSyncEngine; regression test proves a real createPerson write pushes a shard to the provider and clears the dirty flag"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "User can connect their own Google Drive and sees a visible, named app folder appear in Drive (consent screen shows only drive.file, never 'all your Drive files')"
    test: "Configure VITE_GOOGLE_CLIENT_ID, click 'Connect Drive', sign in with a real Google account"
    expected: "A visible 'Relation Blueprint' folder appears at drive.google.com; the OAuth consent screen wording references ONLY 'files this app creates' (drive.file), NOT 'See and manage all of your Google Drive files'"
    why_human: "GIS OAuth popup is a live browser interaction with Google's servers; the consent screen wording can only be verified by a human reading the actual consent dialog. All Drive code is unit-tested against mocked GIS — the code is correct, but the runtime behavior against the real Google identity layer requires a human actor."
human_verification:
  - test: "Verify STOR-01: live Drive connect with drive.file-only consent and visible folder"
    expected: "After completing SETUP.md and clicking 'Connect Drive': (a) consent screen shows only 'files this app creates', NOT broad Drive access; (b) a visible 'Relation Blueprint' folder appears in Google Drive at drive.google.com; (c) the status pill transitions to 'Drive - Synced'"
    why_human: "GIS OAuth consent screen wording and the Drive folder visibility can only be confirmed by a human performing the live connect flow"
  - test: "Verify STOR-02/STOR-04 end-to-end against LIVE Drive"
    expected: "After connecting a real Google account and creating a person offline: the SyncEngine push() commits people/maps/markers shards + manifest into the visible 'Relation Blueprint' folder; the shard files are visible in Drive and contain the created entities"
    why_human: "The wiring + push behavior is proven against InMemoryProvider (regression test passes), but the live Drive REST round-trip can only be confirmed with a real OAuth credential and Google account"
  - test: "Verify >1h token expiry Reconnect flow against live Google"
    expected: "After a >1h session, the status pill transitions to 'Drive - Reconnect' without blocking the app; clicking Reconnect re-acquires a new token and resumes sync"
    why_human: "Token lifecycle timing requires a real session exceeding 60 minutes; not reproducible in automated tests"
---

# Phase 01: Storage Spine & First Person on a Map — Verification Report

**Phase Goal:** As a single curator of a private people-and-places dataset, I want to connect my own Google Drive, create a person, place them on an image-map, open their profile, and export then restore my whole database, so that I own my entire database in my own cloud with no server and can trust the storage spine before I put real data in it.
**Verified:** 2026-06-24T15:48:57Z (re-verified after STOR-02/STOR-04 gap closure)
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous: gaps_found 3/5)

---

## Re-Verification Summary

The single hard gap from the initial verification — the `SyncEngine` existing but never instantiated in the running app — is now **CLOSED**.

**Fix verified against actual code (commits d4bb5be wiring, bfdce5f test):**

- `src/features/connect/useSyncEngine.ts` (NEW): the production seam. On `onConnected(folderId)` it builds the active provider (`getActiveProvider()`) + `createDexieRepoPort(db)` + a `new SyncEngine(...)`, runs `reconcileOnOpen()` once, then subscribes to the repository `onChange` emitter and schedules a debounced (800ms) `push()`. `onDisconnected`/unmount tears down the subscription, pending timer, and engine. Every sync call is guarded (surfaces via `syncStatusStore`, never throws into render). Provider/repo are injectable for testing.
- `src/app/App.tsx` (line 36-40): now calls `const sync = useSyncEngine()` and passes `onConnected: sync.onConnected` + `onDisconnected: sync.onDisconnected` into `useConnectDrive(...)`. The `onConnected` seam that was previously `undefined` is now wired.

**Behavioral evidence (ran the named regression test, not symbol presence):**
`npx vitest run tests/connect/useSyncEngine.test.tsx` → **3/3 passed**:
1. `reconcileOnOpen()` runs exactly once on connect (state transition).
2. A real `createPerson({name:'Alice'})` triggers a debounced `push()`; reading `manifest.json` back from the provider shows the people shard contains "Alice" AND the `db.people` record is `dirty:false` afterward — the full dirty→push→clean state transition is exercised end-to-end against an InMemoryProvider.
3. Disconnect tears down the subscription so a later write does NOT push (cleanup invariant).

STOR-02 and STOR-04 are now achieved in the running application (against the proven StorageProvider seam). The live-Drive round-trip remains a human verification item (requires real OAuth credential), but the code path is no longer a gap.

---

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can connect their own Google Drive and sees a visible, named app folder appear in Drive (consent screen shows only `drive.file`, never "all your Drive files") | PRESENT_BEHAVIOR_UNVERIFIED | `src/storage/drive/auth.ts` exports `DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'` (only scope ever passed to `initTokenClient`). `ConnectDrive.tsx` calls `provider.ensureFolder('Relation Blueprint')` on connect. Token in module variable only, never localStorage/IndexedDB. GIS auth + DriveProvider unit-tested with mocked GIS. Live consent wording + folder visibility require human verification. |
| 2 | User can create a person with out-of-box fields, upload a background image to make a map, and place that person as a round photo-avatar marker | VERIFIED | `Person` has all 6 DATA-02 fields. `MapView.tsx` 25 MB cap + format allowlist + "Start with a place." empty state. `AvatarMarker.tsx` uses `clipFunc` + reads `colors.amber` from tokens. E2E `map-create.spec.ts` + `marker.spec.ts` pass. |
| 3 | User can click the person to open a sidebar profile showing all their data plus a thumbnail and photo gallery, and can edit or delete the person | VERIFIED | `ProfileSidebar.tsx` via `useLiveQuery`, `deletePerson` cascade, `PhotoGallery` resolves MediaRefs, `ConfirmDialog`. No `dangerouslySetInnerHTML` in code. E2E `profile.spec.ts` passes. |
| 4 | App keeps working when offline (IndexedDB is the source of truth) and syncs changes back to Drive when reconnected, without a failed/interrupted write corrupting the database | VERIFIED | **OFFLINE + ATOMICITY:** Dexie source of truth; STOR-03 offline CRUD + STOR-05 atomicity failure-injection property test pass. **SYNC TO DRIVE (gap now closed):** `useSyncEngine` boots `SyncEngine` on connect (`new SyncEngine` at useSyncEngine.ts:119), App.tsx wires `sync.onConnected`/`sync.onDisconnected` into `useConnectDrive`. Regression test `tests/connect/useSyncEngine.test.tsx` (3/3 pass) proves a real `createPerson` write pushes a people shard to the provider and clears the dirty flag, and disconnect tears the subscription down. |
| 5 | User can install the app as a PWA, export the whole database as a self-contained backup, and restore it on a fresh session with all photos intact (round-trip verified) | VERIFIED | VitePWA `registerType: 'prompt'`, base/start_url/scope all `/relation_blueprint/`. `usePersistentStorage` calls `navigator.storage.persist()` from user action. `UpdateToast` checks `isWriteInFlight()`. `exportDb`/`importDb` with `BackupSchema.parse` before write. Round-trip property test deep-equal entities + byte-equal photos. E2E `pwa-install.spec.ts` passes. |

**Score:** 4/5 truths verified (1 present-behavior-unverified — live Drive connect requires human)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/types.ts` | Person with DATA-02 fields + sync metadata | VERIFIED | id, name, photo?, phone?, description?, tags[], notes?, gallery[], updatedAt, dirty |
| `src/domain/schemas.ts` | zod schemas | VERIFIED | PersonSchema, MapDocSchema, MarkerSchema, ManifestSchema, BackupSchema |
| `src/storage/StorageProvider.ts` | Provider-agnostic interface | VERIFIED | 7 methods |
| `src/storage/memory/InMemoryProvider.ts` | Interface lock | VERIFIED | `implements StorageProvider` |
| `src/db/schema.ts` | Dexie schema | VERIFIED | people/maps/markers/media/meta/syncQueue; media keyed by hash only |
| `src/db/repository.ts` | CRUD with dirty-marking, zod, cascade, change events | VERIFIED | dirty=true + updatedAt on every write; zod parse; cascade in transaction; `onChange` emitter |
| `src/sync/serializer.ts` | Sharded serializer | VERIFIED | SHARD_NAMES people-000/maps-000/markers-000 |
| `src/sync/manifest.ts` | Manifest read/validate + rolling backups | VERIFIED | ManifestSchema.parse, writeManifestWithBackup, rollBackups |
| `src/sync/syncEngine.ts` | Atomic manifest-swap engine | VERIFIED | bootstrap/push/commit/reconcileOnOpen; **now instantiated in production via useSyncEngine** |
| `src/features/connect/useSyncEngine.ts` | Production seam booting SyncEngine on connect | VERIFIED (NEW) | `new SyncEngine` on onConnected; reconcileOnOpen once; debounced push on repository onChange; teardown on disconnect/unmount |
| `tests/_fakes/faultInjectingProvider.ts` | Fault-injection decorator | VERIFIED | implements StorageProvider; injects at every commit-step boundary |
| `src/storage/drive/auth.ts` | GIS token wrapper, drive.file only | VERIFIED | DRIVE_FILE_SCOPE; token in module var; no localStorage/IndexedDB writes |
| `src/storage/drive/driveRest.ts` | Drive REST v3 wrappers | VERIFIED | multipart create, PATCH uploadType=media for manifest, Bearer token |
| `src/storage/drive/DriveProvider.ts` | StorageProvider over driveRest | VERIFIED | `implements StorageProvider` |
| `src/features/connect/StatusPill.tsx` | Six semantic state pill | VERIFIED | all 6 states |
| `src/features/person-map/MapView.tsx` | Konva Stage + image/marker layers | VERIFIED | empty state, 25 MB cap |
| `src/features/person-map/AvatarMarker.tsx` | Round avatar marker | VERIFIED | clipFunc, tokens.amber |
| `src/features/profile/ProfileSidebar.tsx` | Right-docked profile | VERIFIED | useLiveQuery + deletePerson |
| `src/features/person-form/PersonForm.tsx` | Create/edit form, 6 fields | VERIFIED | name required |
| `src/app/tokens.ts` | Shared tokens | VERIFIED | amber #C8742B |
| `src/media/mediaManager.ts` | Content-addressed blob store | VERIFIED | SHA-256; putMedia/getMedia |
| `src/media/thumbnails.ts` | Client-side resize | VERIFIED | OffscreenCanvas + WebP |
| `src/features/profile/PhotoGallery.tsx` | Lazy gallery grid | VERIFIED | resolveMediaUrl; "No photos yet." |
| `src/features/backup/exportDb.ts` | Export bundler | VERIFIED | schemaVersion + base64 media |
| `src/features/backup/importDb.ts` | Validated all-or-nothing restore | VERIFIED | BackupSchema.parse before transaction |
| `src/features/backup/BackupMenu.tsx` | Export/Restore menu | VERIFIED | wired to exportDb/importDb |
| `src/app/pwa.ts` | registerSW prompt mode | VERIFIED | virtual:pwa-register |
| `src/features/pwa/usePersistentStorage.ts` | Post-action persist() | VERIFIED | persist() in callback |
| `src/features/pwa/UpdateToast.tsx` | Write-guarded update toast | VERIFIED | isWriteInFlight() check |
| `SETUP.md` | OAuth setup (drive.file) | VERIFIED | documents drive.file, warns vs broad scope |
| `tests/setup.ts` | fake-indexeddb import | VERIFIED | `import 'fake-indexeddb/auto'` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `App.tsx` | `src/features/connect/useSyncEngine.ts` | `useSyncEngine()` wired into `useConnectDrive` | VERIFIED (gap closed) | App.tsx:36-40 — `sync.onConnected`/`sync.onDisconnected` passed to `useConnectDrive` |
| `src/features/connect/useSyncEngine.ts` | `src/sync/syncEngine.ts` | `new SyncEngine` on onConnected; reconcile + debounced push | VERIFIED | useSyncEngine.ts:119 instantiates; :130 reconcileOnOpen; :140 onChange→schedulePush |
| `src/features/connect/useSyncEngine.ts` | `src/db/repository.ts` | subscribes to `onChange` to schedule push | VERIFIED | `import { onChange } from '@/db/repository'`; `unsubscribeRef.current = onChange(() => schedulePush())` |
| `src/sync/syncEngine.ts` | `src/storage/StorageProvider.ts` | writes via provider interface only | VERIFIED | provider.writeFile/overwriteFile in commit() |
| `src/features/person-map/AvatarMarker.tsx` | `src/db/repository.ts` | onDragEnd → upsertMarker | VERIFIED | upsertMarker in handleDragEnd |
| `src/features/profile/ProfileSidebar.tsx` | `src/db/repository.ts` | deletePerson + useLiveQuery | VERIFIED | both present |
| `src/db/repository.ts` | `src/domain/schemas.ts` | zod parse before persist | VERIFIED | PersonSchema.parse etc. on every write |
| `src/media/mediaManager.ts` | `src/db/repository.ts` | putMedia/getMedia | VERIFIED | imported + called |
| `src/features/backup/importDb.ts` | `src/domain/schemas.ts` | BackupSchema before transaction | VERIFIED | BackupSchema.parse(raw) |
| `vite.config.ts` | `src/app/pwa.ts` | registerType:'prompt' → virtual:pwa-register | VERIFIED | both present |
| `src/features/pwa/UpdateToast.tsx` | `src/sync/writeStatus.ts` | activate SW only when no write in flight | VERIFIED | isWriteInFlight() |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SyncEngine booted on connect (state transition) | `npx vitest run tests/connect/useSyncEngine.test.tsx` | 3/3 passed — reconcileOnOpen once; createPerson→push writes Alice shard, dirty=false; disconnect stops push | PASS |
| SyncEngine instantiated in production | `grep "new SyncEngine" src/` | useSyncEngine.ts:119 | PASS |
| App wires onConnected | `grep "onConnected" src/app/App.tsx` | `onConnected: sync.onConnected` (line 38) | PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | Exit 0 (orchestrator-confirmed) | PASS |
| Unit tests: 84/84 (was 81, +3) | `npx vitest run` | 84/84 across 15 files (orchestrator-confirmed; regression test independently re-run here = 3/3) | PASS |
| E2E tests: 13/13 | `npx playwright test` | 13/13 green (prior run) | PASS |
| Production build succeeds | `npm run build` | dist/ + SW (orchestrator-confirmed) | PASS |
| No prohibited backend deps | grep package.json | none | PASS |
| Token not in localStorage | grep src/storage/drive/ | comment only | PASS |
| No dangerouslySetInnerHTML in features | grep src/features/ | comment only | PASS |
| clipFunc in AvatarMarker | grep AvatarMarker.tsx | present | PASS |
| drive.file scope only | grep auth.ts | only drive.file | PASS |
| Round-trip property test exists | ls tests/backup/roundtrip.test.ts | present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STOR-01 | 01-06 | Connect Google Drive, drive.file, visible folder | PRESENT_BEHAVIOR_UNVERIFIED | Drive code complete + unit-tested; live connect requires human |
| STOR-02 | 01-05, 01-06 | Persist DB to cloud as sharded manifest + entity files + media | VERIFIED (gap closed) | SyncEngine now booted via useSyncEngine; regression test proves shard push to provider |
| STOR-03 | 01-02 | Works fully offline | VERIFIED | Dexie source of truth; offline unit tests pass |
| STOR-04 | 01-05, 01-06 | Background sync, last-write-wins | VERIFIED (gap closed) | Debounced push on repository onChange; regression test proves createPerson→push→dirty:false |
| STOR-05 | 01-05 | Atomic writes, no corruption | VERIFIED | Failure-injection property test passes |
| STOR-06 | 01-01, 01-08 | PWA install + persistent storage | VERIFIED | vite-plugin-pwa; usePersistentStorage; E2E passes |
| DATA-02 | 01-02, 01-03 | Person 6 fields | VERIFIED | all 6 fields present |
| DATA-04 | 01-02, 01-03 | Edit/delete | VERIFIED | cascade delete; profile.spec.ts passes |
| PROF-01 | 01-03 | Sidebar profile | VERIFIED | all DATA-02 fields, useLiveQuery |
| PROF-02 | 01-04 | Thumbnail + gallery | VERIFIED | PhotoGallery lazy grid |
| PROF-03 | 01-04 | Client-side thumbnails as blobs | VERIFIED | OffscreenCanvas WebP; putMedia |
| MAP-01 | 01-03 | Create map from image | VERIFIED | map-create.spec.ts passes |
| MAP-04 | 01-03 | Round avatar marker | VERIFIED | clipFunc; marker.spec.ts passes |
| EXPT-01 | 01-07 | Export portable backup | VERIFIED | exportDb bundles entities + media |
| EXPT-02 | 01-07 | Restore including photos | VERIFIED | round-trip property test passes |

All 15 declared requirement IDs accounted for; no orphans.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | The previous BLOCKER (App.tsx not booting SyncEngine) is resolved | — | Clean |
| None | — | No TBD/FIXME/XXX debt markers in src/ | — | Clean |
| None | — | No stubs | — | Clean |

---

### Human Verification Required

The only remaining items are LIVE Google Drive interactions that cannot be asserted from code/tests. The OAuth Client ID setup is a documented one-time human runtime prerequisite (SETUP.md) the user chose to defer.

#### 1. Live Drive Connect — STOR-01 (consent screen + visible folder)

**Test:** Complete SETUP.md Step 2 (create OAuth Client ID, set `VITE_GOOGLE_CLIENT_ID` in `.env`). Click "Connect Drive" with a real Google account.
**Expected:** (a) consent screen shows only "files this app creates" (drive.file), NOT broad Drive access; (b) a visible "Relation Blueprint" folder appears at drive.google.com; (c) status pill transitions to "Drive - Synced".
**Why human:** GIS consent dialog is a live interaction with Google. Consent wording + folder visibility can only be read by a human.

#### 2. Live Drive Sync Round-Trip — STOR-02/STOR-04

**Test:** After connecting a real Google account, create a person offline, then observe the push.
**Expected:** SyncEngine push() commits people/maps/markers shards + manifest into the visible "Relation Blueprint" folder; shard files are visible in Drive and contain the created entities.
**Why human:** Wiring + push behavior proven against InMemoryProvider (regression test passes); the live Drive REST round-trip needs a real OAuth credential.

#### 3. Token Expiry Reconnect Flow (>1h session)

**Test:** Use the app over 1 hour with a real Drive connection; observe token expiry (~60 min).
**Expected:** Status pill → "Drive - Reconnect" (non-destructive); app stays usable offline; Reconnect re-acquires a token and resumes sync.
**Why human:** Token expiry timing requires a real session over 60 minutes.

---

### Gaps Summary

**No code gaps remain.** The STOR-02/STOR-04 wiring gap from the initial verification is closed and confirmed by reading the actual code and independently re-running the regression test (`tests/connect/useSyncEngine.test.tsx` → 3/3 pass, including the dirty→push→clean state transition and the disconnect cleanup invariant).

The 3 remaining items are LIVE Google Drive human-verification items, not missing implementation. All automated checks pass (84 unit tests, 13 E2E, tsc clean, build succeeds). Per the decision tree, because the human verification section is non-empty (including 1 present-behavior-unverified truth for live connect), the status is `human_needed` rather than `passed`.

---

_Verified: 2026-06-24T15:48:57Z (re-verified after gap closure)_
_Verifier: Claude (gsd-verifier)_

---
phase: 01-storage-spine-first-person-on-a-map
plan: 06
subsystem: storage
tags: [google-drive, gis, oauth, drive-rest-v3, storage-provider, sync, pwa, react]

# Dependency graph
requires:
  - phase: 01-02
    provides: StorageProvider interface + InMemoryProvider conformance contract
  - phase: 01-05
    provides: atomic manifest-swap SyncEngine driven through StorageProvider (+ getNewMedia seam)
  - phase: 01-04
    provides: content-addressed media manager (media/<hash> cloud filename contract)
  - phase: 01-03
    provides: App.tsx shell + window.__rb E2E test bridge
provides:
  - GIS token-model auth wrapper (in-memory token, drive.file scope only, expiry/revoke)
  - Drive REST v3 fetch layer (ensureFolder, multipart createFile, manifest overwrite, list, readFile, stat, delete)
  - DriveProvider implementing StorageProvider (passes the same conformance contract as InMemoryProvider)
  - providerFactory.getActiveProvider (Drive now; Mega seam for Phase 6)
  - connect/reconnect/status chrome (StatusPill S9, ReconnectBanner S8, useSyncStatus, ConnectDrive)
  - real media wiring into SyncEngine.getNewMedia via a synced-hash watermark
affects: [02-typed-custom-fields, 06-mega-provider, export-restore, sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GIS token model: in-memory-only access token, drive.file scope only, no refresh token, re-acquire on user gesture"
    - "Drive REST v3 via raw fetch: multipart create for new immutable files, PATCH uploadType=media only for the manifest commit point"
    - "Provider behind a factory: app code targets StorageProvider; concrete providers (Drive/Mega) never imported directly"
    - "Observable sync-status store + useSyncExternalStore hook resolving six semantic UI states"
    - "Synced-hash watermark in meta table makes media push incremental while staying content-addressed/idempotent"

key-files:
  created:
    - src/storage/drive/auth.ts
    - src/storage/drive/driveRest.ts
    - src/storage/drive/DriveProvider.ts
    - src/storage/drive/gis.d.ts
    - src/storage/providerFactory.ts
    - src/features/connect/syncStatusStore.ts
    - src/features/connect/useSyncStatus.ts
    - src/features/connect/StatusPill.tsx
    - src/features/connect/StatusPill.module.css
    - src/features/connect/ReconnectBanner.tsx
    - src/features/connect/ReconnectBanner.module.css
    - src/features/connect/ConnectDrive.tsx
    - tests/storage/auth.test.ts
    - tests/storage/driveProvider.contract.test.ts
    - e2e/drive-connect.spec.ts
  modified:
    - src/app/App.tsx
    - src/db/testBridge.ts
    - src/sync/syncEngine.ts
    - src/vite-env.d.ts

key-decisions:
  - "DriveProvider delegates to a thin driveRest fetch layer; auth (token) lives in a separate module, not the provider, so the provider holds no per-call state"
  - "getNewMedia() returns only media whose content hash is not yet in a synced-hash watermark (meta row) — incremental upload that stays idempotent because media is content-addressed"
  - "ConnectDrive exports a useConnectDrive hook (logic) + a thin ConnectDrive component (the pill); App owns layout (pill in top bar, banner under it)"
  - "E2E drives the chrome through window.__rb.connect store transitions because a LIVE connect needs the human OAuth Client ID (deferred); the real GIS lifecycle is unit-tested with a mocked GIS"

patterns-established:
  - "Pattern: token-never-persisted is an asserted invariant (auth.test.ts spies indexedDB.open and scans localStorage after connect)"
  - "Pattern: 401 -> markExpired() -> onExpiry fan-in -> needsReconnect -> non-blocking ReconnectBanner; consent is re-requested ONLY on the user's click"

requirements-completed: [STOR-01, STOR-04]

# Metrics
duration: 18min
completed: 2026-06-24
status: complete
---

# Phase 01 Plan 06: Live Google Drive Backend + Connect/Reconnect Chrome Summary

**GIS token-model auth (in-memory, drive.file-only) + Drive REST v3 fetch layer + a DriveProvider that passes the same StorageProvider contract as the fake, wired to the connect/reconnect/status UI — the Plan 05 sync engine now drives real Drive unchanged.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-24T15:05Z
- **Completed:** 2026-06-24T15:23Z
- **Tasks:** 2
- **Files modified:** 19 (15 created, 4 modified)

## Accomplishments
- `DriveProvider implements StorageProvider` and passes the **same** conformance contract as `InMemoryProvider` (interface parity proven over a mocked fetch backend) — the corruption-proof sync engine runs against real Drive with zero changes.
- GIS token lifecycle implemented and unit-tested **without a live credential**: in-memory token, `drive.file` scope ONLY, 60s expiry skew, `onExpiry`, `revoke()`, `TokenExpiredError`; the token is asserted to never touch localStorage or IndexedDB.
- Connect/reconnect/status chrome: the six-state StatusPill (S9), the non-destructive ReconnectBanner (S8), `useSyncStatus`, and `ConnectDrive` — a 401/expiry surfaces a Reconnect prompt while the app stays fully usable offline (a person can still be created with the banner up).
- Real media wired into the Plan 05 `SyncEngine.getNewMedia()` seam via a synced-hash watermark (content-addressed `media/<hash>`), replacing the intentional empty-set stub.

## Task Commits

1. **Task 1: GIS auth + Drive REST v3 + DriveProvider implementing StorageProvider** - `6835ada` (feat)
2. **Task 2: Connect/reconnect/status chrome + non-destructive token-expiry handling** - `49ace43` (feat)

## Files Created/Modified
- `src/storage/drive/auth.ts` - GIS token wrapper: in-memory token, drive.file scope only, expiry skew, onExpiry/revoke, TokenExpiredError
- `src/storage/drive/driveRest.ts` - Drive REST v3 fetch wrappers (multipart create, manifest PATCH, ensureFolder find-or-create, list/readFile/stat/delete); 401 -> TokenExpiredError
- `src/storage/drive/DriveProvider.ts` - StorageProvider over driveRest (writeFile=createFile new; overwriteFile=manifest PATCH)
- `src/storage/drive/gis.d.ts` - Minimal ambient types for the GIS token-client global
- `src/storage/providerFactory.ts` - getActiveProvider (Drive now; Mega seam for Phase 6)
- `src/features/connect/syncStatusStore.ts` - Observable store of connection/sync state
- `src/features/connect/useSyncStatus.ts` - Hook resolving the six UI-SPEC semantic states
- `src/features/connect/StatusPill.tsx` (+ .module.css) - The S9 status pill with semantic dot colors
- `src/features/connect/ReconnectBanner.tsx` (+ .module.css) - The S8 non-blocking reconnect banner
- `src/features/connect/ConnectDrive.tsx` - useConnectDrive hook + the pill component; the only caller of connect()/revoke()
- `src/app/App.tsx` - Pill in the top bar, ReconnectBanner under it
- `src/db/testBridge.ts` - Exposed connect-state transitions on window.__rb for the E2E
- `src/sync/syncEngine.ts` - Real getNewMedia() via a synced-hash watermark; markSynced records pushed hashes
- `src/vite-env.d.ts` - Typed VITE_GOOGLE_CLIENT_ID on import.meta.env
- `tests/storage/auth.test.ts` - Token-never-persisted + expiry skew + revoke (mocked GIS)
- `tests/storage/driveProvider.contract.test.ts` - DriveProvider conformance parity over a mocked fetch Drive
- `e2e/drive-connect.spec.ts` - Six pill states + 401 -> Reconnect banner while the app stays usable offline

## Decisions Made
- **Auth lives in its own module, not the provider.** The DriveProvider holds no per-call state; `getValidToken()`/`markExpired()` are imported by the REST layer. This keeps the provider a pure StorageProvider and lets the auth invariants be unit-tested in isolation.
- **Incremental media push via a synced-hash watermark** (a `meta` row listing already-pushed hashes). Media stays content-addressed (so the upload is idempotent regardless), but already-synced blobs are not re-sent — this matters as the gallery grows (scale/STOR-04). Replaces the Plan 05 empty-set stub with no change to the StorageProvider contract.
- **E2E drives store transitions, not a live popup.** Because a LIVE connect requires the human OAuth Client ID (deferred — see below), the connect E2E exercises the chrome deterministically through `window.__rb.connect`. The actual GIS token lifecycle (the security-critical part) is unit-tested with a mocked GIS global.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wired real media into SyncEngine.getNewMedia()**
- **Found during:** Task 1 (per the execution context: the Plan 05 seam returned an intentional empty set and Plan 06 owns the real wiring)
- **Issue:** `createDexieRepoPort.getNewMedia()` returned `{}`, so the Drive sync path would never upload photos — the storage spine would be incomplete for the export/restore acceptance.
- **Fix:** `getNewMedia()` now returns every stored media blob whose content hash is absent from a `syncedMediaHashes` meta watermark; `markSynced()` records the pushed hashes. Content addressing keeps it idempotent (`media/<hash>` per Plan 04).
- **Files modified:** src/sync/syncEngine.ts
- **Verification:** `npx vitest run tests/sync` (17 passed) + full suite (75 passed); tsc clean.
- **Committed in:** 6835ada (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical).
**Impact on plan:** The media wiring was explicitly assigned to this plan by the execution context; it completes the Drive sync path without touching the StorageProvider contract. No scope creep.

## Issues Encountered
- **jsdom Response quirks in the contract test:** jsdom's `Response` rejects a 204 body and `Response(Blob)` failed `.blob()` (`object.stream is not a function`). Resolved by returning 200 for the delete double and constructing the media response from an `ArrayBuffer` rather than a Blob. The DriveProvider itself is unaffected (it never reads the delete body).
- **Stale reused preview server masked the E2E:** the first `playwright test` reused a lingering `vite preview` from a pre-change run (port 4173, `reuseExistingServer` locally), so it served an old bundle without the pill and both tests failed "element not found". Killing the stale server forced a fresh `npm run build && npm run preview`; all 13 E2E tests then passed. No code issue — an environment artifact.

## Known Stubs
None — the Plan 05 `getNewMedia()` empty-set stub was replaced with real media wiring in this plan.

## User Setup Required
**LIVE Google Drive connect requires the human OAuth Client ID setup from SETUP.md — this is the phase-end (verify-work) verification item.**

- There is **no live `VITE_GOOGLE_CLIENT_ID`** configured yet (the user opted to keep building). All Drive code is fully developed and unit-/E2E-testable without it:
  - The connect UI surfaces a clear **"OAuth Client ID not configured — see SETUP.md"** error state instead of crashing when the env var is unset.
  - Unit tests mock the GIS global and the Drive REST `fetch`; the E2E drives the chrome through the `window.__rb.connect` bridge (or runs without a live popup).
- **Manual phase gate (verify-work):** complete SETUP.md Step 2 (create the OAuth 2.0 Client ID, consent screen lists **only** `drive.file`, set `VITE_GOOGLE_CLIENT_ID` in `.env`), then connect with a real Google account and confirm:
  1. the consent shows **only** "files this app creates" (never "all your Drive files"),
  2. a **visible** "Relation Blueprint" folder appears at drive.google.com (SC#1),
  3. leaving a >1h session shows the non-destructive Reconnect behavior (RESEARCH Assumption A1).

## Next Phase Readiness
- The StorageProvider seam now has a live Drive implementation behind the factory; Phase 6 (Mega) slots in behind `getActiveProvider` with the same interface.
- The sync engine pushes shards + media to real Drive unchanged — export/restore (Plan 07) and the typed-custom-fields work (Phase 2) build on a complete, proven spine.
- Only blocker to exercising LIVE Drive end-to-end: the human OAuth Client ID (SETUP.md), documented above as the phase-end verification item.

## Self-Check: PASSED

All 15 created files exist on disk; both task commits (`6835ada`, `49ace43`) are present in git history. Verification: 75 unit tests pass, 13 E2E tests pass, `tsc --noEmit` clean, `npm run build` succeeds.

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24*

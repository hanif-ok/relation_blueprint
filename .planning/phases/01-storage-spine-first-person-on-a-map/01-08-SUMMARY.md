---
phase: 01-storage-spine-first-person-on-a-map
plan: 08
subsystem: infra
tags: [pwa, vite-plugin-pwa, workbox, service-worker, offline, react, storage-api]

# Dependency graph
requires:
  - phase: 01-01
    provides: Vite 7 + React 19.2 SPA with base '/relation_blueprint/', index.html, src/main.tsx
provides:
  - Prompt-mode service worker (vite-plugin-pwa) precaching the app shell for offline open
  - Controlled SW update flow that activates only on user Reload and only when no write is in flight
  - PWA web manifest scoped to the GitHub Pages subpath (/relation_blueprint/)
  - usePersistentStorage hook requesting navigator.storage.persist() after a user action
  - InstallPrompt (beforeinstallprompt toast + useInstallPrompt overflow item)
  - src/sync/writeStatus.ts in-flight-write seam for the Plan 05 sync engine to drive
affects: [01-05-sync-engine, 01-06-drive-provider, profile-shell, top-bar-overflow-menu]

# Tech tracking
tech-stack:
  added: [vite-plugin-pwa@1.3.0, workbox-window@7.4.1, "@vite-pwa/assets-generator@1.0.2"]
  patterns:
    - "Prompt-mode SW: a new worker WAITS; activation gated on user action + no in-flight write"
    - "Write-status seam (beginWrite/endWrite/isWriteInFlight) decouples PWA update guard from the not-yet-built sync engine"
    - "PWA lifecycle bridged to React via a subscribe()/replay registry in src/app/pwa.ts"
    - "Storage persistence requested from a user action (not on load), result surfaced with eviction warning"

key-files:
  created:
    - src/app/pwa.ts
    - src/features/pwa/UpdateToast.tsx
    - src/features/pwa/InstallPrompt.tsx
    - src/features/pwa/usePersistentStorage.ts
    - src/sync/writeStatus.ts
    - public/manifest-icons/README.md
    - tests/pwa/persistence.test.ts
    - e2e/pwa-install.spec.ts
  modified:
    - vite.config.ts
    - src/main.tsx
    - src/app/App.tsx
    - src/vite-env.d.ts

key-decisions:
  - "Created src/sync/writeStatus.ts as the in-flight-write seam because Plan 05's sync engine does not exist yet (Plan 08 runs in wave 3 ahead of Plan 05). Plan 05 MUST call beginWrite()/endWrite() around Drive pushes; isWriteInFlight() defaults to false (safe: no engine => no write => update may proceed)."
  - "Installed vite-plugin-pwa/workbox-window/@vite-pwa/assets-generator now: the plan assumed Plan 01 installed them but it had not. All three are vetted in 01-RESEARCH Package Legitimacy Audit (no postinstall, canonical repos, high download counts) — no human-verify checkpoint needed."
  - "injectRegister:'false' in VitePWA so our own src/app/pwa.ts owns registration via virtual:pwa-register (prompt-mode lifecycle wiring lives in one place)."
  - "Manifest theme/background hexes inlined in vite.config.ts (amber #C8742B / paper #F4F1EA) because the shared tokens.ts is owned by Plan 03; the web manifest needs literal values at build time."

patterns-established:
  - "Pattern 4 (RESEARCH): registerType:'prompt' + UpdateToast guarded on isWriteInFlight() — never blind skipWaiting()"
  - "Pitfall 5 (RESEARCH): persist() requested from an action, boolean checked, eviction note surfaced, QuotaExceededError handled"

requirements-completed: [STOR-06]

# Metrics
duration: 14min
completed: 2026-06-24
status: complete
---

# Phase 01 Plan 08: PWA Shell (offline install + controlled update) Summary

**Prompt-mode vite-plugin-pwa service worker precaching the app shell for offline open, a write-safe update toast that never swaps assets mid-sync, an install affordance, and a post-action navigator.storage.persist() request — closing the serverless spine (STOR-06).**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-24T14:00:00Z (approx)
- **Completed:** 2026-06-24T14:14:00Z
- **Tasks:** 2
- **Files modified:** 14 (8 created, 4 modified, + package.json/lock)

## Accomplishments
- vite-plugin-pwa wired with `registerType: 'prompt'`, GitHub Pages base/start_url/scope all `/relation_blueprint/`; build emits `sw.js` + `manifest.webmanifest` precaching the shell (verified offline-open in E2E).
- Controlled update flow: `src/app/pwa.ts` registers the SW via `virtual:pwa-register` and bridges `onNeedRefresh`/`onOfflineReady` to React; `UpdateToast` (S7) activates the waiting SW only on the user's Reload click and only when `isWriteInFlight()` is false, showing "Finishing sync…" otherwise.
- `usePersistentStorage` requests `navigator.storage.persist()` from a user action (not on load), surfaces the granted boolean + the eviction warning when denied, captures `estimate()`, and handles `QuotaExceededError`.
- `InstallPrompt` (S6) captures `beforeinstallprompt`, renders a dismissible toast and exposes a `useInstallPrompt` hook for the overflow "Install app" item.
- Tests: `tests/pwa/persistence.test.ts` (5 cases) green; `e2e/pwa-install.spec.ts` (manifest scoping + offline-shell open, 2 cases) green; full unit suite 29/29 green.

## Task Commits

Each task was committed atomically:

1. **Task 1: prompt-mode SW + controlled update flow + GitHub Pages scoping** - `8d20328` (feat)
2. **Task 2: install affordance + persistent-storage request after user action** - `5dc3466` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `vite.config.ts` - Added `VitePWA({ registerType:'prompt', injectRegister:false, base/scope '/relation_blueprint/', manifest, workbox precache + media runtimeCaching })`.
- `src/app/pwa.ts` - `registerPwa()` + `subscribePwa()` lifecycle registry bridging `virtual:pwa-register` to the UI; replays events to late subscribers.
- `src/main.tsx` - Calls `registerPwa()` after mount.
- `src/app/App.tsx` - Renders `<UpdateToast />` + `<InstallPrompt />`.
- `src/vite-env.d.ts` - Adds `vite-plugin-pwa/client` types for `virtual:pwa-register`.
- `src/features/pwa/UpdateToast.tsx` - S7 toast; gates `updateSW(true)` on `isWriteInFlight()`, polls then proceeds during "Finishing sync…".
- `src/features/pwa/InstallPrompt.tsx` - S6 install toast + `useInstallPrompt` hook owning `beforeinstallprompt`/`appinstalled`.
- `src/features/pwa/usePersistentStorage.ts` - Post-action persistence request + warning/estimate/quota handling.
- `src/sync/writeStatus.ts` - In-flight-write seam (`beginWrite`/`endWrite`/`isWriteInFlight`) for Plan 05.
- `public/manifest-icons/README.md` - Required icon sizes + `@vite-pwa/assets-generator` command + brand colors.
- `tests/pwa/persistence.test.ts` - 5 cases for the persistence hook.
- `e2e/pwa-install.spec.ts` - Manifest scoping + offline-shell open (manual OS-install/persist gates documented).

## Decisions Made
- **Write-status seam created ahead of the sync engine.** Plan 05 (atomic sync) is not yet executed; its in-flight-write accessor doesn't exist. Per the plan's own instruction ("if Plan 05's symbol differs, adapt to its exported status accessor and note it in the SUMMARY"), I created `src/sync/writeStatus.ts` exposing `isWriteInFlight()` (default `false`). **Plan 05 MUST call `beginWrite()`/`endWrite()` around Drive pushes/manifest swaps** so the update guard sees in-flight writes. This is the documented seam.
- **`injectRegister: false`** so registration lives only in `src/app/pwa.ts` (single prompt-mode lifecycle owner).
- **Manifest theme/background hexes inlined** in `vite.config.ts` (amber/paper) rather than importing a tokens module Plan 03 owns — the manifest needs literal build-time values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the vetted PWA toolchain (assumed present, was absent)**
- **Found during:** Task 1 (VitePWA config)
- **Issue:** The plan/context stated Plan 01 installed `vite-plugin-pwa`/`workbox-window`; they were NOT in `package.json`. `@vite-pwa/assets-generator` (referenced for icon docs) was also absent. The `virtual:pwa-register` import and the build would fail without them.
- **Fix:** `npm install -D vite-plugin-pwa@1.3.0 workbox-window@7.4.1 @vite-pwa/assets-generator`. All three are explicitly vetted in 01-RESEARCH Package Legitimacy Audit (canonical repos, high download counts, no postinstall), so this is not a package-legitimacy checkpoint. Pinned to RESEARCH-specified versions; verified peer-compatible with the project's Vite 7.3.5.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm run build` emits `sw.js` + `manifest.webmanifest`; `tsc --noEmit` clean.
- **Committed in:** `8d20328` (Task 1 commit)

**2. [Rule 3 - Blocking] Installed Playwright Chromium browser**
- **Found during:** Task 2 (E2E verification)
- **Issue:** `npx playwright test` failed: "Executable doesn't exist … chrome-headless-shell". No browser binary was installed.
- **Fix:** `npx playwright install chromium`.
- **Files modified:** none (binary cache outside repo)
- **Verification:** `e2e/pwa-install.spec.ts` runs and passes (2/2).
- **Committed in:** n/a (no repo files changed)

**3. [Rule 1 - Bug] E2E waited for SW `controller` on first load (prompt-mode never auto-claims)**
- **Found during:** Task 2 (E2E offline-open test)
- **Issue:** The first version of the test waited for `navigator.serviceWorker.controller` on the initial visit and timed out — a prompt-mode SW does NOT call `clients.claim()`, so it does not control the page until the next navigation. This was a test bug, not a code bug (the prompt-mode non-claiming behavior is correct and intended per RESEARCH Pattern 4).
- **Fix:** Wait for `serviceWorker.ready` (active), reload once online so the SW takes control, then go offline and reload to assert the precached shell renders.
- **Files modified:** e2e/pwa-install.spec.ts
- **Verification:** E2E 2/2 green.
- **Committed in:** `5dc3466` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking-install, 1 test bug)
**Impact on plan:** All necessary to make the plan's own acceptance gates runnable/green. No scope creep — the installs are the exact RESEARCH-vetted toolchain the plan depends on; the E2E fix corrects a test assertion to match intended prompt-mode behavior.

## Issues Encountered
- The Plan 05 sync engine (the documented source of the in-flight-write signal) does not exist yet because Plan 08 (wave 3) executed ahead of Plan 05. Resolved by creating the stable `writeStatus.ts` seam and documenting the contract Plan 05 must honor (see Decisions / Next Phase Readiness).

## Known Stubs
- **`src/sync/writeStatus.ts` — `isWriteInFlight()` always returns `false` until Plan 05 drives it.** This is an intentional, documented seam (not dead UI data). The conservative default is correct for the current skeleton: with no sync engine there is no write in flight, so an SW update may proceed immediately. **Plan 05 must call `beginWrite()`/`endWrite()` around its Drive push/manifest-swap** to arm the guard. The PWA update guard, toast copy, and "Finishing sync…" path are fully wired and tested against the seam.

## Threat Flags
None - no new security surface beyond the plan's threat_model. The service worker, manifest scope, and persistence request are exactly the T-08-01/02/03 mitigations the plan specified; the only network surface (media runtime cache) is same-origin GET only and explicitly excludes authed Drive REST calls.

## User Setup Required
None - no external service configuration required for this plan. (Production PWA icon PNGs are a manual asset step documented in `public/manifest-icons/README.md`; the build does not fail without them — installs show a default icon until added.)

## Next Phase Readiness
- The serverless spine's PWA shell is complete: installable, offline-capable, write-safe updates.
- **Action for Plan 05 (sync engine):** import `beginWrite`/`endWrite` from `src/sync/writeStatus.ts` and bracket every Drive push / manifest swap so `isWriteInFlight()` reflects real sync state. The `UpdateToast` guard already consumes it.
- **Action for the top-bar/overflow work:** consume `useInstallPrompt()` (from `InstallPrompt.tsx`) for the persistent "Install app" overflow item, and `usePersistentStorage()` for the post-action persist request (wire it to the first-person-created / first-connect action).

## Self-Check: PASSED

All 8 created files verified present on disk; both task commits (`8d20328`, `5dc3466`) verified in git log.

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24*

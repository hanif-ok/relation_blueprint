---
phase: 01
plan: 10
subsystem: connect/drive-auth
tags: [drive, auth, gis, silent-reconnect, gap-closure, security]
status: complete
requires:
  - "src/storage/drive/auth.ts connect({ silent: true }) silent re-acquire primitive (Plan 06)"
  - "src/features/connect/syncStatusStore.ts markConnected (Plan 06)"
  - "src/storage/providerFactory.ts getActiveProvider seam (Plan 05/06)"
provides:
  - "useConnectDrive().restore(): silent on-load Drive re-acquire that fails quietly"
  - "App mount-time effect that calls restore() once when configured"
  - "token-never-persisted invariant re-asserted on the silent on-load code path"
affects:
  - "src/features/connect/ConnectDrive.tsx"
  - "src/app/App.tsx"
tech-stack:
  added: []
  patterns:
    - "Silent GIS re-acquire on mount (prompt:'') — self-gating on isConfigured(), self-silencing on failure"
    - "Fire-and-forget empty-deps useEffect for one-shot startup restore that never blocks render"
key-files:
  created:
    - "tests/connect/silentReconnect.test.tsx"
  modified:
    - "src/features/connect/ConnectDrive.tsx"
    - "src/app/App.tsx"
decisions:
  - "restore() self-gates on isConfigured() (gating lives in the hook, not App) so an unconfigured/dev visit stays quietly not-connected — never the 'not configured' error pill"
  - "Silent-restore failure is fully invisible: no markError(), no markNeedsReconnect() — WR-05 error/reconnect routing stays gesture-only; benign no-session leaves the not-connected default"
  - "No persistence added anywhere — the only restore mechanism is the in-memory GIS prompt:'' re-acquire (token-never-persisted invariant preserved)"
metrics:
  duration_min: 5
  completed: 2026-06-25
  tasks: 2
  files: 3
---

# Phase 01 Plan 10: Silent Drive Reconnect on Refresh Summary

One-liner: Added a single on-load silent GIS re-acquire (`useConnectDrive().restore()` + one App mount effect) that re-establishes the Drive session across reloads without a popup and without persisting the token, failing quietly on a benign no-session.

## What Was Built

GAP 2 (MINOR) from the Phase 1 UAT: on every page refresh the in-memory GIS token was gone (by design — token-never-persisted), so Drive showed disconnected and the user had to click Reconnect each reload. The silent re-acquire primitive `connect({ silent: true })` already existed in `auth.ts` but was never invoked at startup.

- **Task 1** — `runRestore` callback added to `useConnectDrive`, exposed as `restore` on `ConnectDriveApi`. It mirrors `runConnect`'s success tail (`driveConnect({ silent: true })` → `getActiveProvider().ensureFolder()` → `markConnected()` → `onConnected(folderId)`) but is SILENT (`prompt:''`, no consent popup) and SELF-SILENCING on failure: it self-gates on `isConfigured()` (early no-op) and, on any error, calls neither `markError()` nor `markNeedsReconnect()` — leaving the benign not-connected default with no error/reconnect pill. Commit `c1c73f2`.
- **Task 2** — A single empty-deps `useEffect(() => { drive.restore(); }, [])` in `App.tsx` calls restore once on mount (gating is inside restore, so App calls it unconditionally). Added `tests/connect/silentReconnect.test.tsx` covering silent-on-load success (connected, error null, onConnected called), quiet failure (connected/error/needsReconnect all benign), and the security invariant (no localStorage write, `indexedDB.open` not called). Commit `edb3eef`.

## How It Works

On App mount the effect fires once and calls `restore()`. If `VITE_GOOGLE_CLIENT_ID` is unset, restore is a no-op. Otherwise it attempts a `prompt:''` GIS re-grant: when the user still holds an active Google session + prior grant, GIS returns a fresh in-memory token with no popup, the app-folder is ensured, the store transitions to connected, and `onConnected` boots the SyncEngine via the existing wiring. When no grant is active, GIS rejects; restore swallows it (a single `console.debug`, never user-facing) and the app stays quietly not-connected and fully usable offline. Nothing is written to localStorage / IndexedDB / cookies at any point.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed TDD per the plan's verify gates; the `restore()` primitive landed in Task 1 (its verify is the existing `auth.test.ts` token-never-persisted invariant, which stayed green), and the new behaviour test for the silent path landed in Task 2.

## Verification

Full green gate (plan `<verification>`) passed:
- `npx tsc --noEmit` — exit 0, no type errors.
- `npx vitest run` — 92 passed across 17 files, including the unchanged `tests/storage/auth.test.ts` token-never-persisted invariant (8/8) and the new `tests/connect/silentReconnect.test.tsx` (3/3).
- `npm run build` — production build succeeded (PWA generateSW, 30 precache entries).

Threat register: T-01-10-01 (Information Disclosure, token handling) mitigated — the security test asserts `indexedDB.open` is not called and `localStorage.length === 0` after a successful silent restore, re-confirming the invariant on the new code path. T-01-10-02 (silent re-grant spoofing) and T-01-10-03 (mount-effect DoS) accepted per plan; no new consent surface or blocking work introduced.

## Known Stubs

None. No placeholder data or unwired components introduced.

## Self-Check: PASSED
- FOUND: src/features/connect/ConnectDrive.tsx
- FOUND: src/app/App.tsx
- FOUND: tests/connect/silentReconnect.test.tsx
- FOUND commit: c1c73f2 (Task 1)
- FOUND commit: edb3eef (Task 2)

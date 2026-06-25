---
status: resolved
trigger: "After a page refresh, the app shows Google Drive as disconnected and the user must click Reconnect on every reload. The gap is that the app does not attempt a SILENT token re-acquisition on load, so the connection does not survive a refresh."
created: 2026-06-25T00:00:00Z
updated: 2026-06-25T04:31:16Z
resolved_by: "01-10-PLAN.md — on-load silent restore() via GIS prompt:'' (token never persisted); survives reload, fails quietly on no-session. Regression-tested green. Commits c1c73f2..5b3a7e3."
---

## Current Focus

hypothesis: CONFIRMED — No on-load silent re-acquire is attempted. The `connect({silent:true})` capability already exists in auth.ts but nothing calls it at startup; connect is only ever wired to a user click.
test: Read the full startup path (main.tsx → App.tsx → useConnectDrive → useSyncEngine) and the auth module; searched for any mount-time connect attempt.
expecting: No mount-time call to connect()/getValidToken() that would re-establish the Drive session on load.
next_action: Diagnosis complete — return ROOT CAUSE FOUND. find_root_cause_only: do NOT apply a fix.

## Symptoms

expected: After a page refresh, the app silently re-acquires a Drive access token on load (GIS token client with prompt:'') when the user still has an active Google session — so the Drive connection visibly persists across reloads WITHOUT a popup and WITHOUT persisting the token to storage.
actual: On refresh the in-memory token is gone, the status chip shows disconnected, and the user must manually click Reconnect every time.
errors: None reported.
reproduction: Test 11 in 01-UAT.md — connect Drive, then reload the page; observe the disconnected state.
started: Discovered during Phase 1 verify-work UAT (always-present since Plan 06 shipped the GIS token model).

## Eliminated

- hypothesis: The token is meant to be persisted and a persistence bug is dropping it.
  evidence: By design and by asserted invariant (tests/storage/auth.test.ts: "NEVER persists the token to localStorage", "NEVER opens an IndexedDB database to persist the token"), the GIS access token is in-memory only. Losing it on reload is correct, not a bug. The bug is the missing silent re-acquire, not lost persistence.
  timestamp: 2026-06-25T00:00:00Z

- hypothesis: The silent re-acquire capability does not exist and must be built from scratch.
  evidence: src/storage/drive/auth.ts:97-120 `connect({ silent: true })` already passes `{ prompt: '' }` to `requestAccessToken`. The capability exists; it is simply never invoked on load.
  timestamp: 2026-06-25T00:00:00Z

## Evidence

- timestamp: 2026-06-25T00:00:00Z
  checked: src/storage/drive/auth.ts (full module)
  found: Token state is `let token: InMemoryToken | null = null` (line 48), module-scoped and in-memory only; reset to null on every page load. `connect(options:{silent?})` (line 97) already supports silent re-acquire — `client.requestAccessToken(options.silent ? { prompt: '' } : undefined)` (line 118). `getValidToken()` returns null when no token (line 126-130).
  implication: The silent re-acquire primitive (prompt:'') already exists. Nothing about auth.ts needs new capability; it just needs to be CALLED on startup. On a fresh page load `token` is null → app shows not-connected.

- timestamp: 2026-06-25T00:00:00Z
  checked: src/features/connect/ConnectDrive.tsx (useConnectDrive / runConnect)
  found: `runConnect()` (line 72) calls `await driveConnect()` with NO arguments — i.e. always the interactive (popup) path, never silent. `runConnect` is exposed only as `connect` (line 97) and wired exclusively to user gestures: `drive.connect` is passed to the StatusPill `onAction` and the ReconnectBanner `onReconnect` in App.tsx. There is no non-gesture caller.
  implication: connect() is only ever triggered by a click. No code path attempts to re-establish the session automatically on load.

- timestamp: 2026-06-25T00:00:00Z
  checked: src/app/App.tsx (full component)
  found: App calls `useSyncEngine()` and `useConnectDrive({ onConnected, onDisconnected })`, renders `<ConnectDrive status={drive.status} onAction={drive.connect} />` and `<ReconnectBanner ... onReconnect={drive.connect} />`. There is NO `useEffect(() => { ... }, [])` that attempts a connect/restore on mount. Nothing calls drive.connect at startup.
  implication: No mount-time restore attempt. Confirms the gap is in the startup wiring, not auth.

- timestamp: 2026-06-25T00:00:00Z
  checked: src/main.tsx (app bootstrap)
  found: main.tsx mounts <App/>, installs the optional E2E test bridge, and registers the PWA service worker. No Drive auth involvement at bootstrap.
  implication: Startup bootstrap has no hook to re-acquire the Drive session either.

- timestamp: 2026-06-25T00:00:00Z
  checked: src/features/connect/syncStatusStore.ts (initial state)
  found: `initial` state is `{ connected: false, syncing: false, needsReconnect: false, error: null, lastSyncedAt: null }` (line 34-40). On every load the store resolves (via useSyncStatus.resolvePhase) to `not-connected` because `connected` is false and no reconnect/error is pending.
  implication: With no token and no startup re-acquire, the pill correctly shows the disconnected ("not-connected") state on every reload — matching the reported symptom exactly.

- timestamp: 2026-06-25T00:00:00Z
  checked: src/features/connect/useSyncEngine.ts
  found: The SyncEngine only boots inside `onConnected(folderId)` (line 113), which is only called by useConnectDrive AFTER a successful `driveConnect()` + `ensureFolder`. No engine boot occurs without a prior successful connect.
  implication: Even the sync loop is gated on a successful (currently click-only) connect. A silent on-load connect would naturally re-arm sync via the existing onConnected path.

- timestamp: 2026-06-25T00:00:00Z
  checked: tests/storage/auth.test.ts (token-never-persisted invariant)
  found: Tests assert nothing lands in localStorage (line 95-101) and indexedDB.open is never called during connect (line 103-108). This is the hard security invariant the fix must not violate.
  implication: The fix MUST be a silent GIS re-acquire (prompt:'') — it must NOT persist the token anywhere. The existing connect({silent:true}) path satisfies this because it acquires a fresh in-memory token via GIS, persisting nothing.

## Resolution

root_cause: The app never attempts a silent Drive token re-acquisition on page load. The GIS access token is intentionally in-memory only (token-never-persisted invariant), so every reload starts with `token = null` and the status resolves to `not-connected`. The only path that re-establishes a token is `useConnectDrive.runConnect()`, which (a) calls `driveConnect()` without the `{ silent: true }` option and (b) is wired exclusively to user gestures (StatusPill onAction / ReconnectBanner onReconnect). There is no mount-time effect in App.tsx (or anywhere in main.tsx / useSyncEngine) that calls connect — so the session cannot survive a refresh. This is a MISSING-CAPABILITY-INVOCATION bug: the silent re-acquire primitive already exists in auth.ts (`connect({ silent: true })` → `requestAccessToken({ prompt: '' })`) but is never invoked.
fix: "" (find_root_cause_only — not applied)
verification: ""
files_changed: []

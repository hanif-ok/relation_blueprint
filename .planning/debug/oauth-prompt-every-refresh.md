---
status: awaiting_human_verify
trigger: "Google Drive sync is broken. On one browser: a Google OAuth popup on every refresh. On a DIFFERENT browser: sync does not work at all — stuck in a 'drive reconnect / failed to sync' state. Happens on BOTH browsers; the popup appears BOTH on its own AND after clicking Reconnect."
created: 2026-07-03T00:00:00Z
updated: 2026-07-03T00:00:00Z
---

## Current Focus

hypothesis: REVISED after escalation. The dominant bug is that the FIRST live Drive REST call after acquiring a token fails every time, trapping the status machine in reconnect/error. Flow: runConnect/runRestore acquires a token, then calls provider.ensureFolder() (→ Drive REST) — or prepareOnOpen()'s list() during reconcile. driveRest.driveFetch maps 401→markExpired()→TokenExpiredError (which fires onExpiry→markNeedsReconnect ⇒ phase 'reconnect') and any other !ok→Error("Drive REST <status> <statusText>: <body>") (⇒ phase 'error' / "failed to sync"). needsReconnect is ONLY cleared by a SUCCESSFUL connect (markConnected), so if the first REST call always fails the UI ping-pongs reconnect⇄error and never reaches synced.
  Because it fails IDENTICALLY on TWO browsers, a per-browser third-party-cookie cause is DOWNGRADED. The like-for-like failure points at account/config/data-level causes shared across browsers:
  - (C1) OAuth app config: authorized JavaScript origin not matching the actual app origin (localhost:PORT vs the deployed Pages URL), OR consent screen in "Testing" without the account as a test user, OR the drive.file grant not actually covering the calls.
  - (C2) drive.file scope visibility: the "Relation Blueprint" folder/manifest was created by a DIFFERENT OAuth client (or outside the app), so this client cannot see/list it (403) — reconcile/ensureFolder fails.
  - (C3) A live-Drive-only defect in driveRest/DriveProvider that never ran against real Drive (engine was proven vs InMemory/FaultInjecting providers, not live Drive except Plan 06) — e.g. a 400/403 on ensureFolder's query, the multipart upload, or writeFile path mapping.
  The SECONDARY (cosmetic) issue — silent restore using prompt:'' instead of prompt:'none' — still stands for the on-load popup, but is now clearly not the whole story.
DISCRIMINATING OBSERVATION NEEDED: the exact error text / HTTP status of the failing googleapis.com request. driveFetch encodes it verbatim into the thrown message ("Drive REST <status> <statusText>: <body>"), which markError stores — so one console line collapses C1/C2/C3 (401 vs 403 vs 400 + body).
test: Ask the user for (a) the exact error shown (StatusPill/console — it starts with "Drive REST <number>"), (b) local dev vs deployed URL, (c) consent-screen status + test-user, (d) whether a "Relation Blueprint" folder exists in their Drive. OR capture via browser automation against their running app.
expecting: A 401 → token/grant not honored by the API (C1). A 403 insufficientPermissions/insufficientScopes → scope/visibility (C1/C2). A 400/403 on a specific call → code defect (C3). The status + body decides which.
next_action: obtain the exact Drive REST error status+body and the config answers; THEN pinpoint the failing call and fix (config guidance and/or code). Do NOT patch the auth/sync spine blind.

## Symptoms

expected: After connecting once, Drive sync works and survives refresh: on-load silent restore re-establishes the session (no popup) and reconcile/push succeed (phase reaches 'synced'). If it genuinely can't restore, the app shows a quiet Reconnect affordance — not a permanent failed-to-sync loop.
actual: Sync is broken. Browser A: OAuth popup on every refresh (both unprompted on load AND after clicking Reconnect). Browser B: sync does not work at all — stuck in "drive reconnect / failed to sync." Occurs on BOTH browsers.
errors: EXACT text not yet captured — need the "Drive REST <status> ...: <body>" message (this is the key missing evidence).
reproduction: Open the app (VITE_GOOGLE_CLIENT_ID configured), connect Drive; observe the reconnect/failed-to-sync loop and repeated popups; same on a second browser.
started: Escalated from the initial "popup every refresh" report; the earlier resolved "drive-reconnect-on-refresh" fix only added the on-load restore — it did not exercise the live reconcile/push success path across refresh on this user's account.

## Eliminated

- hypothesis: A third-party-cookie block is the primary cause.
  evidence: DOWNGRADED (not fully eliminated) — the failure reproduces IDENTICALLY on two different browsers, whereas 3p-cookie behavior is per-browser. A shared account/config/data cause is more consistent with both-browser failure.
  timestamp: 2026-07-03T00:00:00Z

- hypothesis: The in-memory token is meant to persist and a persistence bug drops it.
  evidence: In-memory-only is an asserted security invariant (tests/storage/auth.test.ts). Re-acquire on load is by design.
  timestamp: 2026-07-03T00:00:00Z

## Evidence

- timestamp: 2026-07-03T00:00:00Z
  checked: src/storage/drive/driveRest.ts:31-53 (authHeader + driveFetch)
  found: authHeader() throws TokenExpiredError + markExpired() if getValidToken() is null. driveFetch: 401→markExpired()+throw TokenExpiredError; other !ok→throw Error(`Drive REST ${status} ${statusText}: ${body}`). The body is included verbatim.
  implication: The exact failing status + Google error body is available in the thrown message → surfaced via markError. This is the single most diagnostic artifact and is currently uncaptured.

- timestamp: 2026-07-03T00:00:00Z
  checked: src/features/connect/useSyncStatus.ts:44-51 (resolvePhase) + syncStatusStore.ts (transitions)
  found: phase priority reconnect > error > not-connected > offline > syncing > synced. needsReconnect set by onExpiry(401) and runConnect's catch; cleared ONLY by markConnected (successful connect) or markDisconnected. error set by markError; cleared by markConnected/markSyncing/markSynced.
  implication: A persistently-failing first REST call keeps needsReconnect/error set forever → the "stuck" loop. Matches the report.

- timestamp: 2026-07-03T00:00:00Z
  checked: src/features/connect/ConnectDrive.tsx (runConnect/runRestore) + useSyncEngine.ts (onConnected → prepareOnOpen/reconcileOnOpen)
  found: runConnect: driveConnect() then provider.ensureFolder() (FIRST REST call) — a throw here routes to markNeedsReconnect (TokenExpiredError/auth-affordance) or markError. onConnected then boots the engine: prepareOnOpen() (list) + reconcileOnOpen() (readFile) — a throw here → markError('Reconcile failed').
  implication: Two adjacent first-call failure surfaces (ensureFolder in connect; list/readFile in reconcile). The captured status will say which and why.

- timestamp: 2026-07-03T00:00:00Z
  checked: syncEngine.ts header + repo note
  found: The engine was "proven against InMemoryProvider + FaultInjectingProvider" — i.e. NOT exhaustively against live Drive. drive.file scope only grants access to files THIS OAuth client created.
  implication: A live-Drive-only defect (C3) or a drive.file visibility mismatch (C2) is plausible and would not have been caught by the in-memory tests.

- timestamp: 2026-07-03T00:00:00Z
  checked: GIS official reference (Context7) — prompt semantics
  found: prompt defaults to 'select_account'; only 'none' is truly silent (errors instead of popping). Silent restore currently uses ''.
  implication: SECONDARY fix for the on-load popup (prompt:'' → 'none'), independent of the sync-failure root cause.

## Resolution

root_cause: |
  NOT a Drive REST / token / scope / cookie problem, and NOT the auth or sync code. The console
  showed GIS failing at the OAuth token request itself: `[GSI_LOGGER]: Failed to open popup
  window ... Maybe blocked by the browser?` plus repeated `Cross-Origin-Opener-Policy policy
  would block the window.closed call.` (stack: requestAccessToken → auth.ts:118 → the connect
  click). The app is served with NO Cross-Origin-Opener-Policy header (no server.headers in
  vite.config.ts; no meta in index.html). accounts.google.com sends its own COOP, so without the
  app opting into `same-origin-allow-popups`, the browser severs the opener↔popup relationship;
  GIS can't hold the popup handle or poll window.closed, so the token popup never completes. The
  connect() error message contains "popup" → isAuthAffordanceError → markNeedsReconnect(), which
  is why the UI parks in the reconnect / "failed to sync" loop and re-pops on every click/refresh.
  Because COOP is a SERVER-SENT header, the failure is identical on every browser — matching the
  "both browsers" report and ruling out per-browser third-party cookies. Confirmed against Google's
  own docs (load-3p-authorization-library): "you must set the COOP header to same-origin and
  include same-origin-allow-popups. Failing to set the proper header will break communication
  between windows, resulting in a blank popup window or similar issues."
fix: |
  Set `Cross-Origin-Opener-Policy: same-origin-allow-popups` on the app via vite.config.ts
  `server.headers` (vite dev) and `preview.headers` (vite preview). COEP intentionally NOT set
  (require-corp would block the cross-origin gsi/client script). This is the confirmed-root-cause
  fix for the reported failure. SECONDARY follow-up (separate commit, after Drive connect is
  verified): change the on-load silent restore from `prompt: ''` → `prompt: 'none'` (auth.ts:118)
  so the now-working popup does NOT auto-open on every refresh — restore stays truly silent and
  falls back to the quiet not-connected state, while the explicit Reconnect click still pops.
  PRODUCTION CAVEAT: GitHub Pages cannot send custom headers, so the deployed site will hit the
  SAME COOP failure. Production needs a headers-capable host (Cloudflare Pages / Netlify `_headers`)
  or FedCM. Flagged in the vite.config.ts comment and to the user; likely a roadmap item.
verification: |
  PENDING human verification: restart `npm run dev` (server.headers only applies on a fresh dev
  server start), then click Connect Drive — the Google popup should open, consent should complete,
  and the status should reach connected/synced instead of looping on reconnect. Static: vite.config
  change is config-only; no code/type surface. To confirm before archival.
files_changed:
  - vite.config.ts

---
status: diagnosed
trigger: "The FIRST Google Drive sync on an EMPTY database fails with 'sync failed, please retry' on the status chip. Once user creates a person/map and sync runs again, it succeeds."
created: 2026-06-25T00:00:00Z
updated: 2026-06-25T00:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — useSyncEngine.onConnected calls engine.reconcileOnOpen() on a SyncEngine that was constructed with no manifestFileId and never bootstrapped; reconcileOnOpen's first statement (this.manifestFileId()) throws "manifest not initialized — call bootstrap() first", which onConnected maps to markError() -> the chip shows the error state.
test: Static trace from connect gesture -> onConnected -> reconcileOnOpen -> manifestFileId(); cross-checked bootstrap() call sites and the test suite's coverage of the path.
expecting: reconcileOnOpen throws synchronously on a never-bootstrapped engine; tests never exercise this because they always pre-bootstrap and the one onConnected test only asserts reconcileOnOpen was CALLED, not that it succeeded / status reached synced.
next_action: Return ROOT CAUSE FOUND (find_root_cause_only — no fix applied).

reasoning_checkpoint:
  hypothesis: "On a fresh/empty connect, onConnected runs reconcileOnOpen() on an engine with _manifestFileId=null that was never bootstrapped; reconcileOnOpen's first line calls this.manifestFileId() which throws, and onConnected's catch maps it to markError() -> error chip."
  confirming_evidence:
    - "useSyncEngine.onConnected (useSyncEngine.ts:119-137) constructs `new SyncEngine({provider, folderId, repo})` with NO manifestFileId, then awaits engine.reconcileOnOpen() in a try/catch whose catch calls markError(); it never calls bootstrap() or push() at connect time."
    - "reconcileOnOpen (syncEngine.ts:208) first statement: readManifest(this.provider, this.manifestFileId()); manifestFileId() (syncEngine.ts:89-90) throws Error('SyncEngine: manifest not initialized — call bootstrap() first') when _manifestFileId is null."
    - "bootstrap() is ONLY called inside push() (syncEngine.ts:125); push() is only scheduled via the onChange repository subscription on a later edit — so an empty connect with no edits never bootstraps."
    - "Matches UAT exactly: empty connect errors; after creating a person, onChange -> schedulePush -> push() -> bootstrap() creates the manifest and all further syncs succeed (Test 7 pass). Folder appears regardless because ensureFolder runs in ConnectDrive.runConnect, not the engine."
  falsification_test: "If reconcileOnOpen succeeded (or no-op'd) on a never-bootstrapped engine, the chip would read 'synced' on empty connect. It does not — and the only sync call at connect time is reconcileOnOpen, which provably throws at manifestFileId() before any provider/network call."
  fix_rationale: "Root cause is a missing initialization step in the connect orchestration, not a flaw in the atomic-commit engine. The engine correctly requires bootstrap()/a manifestFileId before reconcile; onConnected violates that contract. Establishing the manifest before reconcile addresses the actual cause."
  blind_spots: "Could not run a LIVE Drive connect (no VITE_GOOGLE_CLIENT_ID), so this is a static + test-coverage trace rather than an observed live stack. However the throw is upstream of any Drive/network call (it's a pure in-engine guard), so the live path cannot diverge here. The exact UI string 'sync failed, please retry' is the StatusPill's rendering of the error phase (StatusPill not required to confirm root cause)."

## Symptoms

expected: Connecting Google Drive before adding any data should reach a clean synced state. SyncEngine bootstraps an empty v0 manifest + empty shards, so an empty/first push must SUCCEED and the chip should read "Drive – Synced".
actual: On first connect with an empty DB, the status chip shows "sync failed, please retry". After creating a person/map and re-syncing, sync succeeds and the folder populates.
errors: UI chip text "sync failed, please retry". No console/network error captured during UAT — must find the actual thrown error.
reproduction: Test 2 in 01-UAT.md — connect Drive in a fresh/empty app state (no map, no person) and observe the status chip.
started: Discovered during Phase 1 verify-work UAT.

## Eliminated

- hypothesis: push() throws on a zero-entity DB (empty shard serialize / zero-byte upload / manifest PATCH against missing manifest)
  evidence: push() (syncEngine.ts:124) calls bootstrap() first, then returns early at line 128 when dirtyTypes.length===0 && newMedia empty. On an empty first connect, push() is never even CALLED — onConnected only runs reconcileOnOpen() and only schedules push() on a later repository write. The empty path never reaches push().
  timestamp: 2026-06-25

- hypothesis: A benign "nothing to sync yet" is mapped to a "failed/retry" UI state in syncStatusStore/useSyncStatus
  evidence: The status mapping is correct — markError() is only called when an actual exception is caught in runPush/onConnected. The error is real, not a mis-mapping of a benign result. resolvePhase shows "error" because s.error was set by a genuine thrown Error.
  timestamp: 2026-06-25

## Evidence

- timestamp: 2026-06-25
  checked: useSyncEngine.onConnected (src/features/connect/useSyncEngine.ts:113-143)
  found: On connect it constructs SyncEngine WITHOUT manifestFileId, then immediately calls engine.reconcileOnOpen() inside a try/catch that calls markError() on throw. It does NOT call engine.bootstrap() first. push() is only scheduled by the onChange repository subscription (a later edit), never at connect time.
  implication: On a fresh/empty connect, reconcileOnOpen() is the FIRST and ONLY sync call. Whether it succeeds determines the chip.

- timestamp: 2026-06-25
  checked: SyncEngine.reconcileOnOpen + manifestFileId() (src/sync/syncEngine.ts:207-208, 88-92)
  found: reconcileOnOpen() first line is `const manifest = await readManifest(this.provider, this.manifestFileId())`. manifestFileId() throws `Error('SyncEngine: manifest not initialized — call bootstrap() first')` when _manifestFileId is null. The engine was constructed with no manifestFileId and bootstrap() was never called, so _manifestFileId IS null.
  implication: reconcileOnOpen() throws synchronously at its very first statement on a never-bootstrapped engine. The catch in onConnected calls markError('SyncEngine: manifest not initialized — call bootstrap() first') -> chip shows "error" / "sync failed, please retry".

- timestamp: 2026-06-25
  checked: bootstrap() call sites (src/sync/syncEngine.ts:99, 124-130)
  found: bootstrap() is ONLY called from inside push(). reconcileOnOpen() never calls bootstrap(). onConnected never calls bootstrap() or push() at connect time. So the ONLY thing that creates the v0 manifest is the first push() — which is triggered by the first repository write (creating a person/map).
  implication: This perfectly matches the UAT symptom: empty connect fails (reconcile on a non-bootstrapped engine), but once you create a person/map, onChange fires -> schedulePush -> push() -> bootstrap() runs -> manifest is created -> subsequent reconcile/push succeed and the folder populates. The "Relation Blueprint" folder appears on connect because ensureFolder runs in ConnectDrive.runConnect (ConnectDrive.tsx:80), independent of the engine.

- timestamp: 2026-06-25
  checked: tests/sync/reconcile.test.ts and atomicity.test.ts coverage of the empty-first-reconcile path
  found: The reconcile/atomicity suites always construct or bootstrap a manifest before calling reconcileOnOpen() (Plan 05 SUMMARY line 138 explicitly notes bootstrap() guarantees "there is always a last good manifest"). No test exercises reconcileOnOpen() on a fresh engine that was never bootstrapped and has no manifestFileId. That is exactly the production connect path in useSyncEngine, which itself has no direct test of the empty-first-connect reconcile-before-any-push sequence.
  implication: The defect was invisible to the suite because the engine unit tests always pre-create a manifest, while the production wiring (useSyncEngine.onConnected) reconciles on a never-bootstrapped engine. The gap is the missing bootstrap()/manifest-discovery before reconcileOnOpen() in onConnected.

## Resolution

root_cause: |
  On a fresh/empty Drive connect, useSyncEngine.onConnected (src/features/connect/useSyncEngine.ts:113-143)
  constructs the SyncEngine with NO manifestFileId and then immediately calls engine.reconcileOnOpen()
  WITHOUT first calling engine.bootstrap() (or discovering an existing manifest). reconcileOnOpen()'s
  very first statement is readManifest(provider, this.manifestFileId()), and manifestFileId()
  (src/sync/syncEngine.ts:89-92) throws "SyncEngine: manifest not initialized — call bootstrap() first"
  because _manifestFileId is null. The catch in onConnected maps that thrown Error to markError(),
  which resolves to the "error" sync phase -> the chip reads "sync failed, please retry".

  bootstrap() (which writes the empty v0 manifest + empty shards) is only ever called from inside push().
  At connect time onConnected runs reconcileOnOpen() but never push(); push() is only scheduled by the
  first repository write via the onChange subscription. So the engine is never bootstrapped on an empty
  connect. Once the user creates a person/map, onChange -> schedulePush -> push() -> bootstrap() finally
  creates the manifest, and all subsequent syncs succeed — exactly matching the UAT report (empty connect
  errors; sync works once data exists). The "Relation Blueprint" folder appears regardless because
  ensureFolder runs in ConnectDrive.runConnect, independent of the engine.

fix: |
  (find_root_cause_only — NOT applied. Suggested direction only.)
  In useSyncEngine.onConnected, ensure the engine has a manifest BEFORE reconcileOnOpen():
  call `await engine.bootstrap()` first (it is idempotent and, for a missing manifest, writes the
  empty v0 manifest + empty shards exactly as designed in Plan 05). On an empty DB this makes the
  subsequent reconcileOnOpen() a clean no-op (v0 manifest has updatedAt=0 <= local watermark 0, so
  every type is skipped) and the chip reaches "synced". This does NOT weaken any safety guarantee:
  bootstrap only ever creates files when none exist; it never overwrites the canonical manifest
  (the atomic swap remains the sole commit point); validate-before-write is untouched.

  Better-yet direction (more faithful to multi-device reconnect): discover an EXISTING manifest in
  the app folder first (provider.list(folderId) -> find 'manifest.json' -> set manifestFileId), and
  only bootstrap when none is found. The current code never discovers a pre-existing manifest, so a
  second device/browser would also re-bootstrap; pairing discovery + idempotent bootstrap fixes both
  the empty-first-connect error AND silent re-adoption of an existing cloud DB. Either way, the
  minimal correct fix is: establish/locate the manifest before reconcileOnOpen() in onConnected.

  Also recommended (test gap): the existing test tests/connect/useSyncEngine.test.tsx:52 only asserts
  reconcileOnOpen was CALLED, never that it succeeded or that status reached 'synced'. Add an
  empty-DB connect test asserting NO markError and phase === 'synced' so this regression is caught.

verification: (find_root_cause_only — not applied)
files_changed: []

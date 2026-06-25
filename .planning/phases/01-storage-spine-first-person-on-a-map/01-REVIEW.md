---
phase: 01-storage-spine-first-person-on-a-map
reviewed: 2026-06-25T06:00:00Z
depth: standard
scope: gap-closure (01-09, 01-10)
files_reviewed: 6
files_reviewed_list:
  - src/sync/syncEngine.ts
  - src/features/connect/useSyncEngine.ts
  - src/features/connect/ConnectDrive.tsx
  - src/app/App.tsx
  - tests/connect/useSyncEngine.test.tsx
  - tests/connect/silentReconnect.test.tsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 01 Gap-Closure: Code Review Report (01-09 + 01-10)

**Reviewed:** 2026-06-25T06:00:00Z
**Depth:** standard (gap-closure-only; base SHA `636123490f6ee5e730921013f38f04de58530c85`)
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The two gap plans are correctly targeted and structurally sound. The 01-09 fix
(`prepareOnOpen()`) correctly applies discover-then-bootstrap ordering, is idempotent, reuses
`MANIFEST_NAME`, does not change the commit sequence, and cannot overwrite an existing canonical
manifest. The 01-10 fix (`restore()` + mount effect) correctly gates on `isConfigured()`, fails
silently on no active grant without calling `markError`/`markNeedsReconnect`, and persists
nothing. The token-never-persisted invariant is structurally upheld in the production code.

Four findings were surfaced — none are blockers against shipping, but two are warnings that
affect test reliability and a real race condition.

---

## Warnings

### WR-01: `onConnected` subscribes the change listener OUTSIDE the try block — a `prepareOnOpen` failure leaves a live subscription with a dead engine

**File:** `src/features/connect/useSyncEngine.ts:131-145`

**Issue:** The async IIFE (lines 131-142) that calls `prepareOnOpen` + `reconcileOnOpen` runs
**concurrently** with the synchronous continuation on line 145 that installs the change
subscription:

```ts
void (async () => {       // IIFE — fire-and-forget, starts here
  markSyncing();
  try {
    await engine.prepareOnOpen();
    await engine.reconcileOnOpen();
    if (activeRef.current) markSynced();
  } catch (err) {
    if (activeRef.current) markError(...);
  }
})();                      // returns immediately

// This runs synchronously, BEFORE the await inside the IIFE resolves:
unsubscribeRef.current = onChange(() => schedulePush()); // line 145
```

Because `void (async () => { ... })()` returns a Promise immediately and the IIFE awaits
`prepareOnOpen()`, the `onChange` subscription is installed before `prepareOnOpen` resolves.
This is the *existing* pre-gap pattern, unchanged by 01-09.

The gap-closure does not introduce a new bug here — the pre-existing timing is unchanged — but
the addition of `prepareOnOpen()` (which can now throw, e.g. if `provider.list()` rejects) means
a `prepareOnOpen` failure now routes to `markError`, which is correct. However, if `teardown()`
is not called (i.e. the error is handled by `catch` in the IIFE but `onDisconnected` is never
called externally), the `unsubscribeRef` installed on line 145 remains live and `schedulePush()`
will fire on the next repository write, calling `push()` on an engine whose `_manifestFileId` is
still null (because `prepareOnOpen` threw before setting it). The subsequent `push()` calls
`bootstrap()`, which would write a new manifest — unexpected side-effect on a "failed" connect.

This is low-probability in practice (a `provider.list()` failure on connect is transient and the
user must click Reconnect), but it is a latent bug introduced by making `prepareOnOpen` a
real-I/O step that can fail.

**Fix:** Either move the `onChange` subscription inside the `try` block (after `reconcileOnOpen`
succeeds) so it is never installed when `prepareOnOpen` fails, or call `teardown()` in the catch:

```ts
void (async () => {
  markSyncing();
  try {
    await engine.prepareOnOpen();
    await engine.reconcileOnOpen();
    // Install subscription only when initialization succeeded.
    unsubscribeRef.current = onChange(() => schedulePush());
    if (activeRef.current) markSynced();
  } catch (err) {
    teardown(); // clean up the engine; caller must re-connect
    if (activeRef.current) markError(...);
  }
})();
// Remove line 145 from outside the IIFE.
```

---

### WR-02: `eslint-disable-next-line react-hooks/exhaustive-deps` suppresses a real stale-closure lint for the wrong reason

**File:** `src/app/App.tsx:48`

**Issue:** The mount effect intentionally omits `drive` from deps to run exactly once:

```ts
useEffect(() => {
  drive.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

`drive` is the object returned by `useConnectDrive`, which is a new reference on every render
(it is created inline: `const drive = useConnectDrive({...})`). The lint suppression is
necessary because the rule would otherwise flag the omitted `drive` dep.

The underlying correctness question: `restore` is a `useCallback` inside `useConnectDrive` whose
deps include `onConnected` (itself a stable `useCallback` from `useSyncEngine`). So `restore` is
effectively stable across renders even though `drive` is not. Calling the first-render's
`restore` on mount is correct.

However, the suppression comment tells future readers nothing about *why* it is safe. This is a
maintenance trap: if `restore` is ever changed to depend on a value that changes between renders,
the suppression silently hides a genuine stale-closure bug.

**Fix:** Extract `restore` into a stable ref before the effect, which eliminates the need for
the lint suppression entirely and documents the intent:

```ts
const restoreRef = useRef(drive.restore);
useEffect(() => {
  restoreRef.current();
}, []);
```

Or, expose `restore` directly as a stable callback ref from `useConnectDrive` (it already is
via `useCallback`), pull it out of the `drive` object, and include it in the deps:

```ts
const { restore } = drive; // stable ref from useCallback
useEffect(() => {
  restore();
}, [restore]);
```

Either approach eliminates the lint suppression and makes the stability contract explicit.

---

## Info

### IN-01: The SUCCESS test in `silentReconnect.test.tsx` does not assert that `prompt: ''` was actually passed to GIS

**File:** `tests/connect/silentReconnect.test.tsx:104-106`

**Issue:** The comment on line 104 says "The silent grant requested prompt:'' (no consent popup)"
but no assertion enforces this. `gis.lastConfig` captures the `initTokenClient` config and
`requestAccessToken` receives the `{ prompt: '' }` object — but neither is asserted in the test.
The plan (01-10) specifies that the only restore mechanism is the GIS `prompt:''` re-grant; if a
future refactor calls `driveConnect()` without `{ silent: true }` the silent path would pop a
consent dialog in production and no test would fail.

**Fix:** Add an assertion that `requestAccessToken` was called with `{ prompt: '' }`. Because the
fake's `requestAccessToken` in `installGisFake` does not capture its argument, a small change to
the fake is needed:

```ts
// In FakeGis:
lastRequestOptions: TokenClientRequestOptions | undefined;

// In requestAccessToken(opts?: TokenClientRequestOptions):
state.lastRequestOptions = opts;

// In the SUCCESS test:
expect(gis.lastRequestOptions).toEqual({ prompt: '' });
```

---

### IN-02: `prepareOnOpen` idempotency test asserts the folder is empty but the idempotency path returns without a `provider.list()` call — the assertion is vacuously passing

**File:** `tests/sync/prepareOnOpen.test.ts:50-65`

**Issue:** The test "is idempotent / a no-op when constructed with a manifestFileId" asserts
`expect(await provider.list(folderId)).toHaveLength(0)` to prove no writes happened. This is
correct — a fresh `InMemoryProvider` with `ensureFolder` called returns an empty listing, and if
`prepareOnOpen` skips everything (early return on line 134), the folder stays empty. The
assertion passes, but the proof that `provider.list` was *not called on the early-return path* is
only implied. More importantly, if `prepareOnOpen` ever gains a secondary side effect before the
early-return check (e.g. a metrics call), the test would not catch it.

The assertion also conflates "no writes" with "empty folder" — if the test were run against a
pre-populated folder, the assertion would be `toHaveLength(N)` and would need to be rewritten.

**Fix:** Spy on `provider.list` to assert it was not called at all on the idempotent path:

```ts
const listSpy = vi.spyOn(provider, 'list');
await engine.prepareOnOpen();
expect(listSpy).not.toHaveBeenCalled();
expect(engine.manifestFileId()).toBe('preset-id');
```

This is the direct proof of the early-return guarantee and does not depend on folder state.

---

_Reviewed: 2026-06-25T06:00:00Z_
_Reviewer: Claude (gsd-code-reviewer) — gap-closure advisory gate_
_Depth: standard_
_Base: 636123490f6ee5e730921013f38f04de58530c85_

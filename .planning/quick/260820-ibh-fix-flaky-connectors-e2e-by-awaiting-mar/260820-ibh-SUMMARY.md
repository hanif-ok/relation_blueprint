---
phase: 260820-ibh-fix-flaky-connectors-e2e-by-awaiting-mar
plan: 01
subsystem: e2e-tests
tags: [flaky-test, playwright, dexie, synchronization, test-only]
status: complete
requires:
  - "e2e/connectors.spec.ts (existing REL-03 drag-persist test)"
  - "window.__rb test bridge (VITE_E2E build, already present)"
provides:
  - "Deterministic REL-03 drag-persist e2e test — polls the repository for the committed dragend write before reloading"
affects:
  - "e2e/connectors.spec.ts"
tech-stack:
  added: []
  patterns:
    - "Pre-teardown repository poll: when the app persists via an unawaited fire-and-forget write, the test must poll the repository for the write's RESULT rather than assume the dispatching event completed it"
key-files:
  created: []
  modified:
    - "e2e/connectors.spec.ts"
decisions:
  - "Fixed the test's synchronization, not the app: `void upsertMarker(...)` in AvatarMarker.handleDragEnd is correct behavior — a real curator never reloads inside the same tick as a drop"
  - "The pre-reload poll is strictly ADDITIVE — the post-reload persistence assertions survive verbatim so a genuine persistence regression still fails the test"
  - "Rejected retry/sleep/raised-timeout band-aids: a fixed delay re-introduces the same race on a slower machine"
metrics:
  duration: "~25 min"
  completed: "2026-08-20"
---

# Quick Task 260820-ibh: Fix Flaky connectors e2e by Awaiting Marker Persist — Summary

Replaced an implicit same-tick assumption with an explicit repository poll, so the drag-persist e2e test waits for the unawaited `void upsertMarker(...)` Dexie write to actually commit before it reloads the page — 20/20 green across two `--repeat-each=5` batches, with the post-reload persistence assertions untouched.

## What Was Built

### The Fix

`AvatarMarker.handleDragEnd` (`src/features/person-map/AvatarMarker.tsx:129`) persists the dropped
position with `void upsertMarker({...})` — a fire-and-forget, unawaited Dexie write. The test fired
`dragend` through `page.evaluate` and then immediately called `page.reload()`. The event dispatch
returns the moment the handler synchronously reaches that `void`, so the reload could tear the page
down before IndexedDB committed, and the post-reload read came back with the pre-drag seed value
(`Expected: 300 / Received: 200`).

The app behavior is correct; only the test's synchronization was wrong. One `expect.poll` was
inserted between the `dragend` dispatch and the reload.

### The Diff (complete — 16 insertions, no deletions)

```diff
@@ -174,6 +174,22 @@ test('a relationship renders as a connector that follows a marker on drag and pe
     group.fire('dragend', { target: group }, true);
   }, personA);

+  // `onDragEnd` persists through an UNAWAITED `void upsertMarker(...)`, so the dragend event
+  // returning does NOT mean the Dexie write has committed. Reloading in that same tick tore the
+  // page down mid-write — the pre-existing flake, where the post-reload read came back with the
+  // pre-drag seed position instead of the dropped one. This poll is a SYNCHRONIZATION GUARD only:
+  // the reload and the assertions below it still carry the full burden of proving persistence.
+  await expect
+    .poll(
+      () =>
+        page.evaluate(async (id) => {
+          const m = await window.__rb!.db.markers.get(id);
+          return m ? [m.x, m.y] : null;
+        }, markerAId),
+      { timeout: 15_000 },
+    )
+    .toEqual([300, 220]);
+
   // The move persisted to Dexie (read after a full reload).
   await page.reload();
   await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
```

Design points, each deliberate:

- Reads through the **same** bridge the next line already uses (`window.__rb!.db.markers.get(id)`) —
  no new bridge method, no new mutation capability (T-ibh-02 disposition held).
- The read is an `async` arrow inside `page.evaluate`, matching the file's existing `resetDb` /
  `suppressPrivacyNotice` / `seed` helpers — an async function returns a native promise, which is
  what Playwright's evaluate await path resolves reliably.
- Returns the `x`/`y` **pair**, so the poll gates on the whole write rather than half of it.
- Returns `null` when the marker is not yet readable, so the poll retries instead of throwing.
- Uses the file's house `{ timeout: 15_000 }` — not raised.

### What Was Deliberately NOT Changed

The post-reload block is verbatim and in its original order: `await page.reload()`, the
`waitForFunction(() => !!window.__rb)`, the `const persisted = await page.evaluate(...)` read,
`expect(persisted?.x).toBe(300)`, `expect(persisted?.y).toBe(220)`, the canvas visibility wait,
and the final connector poll to `[300, 220, 400, 300]`. Proving the value survives a full page
teardown is the entire point of the test, and that burden still rests on those assertions.

A pre-existing Prettier violation at `e2e/connectors.spec.ts:62` (the `markerA` seed line exceeds
the print width) was reflowed by a `prettier --write` and then **reverted**, to keep the diff to
the single intended insertion. It is untouched, exactly as it was before this task.

## `page.reload()` Site Audit (all six)

Line numbers are post-change.

| # | Line | Context | Verdict | Reason |
|---|------|---------|---------|--------|
| 1 | 100 | `beforeEach`, after `resetDb(page)` | **clean** | `resetDb` awaits a Promise that resolves on the `deleteDatabase` request's `onsuccess`/`onerror`/`onblocked` inside an async `page.evaluate` — the deletion is settled before the evaluate returns. |
| 2 | 103 | `beforeEach`, after `suppressPrivacyNotice(page)` | **clean** | The helper `await`s `db.meta.put(...)` inside an async `page.evaluate`, so the write is committed before the reload. |
| 3 | 111 | Test 1, after `seed(page)` | **clean** | `seed` awaits every repository call (`storeMedia`, `createMap`, `updateMap`, `createPerson` x2, `upsertMarker` x2, `createRelationshipLink`) inside one async `page.evaluate` and only then returns the ids. |
| 4 | 194 | Test 1, after the `dragend` dispatch | **HAZARD — fixed** | `onDragEnd` persists via an unawaited `void upsertMarker(...)`; the event dispatch returning did not mean the write had committed. Gated by the new pre-reload poll. |
| 5 | 219 | Test 2, after `seed(page)` | **clean** | Identical to site 3 — same fully-awaited helper. |
| 6 | 254 | Test 2, session-only toggle reload | **clean** | Follows `linesToggle.uncheck()`, which mutates session-only React state that is deliberately never persisted — there is no write to wait for. The preceding `expect.poll(...).toBeNull()` already synchronizes the render before the reload. |

**Net: one genuine hazard out of six.** No site was changed defensively merely for being followed
by a reload.

## Verification Evidence

### The decisive check — repeat runs

Two full batches, both green. `retries` is 0 locally, so nothing was masked.

| Batch | Command | Result | Duration |
|-------|---------|--------|----------|
| 1 | `npx playwright test connectors.spec.ts --repeat-each=5 --reporter=line` | **10 passed, 0 failed, 0 flaky** (exit 0) | 1.1m |
| 2 | `npx playwright test connectors.spec.ts --repeat-each=5 --reporter=line` | **10 passed, 0 failed, 0 flaky** (exit 0) | 59.3s |

**20/20 total.** Both batches ran at Playwright's default `fullyParallel` with **6 workers** — the
loaded, contended condition under which the prior investigation (`260820-ceg`) reproduced the
failure. `--reporter=line` was substituted for the config's `html` reporter only so the run would
not block on the report server; it changes no test behavior, timeout, or retry setting.

The `webServer` (`npm run build:e2e && npm run preview`) was exercised as configured — the tests
ran against the real production-mode bundle with the `VITE_E2E` bridge.

### Gates

| Check | Result |
|-------|--------|
| `npm run typecheck` (`tsc --noEmit`) | pass, no output |
| `npx eslint e2e/connectors.spec.ts` | pass, exit 0, no findings |
| `grep -c 'db.markers.get'` | **2** — the new pre-reload poll plus the untouched post-reload read |
| `grep -c 'expect(persisted?.y).toBe(220)'` | **1** — the original assertion survived |
| `git diff --name-only -- src \| wc -l` | **0** — zero application code changed |
| `git diff --stat` | `e2e/connectors.spec.ts \| 16 ++++++++++++++++`, 1 file changed, 16 insertions(+), 0 deletions(-) |
| Test 2 (Layers-panel session-only) | byte-for-byte unmodified; green on all 10 of its repeats |

Repo-wide `npm run lint` was not used as a gate — it exits 1 on ~16 documented pre-existing errors
in `src/` files this task does not touch. Lint was scoped to the changed file, per the plan.

## Non-Goals Held

| Non-goal | Held? | Evidence |
|----------|-------|----------|
| No application/source changes | yes | `git diff --name-only -- src` is empty; `AvatarMarker.tsx`, `MapView.tsx`, `testBridge.ts` untouched |
| No weakened assertion | yes | `expect(persisted?.x).toBe(300)` / `expect(persisted?.y).toBe(220)` still execute after a full `page.reload()` |
| No `test.retry` / `test.slow()` | yes | not present in the file |
| No `page.waitForTimeout` / sleep | yes | not present in the file |
| No raised timeouts | yes | the new poll uses the file's existing `15_000` house value |
| No `playwright.config.ts` change | yes | not in the diff |
| No restructuring / rename / reorder | yes | 16 insertions, 0 deletions — nothing moved |
| No package install | yes | no dependency added (T-ibh-SC surface unopened) |

## Deviations from Plan

None — plan executed exactly as written.

One incidental note worth recording: a `prettier --write` on the changed file also reflowed a
**pre-existing** overlong line at `e2e/connectors.spec.ts:62` (unrelated to this task). Per the
plan's "nothing else in the file changes" constraint and the out-of-scope rule, that reflow was
reverted rather than shipped. The file therefore remains one line short of `prettier --check`
clean, exactly as it was at base commit `cf55e32`. This is not a regression introduced here; it is
logged only so a future formatter pass is not mistaken for this task's doing.

## Known Stubs

None.

## Threat Flags

None. Test-only change: no new endpoint, auth path, file access pattern, schema change, or trust
boundary. The new poll uses an already-exposed read on the existing `window.__rb` bridge, which
remains gated behind the `--mode e2e` build (WR-01).

## Commits

| Hash | Message |
|------|---------|
| `d93f3fc` | `test(260820-ibh): await the dragend Dexie write before reloading in connectors e2e` |

Task 2 (repeat-run proof) produced no file changes and therefore no commit — its output is the
evidence table above.

## Self-Check: PASSED

- `e2e/connectors.spec.ts` modified and committed — verified on disk and in `git log`.
- `.planning/quick/260820-ibh-fix-flaky-connectors-e2e-by-awaiting-mar/260820-ibh-SUMMARY.md` — verified present.
- Commit `d93f3fc` — verified present in `git log --oneline --all`.
- `git diff --name-only -- src` — empty, re-verified after commit.

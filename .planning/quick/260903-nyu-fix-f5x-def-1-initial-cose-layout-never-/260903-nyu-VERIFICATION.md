---
phase: quick-260903-nyu
verified: 2026-09-04T08:20:00Z
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Quick Task 260903-nyu: Persist the Initial `cose` Layout (F5X-DEF-1) — Verification Report

**Task Goal:** Fix F5X-DEF-1 — the initial `cose` layout never persisted a `graphPositions` row,
because react-cytoscapejs runs the layout inside `patch()` BEFORE it invokes the `cy` callback that
attaches GraphView's `layoutstop` listener, and the layout memo's identity never changes afterwards
so no second `layoutstop` is ever emitted.

**Verified:** 2026-09-04T08:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `shouldPersistInitialLayout` exists in positionCache.ts and is wired into a `useLayoutEffect` in GraphView.tsx that calls `savePositions` | ✓ VERIFIED | `positionCache.ts:104-111` exports the pure function; `GraphView.tsx:498-514` wires it into `useLayoutEffect`, calling `void savePositions(cy).then(...)` when the gate passes |
| 2 | The `probed` data-loss guard is genuinely required (not vestigial), and the unit truth table covers `probed: false` explicitly | ✓ VERIFIED | `positionCache.ts:110` — `probed` is one of 4 ANDed conditions, changes the return value; `tests/features/positionCache.test.ts:140-142` explicitly asserts `probed:false → false` with the data-loss rationale in the test name |
| 3 | The recovery reads the SAME `suspendSaveRef` fence as `layoutstop`; `layoutStopSeenRef` is set BEFORE the fence bail in the handler | ✓ VERIFIED | `GraphView.tsx:506` passes `suspendSaveRef.current` into the gate (same ref declared once at line 190); `GraphView.tsx:636-642` — `layoutStopSeenRef.current = true` is the FIRST statement in the handler, before the `if (suspendSaveRef.current) return` bail at line 642 |
| 4 | A `preset`-skip exists in the `layoutstop` handler, matches ONLY exact `'preset'`, and an absent/unrecognised name falls through to saving | ✓ VERIFIED | `GraphView.tsx:651-653`: `if (layoutName === 'preset') return;` — strict equality only; any other value (including `undefined`) falls through to the `savePositions` call at line 660 |
| 5 | The module header documents why candidates (a), (b), (d) were rejected, each with a source citation | ✓ VERIFIED | `GraphView.tsx:85-105` — three `REJECTED` paragraphs, each citing `react-cytoscapejs component.js:46-88` / `patch.js:57-70` or `isDiffAtKey`/`shallowObjDiff` behavior |
| 6 | The stale comment (formerly ~514-519) claiming every layout persists is corrected to state the true scope | ✓ VERIFIED | `GraphView.tsx:627-635` now reads "Persist positions after every layout FROM THE SECOND ONE ONWARD... this handler owns every one after it" — no longer claims to cover the first layout |
| 7 | A new e2e test in `e2e/graph.spec.ts` asserts a `graphPositions` row with ≥1 node id after first-ever open, appended as the LAST test, using `expect.poll` (never a vacuous `waitForFunction(async …)`) | ✓ VERIFIED | `e2e/graph.spec.ts:560-604` — final test in the file (`wc -l` = 604, no test after line 560); uses `expect.poll(() => page.evaluate(async ...))` at line 580-591; the only `waitForFunction` predicate (line 567-572) is synchronous, not async |
| 8 | Scope held: `git diff e5a9e02..HEAD` touches ONLY the 4 declared files; `package.json` unchanged; only the `graphPositions` meta row is written | ✓ VERIFIED | `git diff e5a9e02..HEAD --name-only` → exactly `e2e/graph.spec.ts`, `src/features/graph/GraphView.tsx`, `src/features/graph/positionCache.ts`, `tests/features/positionCache.test.ts`; `git diff e5a9e02..HEAD -- package.json` is empty; the new e2e test asserts `people/groups/relationshipLinks` counts unchanged (2/1/2) at lines 593-603 |
| 9 | `tsc --noEmit`, `vitest` (positionCache), and eslint over the 4 touched files all exit 0 | ✓ VERIFIED | Independently re-run: `npx tsc --noEmit` exit 0; `npx eslint e2e/graph.spec.ts src/features/graph/GraphView.tsx src/features/graph/positionCache.ts tests/features/positionCache.test.ts` exit 0; `npx vitest run tests/features/positionCache.test.ts --no-file-parallelism` → 18/18 passed |
| 10 | `graph.spec.ts` + `graph-multi-select.spec.ts` all pass, including the previously-red "ego focus is transient" test and the new test | ✓ VERIFIED | Independently re-run: `npx playwright test e2e/graph.spec.ts e2e/graph-multi-select.spec.ts --reporter=line` → 12/12 passed, including `graph.spec.ts:324` (ego focus) and `graph.spec.ts:560` (new test) |
| 11 | The new e2e test is deterministic (3/3) | ✓ VERIFIED | Independently re-run: `npx playwright test e2e/graph.spec.ts -g "initial cose layout persists" --repeat-each=3` → 3/3 passed |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/graph/positionCache.ts` | Pure `shouldPersistInitialLayout` gate | ✓ VERIFIED | Exists, exported, pure (reads only its argument, `Object.prototype.hasOwnProperty`-style checks elsewhere in file confirm existing style match) |
| `src/features/graph/GraphView.tsx` | Wired recovery effect + fixed comment + header | ✓ VERIFIED | `useLayoutEffect` at line 498, handler fix at 636-663, header section at 45-105 |
| `tests/features/positionCache.test.ts` | 5-row truth table + purity test | ✓ VERIFIED | `describe('F5X-DEF-1 — shouldPersistInitialLayout...')` block, 6 tests (5 truth-table rows + 1 purity test) |
| `e2e/graph.spec.ts` | New regression test, appended last | ✓ VERIFIED | Test at line 560, file ends at line 604, no test appears after it |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `shouldPersistInitialLayout(...)` | one-shot `useLayoutEffect` in GraphView | direct call at line 502 | WIRED | `saveSuspended` input reads the same `suspendSaveRef.current` the `layoutstop` handler reads (single ref, declared once at line 190) |
| `layoutStopSeenRef` | recovery gate | `layoutStopSeen: layoutStopSeenRef.current` at line 505 | WIRED | Set as first statement of the handler (line 639), before the fence bail (line 642) |
| `savePositions(cy)` | recovery effect | `void savePositions(cy).then(...)` at line 511 | WIRED | Builds the id→position map synchronously (positionCache.ts:32-35) before its `await` |
| New e2e assertion | `window.__rb.db.meta.get('graphPositions')` | `expect.poll` | WIRED | Confirmed compliant with `rb-e2e/no-async-wait-predicate` (eslint exits 0 on this file) |

### Behavioral Spot-Checks / Independent Gate Re-runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type safety | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint (4 touched files) | `npx eslint e2e/graph.spec.ts src/features/graph/GraphView.tsx src/features/graph/positionCache.ts tests/features/positionCache.test.ts` | exit 0 | ✓ PASS |
| Unit truth table | `npx vitest run tests/features/positionCache.test.ts --no-file-parallelism` | 18 passed | ✓ PASS |
| Graph e2e suite | `npx playwright test e2e/graph.spec.ts e2e/graph-multi-select.spec.ts --reporter=line` | 12 passed | ✓ PASS |
| New test determinism | `npx playwright test e2e/graph.spec.ts -g "initial cose layout persists" --repeat-each=3` | 3 passed | ✓ PASS |
| Rejected-alternatives gate | `grep -c REJECTED src/features/graph/GraphView.tsx` | 3 | ✓ PASS |
| Debt-marker scan | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` on all 4 touched files | no matches | ✓ PASS |
| Commit ancestry | `git merge-base --is-ancestor e2b103f/3f2f85e master` | both true | ✓ PASS |

Note: the full `npx playwright test` run (all specs) was NOT re-run in this verification — per the
task instructions this was already run independently by the orchestrator on the merged tree (8
pre-existing failures, all on the known list). The scoped re-run above (graph.spec.ts +
graph-multi-select.spec.ts, the two files this fix could plausibly affect) was executed directly and
confirms the claim for the files most likely to regress.

### Anti-Patterns Found

None. No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in any of the 4 touched files. No stub
returns, no hardcoded empty data flowing to output, no console.log-only implementations.

### Requirements Coverage

This is a quick task (not a phase); requirements NYU-1 through NYU-7 are locally scoped in the
PLAN's `must_haves.truths` rather than tracked in the global `.planning/REQUIREMENTS.md` registry.
All 7 (NYU-1 through NYU-7, several with sub-clauses) are covered by the Observable Truths table
above — no orphaned or unaddressed requirement IDs found.

### Human Verification Required

None. All must-haves are verifiable programmatically via code inspection and automated gate
re-execution; no visual, real-time, or external-service behavior is involved.

### Gaps Summary

No gaps found. Every must-have truth, artifact, and key link from the PLAN's frontmatter is
independently confirmed in the current working tree (not merely claimed by the SUMMARY). The
executor's mid-run stall (after committing both tasks, before writing the SUMMARY) did not leave any
gap in the actual code — both commits (`e2b103f` RED-proving, `3f2f85e` GREEN-proving) are ancestors
of `master`, and every gate the SUMMARY reports was independently re-run here with matching results
(18 vitest passes, 12 playwright passes, 3/3 determinism, 3 REJECTED citations, clean tsc/eslint).

Scope was held precisely: only the 4 declared files were touched, `package.json` is byte-identical,
and the graph continues to write only the `graphPositions` meta row (pinned by both the new e2e
assertion and by code inspection of `savePositions`).

---

_Verified: 2026-09-04T08:20:00Z_
_Verifier: Claude (gsd-verifier)_

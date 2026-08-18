---
phase: 07-relationships-map-visual-polish
plan: 03
subsystem: ui
tags: [cytoscape, graph, dexie, react, playwright, vitest, layout-cache]

# Dependency graph
requires:
  - phase: 04-relationships-graph
    provides: "GraphView (viewer-only Cytoscape) + positionCache (graphPositions meta row, D-13 preset/cose gate)"
provides:
  - "partitionCached(positions, nodeIds) three-way layout gate (allCached/noneCached/partial) — pure"
  - "clearPositions() — deletes the graphPositions meta row (Reset-layout escape hatch)"
  - "Grabbable graph nodes with dragfree sticky-persist (viewer-only, layout-only writes)"
  - "Place-newcomer-only partial-cache placement (lock anchors → cose → unlock → save) superseding D-13 full-invalidation"
  - "suspendSaveRef save-guard seam at the top of the layoutstop handler (consumed by Plan 04's ego overlay)"
  - "graph-reset-layout data-testid + e2e coverage for grabbable/drag-persist/reset/sticky-partial-cache"
affects: [07-04, graph, ego-focus, plan-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-way layout gate: partition the node-set into cached anchors vs newcomers rather than a binary all-or-nothing invalidation"
    - "Lock cached nodes + full-graph cose so only unlocked newcomers relax into place around fixed anchors (relational placement via edges)"
    - "suspendSaveRef ref-flag fences a transient layout off the once-attached layoutstop auto-save"
    - "Integration e2e proves the imperative lock→cose→unlock→save wiring end-to-end (byte-identical anchors, non-origin/non-colliding newcomer)"

key-files:
  created: []
  modified:
    - "src/features/graph/positionCache.ts — partitionCached + clearPositions; header rewritten for D-08"
    - "tests/features/positionCache.test.ts — partitionCached + clearPositions unit coverage"
    - "src/features/graph/GraphView.tsx — grabbable, dragfree persist, three-way gate, placement effect, Reset button, suspendSaveRef"
    - "e2e/graph.spec.ts — grabbable flip + drag-persist/viewer-only + reset + sticky-partial-cache specs"

key-decisions:
  - "Reset-layout e2e asserts the manual layout was discarded (row absent-or-regenerated) rather than a flaky transient-undefined, because IC-3 immediately re-runs a fresh cose that re-saves"
  - "dragfree handler is NOT gated by suspendSaveRef in this plan (plan scopes the guard to layoutstop only); the flag stays false throughout"
  - "Partial-cache placement guarded by placedMissingRef (runs once per newcomer node-set, not on every data tick)"

patterns-established:
  - "partitionCached three-way gate is the canonical layout decision; hasCachedPositions retained but no longer drives GraphView"
  - "Viewer-only contract proven by asserting db.people + db.relationshipLinks are byte-identical after a drag"

requirements-completed: [POL-02]

# Metrics
duration: 15min
completed: 2026-08-18
status: complete
---

# Phase 7 Plan 03: Draggable Graph Nodes with Sticky Positions + Reset Layout Summary

**Grabbable Cytoscape graph nodes that sticky-persist to the graphPositions meta row on dragfree (viewer-only, never touching entity data), a three-way partitionCached gate that keeps saved positions and auto-places only the newcomer, and a Reset-layout escape hatch — plus the suspendSaveRef seam for Plan 04's ego overlay.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-18T10:06:55Z
- **Completed:** 2026-08-18T10:21:31Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `partitionCached` three-way layout gate (allCached → preset, noneCached → cose, partial → place-newcomer-only) plus `clearPositions()`, both unit-tested — supersedes Phase-4's D-13 full-invalidation with D-08 sticky behaviour.
- GraphView nodes are now grabbable; a `dragfree` handler sticky-persists the new position to the `graphPositions` meta row only, while a node tap still opens the ProfileSidebar (native tap-vs-drag) — the viewer-only contract for relationship data is intact.
- Adding an entity no longer blows away the hand-arranged layout: cached anchors are locked and a full-graph `cose` relaxes only the unlocked newcomer around them (`fit:false`), then re-saves.
- A neutral "Reset layout" button (`graph-reset-layout`) clears the saved positions and re-runs a fresh `cose`; the `suspendSaveRef` save-guard is wired at the top of the `layoutstop` handler (false here, ready for Plan 04).
- e2e coverage flipped to `grabbable === true` and added drag-persist/viewer-only, reset, and the sticky-partial-cache integration proof.

## Task Commits

Each task was committed atomically:

1. **Task 1: partitionCached + clearPositions (TDD)** — `638fae5` (test, RED) → `eeb3b7e` (feat, GREEN)
2. **Task 2: Grabbable nodes + dragfree persist + partial-cache placement + Reset layout** — `bf6d907` (feat)
3. **Task 3: e2e for drag + reset + sticky-partial-cache** — `3b177e1` (test)

_TDD gate compliance: Task 1 has a `test(...)` RED commit (`638fae5`) preceding the `feat(...)` GREEN commit (`eeb3b7e`)._

## Files Created/Modified
- `src/features/graph/positionCache.ts` — added pure `partitionCached` (three-way gate) and `clearPositions()`; header rewritten to document the D-08 place-newcomer-only rule (D-13 full-invalidation marked superseded).
- `tests/features/positionCache.test.ts` — added `partitionCached` cases (every behavior row incl. stale-entry tolerance) and a `clearPositions` case (save → clear → loadPositions undefined).
- `src/features/graph/GraphView.tsx` — dropped `autoungrabify`; added `dragfree` sticky-persist, the `partitionCached` three-way gate, the partial-cache placement effect (lock → cose(fit:false) → unlock → save), the `suspendSaveRef` guard at the top of `layoutstop`, and the Reset-layout button; header comment updated.
- `e2e/graph.spec.ts` — flipped `grabbable()` to `true`; added drag-persist/viewer-only, reset-layout, and sticky-partial-cache integration specs; extended `seedGraph` to return all node ids.

## Decisions Made
- **Reset-layout e2e assertion.** IC-3 has Reset immediately re-run a fresh `cose`, which re-saves the row, so a literal "row is undefined immediately after clear" check is inherently racy. The spec instead deterministically asserts the row no longer equals the seeded manual layout (absent-or-regenerated) — proving the manual positions were discarded (D-09). See Deviations.
- **dragfree not gated by suspendSaveRef.** The plan scopes the save-guard to the `layoutstop` handler only; the flag stays false in this plan, so gating `dragfree` would be inert. Left ungated to match the plan exactly.
- **placedMissingRef guard.** The partial-cache placement effect keys off the sorted missing-id signature so it runs once per node-set change, not on every unrelated data tick.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reset-layout e2e asserts "manual layout discarded" instead of a flaky transient-undefined**
- **Found during:** Task 3 (e2e reset spec)
- **Issue:** The plan's literal acceptance ("assert the graphPositions row is undefined immediately after the clear") is a race: Reset's onClick clears the row and then re-runs a fresh `cose` (IC-3), whose `layoutstop` re-saves the row within a frame. A poll for the transient `undefined` window would be flaky on CI.
- **Fix:** The spec seeds a distinctive manual layout, opens the graph, clicks Reset, then `waitForFunction`s until the row is `undefined` OR no longer deep-equals the seeded manual positions — a deterministic proof that the manual layout was discarded (the intent of D-09/IC-3).
- **Files modified:** e2e/graph.spec.ts
- **Verification:** `npx playwright test e2e/graph.spec.ts` — 4/4 pass.
- **Committed in:** `3b177e1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — flaky-assertion avoidance)
**Impact on plan:** The adjusted assertion is strictly more robust and still proves the D-09 behaviour (manual positions cleared). No scope change; all other acceptance criteria met literally.

## Issues Encountered
- Considered the preset-layoutstop-vs-placement-effect ordering race for the partial-cache path (a preset `layoutstop` could otherwise persist a newcomer at the origin before placement runs). The placement effect runs at React commit time (parent effect, after CytoscapeComponent's child layout effect) and its closure captures the partial `partition`, so it always executes once and the newcomer ends up placed; the `waitForFunction` on Carol-off-origin makes the sticky-partial-cache spec deterministic. Confirmed green in e2e.

## Verification

- `npx vitest run tests/features/positionCache.test.ts` — 12/12 green (incl. new partitionCached + clearPositions).
- `npm test` — full unit suite green (358/358).
- `npx playwright test e2e/graph.spec.ts` — 4/4 green (grabbable flip + drag-persist/viewer-only + reset + sticky-partial-cache).
- `npx tsc -p tsconfig.json --noEmit` — clean. `npx eslint` on changed files — clean.
- `git diff` of `src/features/graph/graphStyle.ts` — empty (graph stays token-driven, D-01). `git diff --exit-code package.json` — clean (zero installs, T-07-SC).

## Threat Surface
- T-07-04 (Tampering, dragfree/layout handlers → mitigate): handlers call only `savePositions`/`clearPositions` (the graphPositions meta row); the drag-persist e2e asserts `db.people` and `db.relationshipLinks` are byte-identical after `dragfree` (viewer-only proof). Mitigation present.
- T-07-SC (npm installs → mitigate): zero installs; `git diff --exit-code package.json` passes.
- No new security surface introduced beyond the plan's threat register.

## Next Phase Readiness
- Plan 04 (ego overlay) can consume the `suspendSaveRef` seam and the `graph-reset-layout` / `partitionCached` surfaces as designed.
- No blockers. No new dependencies. No user setup required.

## Self-Check: PASSED
- Modified files exist: positionCache.ts, positionCache.test.ts, GraphView.tsx, e2e/graph.spec.ts — all present.
- Commits exist: `638fae5`, `eeb3b7e`, `bf6d907`, `3b177e1` — all in git log.

---
*Phase: 07-relationships-map-visual-polish*
*Completed: 2026-08-18*

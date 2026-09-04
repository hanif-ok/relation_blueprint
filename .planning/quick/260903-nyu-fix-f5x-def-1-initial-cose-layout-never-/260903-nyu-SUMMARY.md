---
phase: quick-260903-nyu
plan: 01
subsystem: graph
status: complete
tags: [graph, cytoscape, react-cytoscapejs, persistence, defect-fix, F5X-DEF-1]
requires:
  - src/features/graph/positionCache.ts (savePositions / loadPositions / partitionCached)
  - src/features/graph/GraphView.tsx (layoutstop handler, suspendSaveRef fence)
provides:
  - the initial `cose` layout now persists a `graphPositions` row on a first-ever graph open
  - shouldPersistInitialLayout — the pure, four-input recovery gate (incl. the data-loss guard)
  - e2e/graph.spec.ts:560 — regression test for a first-ever graph open
affects:
  - src/features/graph/GraphView.tsx
  - src/features/graph/positionCache.ts
  - e2e/graph.spec.ts
  - tests/features/positionCache.test.ts
tech-stack:
  added: []
  patterns:
    - one-shot recovery in a parent `useLayoutEffect` for an event lost to child-before-parent
      commit ordering
    - a pure exported predicate gating an effect, so each guard condition is unit-testable
      without a DOM
decisions:
  - Approach (c) — a one-shot post-mount recovery gated by `shouldPersistInitialLayout` — chosen
    over (a) owning every layout via `layout={null}`, (b) attaching listeners pre-patch, and
    (d) forcing a layout-prop identity change. All three rejections are recorded WITH CITATIONS in
    the GraphView module header, because the previous attempt at this defect failed precisely
    because its reasoning was never written down.
  - `useLayoutEffect`, not `useEffect`: children commit before parents (so `registerCy` has run and
    `cyRef.current` is set), and layout effects precede passive effects (so the snapshot is taken
    before the concentric ego overlay can raise the fence).
  - `layoutStopSeenRef` is set as the FIRST statement of the handler, BEFORE the fence bail, so a
    fenced ego `layoutstop` still counts as proof the listener is live.
  - The `preset`-skip reads `evt.layout.options.name` through an inline structural type (neither
    `evt.layout` nor `options` is modelled by `@types/cytoscape`), and skips ONLY on an exact
    `'preset'` match — an absent or unrecognised name falls through to saving.
metrics:
  completed: 2026-09-04
---

# Quick Task 260903-nyu: Persist the Initial `cose` Layout (F5X-DEF-1)

Fixes the defect logged as F5X-DEF-1 during quick-260903-f5x: a `graphPositions` row was never
written for any graph that had not been hand-arranged, so the D-13 `preset` fast-path never engaged,
every reopen paid a full physics layout, and node positions were not stable across sessions.

## Root cause

react-cytoscapejs's `componentDidMount` constructs the core and calls `updateCytoscape(null, this.props)`,
which runs `patch(cy, …)` **first** and only then calls `newProps.cy(cy)` — GraphView's `registerCy`,
where the `layoutstop` listener is attached (`react-cytoscapejs/src/component.js:46-88`). `patch`
ends in `patchLayout` → `cy.layout(opts).run()` (`patch.js:57-70`), and `cose` with `animate: false`
runs its whole simulation synchronously and emits `layoutstop` inside that call. The event is raised
before any listener exists and is lost.

It never recovered: the `layout` memo only changes identity when `usePresetPositions` flips, and with
no saved positions `posCache.probed && !partition.noneCached` stays false forever. `dragfree` looked
healthy because it is a later user gesture, long after `registerCy` ran — exactly the asymmetry the
field report observed.

## The fix

A one-shot recovery save in a parent `useLayoutEffect`, gated by the pure
`shouldPersistInitialLayout({ probed, noneCached, layoutStopSeen, saveSuspended })` in
`positionCache.ts`. Because the mount `cose` completes synchronously inside `patch`, the nodes are
already at their final positions when the parent effect runs, so persisting them reproduces exactly
what the missed `layoutstop` would have persisted.

Each gate input guards a distinct failure:

| Input | Guards against |
|---|---|
| `probed` | **Data loss.** `posCache.probed` can still be false at mount (the `loadPositions()` probe races three `useLiveQuery` reads); recovering then would persist a fresh `cose` OVER a curator's saved hand-arranged layout. |
| `noneCached` | `allCached`'s missed `preset` stop would be a no-op re-save; `partial`'s newcomer is already persisted by the placement effect's own heard `cose` stop, and recovering there would race a newcomers-at-origin snapshot against it. |
| `!layoutStopSeen` | Reset-layout double-saving — that `cose` **is** heard, so the handler owns persistence from then on. |
| `!saveSuspended` | The ego-focus fence, read from the **same** `suspendSaveRef` the handler reads. One fence, two readers. |

The placement effect's gate (`GraphView.tsx:393`) is the exact logical complement of the recovery's
`noneCached` gate, so the two can never both fire in one commit and `placedMissingRef` is untouched.

A `preset`-skip was added to the `layoutstop` handler: without it, the recovery's
save → load → `setPosCache` → `usePresetPositions` flip → `preset` patch sequence would raise a heard
`layoutstop` and write the same row a second time.

The stale comment at the old `GraphView.tsx:514-519` — which asserted that `cy.on` made *every*
layout persist — was corrected: `cy.on` covers every layout **from the second onward**; the recovery
effect covers the first.

## Verification (run on the merged tree by the orchestrator)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` over all 4 touched files | exit 0 |
| `vitest tests/features/positionCache.test.ts` | 18 passed (incl. 6 new `shouldPersistInitialLayout` rows) |
| `playwright e2e/graph.spec.ts e2e/graph-multi-select.spec.ts` | **12 passed** |

Acceptance signals, all confirmed:

- `e2e/graph.spec.ts:324` ("ego focus is transient…") — previously **RED** from this defect, now green.
- `e2e/graph.spec.ts:560` — the new test, "the initial cose layout persists a graphPositions row on a
  first-ever graph open", green. Appended as the LAST test so `graph.spec.ts:324` and the
  deferred-items line references did not shift.
- Both fence tests still green, so the ego overlay still never clobbers the persisted base.
- "Reset layout clears the saved manual positions" and the sticky-partial-cache test still green, so
  the `preset`-skip introduced no double-save or save-loop regression.
- The unit truth table covers the dangerous `probed: false` row explicitly.

## Scope held

`graphPositions` remains the only row the graph writes — the viewer-only principle
(`.planning/PROJECT.md` lines 68, 101) is untouched. No new dependencies; `node_modules` was not
forked or patched. No other logged defect was touched.

## Execution note

The executor agent stalled on a watchdog timeout **after** committing both tasks (`e2b103f` RED,
`3f2f85e` GREEN) and completing its full-suite run, but **before** writing this SUMMARY. Its final
output reported that all 8 remaining suite failures were exactly the known pre-existing list. The
worktree was clean, both commits verified as ancestors of `master`, and every gate in the table above
was re-run independently by the orchestrator on the merged tree rather than taken from the agent's
self-report. This document was written from those independent results.

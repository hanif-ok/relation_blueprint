---
phase: 07-relationships-map-visual-polish
plan: 04
subsystem: ui
tags: [cytoscape, graph, ego-focus, concentric, react, playwright, vitest]

# Dependency graph
requires:
  - phase: 07-relationships-map-visual-polish
    plan: 03
    provides: "Grabbable graph + suspendSaveRef save-guard seam at the layoutstop handler + graph-reset-layout"
  - phase: 04-relationships-graph
    provides: "GraphView (viewer-only Cytoscape) + positionCache (graphPositions meta row)"
provides:
  - "computeHopLevels(adjacency, egoId) + concentricValue(hop) pure helpers (egoLayout.ts) — BFS hop-distance + concentric mapping, core-free"
  - "focusedId view-state + concentric ego overlay in GraphView (whole-graph re-layout around the ego, follows taps)"
  - "basePosRef snapshot/restore — Exit focus restores the exact saved base with no layout and no save"
  - "graph-exit-focus control (distinct from Reset layout) rendered only while focused"
  - "suspendSaveRef consumed: fenced for the whole focus session so the transient concentric run never overwrites the persisted base (Pitfall 1)"
  - "ego-transient e2e proof (exit restores snapshot, graphPositions byte-identical across focus→exit)"
affects: [graph, ego-focus, POL-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure hop-distance derivation (BFS over an undirected adjacency) decoupled from Cytoscape so it unit-tests core-free"
    - "Transient concentric overlay fenced off the auto-save for the WHOLE focus session (suspendSaveRef true on enter, dropped only on exit after the in-flight layout is stopped)"
    - "Base-snapshot restore via cy.nodes().positions() (direct set, emits no layoutstop) — restore never persists"
    - "Adjust-state-during-render (prevEgoId sentinel) to mirror a prop into local state without a set-state-in-effect cascade"

key-files:
  created:
    - "src/features/graph/egoLayout.ts — computeHopLevels + concentricValue + Adjacency (pure)"
    - "tests/features/egoLayout.test.ts — hop-levels + concentric-value unit coverage"
  modified:
    - "src/features/graph/GraphView.tsx — focusedId state, concentric overlay, basePosRef snapshot/restore, Exit-focus button; removed old center/zoom pan"
    - "e2e/graph.spec.ts — ego-transient spec (exit restores base, graphPositions unchanged)"

key-decisions:
  - "suspendSaveRef is held true for the ENTIRE focus session and dropped only on exit (after stopping the in-flight layout) — race-free vs resetting on the concentric layoutstop, which could clobber the base if the global save handler ran before the reset"
  - "Exit routes through setFocusedId(null); the concentric effect's EXIT branch is the single restore path (button + profile-close converge), so restore logic is never duplicated"
  - "egoId prop is mirrored into focusedId via the adjust-state-during-render pattern (prevEgoId sentinel), not a useEffect, to satisfy react-hooks/set-state-in-effect"

patterns-established:
  - "computeHopLevels/concentricValue are the canonical ego-ring derivation; GraphView builds the undirected adjacency from cy.edges()"
  - "Transient view overlays fence the auto-save for their whole lifecycle and restore via direct positions() (no layoutstop) on exit"

requirements-completed: [POL-03]

# Metrics
duration: 20min
completed: 2026-08-18
status: complete
---

# Phase 7 Plan 04: Dynamic Concentric Ego Focus (Transient) Summary

**Tapping or opening a node re-lays the whole graph out concentrically around that ego (rings by hop-distance) and follows subsequent taps, as a TRANSIENT overlay fenced off the auto-save so it never overwrites the persisted base; Exit focus (or closing the profile) restores the exact saved base, distinct from Reset layout — delivering POL-03 (D-10..D-13).**

## Performance
- **Duration:** ~20 min
- **Started:** 2026-08-18T10:29:56Z
- **Completed:** 2026-08-18T10:49:50Z
- **Tasks:** 3
- **Files created:** 2 / **modified:** 2

## Accomplishments
- `egoLayout.ts` — pure `computeHopLevels(adjacency, egoId)` (breadth-first hop-distance over an UNDIRECTED adjacency; ego=0, neighbour=1, …, disconnected parked at maxHop+1, never undefined/NaN) and `concentricValue(hop) = 0 - hop` (nearer hop → higher value → inner ring). No Cytoscape import — unit-tested core-free.
- GraphView now drives a local `focusedId` (seeded from the `egoId` prop AND from node taps): the whole graph re-lays out concentrically around the ego and focus follows the tap.
- The concentric run is a transient overlay: on enter the resting base positions are snapshotted into `basePosRef`, and `suspendSaveRef` fences the global `layoutstop` auto-save for the whole focus session so the persisted base is NEVER clobbered (research Pitfall 1). Exit focus stops any in-flight animation and restores the exact base via `cy.nodes().positions()` (no layout, no save).
- `graph-exit-focus` toolbar control, rendered only while focused (neutral `styles.toggle`), DISTINCT from Reset layout — it keeps manual positions and only drops the overlay. Closing the ProfileSidebar (egoId → null) exits focus the same way.
- Removed the old `cy.animate({center,zoom})` pan effect (the concentric run repositions instead — no double viewport driver); all ego layouts use `fit:false` (WR-01); prefers-reduced-motion snaps (no tween).
- New ego-transient e2e proves exit restores the exact pre-focus snapshot AND `graphPositions` is byte-identical across enter-focus → exit-focus (the Pitfall-1 guard proof), while tapping node B during focus still opens its ProfileSidebar (AT bridge preserved).

## Task Commits
1. **Task 1: computeHopLevels + concentricValue (TDD)** — `edb62ae` (test, RED) → `d92528a` (feat, GREEN)
2. **Task 2: Concentric ego overlay + snapshot/restore + Exit focus** — `7a62aff` (feat)
3. **Task 3: Ego-transient e2e spec** — `348e027` (test)

_TDD gate compliance (Task 1): a `test(...)` RED commit (`edb62ae`) precedes the `feat(...)` GREEN commit (`d92528a`)._

## Files Created/Modified
- `src/features/graph/egoLayout.ts` (NEW) — `Adjacency` type, `computeHopLevels` (BFS, undirected symmetrisation, disconnected → maxHop+1), `concentricValue`.
- `tests/features/egoLayout.test.ts` (NEW) — multi-hop, single-node, disconnected→maxHop+1, undirected traversal, nearest-path-wins, and monotonic concentricValue cases.
- `src/features/graph/GraphView.tsx` — `focusedId` state + prop mirror (adjust-state-during-render), `basePosRef`/`prevFocusedRef`/`egoLayoutRef`, the concentric overlay effect (snapshot → hop-levels → fenced concentric run → exit restore), the amber-class effect re-keyed on `focusedId`, `setFocusedId` in the tap handler, the `graph-exit-focus` button; removed the center/zoom pan effect; header comment rewritten.
- `e2e/graph.spec.ts` — added the ego-transient spec (position snapshot + graphPositions parity across focus→exit + AT-bridge assertion).

## Decisions Made
- **Session-long save fence (not per-layoutstop reset).** `suspendSaveRef` is set true on enter and dropped only on exit, after the in-flight concentric layout is stopped and the base restored. Resetting it inside the concentric `layoutstop` would race the global auto-save handler (ordering between the layout-instance listener and `cy.on('layoutstop')` is not guaranteed) and could persist the transient concentric positions, clobbering the base. Holding the fence for the whole session is race-free and also covers add-node-while-focused.
- **Single restore path.** The Exit-focus button and the profile-close path both converge on `setFocusedId(null)`; the concentric effect's EXIT branch is the only place that restores `basePosRef` (no duplication, no double-restore).
- **Prop→state mirror without an effect.** `egoId` is mirrored into `focusedId` via the `prevEgoId` sentinel (adjust-state-during-render), not a `useEffect`, to satisfy `react-hooks/set-state-in-effect` and avoid a cascading render. See Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prop→state mirror refactored from useEffect to adjust-state-during-render**
- **Found during:** Task 2 (ESLint gate)
- **Issue:** The planned `useEffect(() => setFocusedId(egoId), [egoId])` mirror trips `react-hooks/set-state-in-effect` (cascading-render lint error), failing the lint gate.
- **Fix:** Replaced with React's official "adjust state during render" pattern — a `prevEgoId` sentinel that syncs `focusedId` when the prop changes. Same behaviour (open-from-profile enters focus, profile-close exits), no effect.
- **Files modified:** src/features/graph/GraphView.tsx
- **Commit:** `7a62aff`

**2. [Rule 3 - Blocking] `animate: 'end'` cast for the concentric layout**
- **Found during:** Task 2 (tsc gate)
- **Issue:** `@types/cytoscape` narrows a layout's `animate` to `boolean`, but the concentric layout accepts `'end'` at runtime; `tsc` errored (TS2345).
- **Fix:** Localized `as unknown as boolean` cast on the `animate` value with an explanatory comment; runtime keeps `'end'`.
- **Files modified:** src/features/graph/GraphView.tsx
- **Commit:** `7a62aff`

**3. [Rule 1 - Bug] Two TDD-iteration corrections in egoLayout**
- **Found during:** Task 1 (GREEN)
- **Issue:** (a) `concentricValue(0)` returned `-0`, which fails `toBe(0)` under `Object.is`; (b) one RED test expectation was wrong (`c` is reachable via ego→d→c = hop 2, not 3).
- **Fix:** (a) `concentricValue` returns `0 - hop` (positive zero); (b) corrected the test expectation to match the true BFS depth. Implementation was otherwise correct.
- **Files modified:** src/features/graph/egoLayout.ts, tests/features/egoLayout.test.ts
- **Commit:** `d92528a`

**4. [Planned] Removed the old center/zoom pan effect**
- The plan directed removing the `cy.animate({center,zoom})` ego pan (the concentric run repositions instead of panning — no double viewport driver). Done in Task 2.

---
**Total deviations:** 3 auto-fixed (2 blocking-gate fixes, 1 bug) + 1 planned removal.
**Impact on plan:** No scope change. All acceptance criteria met; the prop-mirror refactor is behaviour-equivalent and lint-clean.

## Verification
- `npx vitest run tests/features/egoLayout.test.ts tests/features/positionCache.test.ts` — 19/19 green.
- `npx vitest run` — full unit suite green (388/388, 60 files).
- `npx playwright test e2e/graph.spec.ts` — 5/5 green (incl. the new ego-transient spec; e2e build mode).
- `npx tsc -p tsconfig.json --noEmit` — clean. `npx eslint` on changed files — clean.
- `git diff` of `src/features/graph/graphStyle.ts` — empty (D-01). `git diff --exit-code package.json` — clean (zero installs, T-07-SC).

## Threat Surface
- **T-07-05** (Tampering, transient concentric layout → graphPositions save → mitigate): `suspendSaveRef` fences the concentric run's `layoutstop` for the whole focus session; the e2e asserts `graphPositions` is byte-identical across focus → exit. Mitigation present and proven.
- **T-07-04** (Tampering, ego overlay / tap handlers → mitigate): the overlay and restore write no repository row — only view-state and (never) the meta row; the tap AT bridge is preserved (e2e asserts Bob's ProfileSidebar opens). No entity mutation.
- **T-07-SC** (npm installs → mitigate): zero installs (built-in Cytoscape concentric/bfs); `git diff --exit-code package.json` passes.
- No new security surface beyond the plan's threat register.

## Known Stubs
None — no placeholder/empty-data patterns introduced.

## Next Phase Readiness
- POL-03 complete (D-10..D-13). No blockers, no new dependencies, no user setup.
- MANUAL UAT still open per VALIDATION.md: with prefers-reduced-motion, ego re-layout + Reset layout should snap (no tween) — the code path is wired (`animate: false` on reduced-motion) but not automatically asserted.

## Self-Check: PASSED
- Created files exist: `src/features/graph/egoLayout.ts`, `tests/features/egoLayout.test.ts` — present.
- Modified files exist: `src/features/graph/GraphView.tsx`, `e2e/graph.spec.ts` — present.
- Commits exist: `edb62ae`, `d92528a`, `7a62aff`, `348e027` — all in git log.

---
*Phase: 07-relationships-map-visual-polish*
*Completed: 2026-08-18*

---
phase: 7
slug: relationships-map-visual-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-18
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` § Validation Architecture. Konva + Cytoscape render to an opaque `<canvas>` (pixels are not assertable and are invisible to AT), so the strategy is: **push logic into pure functions (Vitest), drive interactions through the exposed cores (Playwright `window.__cyGraph` / `window.__rb`), and gate the one irreducibly-visual claim — legibility over a light image — as scoped manual UAT.**

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (unit, jsdom + `fake-indexeddb` via `tests/setup.ts`) + Playwright 1.61.1 (e2e) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/features/color.test.ts tests/features/positionCache.test.ts tests/features/mapAppearance.test.ts tests/features/egoLayout.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **E2E command** | `npm run test:e2e` (requires e2e build mode — `window.__rb` + `window.__cyGraph` are e2e-only; see [[testbridge-requires-e2e-build-mode]]) |
| **Estimated runtime** | Quick ~5s · full unit suite ~tens of s · e2e separate |

---

## Sampling Rate

- **After every task commit:** Run the relevant pure-function test file(s) — `npx vitest run tests/features/{color,positionCache,mapAppearance,egoLayout}.test.ts` (< 5s).
- **After every plan wave:** Run `npm test` (full unit suite). If it false-fails with fork-worker startup timeouts under load, re-run `npx vitest run --no-file-parallelism` to confirm it is environmental, not a code defect ([[vitest-forks-timeout-under-load]]).
- **Before `/gsd-verify-work`:** `npm test` green **AND** `npm run test:e2e` green (updated `graph.spec.ts` + new drag/ego/reset specs) **AND** the manual legibility screenshot checklist signed off.
- **Max feedback latency:** ~5 seconds (quick pure-function run).

---

## Per-Task Verification Map

> Task IDs (`07-NN-NN`) are assigned when the planner writes PLAN.md; complete this column during/after planning. The validation *units* below are fixed by research and map to POL-01/02/03.

| Validation Unit | Plan (target) | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-----------------|---------------|-------------|------------|-----------|-------------------|-------------|--------|
| `relativeLuminance(hex)` known values | colors (POL-01) | POL-01 | T-07 V5 / — | unit | `npx vitest run tests/features/color.test.ts` | ❌ W0 | ⬜ pending |
| `outlineColorFor(hex)` light→slate / dark→paper | colors (POL-01) | POL-01 | — | unit | `npx vitest run tests/features/color.test.ts` | ❌ W0 | ⬜ pending |
| `getMapAppearance(record, mapId)` default/stored/clear | colors (POL-01) | POL-01 | T-07 V5 (coerce bad hex) | unit | `npx vitest run tests/features/mapAppearance.test.ts` | ❌ W0 | ⬜ pending |
| `partitionCached(positions, nodeIds)` place-newcomer-only | drag (POL-02) | POL-02 | — | unit | `npx vitest run tests/features/positionCache.test.ts` | ✅ extend | ⬜ pending |
| `computeHopLevels(adjacency, egoId)` + concentric value | ego (POL-03) | POL-03 | — | unit | `npx vitest run tests/features/egoLayout.test.ts` | ❌ W0 | ⬜ pending |
| Tap still opens ProfileSidebar after drag enabled | drag (POL-02) | POL-02 | — | e2e | `npm run test:e2e` | ❌ W0 | ⬜ pending |
| Node `grabbable() === true` (flip existing assertion) | drag (POL-02) | POL-02 | — | e2e | `npm run test:e2e` | ✅ update | ⬜ pending |
| Drag persists + entity rows byte-identical (viewer-only) | drag (POL-02) | POL-02 | T-07 (viewer-only) | e2e | `npm run test:e2e` | ❌ W0 | ⬜ pending |
| Reset layout clears `graphPositions` row | drag (POL-02) | POL-02 | — | e2e | `npm run test:e2e` | ❌ W0 | ⬜ pending |
| Sticky partial cache — add entity keeps saved positions byte-identical, only newcomer placed | drag (POL-02) → 07-03 Task 3 | POL-02 | — | e2e | `npm run test:e2e` | ❌ W0 | ⬜ pending |
| Ego focus transient — exit restores snapshot, cache unchanged | ego (POL-03) | POL-03 | — | e2e | `npm run test:e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/features/color.test.ts` — `relativeLuminance` + `outlineColorFor` (POL-01)
- [ ] `tests/features/mapAppearance.test.ts` — `getMapAppearance` default/merge/clear (POL-01)
- [ ] `tests/features/egoLayout.test.ts` — hop-levels + concentric value derivation (POL-03)
- [ ] Extend `tests/features/positionCache.test.ts` — `partitionCached` + `clearPositions` cases (POL-02)
- [ ] Update `e2e/graph.spec.ts` — flip `grabbable` assertion (`false`→`true`); add drag-persist/viewer-only, reset-layout, sticky-partial-cache (add-entity keeps saved positions, only newcomer placed — D-08), ego-transient specs; add `data-testid`s `graph-reset-layout`, `graph-exit-focus`, `map-label-color`, `map-connector-color`
- [ ] No framework install needed (Vitest + Playwright already present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marker label legible over a **light** background image (closes the Phase-04 UAT tests 6&7 white-on-white gap) | POL-01 | Halo contrast on real pixels is not assertable in headless canvas | Load a light map image, keep/pick a light label color, confirm the dark auto-halo makes it read; screenshot |
| Marker label legible over a **dark** background image | POL-01 | same | Load a dark map, pick a dark label color, confirm light auto-halo reads; screenshot |
| Connector casing reads over both light and dark | POL-01 | same | Screenshot pair of the cased connector line on light + dark maps |
| Reduced-motion snap (no animation) on ego re-layout / Reset layout | POL-02, POL-03 | Motion is perceptual | Enable `prefers-reduced-motion`, tap a node + Reset layout, observe instant snap (no tween) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

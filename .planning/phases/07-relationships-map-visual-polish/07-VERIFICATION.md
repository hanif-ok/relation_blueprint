---
phase: 07-relationships-map-visual-polish
verified: 2026-08-18T18:30:00Z
status: gaps_found
score: 10/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Ego focus is a TRANSIENT overlay that never overwrites the persisted base positions (POL-03, D-12, Pitfall 1)"
    status: failed
    reason: >
      The concentric ego-overlay effect itself correctly fences the auto-save with suspendSaveRef,
      but a SEPARATE effect — the partial-cache "place only the newcomer" effect in GraphView.tsx
      (lines 323-337) — calls `savePositions(cy)` directly and never checks `suspendSaveRef`. This
      effect re-runs whenever `partition` (derived from live people/groups/links) changes. If an
      entity is added while a focus session is active — e.g. a background Drive/Mega sync pull, or
      the curator adding a person via another open surface — the effect locks the CURRENTLY-DISPLAYED
      (concentric, not base) positions of the existing nodes, cose-places the newcomer around them,
      and persists that snapshot to the `graphPositions` meta row. The in-session Exit-focus restore
      (basePosRef) still looks correct to the user in that session, but the DURABLE saved base is now
      silently corrupted to the transient concentric layout — so a later reopen shows the wrong
      layout, breaking the "exiting focus restores the saved layout" guarantee for future sessions.
      This is a real, reachable code path (confirmed by direct reading of GraphView.tsx, not just the
      advisory 07-REVIEW.md WR-01 finding), and it is untested: the e2e "ego focus is transient" spec
      only exercises the no-concurrent-mutation path.
    artifacts:
      - path: "src/features/graph/GraphView.tsx"
        issue: "Partial-cache placement effect (~lines 323-337) omits the `if (suspendSaveRef.current) return;` guard that the layoutstop handler (~line 370) already has, so it can save transient concentric positions as the persisted base during an active ego-focus session."
    missing:
      - "Add `if (suspendSaveRef.current) return;` as the first check inside the partial-cache placement effect, mirroring the layoutstop guard (07-REVIEW.md WR-01's suggested fix)."
      - "Re-run placement for any newcomer added during a focus session once focus exits (e.g. reset `placedMissingRef` on exit, or include focus state in the effect's dependency set) so the newcomer is still placed after the fence lifts."
      - "Add e2e/unit coverage for the concurrent-mutation case: add an entity while `focusedId` is set, exit focus, then assert `graphPositions` still equals the pre-focus base (not the concentric snapshot)."
human_verification:
  - test: "Load a map with a light background image; keep or pick a light marker-label color; confirm the auto dark-slate halo makes the label read clearly."
    expected: "Label text is legible over the light background via the dark halo (closes the Phase-04 UAT white-on-white gap)."
    why_human: "Canvas pixel contrast is not headless-assertable (Konva renders to an opaque <canvas>); scoped as manual UAT in 07-VALIDATION.md."
  - test: "Load a map with a dark background image; pick a dark marker-label color; confirm the auto light-paper halo makes the label read clearly."
    expected: "Label text is legible over the dark background via the light halo."
    why_human: "Same as above — rendered-pixel contrast, not headless-assertable."
  - test: "Screenshot the connector casing on both a light and a dark map background, with a custom connector color set."
    expected: "The cased underlay keeps the connector line visible against both backgrounds."
    why_human: "Rendered-pixel contrast, not headless-assertable."
  - test: "Enable OS-level prefers-reduced-motion; tap a graph node to enter ego focus, then click Reset layout."
    expected: "Both the ego re-layout and the reset re-layout snap instantly with no animated tween."
    why_human: "Motion/animation absence is a perceptual property; the code path (`animate: false` on reduced-motion) is present but not automatically asserted."
---

# Phase 7: Relationships & Map Visual Polish Verification Report

**Phase Goal:** A curator can visually tailor and more fluidly navigate the already-shipped relationship/map/graph features — customize map marker name-label and connector line colors, drag graph nodes to rearrange the layout, and use a dynamic ego focus that re-lays-out the graph around the focused person and follows taps.

**Verified:** 2026-08-18
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Per-map marker-label and connector colors are customizable and persist across reloads (Dexie `meta`, no migration); defaults keep today's look (POL-01, D-05/D-06) | ✓ VERIFIED | `mapAppearance.ts` persists over the existing `db.meta` row (`git diff --exit-code src/db/schema.ts` empty); `MapView.tsx:221-222` threads `useLiveQuery(loadAppearance)` → `getMapAppearance`; `tests/features/mapAppearance.test.ts` (14 tests, all green) proves default/stored/merge/clear semantics |
| 2 | Any chosen color stays legible on light AND dark background images (structural halo/casing mechanism) (POL-01, D-04) | ? UNCERTAIN — routed to human verification | `outlineColorFor`/`relativeLuminance` unit-proven (`tests/features/color.test.ts`, 9 green); `AvatarMarker.tsx` wires `fillAfterStrokeEnabled` + `stroke={outlineColorFor(labelColor)}`; `ConnectorLayer.tsx` wires a cased underlay Arrow. Rendered-pixel contrast is NOT headless-assertable (opaque `<canvas>`) — scoped MANUAL UAT per 07-VALIDATION.md |
| 3 | A tampered/malformed stored hex is coerced to the default rather than painting an undefined color (POL-01, T-07-01) | ✓ VERIFIED | `coerceHex` gate in `mapAppearance.ts` (`HEX6` regex); explicit bad-hex test cases in `mapAppearance.test.ts` (`'red'`, `'#12'`, `'#12ZZ34'`, `'rgba(...)'`) all coerce correctly |
| 4 | Two native color pickers + per-row Reset live in the LayersPanel Appearance block and live-update the canvas | ✓ VERIFIED | `LayersPanel.tsx:295-345` renders `data-testid="map-label-color"`/`"map-connector-color"` `<input type=color>` with associated `<label>` + Reset buttons; `LayersPanel.module.css:209-274` styles present; `MapView.tsx:799-802` wires `setMapColor`/`clearMapColor` writers |
| 5 | Graph nodes are grabbable/draggable to rearrange the layout; a tap still opens the ProfileSidebar (viewer-only bridge preserved) (POL-02, D-07) | ✓ VERIFIED | `GraphView.tsx` drops `autoungrabify`; e2e `tapping a graph node opens its ProfileSidebar (viewer-only)` asserts `grabbable() === true` AND the sidebar opens — **ran live, PASSED** |
| 6 | Dragging a node persists its position on `dragfree` and NEVER mutates relationship/entity data (POL-02, D-07 viewer-only) | ✓ VERIFIED | `GraphView.tsx:356-360` `dragfree` handler calls only `savePositions`/`loadPositions` (the `graphPositions` meta row); e2e `dragging a node persists its position without mutating entity data` asserts `db.people`/`db.relationshipLinks` byte-identical before/after — **ran live, PASSED** |
| 7 | Adding a person/group keeps everyone's saved positions and auto-places ONLY the newcomer (POL-02, D-08) | ✓ VERIFIED | `positionCache.ts` `partitionCached` three-way gate (12 unit tests green); `GraphView.tsx:317-337` lock→cose→unlock→save wiring; e2e `sticky partial cache` asserts existing nodes byte-identical, newcomer non-origin/non-colliding — **ran live, PASSED** |
| 8 | A Reset layout control clears saved positions and re-runs a fresh automatic arrangement (POL-02, D-09) | ✓ VERIFIED | `GraphView.tsx:421-437` `data-testid="graph-reset-layout"` → `clearPositions()`; e2e `Reset layout clears the saved manual positions` — **ran live, PASSED** |
| 9 | Opening/tapping a node re-lays-out the WHOLE graph concentrically around that ego; tapping a different node re-egos onto it (focus follows the tap) (POL-03, D-10/D-11/D-12) | ✓ VERIFIED | `egoLayout.ts` `computeHopLevels`/`concentricValue` (11 unit tests green); `GraphView.tsx:243-315` concentric overlay effect keyed on `focusedId`; tap handler sets `focusedId` (line 350); e2e `ego focus is transient` taps Bob mid-session and asserts his ProfileSidebar opens — **ran live, PASSED** |
| 10 | Ego focus is a TRANSIENT overlay that NEVER overwrites the persisted base positions (POL-03, D-12, Pitfall 1) | ✗ **FAILED** | See Gaps Summary — WR-01: the partial-cache placement effect (`GraphView.tsx:323-337`) is NOT fenced by `suspendSaveRef` and can persist transient concentric positions over the saved base when an entity is added during an active focus session. Confirmed by direct code read, not merely an untested path. |
| 11 | Exiting focus (or closing the ProfileSidebar) restores the exact saved base layout, discarding nothing, in the no-concurrent-mutation case (POL-03, D-12/D-13) | ✓ VERIFIED | `GraphView.tsx:288-311` EXIT branch restores via `cy.nodes().positions()` (no layout, no save); e2e `ego focus is transient` asserts positions equal the pre-focus snapshot AND `graphPositions` byte-identical across focus→exit — **ran live, PASSED**. Caveat: this proof does not cover the concurrent-mutation path broken by truth #10. |
| 12 | Exit focus and Reset layout are distinct and never conflate (POL-03, D-13) | ✓ VERIFIED | `GraphView.tsx:438-451` `graph-exit-focus` button only calls `setFocusedId(null)` (no `clearPositions`); `Reset layout` button only calls `clearPositions()`; e2e proves each independently |

**Score:** 10/12 truths verified (1 uncertain — routed to human/manual UAT; 1 failed — gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/common/color.ts` | `relativeLuminance` + `outlineColorFor` pure helpers | ✓ VERIFIED | Both exported, pure, unit-tested (9 tests green) |
| `src/features/person-map/mapAppearance.ts` | Per-map colour persistence over `db.meta` | ✓ VERIFIED | `loadAppearance`/`getMapAppearance`/`setMapColor`/`clearMapColor` all present, wired, tested (14 tests green) |
| `src/features/person-map/AvatarMarker.tsx` | `labelColor` prop + luminance halo | ✓ VERIFIED | `fillAfterStrokeEnabled` + `stroke={outlineColorFor(labelColor)}` present (line 273-284) |
| `src/features/person-map/editor/ConnectorLayer.tsx` | `connectorColor` prop + cased underlay | ✓ VERIFIED | Casing Arrow + colored Arrow present (lines 107-138) |
| `src/features/person-map/editor/LayersPanel.tsx` | Appearance block with two pickers + Reset | ✓ VERIFIED | Lines 295-345 |
| `src/features/person-map/MapView.tsx` | `useLiveQuery(loadAppearance)` threading | ✓ VERIFIED | Lines 221-222, 799-802, 863, 915 |
| `src/features/graph/positionCache.ts` | `partitionCached` + `clearPositions` | ✓ VERIFIED | Both exported, pure/async respectively, 12 unit tests |
| `src/features/graph/GraphView.tsx` | Grabbable nodes, dragfree persist, three-way gate, Reset button, `suspendSaveRef` | ✓ VERIFIED (POL-02 parts); ⚠️ **PARTIAL** (POL-03 save-guard is incomplete — WR-01) | `suspendSaveRef` exists and correctly guards the `layoutstop` handler (line 370) and is set/cleared correctly by the concentric overlay effect (lines 273, 301, 308) — but the newcomer-placement effect (line 334) is NOT guarded |
| `src/features/graph/egoLayout.ts` | `computeHopLevels` + `concentricValue` | ✓ VERIFIED | Both exported, pure, 11 unit tests |
| `e2e/graph.spec.ts` | grabbable flip, drag-persist, reset, sticky-partial-cache, ego-transient specs | ✓ VERIFIED | All 5 specs present AND executed live in this verification — **5/5 passed** |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `mapAppearance.ts` | `db.meta` | `db.meta.get/put` under key `mapAppearance` | ✓ WIRED | Confirmed in source; no `db.version()` bump |
| `MapView.tsx` | `mapAppearance.ts` | `useLiveQuery(loadAppearance)` → `getMapAppearance` | ✓ WIRED | Lines 221-222 |
| `MapView.tsx` | `AvatarMarker`/`ConnectorLayer` | `labelColor`/`connectorColor` props | ✓ WIRED | Lines 863, 915 |
| `LayersPanel.tsx` | `mapAppearance.ts` (via MapView) | `onChange` → `setMapColor`/`clearMapColor` | ✓ WIRED | Lines 799-802 |
| `GraphView.tsx` | `positionCache.ts` | `dragfree`/`layoutstop` → `savePositions`; Reset → `clearPositions` | ✓ WIRED | Lines 356-360, 367-380, 421-437 |
| `GraphView.tsx` | `egoLayout.ts` | tap → `focusedId` → adjacency → `computeHopLevels` → concentric layout | ✓ WIRED | Lines 262-286 |
| `GraphView.tsx` (concentric overlay) | `suspendSaveRef` fence | set true on enter, false on exit | ✓ WIRED | Lines 273, 301, 308 |
| `GraphView.tsx` (**newcomer-placement effect**) | `suspendSaveRef` fence | expected but **absent** | ✗ **NOT WIRED** | Line 334 calls `savePositions(cy)` with no `suspendSaveRef` check — the WR-01 gap |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| POL-01 | 07-01, 07-02 | Customizable map label/connector colors, per-map, persisted, legible defaults | ✓ SATISFIED | All artifacts + tests verified; pixel-legibility is scoped manual UAT |
| POL-02 | 07-03 | Viewer-only draggable graph nodes, sticky positions, Reset escape hatch | ✓ SATISFIED | All artifacts + e2e specs verified live |
| POL-03 | 07-04 | Dynamic ego focus — re-lays-out around ego, follows taps, exit restores base | ✗ **BLOCKED** | Core dynamic-focus behavior (re-layout, follow-taps, in-session exit-restore) is verified, but the "never overwrites the persisted base" guarantee (D-12, Pitfall 1) has a confirmed unfenced code path (WR-01) |

No orphaned requirements — POL-01/02/03 are the only Phase-7 requirements in REQUIREMENTS.md, and all three are claimed across the four plans' frontmatter.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 9 files modified this phase (`color.ts`, `mapAppearance.ts`, `positionCache.ts`, `egoLayout.ts`, `GraphView.tsx`, `AvatarMarker.tsx`, `ConnectorLayer.tsx`, `LayersPanel.tsx`, `MapView.tsx`). No stub/empty-implementation patterns found.

The advisory 07-REVIEW.md flagged two additional warnings not treated as phase-goal blockers here:
- **WR-02** (`ConnectorLayer.tsx:107-108`): a custom connector color renders fully opaque instead of at the documented 55% default alpha. This is a cosmetic/consistency deviation from the mapAppearance.ts doc comment, not a break of success criterion 1 (the connector still reads legibly via the casing mechanism, and the color still persists). Not a gap for this phase's goal, but worth fixing for consistency.
- **WR-03** (`MapView.tsx`): `selectedRelationshipId` is never passed to `ConnectorLayer` on the map surface, so the amber-selected-connector path is unreachable there. This predates Phase 7 (the prop/wiring gap is on the map's REL-03 selection surface, not on anything POL-01/02/03 introduced) and is orthogonal to this phase's success criteria — not a Phase-7 gap.

### Behavioral Spot-Checks / Live Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-7 unit suite (color/mapAppearance/positionCache/egoLayout) | `npx vitest run tests/features/{color,mapAppearance,positionCache,egoLayout}.test.ts` | 4 files, 42 tests, all passed | ✓ PASS |
| TypeScript compiles | `npx tsc -p tsconfig.json --noEmit` | Clean, no errors | ✓ PASS |
| `src/db/schema.ts` unchanged | `git diff --exit-code src/db/schema.ts` | Empty diff | ✓ PASS (no migration) |
| `package.json` unchanged | `git diff --exit-code package.json` | Empty diff | ✓ PASS (zero new deps) |
| Full graph e2e suite | `npx playwright test e2e/graph.spec.ts --reporter=list` (real build + preview server, e2e mode) | 5/5 specs passed (grabbable-flip, drag-persist, reset-layout, sticky-partial-cache, ego-transient) | ✓ PASS |

All automated checks were executed directly by this verifier (not sourced from SUMMARY.md claims).

### Human Verification Required

See frontmatter `human_verification` — four items, all scoped MANUAL UAT per 07-VALIDATION.md (rendered-pixel legibility on light/dark backgrounds, connector casing, and reduced-motion snap). None of these are assertable headlessly because Konva/Cytoscape render to an opaque `<canvas>`.

### Gaps Summary

One blocking gap: **WR-01 — the ego-focus save-fence is incomplete.** The phase's headline POL-03 mechanism (concentric overlay, follow-the-tap, in-session snapshot/restore) is fully built, wired, and proven by a live e2e run. However, the specific guarantee the plan calls out as the "single biggest landmine" (07-04-PLAN.md: "Pitfall 1 — the existing global `layoutstop` auto-save would clobber the base the instant the transient concentric ego runs") is only PARTIALLY closed: the `layoutstop` handler is correctly fenced, but a second, independently-triggered effect (the POL-02 "place only the newcomer" partial-cache effect) writes to the same `graphPositions` row without checking the fence. Because this effect re-runs on any live-query change to the node-set (an entity add — including from a background Drive/Mega sync pull, which is this app's core architecture), a focus session that overlaps a data mutation will silently corrupt the durable saved base layout. The in-session UX still looks correct (Exit focus restores from `basePosRef`, an in-memory snapshot), which is why the existing e2e test suite does not catch it — the corruption only becomes visible on a later reopen. This was independently confirmed by reading `GraphView.tsx` directly (not merely trusting 07-REVIEW.md), and the fix is a one-line guard mirroring the existing `layoutstop` pattern, exactly as 07-REVIEW.md WR-01 proposes, plus a re-run-after-exit provision and a regression test for the concurrent-mutation case.

No override is suggested for this gap — it directly contradicts a must-have the plan itself calls "the single biggest landmine," so it should be closed rather than accepted.

---

_Verified: 2026-08-18_
_Verifier: Claude (gsd-verifier)_

---
phase: 07-relationships-map-visual-polish
verified: 2026-08-19T12:00:00Z
status: verified
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification_completed: 2026-08-20T00:00:00Z (via 07-UAT.md — 4/4 manual items passed)
re_verification:
  previous_status: gaps_found
  previous_score: 10/12
  gaps_closed:
    - "Ego focus is a TRANSIENT overlay that never overwrites the persisted base positions (POL-03, D-12, Pitfall 1) — WR-01"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Load a map with a light background image; keep or pick a light marker-label color; confirm the auto dark-slate halo makes the label read clearly."
    expected: "Label text is legible over the light background via the dark halo (closes the Phase-04 UAT white-on-white gap)."
    why_human: "Canvas pixel contrast is not headless-assertable (Konva renders to an opaque <canvas>); scoped as manual UAT in 07-VALIDATION.md."
  - test: "Load a map with a dark background image; pick a dark marker-label color; confirm the auto light-paper halo makes the label read clearly."
    expected: "Label text is legible over the dark background via the light halo."
    why_human: "Same as above — rendered-pixel contrast, not headless-assertable."
  - test: "Screenshot the connector casing on both a light and a dark map background, with a custom connector color set."
    expected: "The cased underlay keeps the connector line visible against both backgrounds; the custom color now also renders at the same 0.55 resting alpha as the default hairline (WR-02)."
    why_human: "Rendered-pixel contrast, not headless-assertable."
  - test: "Enable OS-level prefers-reduced-motion; tap a graph node to enter ego focus, then click Reset layout."
    expected: "Both the ego re-layout and the reset re-layout snap instantly with no animated tween."
    why_human: "Motion/animation absence is a perceptual property; the code path (`animate: false` on reduced-motion) is present but not automatically asserted."
---

# Phase 7: Relationships & Map Visual Polish Verification Report

**Phase Goal:** Customizable map/graph appearance (label + connector colors), draggable graph node layout, and dynamic ego-focus re-layout — folds in the Phase-04 UAT enhancement todos.

**Verified:** 2026-08-19
**Status:** human_needed
**Re-verification:** Yes — after gap closure (07-05 gap-closure plan)

## Goal Achievement

### Gap-Closure Verification (07-05)

This is a re-verification following gap-closure plan 07-05, which targeted the single blocking gap
(WR-01) plus two advisory findings (WR-02, WR-03) from the prior 07-VERIFICATION.md / 07-REVIEW.md.
All three were independently re-confirmed against the actual source and by re-running the tests
myself (not sourced from SUMMARY.md claims):

**WR-01 (blocking gap, truth #10) — CLOSED.**
- `src/features/graph/GraphView.tsx:348-360` — the partial-cache newcomer-placement effect's first
  statement after the `if (!cy) return;` null-check is `if (suspendSaveRef.current) return;`
  (line 351), placed BEFORE the `partition.noneCached || partition.missing.length === 0`
  early-return (line 352) and BEFORE `placedMissingRef.current = sig` (line 355) — confirmed by
  direct read, mirrors the `layoutstop` guard's fence pattern exactly.
- The effect no longer calls `savePositions(` at all (confirmed: `grep -n savePositions
  GraphView.tsx` shows it only inside the `dragfree` handler (line 380) and the `layoutstop`
  handler (line 400) — persistence flows through a single fenced path (IN-01 collapse verified).
- A `postFocusPlaceTick` `useState` counter (line 99) is in the placement effect's dependency array
  (`[partition, postFocusPlaceTick]`, line 360) and is bumped in BOTH concentric-overlay exit
  paths immediately after `suspendSaveRef.current = false`: the synchronous `basePosRef` path
  (line 310 sets false, line 315 bumps) and inside the async `loadPositions().then(...)` callback
  of the fallback path (line 321 sets false, line 326 bumps, both inside the same callback).
- The new concurrent-mutation regression spec (`e2e/graph.spec.ts:422-539`, "ego focus + concurrent
  entity-add: exit keeps the base and places the newcomer (WR-01 fence)") was RUN LIVE by this
  verifier: `npx playwright test e2e/graph.spec.ts --reporter=list` → **6/6 passed**, including this
  spec. It asserts (a) the pre-existing nodes' persisted `graphPositions` equal the pre-focus base
  after a mid-focus entity-add + exit, and (b) the mid-focus newcomer is placed (non-origin) once
  focus exits.
- `git diff --exit-code src/db/schema.ts` and `package.json` — both empty (re-confirmed independently).

**WR-02 — CLOSED.** `src/features/person-map/editor/ConnectorLayer.tsx:103` —
`const lineStroke = connectorColor ? hexToRgba(connectorColor, 0.55) : CONNECTOR_HAIRLINE;`
confirmed by direct read: a custom connector color now renders at the same 0.55 resting alpha as
the default hairline, matching the documented render-time-alpha contract.

**WR-03 — CLOSED.** `rg -n selectedRelationshipId src/features/person-map` (re-run independently) →
zero matches. `src/features/person-map/connectors.ts` no longer declares `Connector.selected` or
`BuildConnectorsOptions.selectedRelationshipId`; `ConnectorLayer.tsx` no longer destructures
`selected` or branches on it — `topWidth` is the constant `1.75` (line 104). `MapView.tsx:857`
(the sole consumer) passes no selection prop, confirmed by grep.

**07-05 must_haves and prohibitions — all held:**
- Viewer-only write boundary preserved: `positionCache.ts` (`savePositions`/`loadPositions`/
  `clearPositions`) touches ONLY `db.meta` under the `graphPositions` key; no `db.people` /
  `db.groups` / `db.relationshipLinks` reference exists anywhere in `GraphView.tsx` or
  `positionCache.ts` (confirmed by reading both files in full). The existing e2e drag-persist spec
  (re-run live) asserts entity tables stay byte-identical.
- No Dexie schema/version bump, zero new dependencies — `git diff --exit-code src/db/schema.ts` and
  `package.json` both empty (independently re-run).
- No unreachable connector-selection code remains — `rg -n selectedRelationshipId` and
  `rg -n selected src/features/person-map/connectors.ts` both empty (independently re-run).

**Advisory follow-up (non-blocking).** 07-REVIEW.md's WR-01 warning still applies to the delta as
shipped: the async exit-fallback's `loadPositions().then(...)` callback (GraphView.tsx:318-327) has
no `.catch` and no `cancelled`/mounted guard — confirmed present in the current source. If
`loadPositions()` rejects, `suspendSaveRef.current` would stay stuck `true`, permanently disabling
further layout saves for that session, and a post-unmount resolution could throw against a
destroyed `cy`. This is a real robustness gap but does not block any must_have (the happy path is
fully fenced and regression-tested); recorded here as a recommended follow-up, not a phase gap.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Per-map marker-label and connector colors are customizable and persist across reloads (Dexie `meta`, no migration); defaults keep today's look (POL-01, D-05/D-06) | ✓ VERIFIED | Unaffected by 07-05; `mapAppearance.ts` unchanged, 14 unit tests still green (re-run in full suite: 388/388) |
| 2 | Any chosen color stays legible on light AND dark background images (structural halo/casing mechanism) (POL-01, D-04) | ? UNCERTAIN — routed to human verification | Unaffected by 07-05; rendered-pixel contrast not headless-assertable, scoped MANUAL UAT |
| 3 | A tampered/malformed stored hex is coerced to the default rather than painting an undefined color (POL-01, T-07-01) | ✓ VERIFIED | Unaffected by 07-05; `coerceHex` gate unchanged |
| 4 | Two native color pickers + per-row Reset live in the LayersPanel Appearance block and live-update the canvas | ✓ VERIFIED | Unaffected by 07-05; `LayersPanel.tsx` unchanged |
| 5 | Graph nodes are grabbable/draggable to rearrange the layout; a tap still opens the ProfileSidebar (viewer-only bridge preserved) (POL-02, D-07) | ✓ VERIFIED | Re-run live: `tapping a graph node opens its ProfileSidebar` e2e spec — PASSED |
| 6 | Dragging a node persists its position on `dragfree` and NEVER mutates relationship/entity data (POL-02, D-07 viewer-only) | ✓ VERIFIED | Re-run live: `dragging a node persists its position without mutating entity data` e2e spec — PASSED (people/links byte-identical) |
| 7 | Adding a person/group keeps everyone's saved positions and auto-places ONLY the newcomer (POL-02, D-08) | ✓ VERIFIED | Re-run live: `sticky partial cache` e2e spec — PASSED |
| 8 | A Reset layout control clears saved positions and re-runs a fresh automatic arrangement (POL-02, D-09) | ✓ VERIFIED | Re-run live: `Reset layout clears the saved manual positions` e2e spec — PASSED |
| 9 | Opening/tapping a node re-lays-out the WHOLE graph concentrically around that ego; tapping a different node re-egos onto it (focus follows the tap) (POL-03, D-10/D-11/D-12) | ✓ VERIFIED | Re-run live: `ego focus is transient` e2e spec — PASSED |
| 10 | Ego focus is a TRANSIENT overlay that NEVER overwrites the persisted base positions, including under a CONCURRENT mutation during an active focus session (POL-03, D-12, Pitfall 1, WR-01) | ✓ VERIFIED (gap closed) | Source: `suspendSaveRef` fence is the placement effect's first check (GraphView.tsx:351), before `placedMissingRef` is recorded; single persistence path via fenced `layoutstop` (IN-01, no `savePositions` in the placement effect). Behavioral evidence: NEW concurrent-mutation e2e spec re-run live by this verifier — **PASSED** (base preserved + newcomer placed post-exit) |
| 11 | Exiting focus (or closing the ProfileSidebar) restores the exact saved base layout, discarding nothing, in the no-concurrent-mutation case (POL-03, D-12/D-13) | ✓ VERIFIED | Re-run live: `ego focus is transient` e2e spec — PASSED |
| 12 | Exit focus and Reset layout are distinct and never conflate (POL-03, D-13) | ✓ VERIFIED | Unaffected by 07-05; source unchanged (`graph-exit-focus` calls only `setFocusedId(null)`) |
| 13 | A custom connector line color renders at 0.55 resting alpha, matching the default translucent hairline weight (POL-01, WR-02) | ✓ VERIFIED (gap closed) | Source: `ConnectorLayer.tsx:103` `connectorColor ? hexToRgba(connectorColor, 0.55) : CONNECTOR_HAIRLINE` |
| 14 | The map connector surface carries no unreachable relationship-selection code after WR-03 removal (POL-01) | ✓ VERIFIED (gap closed) | `rg -n selectedRelationshipId src/features/person-map` — zero matches (re-run independently); `connectors.ts`/`ConnectorLayer.tsx` fully cleaned |

**Score:** 13/14 truths verified (1 uncertain — routed to human/manual UAT; 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/graph/GraphView.tsx` | `suspendSaveRef`-fenced newcomer-placement effect + fence-lifted re-place trigger; IN-01 single-persistence collapse | ✓ VERIFIED | Fence at line 351, tick re-trigger at lines 99/315/326/360, no `savePositions` in the placement effect |
| `e2e/graph.spec.ts` | Concurrent-mutation regression spec | ✓ VERIFIED | Present at lines 422-539; re-run live, PASSED |
| `src/features/person-map/editor/ConnectorLayer.tsx` | Custom connector color at 0.55 render-time alpha; selection prop + amber branch removed | ✓ VERIFIED | Line 103 alpha expression; no `selected` reference remains |
| `src/features/person-map/connectors.ts` | `buildConnectors` with `selectedRelationshipId` option + `Connector.selected` field removed | ✓ VERIFIED | Full-file read confirms both removed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `GraphView.tsx` (newcomer-placement effect) | `suspendSaveRef` | first-check fence mirrors the `layoutstop` guard | ✓ WIRED (was NOT WIRED — the closed gap) | Line 351 |
| `GraphView.tsx` (concentric-overlay exit branches) | the placement effect | `postFocusPlaceTick` bumped after `suspendSaveRef.current = false` in both exit paths | ✓ WIRED | Lines 310/315 (sync), 321/326 (async) |
| `ConnectorLayer.tsx` | `src/features/common/color.ts` | `hexToRgba(connectorColor, 0.55)` at render time | ✓ WIRED | Line 103 |
| `positionCache.ts` | `db.meta` (key `graphPositions`) ONLY | `savePositions`/`loadPositions`/`clearPositions` | ✓ WIRED (viewer-only boundary intact) | Full-file read confirms no entity-table reference |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| POL-01 | 07-01, 07-02, 07-05 | Customizable map label/connector colors, per-map, persisted, legible defaults; render-time alpha; no dead selection code | ✓ SATISFIED | All artifacts + tests verified; WR-02/WR-03 closed; pixel-legibility remains scoped manual UAT |
| POL-02 | 07-03, 07-05 | Viewer-only draggable graph nodes, sticky positions, Reset escape hatch | ✓ SATISFIED | All artifacts + e2e specs re-verified live |
| POL-03 | 07-04, 07-05 | Dynamic ego focus — re-lays-out around ego, follows taps, exit restores base, NEVER corrupts base even under concurrent mutation | ✓ SATISFIED (was BLOCKED) | WR-01 gap closed: fence + single persistence path + passing regression spec, all independently re-verified |

No orphaned requirements — POL-01/02/03 are the only Phase-7 requirements in REQUIREMENTS.md, and all three are claimed across plans 07-01 through 07-05's frontmatter.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 4 files modified by
07-05 (`GraphView.tsx`, `e2e/graph.spec.ts`, `ConnectorLayer.tsx`, `connectors.ts`) — re-confirmed
by direct grep. No stub/empty-implementation patterns found.

One advisory (non-blocking) robustness finding carried from 07-REVIEW.md, independently re-confirmed
present in the current source: the async exit-fallback's `loadPositions().then(...)` callback
(`GraphView.tsx:318-327`) has no `.catch` and no `cancelled`/mounted guard, unlike the sibling
mount-time effects in the same file. See "Advisory follow-up" above.

### Behavioral Spot-Checks / Live Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles | `npx tsc -p tsconfig.json --noEmit` | Clean, no errors | ✓ PASS |
| Full unit suite | `npx vitest run` | 60 files, 388 tests, all passed | ✓ PASS |
| Connectors + positionCache unit suites (isolated) | `npx vitest run tests/features/connectors.test.ts tests/features/positionCache.test.ts` | 19 tests, all passed | ✓ PASS |
| Full graph e2e suite (incl. NEW concurrent-mutation spec) | `npx playwright test e2e/graph.spec.ts --reporter=list` (real build + preview, e2e mode) | 6/6 specs passed (grabbable-flip, drag-persist, reset-layout, sticky-partial-cache, ego-transient, **concurrent-mutation/WR-01**) | ✓ PASS |
| Connector + relationship e2e specs | `npx playwright test e2e/connectors.spec.ts e2e/relationships.spec.ts --reporter=list` | 2/2 passed | ✓ PASS |
| `src/db/schema.ts` unchanged | `git diff --exit-code src/db/schema.ts` | Empty diff | ✓ PASS (no migration) |
| `package.json` unchanged | `git diff --exit-code package.json` | Empty diff | ✓ PASS (zero new deps) |
| No dangling `selectedRelationshipId` | `rg -n selectedRelationshipId src/features/person-map` | No matches | ✓ PASS |

All checks above were executed directly by this verifier in this session (not sourced from
SUMMARY.md or 07-REVIEW.md claims).

### Human Verification Required

See frontmatter `human_verification` — four items, all scoped MANUAL UAT per 07-VALIDATION.md
(rendered-pixel legibility on light/dark backgrounds, connector casing at the corrected 0.55 alpha,
and reduced-motion snap). None of these are assertable headlessly because Konva/Cytoscape render to
an opaque `<canvas>`. These items are carried forward unchanged from the prior verification — 07-05
did not touch the code paths they cover, other than the WR-02 alpha value itself (which is now
source-verified; only the rendered-pixel appearance needs a human look).

### Gaps Summary

No gaps remain. The single blocking gap from the prior verification (WR-01 — the ego-focus
save-fence was incomplete on the newcomer-placement effect) is closed: the effect is now fenced by
`suspendSaveRef` exactly as the `layoutstop` handler is, persistence flows through one path, a
fence-lifted re-trigger places any mid-focus newcomer once focus exits (both sync and async restore
paths), and a new regression spec proves it — RED pre-fix / GREEN post-fix, independently re-run
GREEN by this verifier. The two advisory findings (WR-02 connector alpha, WR-03 dead selection code)
are also closed. One non-blocking robustness note (missing `.catch` on the async exit-fallback
promise) is carried forward as a recommended follow-up, not a gap.

Status is `human_needed` rather than `passed` solely because of the four pre-existing, scoped-manual
UAT items (rendered-pixel legibility + reduced-motion snap) — none of which were reopened or
affected by this gap-closure work.

---

_Verified: 2026-08-19_
_Verifier: Claude (gsd-verifier)_

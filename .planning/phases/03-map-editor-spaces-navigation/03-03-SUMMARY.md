---
phase: 03-map-editor-spaces-navigation
plan: 03
subsystem: map-editor
tags: [konva, react-konva, tool-mode-state-machine, gesture-disambiguation, shapes, zones, radix-dialog, image-space-coords, xss-safe-canvas-text]

# Dependency graph
requires:
  - phase: 03-map-editor-spaces-navigation
    plan: 02
    provides: "coords.ts imageToStage/stageToImage; MapView as a 3-physical-layer active-map editor; updateMap covers MapDoc.shapes/layers; AvatarMarker position prop; testBridge.updateMap"
  - phase: 03-map-editor-spaces-navigation
    plan: 01
    provides: "MapDoc.shapes/layers + Shape/Layer types + ShapeSchema/LayerSchema; tokens.ts portal hue + zonePresets"
provides:
  - "useToolMode: the pure pan/draw/select interaction state machine (Tool union, deriveStageDraggable, isDrawMode, begin/update/commit draw + polygon helpers, MIN_DRAW_SIZE guard) + a thin React hook"
  - "ToolPalette (D-17): 7 tools, Select default + amber-active, roving focus, 44/48px hits, disabled-with-reason"
  - "ShapeNode: renders rect/ellipse/line/polygon composed through backgroundTransform; drag-persists via updateMap"
  - "ZoneLabel: Konva Text chip for a shape's label (XSS-safe, T-03-01 — never innerHTML)"
  - "StylePopover (D-02/D-03): 5-preset palette + fill toggle (off for lines) + zone label, on installed Radix Dialog"
  - "MapView draw-wiring: pointer events route through useToolMode to draw/commit shapes; renders shapes+labels+preview in L1; selection opens StylePopover; two-finger seam"
  - "tokens.css: portal hue + 5 zone-preset hexes mirrored from tokens.ts (canvas/DOM parity)"
affects: [transformer overlay (03-04), layers panel + z-ordering (03-05), portal placement (03-06)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tool-mode/gesture state machine as a PURE reducer (begin/update/commit/addVertex/closePolygon + deriveStageDraggable) so it is unit-tested without a DOM; the React hook is a thin wrapper (RESEARCH Pattern 2/6, 'Don't Hand-Roll')"
    - "Shape geometry stored in IMAGE space, composed at render via imageToStage (same anchoring as markers, Pattern 7); drag-end converts back via stageToImage delta"
    - "ALL user canvas text renders as a Konva Text child only — never dangerouslySetInnerHTML (XSS boundary T-03-01)"
    - "In-progress draw mirrored into a ref (drawRef) so pointer-move/up read the LIVE draft, not a stale render closure — fixes commit-on-pointerup under fast event sequencing"
    - "Reused the INSTALLED @radix-ui/react-dialog for the StylePopover rather than adding @radix-ui/react-popover (threat T-03-SC: no new dependency)"

key-files:
  created:
    - src/features/person-map/editor/useToolMode.ts
    - src/features/person-map/editor/ToolPalette.tsx
    - src/features/person-map/editor/ToolPalette.module.css
    - src/features/person-map/editor/ShapeNode.tsx
    - src/features/person-map/editor/ZoneLabel.tsx
    - src/features/person-map/editor/StylePopover.tsx
    - src/features/person-map/editor/StylePopover.module.css
    - tests/features/useToolMode.test.ts
    - tests/features/shapes.test.ts
    - e2e/draw-shapes.spec.ts
  modified:
    - src/features/person-map/MapView.tsx
    - src/app/tokens.css

key-decisions:
  - "Extracted the draw state machine as PURE exported helpers (begin/update/commit/addPolygonVertex/closePolygon + deriveStageDraggable/isDrawMode) so the heart of MAP-02 is tested without rendering; useToolMode is a thin hook over them"
  - "Polygon multi-click + Esc-cancel are deferred to 03-04 (alongside the Transformer); the pure polygon helpers already exist and are tested, but MapView wires only rect/ellipse/line drag-draw now (the plan's '(later) ' note + 03-04 ownership)"
  - "StylePopover built on the installed Radix Dialog (not a newly-added Popover) — the plan's explicit fallback, and the lighter-dependency choice for T-03-SC"
  - "ensureDefaultLayer creates the default 'Markers' layer on the fly when a freshly-created map has an empty layers array, so a drawn shape never references a dangling layerId (createMap seeds layers:[]; only the v4 upgrade backfills the default layer)"

patterns-established:
  - "Pure interaction-state-machine + thin React hook is the template for the editor's custom logic (the genuinely-new pieces RESEARCH flagged)"
  - "drawRef-mirror pattern for canvas gestures where a synchronous down→move→up must not read stale state"

requirements-completed: [MAP-02]

# Metrics
duration: 29min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 03: Tool Palette, Draw State Machine, Shapes & Style Popover Summary

**Delivered the MAP-02 vertical slice: a seven-tool palette (D-17), the pure pan/draw/select interaction state machine with touch parity wired in from the start (D-19), Rect/Ellipse/Line/Polygon shapes composed through the background transform and persisted on MapDoc.shapes (D-01), and a minimal Radix-Dialog style popover with the five-preset palette + fill toggle + XSS-safe zone label (D-02/D-03) — a user can now draw and style rooms/areas/zones on a map.**

## Performance
- **Duration:** ~29 min
- **Started:** 2026-06-27T00:14:25Z
- **Completed:** 2026-06-27T00:43:43Z
- **Tasks:** 3 (Task 1 TDD)
- **Files:** 12 (10 created, 2 modified)
- **Tests:** 228 unit (40 files) green; draw-shapes E2E (2 tests) green

## Accomplishments
- **useToolMode** is the heart of the editor's custom logic (RESEARCH "Don't Hand-Roll"): a PURE reducer exported as `beginDraw`/`updateDraw`/`commitDraw`/`addPolygonVertex`/`closePolygon` plus `deriveStageDraggable`/`isDrawMode`, with a thin React hook on top. Select is default; draw modes suppress single-pointer pan (so a drag DRAWS, Pitfall 3); a two-finger gesture always pans/pinches (Pattern 6); a `MIN_DRAW_SIZE` threshold rejects degenerate draws (T-03-11). Tested without a DOM (12 cases).
- **ToolPalette** (D-17): seven Lucide tools (Select/Rect/Ellipse/Line/Polygon/Portal/Person), Select first/default with a 2px amber active bar + paper-shade fill, single-key shortcuts in tooltips (V/R/O/L/P/T/M), 44px/48px-coarse hit targets, arrow-key roving focus (one tab stop), disabled-with-reason when no map.
- **ShapeNode** renders each `Shape` as the matching Konva primitive (`Rect`/`Ellipse`/`Line`/`Line closed`), reading geometry in IMAGE space and composing through `imageToStage` exactly like a marker; line shapes get a generous `hitStrokeWidth` for touch; drag-end converts back via `stageToImage` and persists the whole shapes array through `updateMap` (never straight to Dexie).
- **ZoneLabel** renders a shape's label as a paper-shade Konva `Text` pill — user text flows straight into the Konva `Text` prop, NEVER innerHTML (threat T-03-01).
- **StylePopover** (D-02/D-03) on the installed Radix Dialog: a 5-swatch preset palette (Stone/Sage/Clay/Dusk/Plum) with an amber selection ring, a Fill on/off toggle (forced off + disabled for lines), and a zone-label input — each change writes through `updateMap`. A clearly-marked seam is left for the 03-05 move-to-layer dropdown.
- **MapView** mounts the ToolPalette, routes Stage `onPointerDown/Move/Up` + `onTouchStart/End` through the tool-mode handlers, drives `Stage.draggable` from `stageDraggable`, renders shapes + zone-label chips + a live draw preview in L1 (below markers), opens the StylePopover on shape select, and keeps the two-finger pan/pinch seam (`stage.stopDrag()`).
- **tokens.css** mirrors the portal hue (`#3e6b8c`, canonical `#3E6B8C`) and the five zone-preset stroke hexes from `tokens.ts` so canvas (`.ts`) and DOM (`.css`) read one source of truth.

## Task Commits
1. **Task 1: useToolMode state machine + test (TDD)** — `104363e` (feat)
2. **Task 2: ToolPalette + ShapeNode + ZoneLabel + StylePopover + tokens.css** — `b4d1ce7` (feat)
3. **Task 3: MapView draw-wiring + shapes.test + draw-shapes E2E** — `681d034` (feat)

## Decisions Made
See `key-decisions` frontmatter. Headlines: the draw machine is a pure tested reducer (the React hook is a thin wrapper); polygon multi-click is deferred to 03-04 (its pure helpers exist + are tested); the StylePopover reuses the installed Radix Dialog (no new dependency, T-03-SC).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] commit-on-pointerup dropped the shape under fast event sequencing**
- **Found during:** Task 3 (draw-shapes E2E)
- **Issue:** `handlePointerUp` read the in-progress `draw` from its render closure. A rapid down→move→up sequence (and any synthetic test sequence) fires before React flushes the `setDraw` state, so pointer-up saw `draw === null` and silently committed nothing — the live preview rendered but no shape persisted.
- **Fix:** Mirror the in-progress draw into a `drawRef` (`setDrawTracked` updates ref + state together); pointer-move/up read `drawRef.current`. This also hardens real-world rapid drags, not just the test.
- **Files modified:** src/features/person-map/MapView.tsx
- **Committed in:** `681d034` (Task 3).

**2. [Rule 2 - Missing critical functionality] a drawn shape could reference a dangling layerId**
- **Found during:** Task 3 (MapView wiring)
- **Issue:** `Shape.layerId` is required (D-04), but `createMap` seeds `layers: []` (only the version(4) upgrade backfills the default "Markers" layer for pre-existing maps). A shape drawn on a freshly-created map would reference a layer that doesn't exist.
- **Fix:** `ensureDefaultLayer(map.layers)` returns the first layer's id, or creates the default "Markers" layer (order 0) on the fly and persists it alongside the shape via the same `updateMap` call.
- **Files modified:** src/features/person-map/MapView.tsx (+ asserted in tests/features/shapes.test.ts)
- **Committed in:** `681d034` (Task 3).

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing-functionality). No scope creep; no architectural changes.

## Threat Mitigations Applied
- **T-03-01** (XSS via zone labels exfiltrating the Drive token): ZoneLabel renders user text as a Konva `Text` child only — never `dangerouslySetInnerHTML`. Asserted by the acceptance grep (0 innerHTML usages) and the component's single-path text rendering.
- **T-03-11** (degenerate/oversized geometry): `MIN_DRAW_SIZE` rejects below-threshold drags so a fat-finger tap never commits a zero-size shape; `commitDraw`/`closePolygon` return `null` for degenerate input (unit-tested). ShapeNode tolerates absent/empty geometry. (Cloud-load `ShapeSchema` validation from 03-01 still guards at-rest data.)
- **T-03-SC** (new-dependency supply-chain risk): avoided adding `@radix-ui/react-popover` — reused the already-installed `@radix-ui/react-dialog` for the StylePopover (the plan's explicit fallback).

## Known Stubs
- **Polygon drawing in MapView** is deferred: the ToolPalette exposes the Polygon tool and the pure `addPolygonVertex`/`closePolygon` helpers exist and are tested, but MapView wires only rect/ellipse/line drag-draw now. Polygon multi-click + Esc-cancel land in 03-04 alongside the Transformer (the plan's "(later)" note). Picking the Polygon tool currently no-ops on pointer-down — no data hazard.
- **Per-layer z-ordering** is deferred to 03-05: shapes render in array order in the single L1 content layer (below markers). The fixed 3-physical-layer structure is unchanged.
- **Move-to-layer dropdown** in the StylePopover is a clearly-marked seam (arrives in 03-05).
- **Shape rotation/resize Transformer** is not attached here (03-04 owns the L2 transformer-overlay); ShapeNode already reads `shape.rotation` so the Transformer can drive it later.

## User Setup Required
None — no external service configuration, no new package installed.

## Self-Check: PASSED

All 10 created files + 2 modified files exist on disk; all 3 commits (104363e, b4d1ce7, 681d034) present in git history. `npx tsc --noEmit` clean; 228/228 unit tests green (40 files); `npx playwright test e2e/draw-shapes.spec.ts` 2/2 green. Acceptance greps satisfied (7 tool glyphs, ShapeNode primitives + updateMap, 0 ZoneLabel innerHTML, tokens.css 3E6B8C, MapView ToolPalette/ShapeNode/stageDraggable).

---
*Phase: 03-map-editor-spaces-navigation*
*Completed: 2026-06-27*

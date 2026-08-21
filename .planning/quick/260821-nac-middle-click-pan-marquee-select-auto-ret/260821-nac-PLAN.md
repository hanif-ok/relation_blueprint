---
phase: quick-260821-nac
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/person-map/editor/useToolMode.ts
  - src/features/person-map/editor/marquee.ts
  - src/features/person-map/MapView.tsx
  - src/features/person-map/MapView.module.css
  - tests/features/useToolMode.test.ts
  - tests/features/marquee.test.ts
  - e2e/canvas-pan-marquee.spec.ts
  - playwright.config.ts
autonomous: true
requirements: [QT-260821-nac]

estimate:
  tokens: 96000
  raw_tokens: 48000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Holding the middle mouse button and moving pans the Konva Stage, whatever tool is armed (including a draw tool), and releasing ends the pan."
    - "Middle-clicking on the canvas never triggers the browser autoscroll widget and never deselects the current object."
    - "With the Select tool armed, a left-mouse drag starting on empty canvas draws a rubber-band rectangle; on release every shape/marker/portal intersecting the band is selected."
    - "A left drag that starts ON a marker, portal or shape still moves that object — no rubber band appears."
    - "Finishing a shape draw (rect/ellipse/line drag, or a closed polygon) re-arms the Select tool automatically."
    - "Existing behaviours survive: wheel-zoom, two-finger touch pan/pinch, single-finger touch pan in Select mode, marker drag-persist, Transformer reshape, connector drawing, and the multi-click polygon flow."
  artifacts:
    - src/features/person-map/editor/marquee.ts
    - tests/features/marquee.test.ts
    - e2e/canvas-pan-marquee.spec.ts
  key_links:
    - "MapView.handlePointerDown routes by `e.evt.button` FIRST (1 = middle pan, 0 = tool/marquee) so no tool branch ever sees a middle press."
    - "useToolMode.deriveStageDraggable gains OPTIONAL `middlePanning`/`marqueeActive` flags that force `false`, so Konva's own drag-drop never double-pans alongside the hand-rolled gestures."
    - "The marquee band is tracked in stage-CONTAINER pixels (`stage.getPointerPosition()`), the same space the DOM overlay div and the container-space hit boxes use — no image-space round-trip."
    - "Marker/portal marquee candidates come from the already-culled `visibleMarkers`/`visiblePortals` memos, so hit-testing never walks the full marker table."
    - "commitShape → setTool('select') is ordered AFTER setDrawTracked(null), so useToolMode.setTool's internal setDraw(null) can't strand drawRef."
---

<objective>
Three map-editor canvas interactions the curator asked for, delivered together because they all live
on the same Stage pointer-event seam in `MapView.tsx`:

1. Middle-mouse-button hold + move pans the canvas, regardless of the armed tool.
2. With the Select tool, a left drag on empty canvas draws a marquee (rubber-band) rectangle that
   selects everything it intersects on release.
3. Finishing a shape draw returns the palette to the Select tool.

Purpose: the editor currently forces the curator to switch back to Select by hand after every shape,
gives no way to pan while a draw tool is armed, and offers no multi-object selection at all.
Output: a pure, unit-tested `marquee.ts` hit-test module; three new gesture paths in `MapView.tsx`;
two optional gesture flags on the `useToolMode` state machine; unit + e2e coverage.
</objective>

<execution_context>
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@src/features/person-map/MapView.tsx
@src/features/person-map/editor/useToolMode.ts
@src/features/person-map/coords.ts
@src/features/person-map/editor/ShapeNode.tsx
@src/features/person-map/MapView.module.css
@tests/features/useToolMode.test.ts
@e2e/draw-shapes.spec.ts
</context>

<design_decisions>
Read this before touching code — these are settled, do not re-litigate them mid-task.

**D-1 — Middle pan is hand-rolled, not Konva drag-and-drop.**
Konva's `dragButtons` default includes the middle button, so leaving it to `Stage.draggable` would
pan only in Select mode (draw modes set `stageDraggable=false`) and would double-pan in Select mode.
Instead: begin on the Konva `pointerdown` (button 1), then move/end on WINDOW `pointermove`/
`pointerup` listeners so a release outside the canvas still ends the pan. During the pan
`middlePanning` forces `stageDraggable` false and `stage.stopDrag()` disarms any Konva drag that the
same pointerdown may have armed (the exact Pitfall-4 treatment already used for two-finger touch).

**D-2 — A middle press never cancels an in-progress draw.**
Panning mid-polygon to reach an off-screen vertex is a legitimate workflow. The draw state is left
untouched; the rubber band simply freezes while the middle button is held.

**D-3 — The marquee is mouse-only.**
The band starts only when `e.evt.pointerType === 'mouse'` and `e.evt.button === 0`. Touch and pen
keep today's single-pointer empty-canvas pan (`stageDraggable` in Select mode) untouched, so no
touch behaviour regresses. Left-drag panning with a mouse is intentionally replaced by the marquee —
mouse panning is now middle-drag.

**D-4 — Multi-selection representation (the least-invasive option, per the task constraints).**
The codebase is strictly single-select today: `selectedShapeId` XOR `selectedMarkerId`, mirrored into
one `selectedNode` that the L2 `TransformerOverlay` attaches to. That single-select path is NOT
refactored. Instead a parallel, additive `marqueeSelection: { shapeIds: string[]; markerIds: string[] }`
state is added, and the release rule is:

  - 0 hits  → clear everything (same as clicking empty canvas today).
  - 1 hit   → set the EXISTING single-select state for that object, exactly as a click would. The
              Transformer and StylePopover attach as they do today (the `onNodeRef` conditional in
              `MapView` re-wires on the next render — this is already how click-select works).
  - 2+ hits → populate `marqueeSelection` only. Every hit renders its amber selected outline, and
              Delete/Backspace removes all selected SHAPES in one write. No Transformer attaches
              (the overlay is single-node by construction) and no StylePopover opens.

Marker deletion stays out of scope — the existing keydown handler already documents that boundary and
this plan preserves it. Highlight is wired by widening the existing `selected` props with an
`|| marqueeSet.has(id)` term; `AvatarMarker`, `PortalGlyph` and `ShapeNode` are NOT modified.

**D-5 — Hit-testing is pure and data-driven, not Konva-node-driven.**
`AvatarMarker`'s Konva `name` is keyed by PERSON id, which collides under multi-placement (D-13), and
`e2e/draw-shapes.spec.ts` asserts an exact `node.name()` string — so name-based node enumeration is
both wrong and breaking. Hit-testing instead composes stored geometry with the same `imageToStage`
math the renderer uses, in a pure module unit-tested without a DOM (mirroring `useToolMode`'s pure
helpers). Rotation is ignored: a rotated shape is tested by its unrotated composed bounding box.

**D-6 — Auto-return to Select fires only when a shape actually commits.**
`commitDraw`/`closePolygon` return `null` for a degenerate drag or a <3-vertex polygon. A stray click
must not silently disarm the curator's tool, so the tool resets only on a non-null commit. Escape-
cancelling a polygon leaves the Polygon tool armed.
</design_decisions>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Middle-mouse pan, end-to-end through every layer</name>
  <files>
    playwright.config.ts,
    src/features/person-map/editor/useToolMode.ts,
    src/features/person-map/MapView.tsx,
    tests/features/useToolMode.test.ts,
    e2e/canvas-pan-marquee.spec.ts
  </files>
  <precondition>`playwright.config.ts` must serve the app at the base path `vite.config.ts` actually builds with. `vite.config.ts` sets `const BASE = '/'` (Cloudflare Pages, commit d2e7d9b) while `playwright.config.ts` still derives `BASE_URL` from `/relation_blueprint/`. If that mismatch is still present, no e2e in this repo can load the app.</precondition>
  <read_first>
    - `src/features/person-map/editor/useToolMode.ts` lines 69-86 (`deriveStageDraggable`) and 145-199 (hook shape + returned setters).
    - `src/features/person-map/MapView.tsx` lines 292-325 (wheel/dragEnd + `culling.recompute`), 554-620 (pointer handlers), 672-693 (two-finger `stage.stopDrag()` precedent), 909-936 (Stage props + the empty-canvas `onClick` deselect).
    - `e2e/draw-shapes.spec.ts` lines 14-85 (PNG fixture, `resetDb`, `seedMap`, `suppressPrivacyNotice`, the `beforeEach`).
  </read_first>
  <behavior>
    - `deriveStageDraggable('select', { objectDragging: false, twoFingerActive: false, middlePanning: true })` returns false.
    - `deriveStageDraggable('rect', { objectDragging: false, twoFingerActive: true, middlePanning: true })` returns false — an explicit middle pan outranks the two-finger override.
    - Every existing assertion in `tests/features/useToolMode.test.ts` still passes with the two-key gesture object (the new keys are optional and default to false).
    - e2e: with the Rect tool armed, a middle-button press-move-release over the Stage shifts `stage.x()`/`stage.y()` by the drag delta and commits no shape.
  </behavior>
  <action>
Fix the e2e base path first: in `playwright.config.ts`, make `BASE_URL` resolve to the root path that `vite.config.ts`'s `BASE` const produces (`http://localhost:4173/`), so `use.baseURL` and `webServer.url` both match the built bundle. Change only that derivation.

In `useToolMode.ts`:
- Widen the `deriveStageDraggable` gesture parameter with two OPTIONAL booleans, `middlePanning` and `marqueeActive` (both default false when absent, so existing callers and the existing unit tests compile unchanged). Evaluate them FIRST: when either is set the function returns false, ahead of the `twoFingerActive` branch. Explain in the doc comment that an explicit hand-rolled gesture owns the Stage outright, so Konva's own drag-and-drop must not run alongside it.
- Add `middlePanning` and `marqueeActive` `useState` pairs inside the hook, feed them into the `deriveStageDraggable` memo and its dependency array, and expose `setMiddlePanning` / `setMarqueeActive` on the `UseToolMode` interface — modelled exactly on the existing `setTwoFingerActive` transient-gesture-flag seam. (Task 2 consumes `setMarqueeActive`; add both now so the state machine changes land in one edit.)

In `MapView.tsx`:
- Destructure `setMiddlePanning` (and `setMarqueeActive`, used by Task 2) from `toolMode`.
- Add `const middlePanRef = useRef<{ clientX: number; clientY: number; stageX: number; stageY: number } | null>(null)`.
- At the very TOP of `handlePointerDown`, before any tool branch: when `e.evt.button === 1`, call `e.evt.preventDefault()`, call `stage.stopDrag()` to disarm any Konva drag the same press armed, record `{ clientX, clientY }` from `e.evt` together with the current `stage.x()`/`stage.y()`, call `setMiddlePanning(true)`, and return. Do NOT clear the draw state (per D-2). Immediately after that branch, return early for any `e.evt.button` other than 0 so a right-click never reaches a tool branch.
- Guard `handlePointerMove` and `handlePointerUp` with an early return while `middlePanRef.current` is non-null, so a pan never updates or commits a draw.
- Add a `useEffect` gated on `middlePanning` that attaches WINDOW listeners for `pointermove`, `pointerup` and `pointercancel`. The move listener repositions the stage to `{ x: stageX + (ev.clientX - clientX), y: stageY + (ev.clientY - clientY) }` and calls `stage.batchDraw()`. The up/cancel listener nulls `middlePanRef`, calls `setMiddlePanning(false)` and calls `culling.recompute(stage)` (matching how `handleWheel`/`handleDragEnd` refresh the cull rect after a viewport change). Remove all three listeners in the cleanup. Comment that window-level listeners are what make a release outside the canvas still end the pan.
- Add a second `useEffect` that attaches native `mousedown` and `auxclick` listeners to `rootRef.current`, each calling `preventDefault()` when `button === 1`. Comment that this is what suppresses the platform autoscroll widget, and that it must be a native listener because preventing the default on a `pointerdown` does not suppress the compatibility mouse event.
- In the Stage `onClick` empty-canvas deselect, return early unless `e.evt.button === 0`. Konva raises a synthetic click on any button release, so without this a middle-button pan would clear the curator's selection.

Extend `tests/features/useToolMode.test.ts` with the `deriveStageDraggable` cases from `<behavior>`; leave the existing cases untouched.

Create `e2e/canvas-pan-marquee.spec.ts`. Copy the fixture and helper block from `e2e/draw-shapes.spec.ts` (`PNG_BASE64`, `resetDb`, `seedMap`, `suppressPrivacyNotice`, the `beforeEach`). Add the middle-pan test: seed a map, reload, wait for the Stage canvas, arm the Rect tool via `[data-testid="tool-rect"]`, read the canvas bounding box, then drive a real `page.mouse` sequence — `move` to a point inside the canvas, `down({ button: 'middle' })`, `move` to a point offset by a known delta with `steps` above 1, `up({ button: 'middle' })`. Assert `stage.x()`/`stage.y()` read back through `window.Konva.stages[0]` moved by that delta, and assert the seeded map's `shapes` array is still empty.
  </action>
  <verify>
    <automated>cd C:/Users/cartr/git_stuff/relation_blueprint &amp;&amp; npm run typecheck &amp;&amp; npx vitest run tests/features/useToolMode.test.ts --no-file-parallelism &amp;&amp; npx playwright test e2e/canvas-pan-marquee.spec.ts</automated>
  </verify>
  <done>
    `npm run typecheck` is clean. The `useToolMode` unit suite passes including the new
    `middlePanning`/`marqueeActive` derivation cases. The e2e middle-pan test passes: the Stage
    position moved by the drag delta while the Rect tool was armed, and no shape was committed.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Marquee rubber-band selection on the Select tool</name>
  <files>
    src/features/person-map/editor/marquee.ts,
    src/features/person-map/MapView.tsx,
    src/features/person-map/MapView.module.css,
    tests/features/marquee.test.ts,
    e2e/canvas-pan-marquee.spec.ts
  </files>
  <read_first>
    - `src/features/person-map/coords.ts` in full (`Point`, `imageToStage`, and the zero/non-finite scale guard convention).
    - `src/features/person-map/editor/ShapeNode.tsx` lines 63-90 — the exact composed geometry the renderer uses (`origin` from `imageToStage`, `scaledW = width * transform.scale`, `stagePoints` for line/polygon). The hit boxes must reproduce this, not re-derive it differently.
    - `src/features/person-map/MapView.tsx` lines 327-413 (tool-mode wiring, `drawRef` mirroring rationale, `clearSelection`, `deleteShape`), 726-781 (`orderedShapes`, `visibleMarkers`, `visiblePortals`, `MARKER_HALF_EXTENT`), 988-1076 (the `selected` props on `ShapeNode`/`AvatarMarker`/`PortalGlyph`).
    - `src/app/tokens.css` line 18 — the `--amber` custom property. The band must use it; never an inline hex (CLAUDE.md convention).
  </read_first>
  <behavior>
    Pure `marquee.ts` module:
    - `normalizeBox({x:200,y:200},{x:150,y:120})` returns `{x:150,y:120,width:50,height:80}`.
    - `boxesIntersect` is true for overlapping boxes, true for a box fully containing another, false for
      disjoint boxes, and false when either box carries a non-finite coordinate.
    - `shapeStageBox` on a rect at image `{x:10,y:20,width:100,height:70}` under the identity transform
      returns `{x:10,y:20,width:100,height:70}`; under `scale: 2` it returns `{x:20,y:40,width:200,height:140}`.
    - `shapeStageBox` on a polygon returns the bounding box of its composed points.
    - `marqueeHits` returns the ids of every shape and every marker whose box intersects the band, and
      omits objects that only come close; a marker is a square of `2 * halfExtent` centred on its
      composed position.
    - `marqueeHits` with an empty band (zero width and height) returns two empty arrays.

    MapView integration:
    - A left drag starting on empty canvas with the Select tool renders `[data-testid="marquee-rect"]`.
    - A left drag starting on a shape or marker renders no band and still moves that object.
    - e2e: two seeded shapes, marquee both, press Delete → the map's `shapes` array is empty.
  </behavior>
  <action>
Create `src/features/person-map/editor/marquee.ts` — a PURE module, no React and no Konva import, in
the house style of `useToolMode.ts`'s exported helpers (leading doc comment explaining the coordinate
space, every export documented). Export:
- `interface Box { x: number; y: number; width: number; height: number }`
- `normalizeBox(a: Point, b: Point): Box` — two corners to a positive-origin box.
- `boxesIntersect(a: Box, b: Box): boolean` — standard axis-aligned overlap, returning false whenever
  any coordinate or extent involved is not finite. Document that this is the corrupt-geometry guard
  (mirroring the `stageToImage` non-finite-scale guard) so a tampered record can never poison a
  selection.
- `shapeStageBox(shape: Shape, transform: BackgroundTransform): Box` — for `points`-bearing shapes,
  compose every vertex with `imageToStage` and take the min/max bounding box; otherwise compose the
  `x`/`y` origin with `imageToStage` and scale `width`/`height` by `transform.scale`. Document that
  rotation is deliberately not applied, so a rotated shape is tested by its unrotated composed box.
- `markerStageBox(pos: Point, halfExtent: number): Box` — the square centred on an already-composed
  stage position.
- `marqueeHits(band: Box, shapes: Shape[], markers: Array<{ id: string; pos: Point }>, transform: BackgroundTransform, markerHalfExtent: number): { shapeIds: string[]; markerIds: string[] }` —
  everything whose box intersects the band. Document that callers pass ALREADY-CULLED markers so the
  cost is bounded by what is on screen, never by the marker table size.

Write `tests/features/marquee.test.ts` covering every `<behavior>` bullet for the pure module, in the
`describe`/`it` style of `tests/features/useToolMode.test.ts`, with a header comment naming what each
group pins.

Wire it into `MapView.tsx`:
- Add `const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)`
  plus a `marqueeRef` mirror and a `setMarqueeTracked` setter, following the `drawRef`/`setDrawTracked`
  pattern already in the file and citing the same reason: a fast press-move-release must never read a
  stale render-closure value. `setMarqueeTracked` also calls `setMarqueeActive(next !== null)` so the
  Stage stops being draggable for the duration of the band.
- Add `const [marqueeSelection, setMarqueeSelection] = useState<{ shapeIds: string[]; markerIds: string[] }>({ shapeIds: [], markerIds: [] })`
  and two `useMemo` `Set`s over its arrays for O(1) render-time lookups. Extend `clearSelection` to
  reset `marqueeSelection` to empty arrays.
- Add `const suppressStageClickRef = useRef(false)`.
- Define a module-level `MARQUEE_MIN_DRAG` of 3 (container px) — the band must exceed it in width or
  height before it counts as a drag rather than a click.
- In `handlePointerDown`, AFTER the Task-1 button routing and BEFORE the `tool === 'portal'` branch,
  add the Select-tool branch: when `tool === 'select'`, `e.evt.pointerType === 'mouse'`, and
  `e.target === stage`, read `stage.getPointerPosition()`, seed the band with both corners at that
  point, call `stage.stopDrag()`, and return. Comment that the `e.target === stage` test is what keeps
  a drag that begins on a marker, portal or shape flowing to that object's own drag handler, and that
  the pointer-type test is what preserves single-finger touch panning.
- In `handlePointerMove`, when `marqueeRef.current` is set, update its second corner from
  `stage.getPointerPosition()` and return before the draw path.
- Extract `finishMarquee()` as a `useCallback`. It reads and immediately nulls `marqueeRef` (so it is
  idempotent), clears the band state, and when the band exceeded `MARQUEE_MIN_DRAG` in either axis:
  builds the band `Box` via `normalizeBox`, builds the marker candidate list by mapping
  `[...visibleMarkers, ...visiblePortals]` to `{ id: mk.id, pos }`, calls `marqueeHits` with
  `map.shapes`, `transform` and `MARKER_HALF_EXTENT`, sets `suppressStageClickRef.current = true`, and
  applies the D-4 release rule (0 hits → `clearSelection()`; exactly 1 hit → set the existing
  `selectedShapeId` or `selectedMarkerId` plus `setEditingBackground(false)`, so the Transformer and
  StylePopover attach through the existing `onNodeRef` path; 2 or more → populate `marqueeSelection`
  and null out `selectedShapeId`/`selectedMarkerId`/`selectedNode`). A band at or below the threshold
  changes no selection and leaves `suppressStageClickRef` alone, so the ordinary empty-canvas
  deselect still runs.
- Call `finishMarquee()` from `handlePointerUp` (before the draw-commit path) and from a `useEffect`
  gated on `marquee !== null` that attaches a window `pointerup` safety net, so releasing outside the
  canvas still finalizes.
- In the Stage `onClick` handler, after the Task-1 button guard, consume `suppressStageClickRef`:
  when it is set, reset it to false and return without deselecting. Comment that Konva raises a click
  on the release that ended the band, which would otherwise wipe the selection just made.
- Widen the three `selected` props with the marquee sets: `ShapeNode` gets
  `shape.id === selectedShapeId || marqueeShapeIdSet.has(shape.id)`, `AvatarMarker` gets
  `person.id === selectedPersonId || marqueeMarkerIdSet.has(mk.id)`, `PortalGlyph` gets
  `mk.id === selectedMarkerId || marqueeMarkerIdSet.has(mk.id)`. Do not modify those three components.
- Replace `deleteShape(shapeId)` with `deleteShapes(shapeIds: string[])` that removes every id in ONE
  `updateMapShapes` fresh-read filter (preserving the WR-01 rationale already in that callback) and
  then clears the selection. Update the `StylePopover onDelete` call site to pass a single-element
  array. In the keydown effect, resolve the delete target as `marqueeSelection.shapeIds` when it is
  non-empty, otherwise the single `selectedShapeId`, and act when that list is non-empty. Leave the
  polygon Enter/Escape branch and the typing-in-a-form-control suppression exactly as they are, and
  leave marker deletion out of scope as the existing comment states.
- Render the band as a DOM overlay sibling inside `styles.root` (not a Konva node), guarded on
  `marquee`, carrying `data-testid="marquee-rect"`, `className={styles.marquee}`, and an inline
  `style` computing `left`/`top`/`width`/`height` from the two corners. Comment that
  `stage.getPointerPosition()` is already in stage-container pixels, which is the same box the root
  div occupies, so the band needs no transform composition and stays a constant-weight outline at any
  zoom.

In `MapView.module.css`, add a `.marquee` rule: absolutely positioned, `z-index: var(--z-chrome)`,
`pointer-events: none`, a 1px dashed border in `var(--amber)`, and a low-alpha amber wash for the
fill. Head it with a short comment in the file's existing style.

Add the marquee e2e case to `e2e/canvas-pan-marquee.spec.ts`: seed a map, then seed two rect shapes
at known, well-separated image coordinates on one layer via `window.__rb.updateMap` (the same shape
literal shape as the second test in `e2e/draw-shapes.spec.ts`), reload, and wait for the canvas. With
the default Select tool, drive a real `page.mouse` left drag from a corner that is empty canvas to a
corner past both shapes, with `steps` above 1. Assert `[data-testid="marquee-rect"]` was visible
during the drag, then press `Delete` and wait for the map's `shapes` array to reach length 0 through
the bridge.
  </action>
  <verify>
    <automated>cd C:/Users/cartr/git_stuff/relation_blueprint &amp;&amp; npm run typecheck &amp;&amp; npx vitest run tests/features/marquee.test.ts --no-file-parallelism &amp;&amp; npx playwright test e2e/canvas-pan-marquee.spec.ts</automated>
  </verify>
  <done>
    `marquee.ts` exists as a pure module and its unit suite passes every `<behavior>` case.
    `npm run typecheck` is clean. The e2e marquee test passes: the band renders during a
    Select-tool left drag on empty canvas, and Delete removes both marquee-selected shapes.
    A left drag begun on a shape still moves that shape (no band, verified by the drag path
    early-returning on `e.target !== stage`).
  </done>
</task>

<task type="auto">
  <name>Task 3: Re-arm the Select tool after a shape draw completes</name>
  <files>
    src/features/person-map/MapView.tsx,
    e2e/canvas-pan-marquee.spec.ts
  </files>
  <read_first>
    - `src/features/person-map/MapView.tsx` lines 497-520 (`placePortal`'s one-shot return-to-Select precedent and its `setTool` dependency), 611-630 (`handlePointerUp` and `handlePolygonClose`).
    - `src/features/person-map/editor/useToolMode.ts` lines 177-181 — `setTool` internally calls the raw `setDraw(null)`, which does not touch `drawRef`.
  </read_first>
  <action>
In `handlePointerUp`, after `setDrawTracked(null)` and the `commitShape(committed)` call, re-arm the
Select tool — but only inside the branch where `committed` is non-null, per D-6. In
`handlePolygonClose`, apply the same rule after its `commitShape(committed)` call. Add `setTool` to
both callbacks' dependency arrays.

Order matters and must not be rearranged: `setDrawTracked(null)` runs first so `drawRef` is cleared
through the tracked setter; `setTool` then runs its own internal draft reset harmlessly. Reversing
the order would leave the mirrored ref holding a draft the state machine has already discarded.

Comment both call sites explaining that this mirrors the one-shot behaviour `placePortal` and the
Person tool already have, and that the degenerate-commit path deliberately keeps the drawing tool
armed so a stray click does not disarm the curator.

Note that `commitShape` already calls `setSelectedShapeId`, so after the reset the curator lands on
the Select tool with the shape they just drew selected and its StylePopover open — that combination
is the intended end state, not an accident.

Add the e2e case to `e2e/canvas-pan-marquee.spec.ts`: seed a map, arm the Rect tool, drive a
suprathreshold draw with the `firePointer` helper copied from `e2e/draw-shapes.spec.ts` (pointerdown →
pointermove → pointerup, each in its own `page.evaluate`), wait for the shape to land in Dexie, then
assert `[data-testid="tool-select"]` reports `aria-pressed` of `true` and `[data-testid="tool-rect"]`
reports `false`.
  </action>
  <verify>
    <automated>cd C:/Users/cartr/git_stuff/relation_blueprint &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npx playwright test e2e/canvas-pan-marquee.spec.ts</automated>
  </verify>
  <done>
    After a committed rect/ellipse/line drag the palette shows Select as the pressed tool; after
    closing a polygon it does too. A below-threshold drag leaves the drawing tool armed. The full
    e2e spec passes, `npm run typecheck` and `npm run lint` are clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pointer input → editor state machine | Untrusted button/pointerType/coordinate values arrive from the DOM and route which gesture runs. |
| stored MapDoc geometry → marquee hit-test | Shape `x`/`y`/`width`/`height`/`points` and `backgroundTransform` are read from Dexie (at-rest, restorable from a user-supplied backup) and fed into box math. |
| marquee selection → repository delete | A multi-object selection becomes a destructive `updateMapShapes` write. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-QT-01 | Tampering | `deleteShapes` via marquee + Delete key | medium | mitigate | Delete acts on SHAPES only (markers and people are untouched, preserving the existing boundary); a band must exceed `MARQUEE_MIN_DRAG` before any selection is made, so a stray click can never build a delete set; the existing typing-in-a-form-control suppression stays in place; removal is one `updateMapShapes` fresh-read filter, never a straight Dexie write (T-03-13 convention). |
| T-QT-02 | Denial of Service | `marqueeHits` on pointer events | medium | mitigate | Hit-testing runs only on release, never per `pointermove` (the band update is pure state); marker candidates are the already-culled `visibleMarkers`/`visiblePortals` memos, so cost is bounded by what is on screen, not by the marker table size. |
| T-QT-03 | Tampering | `shapeStageBox` / `boxesIntersect` on corrupt geometry | low | mitigate | `boxesIntersect` returns false for any non-finite coordinate or extent, so a tampered `backgroundTransform` or shape record yields an empty selection instead of a NaN-poisoned one — the same degrade-gracefully posture as `stageToImage`'s zero/non-finite scale guard. |
| T-QT-04 | Elevation of Privilege | window-level `pointermove`/`pointerup` listeners | low | accept | Listeners are mounted only while a gesture flag is true and removed in the effect cleanup; they read coordinates and reposition the local Konva Stage only, touching no persisted record. Accepted under the single-curator, provider-level-security v1 boundary. |

No package-manager install task exists in this plan (no new dependency is added), so the supply-chain
threat `T-{phase}-SC` and its package-legitimacy checkpoint are not applicable.
</threat_model>

<verification>
1. `npm run typecheck` — clean.
2. `npm run lint` — clean.
3. `npx vitest run --no-file-parallelism` — full unit suite green. (Per project memory, a plain
   `vitest run` can false-fail with fork-worker startup timeouts on a loaded machine; re-run with
   `--no-file-parallelism` before treating any failure as a code defect.)
4. `npx playwright test e2e/canvas-pan-marquee.spec.ts e2e/draw-shapes.spec.ts e2e/marker.spec.ts e2e/transform-marker.spec.ts e2e/place-person.spec.ts e2e/portal.spec.ts e2e/connectors.spec.ts` —
   the new spec plus the existing canvas regressions (shape draw, marker drag, Transformer reshape,
   person placement, portal flow, connectors) all pass.
5. Manual smoke against `npx vite --mode e2e` (project memory: `window.__rb` is absent under plain
   `npm run dev`): middle-drag pans with each of the seven tools armed; a Select-tool left drag on
   empty canvas bands and selects; a left drag begun on a marker still moves that marker; two-finger
   and single-finger touch panning still work under device emulation; drawing a rect and closing a
   polygon each land back on the Select tool.
</verification>

<success_criteria>
- Middle-button hold + move pans the Stage under every tool; release ends it, including a release
  outside the canvas; no browser autoscroll widget appears; the current selection survives.
- Select-tool left drag on empty canvas renders a band and selects every intersecting shape, marker
  and portal on release; Delete removes all selected shapes in one write.
- A left drag started on any object still moves that object and shows no band.
- Touch panning (one finger and two) is unchanged.
- Completing a rect/ellipse/line drag or closing a polygon re-arms Select; a degenerate drag does not.
- No new dependency; typecheck, lint, unit and e2e all green.
</success_criteria>

<output>
Create `.planning/quick/260821-nac-middle-click-pan-marquee-select-auto-ret/260821-nac-SUMMARY.md` when done
</output>
</content>
</invoke>

---
phase: quick-260902-nfs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/person-map/MapView.tsx
  - src/features/person-map/MapView.module.css
  - src/features/person-map/connectors.ts
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/person-map/editor/MultiSelectBar.tsx
  - src/features/person-map/editor/MultiSelectBar.module.css
  - src/features/person-map/editor/multiSelect.ts
  - src/features/person-map/editor/groupMove.ts
  - src/features/graph/GraphView.tsx
  - src/features/graph/GraphView.module.css
  - src/features/graph/graphGesture.ts
  - tests/features/multiSelect.test.ts
  - tests/features/groupMove.test.ts
  - tests/features/connectors.test.ts
  - tests/features/graphGesture.test.ts
  - e2e/marquee-multi-edit.spec.ts
  - e2e/graph-multi-select.spec.ts
autonomous: true
requirements: [A1, A2, A3, A4, B1, B2, B3, B4, B5, B6]
user_setup: []

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A map marquee band of 2+ objects + Delete removes every banded SHAPE, MARKER and PORTAL after one confirm; the referenced person/group survives."
    - "The single-select Delete path (selectedShapeId) still deletes that one shape with NO confirm — behaviour unchanged."
    - "Grabbing any banded object drags the WHOLE marquee selection by the same delta and persists every moved object once, on drag-end."
    - "A banded selection can be moved to one layer in a single action, for shapes AND markers/portals together."
    - "A portal moved or re-layered as part of a group keeps its targetMapId; every marker keeps its layerId/width/height/rotation."
    - "Objects on a LOCKED layer never move and are never deleted by a group action."
    - "On the graph, a plain left-drag on empty background rubber-band-selects; middle-drag and Alt+left-drag pan."
    - "Dragging one node of a graph multi-selection moves them all and persists ONE graphPositions write for the gesture."
    - "A modifier-click that extends the graph selection does NOT open a profile and does NOT re-ego the layout."
    - "The graph writes nothing but the graphPositions meta row — db.people / db.groups / db.relationshipLinks are byte-identical after a multi-select drag."
    - "Marquee/box selection stays MOUSE-ONLY on both screens; single-finger touch still pans."
  artifacts:
    - src/features/person-map/editor/multiSelect.ts
    - src/features/person-map/editor/groupMove.ts
    - src/features/person-map/editor/MultiSelectBar.tsx
    - src/features/person-map/editor/MultiSelectBar.module.css
    - src/features/graph/graphGesture.ts
    - tests/features/multiSelect.test.ts
    - tests/features/groupMove.test.ts
    - tests/features/graphGesture.test.ts
    - e2e/marquee-multi-edit.spec.ts
    - e2e/graph-multi-select.spec.ts
  key_links:
    - "MapView.marqueeSelection -> multiSelect.deleteTargets -> ConfirmDialog -> deleteShapes + deleteMarker"
    - "MapView wrapper <Group x/y> transient offset -> groupMove.computeGroupMove -> updateMapShapes (one write) + upsertMarker (per marker, all fields preserved)"
    - "MapView.groupDragOverrides -> ConnectorLayer.dragOverrides -> buildConnectors endpointFor"
    - "MultiSelectBar layer <select> -> updateMapShapes + upsertMarker(layerId)"
    - "GraphView container mousedown -> cy.userPanningEnabled(false) -> cytoscape goIntoBoxMode"
    - "cy 'dragfree' (fires per element) -> coalesced single savePositions -> graphPositions meta row"
    - "cy 'tap node' -> graphGesture.isMultiSelectModifier guard -> setFocusedId (re-ego) suppressed"
---

<objective>
Extend the existing marquee multi-selection so a banded set can be MOVED, DELETED and RE-LAYERED on
the map editor, and give the relationship graph an equivalent LAYOUT-ONLY box selection.

Purpose: the band gesture shipped in quick-260821-nac only widens an amber outline and deletes
shapes. A curator who bands five markers cannot move them, cannot delete them, and cannot re-layer
them — the selection is decorative. On the graph there is no band at all.

Output: a multi-selection action bar + group drag on the map, and a mouse box-select + group drag on
the graph, both persisted through the EXISTING repository/meta paths with no new dependency.
</objective>

<execution_context>
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.claude/CLAUDE.md
@.planning/quick/260821-nac-middle-click-pan-marquee-select-auto-ret/260821-nac-SUMMARY.md

# The band gesture that already exists — READ BEFORE TOUCHING MapView
@src/features/person-map/editor/marquee.ts
@src/features/person-map/coords.ts

# The two persist paths a group action must mirror EXACTLY
@src/features/person-map/AvatarMarker.tsx
@src/features/person-map/editor/PortalGlyph.tsx

# The single-shape controls the bulk versions mirror
@src/features/person-map/editor/StylePopover.tsx
@src/features/common/ConfirmDialog.tsx

# The graph surface
@src/features/graph/GraphView.tsx
@src/features/graph/positionCache.ts
</context>

<house_style>
These files carry heavy explanatory module/decision headers that record WHY, not what
(`marquee.ts`, `useToolMode.ts`, `coords.ts`, `connectors.ts` are the reference standard). Every new
module gets one. Every non-obvious branch gets a comment naming the decision (D-N) or threat
(T-NFS-NN) it implements. Pure, DOM-free, Konva-free helpers are extracted so they can be
unit-tested; the React/Konva/Cytoscape wiring stays thin over them.

Verification tooling: `npm run typecheck`, `npx eslint <changed files>`,
`npx vitest run --no-file-parallelism`, `npx playwright test <spec>`. To exercise the app by hand the
`window.__rb` test bridge requires e2e build mode — `npx vite --mode e2e`, never `npm run dev`.
`src/db/schema.ts` is DEXIE, not Drizzle: there is no migration/schema-push step in this task, and
none may be invented.
</house_style>

<decisions>
Every decision below was verified against the tree during planning. File:line citations are live.

**D-1 — A bulk delete gets a blocking confirm; the single-select delete does not.**
A band hit-tests a rotated shape by its UNROTATED composed box (`marquee.ts` module header), so a
band can legitimately catch an object the curator did not consciously aim at — and this task adds
MARKERS to the delete set for the first time. There is no undo in this app; the only recovery is a
backup restore. So any delete of a 2+ marquee selection routes through the existing
`ConfirmDialog` (`src/features/common/ConfirmDialog.tsx`), used EXACTLY as `ProfileSidebar.tsx:586`
uses it (safe Cancel takes initial focus). The single selected-shape Delete path keeps today's
zero-friction behaviour, unchanged, per scope.

**D-2 — Delete-key single-MARKER deletion is deliberately NOT added.**
Today Delete on a lone selected marker does nothing; removing a placement is the explicit
"Remove from this map" action in `ProfileSidebar`, which is the load-bearing delete-vs-remove
distinction `e2e/delete-vs-remove.spec.ts` guards. Adding a silent keyboard marker delete would blur
it. Only a 2+ marquee selection gains marker deletion, and only behind the confirm.

**D-3 — Group move is a transient offset on the EXISTING wrapper `<Group>`.**
`MapView` already wraps every shape, marker and portal in a `<Group key … opacity listening>`
(MapView.tsx:1316, :1353, :1382). Setting `x`/`y` on that wrapper translates the whole object in
stage space with zero writes and zero changes to `ShapeNode` / `AvatarMarker` / `PortalGlyph` —
preserving the D-4 property from quick-260821-nac that those three components stay untouched.

**D-4 — The GRABBED object persists through its OWN existing drag-end handler; MapView persists the
REST.** `AvatarMarker.handleDragEnd` (AvatarMarker.tsx:117-146), `PortalGlyph.handleDragEnd`
(PortalGlyph.tsx:83-97) and `ShapeNode.handleRectDragEnd` / `handlePointsDragEnd` already persist the
node they belong to and cannot be suppressed without modifying them. So the group patch MapView
writes must EXCLUDE the grabbed id, or the delta is applied twice. All shape writes go through
`updateMapShapes`, which is a fresh-read rw transaction (`repository.ts:376`, delegating to
`updateMapFrom`), and Dexie serialises rw transactions on `db.maps`, so the grabbed shape's own write
and MapView's group write cannot lose each other.

**D-5 — Connector live-follow widens `buildConnectors` additively.**
`BuildConnectorsOptions.dragOverride` is singular (`connectors.ts:44-47`). A group drag moves several
markers at once. Add `dragOverrides?: DragOverride[] | null` ALONGSIDE the existing singular option
(both merged into one lookup Map in `endpointFor`), so `ConnectorLayer`'s existing prop and
`tests/features/connectors.test.ts` keep working untouched.

**D-6 — A3's bulk move-to-layer lives in a new bottom-centre multi-selection action bar.**
`StylePopover` opens for a SINGLE selected shape only and explicitly does not open for a 2+ marquee
selection; it also has no notion of markers. A new `MultiSelectBar` DOM overlay renders only when the
marquee selection holds 2+ objects. Bottom-centre is the one free edge of the Stage: the editor
toolbar column occupies top-left out to ~y=135 (recorded in `e2e/canvas-pan-marquee.spec.ts`), the
LayersPanel docks 248px down the right edge, and `.bgHint` owns top-centre.

**D-7 — Graph: plain left-drag on empty background box-selects; mouse panning moves to middle-drag
and Alt+left-drag.** Verified in the INSTALLED cytoscape 3.34.0 build: `cytoscape.cjs.js:26234` enters
box mode only when `boxSelectionEnabled() && (multSelKeyDown || !panningEnabled() ||
!userPanningEnabled())`. The user asked for "pointer targeting nothing → selection mode", so panning
must leave the plain left button — exactly the trade `MapView` already made on the Konva canvas
(quick-260821-nac D-1/D-3). Rejected alternative: shift+drag box-select, which is cheaper but does
not satisfy the stated requirement and would leave the two canvases inconsistent.

**D-8 — `userPanningEnabled` is toggled at RUNTIME for the duration of one mouse gesture, not passed
as a prop.** A static `userPanningEnabled={false}` would also kill single-finger TOUCH panning
(cytoscape's touch pan reads the same flag), regressing tablets and contradicting A4/B6's mouse-only
rule. Instead the flag is flipped to `false` on a left mouse press on the background and restored on
release, so touch never observes it. Safe against React: `react-cytoscapejs`'s `updateCytoscape`
re-applies `userPanningEnabled` ONLY when the prop value differs between renders
(`node_modules/react-cytoscapejs/dist/react-cytoscape.js`, the `v(prev,next,diff,key)` guard) — and
omitting the prop entirely means `diff(undefined, undefined)` is false on every update, so a
mid-gesture re-render can never clobber the toggle.

**D-9 — Graph multi-node drag is NATIVE; the `dragfree` save must be coalesced.**
Verified at `cytoscape.cjs.js:26063-26078`: on mousedown over a grabbable node that is already
`selected()`, cytoscape collects `cy.$(ele => ele.isNode() && ele.selected() && nodeIsGrabbable(ele))`
into the drag list, so the whole selected set moves together — no fallback needed. BUT `dragfree` is
emitted on the COLLECTION (`draggedElements.emit('dragfree')`, `cytoscape.cjs.js:26282`), so
GraphView's existing `cy.on('dragfree','node', …)` (GraphView.tsx:379) fires ONCE PER DRAGGED NODE and
would run N redundant savePositions → loadPositions → setPosCache chains. Coalesce to one per gesture.

**D-10 — B4's re-ego guard keys on the multi-select MODIFIER, not on the selection count.**
`cy.on('tap','node')` (GraphView.tsx:368) opens the profile and re-egos on every node tap. Cytoscape
emits `tap` BEFORE its own "Single selection" collapse block (`cytoscape.cjs.js:26406` vs `:26444`),
so counting selected elements at tap time would misread an ordinary plain click — which legitimately
collapses to one node and should still re-ego — as a multi-select gesture. Guard instead on
`shiftKey || metaKey || ctrlKey` on the tap's `originalEvent`, the exact predicate cytoscape uses for
`isMultSelKeyDown` (`cytoscape.cjs.js:25733`). A real drag can never leak through: `tap` is suppressed
by the `!r.dragData.didDrag` guard at `cytoscape.cjs.js:26398`.

**D-11 — `originalEvent` is read DEFENSIVELY.** `e2e/graph.spec.ts` drives nodes with programmatic
`.emit('tap')`, which carries no native event — the same class of bug that regressed two specs in
quick-260821-nac (commit `bea3305`). An absent `originalEvent` means "no modifiers", i.e. today's
behaviour.

**D-12 — B5: no stylesheet work.** `:selected` already paints amber border-color / line-color /
target-arrow-color in `src/features/graph/graphStyle.ts` (the last selector block). Do not add,
duplicate or restyle it.

**D-13 — A4 / B6 stand: mouse-only.** No touch or pen marquee on the map; no three-finger touch
box-select on the graph. Single-finger touch keeps panning on both surfaces.
</decisions>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Bulk delete of banded shapes AND markers/portals, behind one confirm</name>
  <files>
    src/features/person-map/editor/multiSelect.ts,
    src/features/person-map/editor/MultiSelectBar.tsx,
    src/features/person-map/editor/MultiSelectBar.module.css,
    src/features/person-map/MapView.tsx,
    tests/features/multiSelect.test.ts,
    e2e/marquee-multi-edit.spec.ts
  </files>
  <read_first>
    MapView.tsx:975-1028 (the keyboard handler whose comment currently says marker deletion is out of
    scope), MapView.tsx:462-478 (deleteShapes / the WR-01 fresh-read filter), MapView.tsx:452-460
    (clearSelection), ProfileSidebar.tsx:586-597 (the ConfirmDialog call shape to mirror),
    repository.ts:155-158 (deleteMarker), MapView.module.css:130-137 (the .marquee overlay, the
    precedent for a DOM overlay sibling positioned inside .root).
  </read_first>
  <behavior>
    Unit (tests/features/multiSelect.test.ts), all against the pure module:
    - selectionCount({shapeIds:['a'],markerIds:['b','c']}) === 3
    - deleteTargets with a 2+ selection returns that selection and requiresConfirm true
    - deleteTargets with a 0/1-object selection and a non-null selectedShapeId returns exactly that
      one shape id, no marker ids, requiresConfirm false
    - deleteTargets with a 0/1-object selection and a null selectedShapeId returns an empty set and
      requiresConfirm false (a bare Delete keypress can never build a delete set — T-QT-01 carried
      forward)
    - deleteTargets never returns a marker id unless the marquee selection held 2+ objects (D-2)
  </behavior>
  <action>
Create `src/features/person-map/editor/multiSelect.ts` — a PURE module (no React, no Konva, no
Dexie), mirroring `marquee.ts`'s posture. Export the `MarqueeSelection` shape `{ shapeIds: string[];
markerIds: string[] }`, `selectionCount(sel): number`, and
`deleteTargets(sel, selectedShapeId): { shapeIds: string[]; markerIds: string[]; requiresConfirm: boolean }`
implementing the D-1/D-2 rules in the behavior block. Give it a module header recording D-1 (why a
bulk delete confirms and a single delete does not) and D-2 (why a lone selected marker is NOT
deletable from the keyboard, naming the delete-vs-remove distinction).

Create `MultiSelectBar.tsx` + `MultiSelectBar.module.css` — a DOM overlay sibling rendered inside
`.root`, shown ONLY when `selectionCount >= 2`. This task's version holds a live count ("N selected")
and a Delete button; Task 2 adds the layer control to the same bar. Props for now:
`{ count: number; onDelete: () => void }`, plus `data-testid="multi-select-bar"` and
`data-testid="multi-select-delete"`. Style it from tokens only (never an inline hex): pin it
bottom-centre of `.root` with `position:absolute; bottom: var(--space-md); left:50%;
transform:translateX(-50%); z-index: var(--z-chrome)`, mirroring `.bgHint`'s chip treatment
(MapView.module.css:139) and reusing the destructive-button colour language already in
`ConfirmDialog.module.css`. The bar itself must be interactive, so do NOT set `pointer-events:none`
on it — that is the one way it differs from `.bgHint`.

In `MapView.tsx`:
1. Add a `deleteMarkers(markerIds: string[])` callback next to the existing `deleteShapes`, importing
   `deleteMarker` from `@/db/repository`. It fires one `deleteMarker(id)` per id. Its comment MUST
   state that `deleteMarker` removes ONLY the marker row and that the referenced person/group
   survives in the database and on every other map — the delete-vs-remove distinction
   `e2e/delete-vs-remove.spec.ts` guards.
2. Add a `pendingBulkDelete` state holding the confirmed-pending target set, and render the shared
   `ConfirmDialog` for it, mirroring ProfileSidebar.tsx:586 exactly (title "Delete N selected
   objects?", a body that spells out that markers are removed from THIS map only and their people and
   groups stay in the database, confirmLabel "Delete", cancelLabel "Cancel"). `onConfirm` runs
   `deleteShapes(shapeIds)` for the shapes — keeping the existing single `updateMapShapes` fresh-read
   filter — then `deleteMarkers(markerIds)`, then clears the selection.
3. Rewrite the `Delete`/`Backspace` branch of the keyboard effect to call
   `deleteTargets(marqueeSelection, selectedShapeId)`. When `requiresConfirm` is true it opens the
   dialog and returns; otherwise it takes today's immediate `deleteShapes` path unchanged. Replace the
   stale comment on that branch and on the effect header (MapView.tsx:979) so neither still claims
   marker deletion is out of scope. Keep the typing-in-a-form-control suppression exactly as it is.
4. Render `MultiSelectBar` next to the existing `{marquee && …}` overlay, driven by
   `selectionCount(marqueeSelection)`; its `onDelete` runs the same `deleteTargets` → confirm path so
   the button and the key are one code path.
5. Objects on a LOCKED layer must never be deletable this way. Verify the exclusion holds and record
   where: locked objects render `listening={false}` and, per `marquee.ts`, hit-testing is data-driven
   over `orderObjectsForRender` output. If banding can currently reach a locked-layer object, filter
   locked ids out of the delete set in MapView and comment why.

E2E `e2e/marquee-multi-edit.spec.ts`: copy the `resetDb` / `seedMap` / `suppressPrivacyNotice`
helpers and the real-`page.mouse` band technique from `e2e/canvas-pan-marquee.spec.ts` (including its
recorded constraint that a band must start clear of the top-left toolbar column — start around
(150,260)). Seed one map with two shapes AND one person marker inside the band area. Band all three,
assert the bar shows, click Delete, confirm, then assert via `window.__rb` that the shapes are gone,
the marker row is gone, AND the person row still exists.
  </action>
  <verify>
    <automated>npx vitest run --no-file-parallelism tests/features/multiSelect.test.ts &amp;&amp; npx playwright test e2e/marquee-multi-edit.spec.ts</automated>
  </verify>
  <done>
    A band over 2+ objects + Delete (key or bar button) opens one confirm; confirming removes every
    banded shape in ONE updateMapShapes write and every banded marker/portal via deleteMarker, while
    the underlying people/groups survive. A lone selected shape still deletes instantly with no
    confirm. Locked-layer objects are untouched. Unit + e2e green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Group drag-move and bulk move-to-layer for a banded selection</name>
  <files>
    src/features/person-map/editor/groupMove.ts,
    src/features/person-map/connectors.ts,
    src/features/person-map/editor/ConnectorLayer.tsx,
    src/features/person-map/editor/MultiSelectBar.tsx,
    src/features/person-map/MapView.tsx,
    tests/features/groupMove.test.ts,
    tests/features/connectors.test.ts,
    e2e/marquee-multi-edit.spec.ts
  </files>
  <read_first>
    coords.ts (imageToStage / stageToImage and the T-03-08 zero-scale guard), ShapeNode.tsx
    handleRectDragEnd + handlePointsDragEnd (the exact delta derivation to reuse),
    AvatarMarker.tsx:117-146 (the full-put field list), PortalGlyph.tsx:83-97 (the portal field list,
    including the comment explaining that targetMapId survives only because it is threaded
    explicitly), StylePopover.tsx:139-151 (the move-to-layer control to mirror), MapView.tsx:495-505
    (draggingMarker / handleMarkerDragMove — the rAF transient-override precedent), connectors.ts:36-90.
  </read_first>
  <behavior>
    Unit (tests/features/groupMove.test.ts), all against the pure module:
    - At the IDENTITY transform a delta of (10,-5) shifts a rect shape's x/y by exactly (10,-5)
    - Under a scaled+rotated transform, applying computeGroupMove's image delta and re-composing with
      imageToStage lands the object at its original stage point plus the stage delta (round-trip)
    - A points-bearing shape has EVERY vertex shifted by the same image delta; its x/y are untouched
    - A marker's returned position is its stored x/y plus the image delta
    - A non-finite delta component returns an EMPTY result (no patches, no positions)
    - A transform with scale 0 or a non-finite scale returns an EMPTY result rather than NaN patches
    - The excluded (grabbed) id never appears in either output list

    Unit (tests/features/connectors.test.ts, appended):
    - buildConnectors honours a `dragOverrides` array for two different markers simultaneously
    - the existing singular `dragOverride` still wins/behaves identically (no regression)
  </behavior>
  <action>
Create `src/features/person-map/editor/groupMove.ts` — PURE (no React/Konva/Dexie), header in the
`marquee.ts` house style recording: that positions are stored in IMAGE space while the drag happens in
STAGE space; that the image delta is derived as `stageToImage(delta) − stageToImage({0,0})` because
that is the only derivation that correctly undoes rotation and scale (the identical technique
`ShapeNode.handlePointsDragEnd` already uses — do not hand-roll new transform math); and threat
T-NFS-03 (a non-finite delta or transform returns an EMPTY result, mirroring `boxesIntersect`'s
non-finite guard and `coords.stageToImage`'s zero-scale guard, so tampered at-rest data degrades to
"nothing moved" instead of writing NaN coordinates).

Export:
- `stageDeltaToImage(delta: Point, t: BackgroundTransform): Point | null` — null on non-finite input.
- `computeGroupMove({ deltaStage, transform, shapes, markers, excludeId }): { shapePatches: Array<{ id: string; patch: Partial<Shape> }>; markerPositions: Array<{ id: string; x: number; y: number }> }`
  where a points-bearing shape yields a `points` patch and a rect/ellipse yields an `x`/`y` patch,
  markers yield image-space positions, and `excludeId` drops the grabbed object (D-4).

Widen `connectors.ts` per D-5: add `dragOverrides?: DragOverride[] | null` to
`BuildConnectorsOptions`, merge it with the existing singular `dragOverride` into one
`Map<markerId, Point>` consulted by `endpointFor`, and document that the plural form exists because a
group drag moves several markers at once. Thread a matching optional `dragOverrides` prop through
`ConnectorLayer` to `buildConnectors`. Do not remove or rename the singular option.

In `MapView.tsx`:
1. Add `groupDrag` transient state: `{ grabbedId: string; startStage: Point; deltaStage: Point } | null`.
   Start it on the `dragstart` of any object whose id is in `marqueeShapeIdSet` or
   `marqueeMarkerIdSet` when `selectionCount >= 2`. Konva drag events bubble, so attach
   `onDragStart` / `onDragMove` / `onDragEnd` on the EXISTING wrapper `<Group>` around each
   shape/marker/portal (MapView.tsx:1316, :1353, :1382) rather than modifying `ShapeNode`,
   `AvatarMarker` or `PortalGlyph` (D-3 — those three stay untouched, as they were in
   quick-260821-nac).
2. During the drag, apply `deltaStage` as the wrapper `<Group>`'s `x`/`y` for every selected object
   EXCEPT the grabbed one (whose own Konva node is already moving). rAF-throttle the `dragmove` →
   state update exactly as `AvatarMarker.handleDragMove` does — no Dexie write may occur per frame
   (Pitfall 1 / T-NFS-04).
3. Feed connector live-follow: build a `dragOverrides` array holding each non-grabbed selected
   MARKER's live stage point (its composed `pos` plus `deltaStage`) and pass it to `ConnectorLayer`
   alongside the existing singular `draggingMarker` override for the grabbed one.
4. On drag-end, call `computeGroupMove` with `excludeId = grabbedId` and persist: ONE
   `updateMapShapes` fresh-read write applying every shape patch, plus one `upsertMarker` per moved
   marker. Each `upsertMarker` payload MUST thread `mapId`, `kind`, `personId`, `targetMapId`,
   `layerId`, `width`, `height` and `rotation` from the stored row — `upsertMarker` does a full `put`
   (repository.ts:414-436), so an omitted field is silently destroyed. Comment that with T-NFS-02 and
   point at the identical warnings in AvatarMarker.tsx and PortalGlyph.tsx.
5. Clear the transient offsets only AFTER the writes settle (`void Promise.all([...]).then(...)`), so
   the objects do not snap back to their pre-drag spots for a frame while `useLiveQuery` catches up.
6. Locked-layer objects must not move: their wrapper `<Group>` already renders `listening={false}`,
   so they cannot be grabbed — additionally exclude any locked id from the moved set and comment why.
7. Add the bulk move-to-layer control to `MultiSelectBar`: a `<select>` with
   `data-testid="multi-select-layer"`, options built from `map.layers` sorted `b.order - a.order`
   (the same top→bottom order StylePopover.tsx:145-151 uses), rendered only when `map.layers.length >
   0`. Choosing a layer applies that one `layerId` to EVERY selected shape in ONE `updateMapShapes`
   write and to every selected marker/portal via `upsertMarker` with the same full-field preservation
   as step 4. `StylePopover` itself is NOT changed.

E2E (append to `e2e/marquee-multi-edit.spec.ts`): (a) band two shapes + one marker, drag from a point
on one banded shape by a known delta with real `page.mouse`, and assert via `window.__rb` that ALL
THREE moved by the same delta — asserting the marker's `layerId` and the map's shape count are
unchanged; (b) band a shape + a portal, pick the second layer in the bar, and assert both the shape's
and the portal's `layerId` changed AND the portal's `targetMapId` survived.
  </action>
  <verify>
    <automated>npx vitest run --no-file-parallelism tests/features/groupMove.test.ts tests/features/connectors.test.ts &amp;&amp; npx playwright test e2e/marquee-multi-edit.spec.ts</automated>
  </verify>
  <done>
    Grabbing any banded object drags the entire selection by the same delta with connectors following
    live and zero writes mid-drag; drag-end persists non-grabbed shapes in one updateMapShapes write
    and each marker via a full-field upsertMarker. The bar's layer dropdown re-layers every selected
    shape and marker at once. Portals keep targetMapId; markers keep layerId/width/height/rotation.
    Locked-layer objects never move.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Layout-only box selection, group drag and pan arbitration on the relationship graph</name>
  <files>
    src/features/graph/graphGesture.ts,
    src/features/graph/GraphView.tsx,
    src/features/graph/GraphView.module.css,
    tests/features/graphGesture.test.ts,
    e2e/graph-multi-select.spec.ts
  </files>
  <read_first>
    GraphView.tsx:1-34 (the file header — its claim about boxSelectionEnabled must be rewritten, B1),
    GraphView.tsx:362-404 (registerCy: the tap, dragfree and layoutstop handlers),
    GraphView.tsx:432-487 (the toolbar and the CytoscapeComponent props),
    src/features/graph/positionCache.ts (savePositions / loadPositions),
    src/types/react-cytoscapejs.d.ts (the declared prop surface),
    src/features/graph/graphStyle.ts (confirm :selected already exists — D-12, add nothing).
  </read_first>
  <behavior>
    Unit (tests/features/graphGesture.test.ts), all against the pure module:
    - isMultiSelectModifier returns true for shiftKey, metaKey or ctrlKey individually
    - isMultiSelectModifier returns false for altKey alone, for a bare event, and for
      undefined/null (the programmatic-emit case, D-11)
    - shouldReEgo is false exactly when a multi-select modifier is held, true otherwise — including
      true for an absent originalEvent
    - shouldSuspendPanning is true only for button 0 with no altKey; false for button 1, for
      button 0 + altKey, and for a non-mouse pointerType
    - isPanButton is true only for button 1
  </behavior>
  <action>
Create `src/features/graph/graphGesture.ts` — PURE (no React, no Cytoscape import), house-style header
recording D-7 (why panning left the plain left button, and that this mirrors MapView's Konva canvas),
D-8 (why the flag is toggled at runtime instead of passed as a prop, naming the touch-pan regression
it avoids and the `react-cytoscapejs` diff-guard that makes it safe), D-10 (why the re-ego guard keys
on the modifier and not on the selection count, with the tap-before-collapse ordering) and D-11
(defensive `originalEvent`). Export `isMultiSelectModifier`, `shouldReEgo`, `shouldSuspendPanning` and
`isPanButton` over a minimal structural event type — no DOM types that would drag in a browser lib.

In `GraphView.tsx`:
1. Rewrite the header block at lines 17-21 so it describes the shipped behaviour: nodes are grabbable,
   drag is layout-only, a plain left-drag on empty background box-selects, panning is middle-drag or
   Alt+left-drag, touch is unchanged, and the graph still writes nothing but `graphPositions`. The
   contradictory `boxSelectionEnabled={false}` sentence must go.
2. Set `boxSelectionEnabled={true}` on `CytoscapeComponent`. Do NOT add a `userPanningEnabled` prop
   (D-8) — omitting it keeps `react-cytoscapejs` from ever re-applying it.
3. In `registerCy`, attach native listeners to `cy.container()`:
   - `mousedown`: if `isPanButton(e)` → `preventDefault()`, record `clientX`/`clientY`, and add
     window `mousemove`/`mouseup`/`pointercancel` listeners that `cy.panBy({ x: dx, y: dy })` by the
     delta since the previous move and tear themselves down on release — the hand-rolled middle-pan
     shape MapView already uses. Else if the event target is the graph BACKGROUND (no cytoscape
     element under the pointer) and `shouldSuspendPanning(e)` → `cy.userPanningEnabled(false)` and
     restore it to `true` on the next window `mouseup`. Restoration must be unconditional (a
     `finally`-style teardown), or a stray release leaves the graph unpannable.
   - Suppress the platform middle-click autoscroll widget with a native `mousedown` +
     `auxclick` `preventDefault()` on the container. quick-260821-nac recorded that this must be the
     NATIVE mouse event — preventing the default on a pointer event does not suppress the
     compatibility event.
   - Every listener added here must be removed on unmount; return a teardown from an effect or keep a
     ref of the disposers (T-NFS-06).
4. Guard the existing `cy.on('tap','node')` handler with `shouldReEgo(e.originalEvent)`: when a
   multi-select modifier is held, do NOT call `onSelectRef.current(...)` and do NOT `setFocusedId(...)`
   — the click is a selection gesture, not a navigation. Everything else about the handler is
   unchanged.
5. Coalesce the `dragfree` save (D-9): `dragfree` fires once per dragged element, so guard the
   existing handler with a ref-held scheduled flag (schedule one save on the next microtask / rAF,
   clear the flag when it runs) so an N-node group drag performs exactly ONE
   savePositions → loadPositions → setPosCache chain. Comment it with the `draggedElements.emit`
   citation.
6. Add a discoverability hint in the toolbar next to the existing `viewerNote` span — e.g.
   "Drag to select · Middle-drag or Alt-drag to pan" — with a matching muted class in
   `GraphView.module.css` styled like `.viewerNote` from tokens. Keep the existing viewer-only note.
7. Add nothing to `graphStyle.ts` (D-12) and add no entity/relationship delete or edit affordance —
   the PROJECT.md viewer-only principle is untouched, and the ONLY persistence remains the
   `graphPositions` meta row (T-NFS-05).

E2E `e2e/graph-multi-select.spec.ts`: reuse the `resetDb` / `suppressPrivacyNotice` / `seedGraph`
helpers and the `window.__cyGraph` driving technique from `e2e/graph.spec.ts`. Cover:
(a) a real `page.mouse` left-drag across empty background selects 2+ nodes (`cy.$(':selected').length`);
(b) with two nodes selected, a real left-drag starting on one of them moves BOTH by approximately the
same delta, and after it the `graphPositions` meta row reflects the new positions;
(c) the viewer-only invariant — snapshot `db.people`, `db.groups` and `db.relationshipLinks` before
and after the multi-drag and assert they are deep-equal;
(d) a shift-click on a second node does not open the ProfileSidebar (assert the sidebar testid stays
absent).
  </action>
  <verify>
    <automated>npx vitest run --no-file-parallelism tests/features/graphGesture.test.ts &amp;&amp; npx playwright test e2e/graph-multi-select.spec.ts e2e/graph.spec.ts</automated>
  </verify>
  <done>
    A plain left-drag on empty graph background rubber-band-selects; middle-drag and Alt+left-drag pan;
    single-finger touch pan is unaffected. Dragging a selected node moves the whole selection and
    persists exactly one graphPositions write. A modifier-click extends the selection without opening
    a profile or re-egoing. No entity table is written. The GraphView header describes the new
    behaviour. e2e/graph.spec.ts still passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| at-rest Dexie data → geometry math | shape/marker coordinates and `backgroundTransform` are restorable from a user-supplied backup, so they are untrusted input to the group-move delta |
| pointer/keyboard gesture → destructive write | a single band + keypress can now remove many rows, including marker rows |
| graph gesture → persistence | the graph must remain viewer-only; a gesture may only reach the `graphPositions` meta row |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-NFS-01 | Tampering | MapView Delete/Backspace + MultiSelectBar | high | mitigate | Any 2+ marquee delete routes through the shared blocking `ConfirmDialog` (safe Cancel focused); `deleteMarker` removes only the marker row so the person/group survives; the typing-in-a-form-control suppression and the `MARQUEE_MIN_DRAG` threshold are unchanged; no keyboard delete for a lone marker (D-2) |
| T-NFS-02 | Tampering | groupMove persist + bulk move-to-layer | high | mitigate | `upsertMarker` does a full `put`, so every payload threads `mapId`/`kind`/`personId`/`targetMapId`/`layerId`/`width`/`height`/`rotation` from the stored row; an e2e asserts a group-re-layered portal keeps its `targetMapId` and a group-moved marker keeps its `layerId` |
| T-NFS-03 | Tampering | groupMove.computeGroupMove | medium | mitigate | Returns an EMPTY result for a non-finite delta or a zero/non-finite transform scale, so corrupt at-rest geometry degrades to "nothing moved" instead of writing NaN coordinates; unit-tested, mirroring `marquee.boxesIntersect` and `coords.stageToImage` |
| T-NFS-04 | Denial of Service | group drag (map) + `dragfree` (graph) | medium | mitigate | Drag-time movement is a transient wrapper offset only, rAF-throttled, with zero Dexie writes per frame; persistence is one `updateMapShapes` + one `upsertMarker` per marker on drag-end; the graph's per-element `dragfree` is coalesced to a single `savePositions` per gesture |
| T-NFS-05 | Elevation of Privilege | GraphView | high | mitigate | No entity delete/edit affordance is added; the only write remains the `graphPositions` meta row; an e2e snapshots `db.people`/`db.groups`/`db.relationshipLinks` around a multi-node drag and asserts deep equality |
| T-NFS-06 | Denial of Service | hand-rolled middle-pan window listeners (graph) | low | accept | Accepted as designed, matching T-QT-04: listeners mount only while a gesture is active, tear down on release/`pointercancel`, are removed on unmount, and touch only the local Cytoscape core |
| T-NFS-SC | Tampering | supply chain | low | accept | This task installs NOTHING — no npm/pip/cargo install task exists, so the package-legitimacy gate is not engaged. Adding a dependency is forbidden by the CLAUDE.md free/OSS + no-backend constraints; if one becomes tempting, stop and re-plan |
</threat_model>

<verification>
Run after the last task, in this order:

1. `npm run typecheck` — clean.
2. `npx eslint` over EVERY file in `files_modified` — **zero errors, zero new warnings**. The repo-wide
   lint debt (16 errors / 17 warnings) in untouched files is out of scope
   (`.planning/quick/260821-nac-.../deferred-items.md` item 2) — do not fix it, do not let it mask a
   real error in a touched file.
3. `npx vitest run --no-file-parallelism` — full suite. The baseline is **405 passing / 61 files**;
   this task adds files, so the count only goes up. Per project memory, a plain `vitest run` can
   false-fail with fork-worker startup timeouts under load — `--no-file-parallelism` is the confirming
   re-run, not a workaround for a real failure.
4. `npx playwright test e2e/marquee-multi-edit.spec.ts e2e/graph-multi-select.spec.ts` — all green.
5. Canvas + graph regression set:
   `npx playwright test e2e/canvas-pan-marquee.spec.ts e2e/draw-shapes.spec.ts e2e/place-person.spec.ts e2e/layers.spec.ts e2e/portal.spec.ts e2e/delete-vs-remove.spec.ts e2e/connectors.spec.ts e2e/graph.spec.ts`
   — all green.

**Known-failing, DO NOT FIX, DO NOT MISTAKE FOR A REGRESSION:** `e2e/marker.spec.ts:63`,
`e2e/marker.spec.ts:90` and `e2e/transform-marker.spec.ts:65` already fail on `master` because
`createMap` yields an empty `layers` array and `orderObjectsForRender` drops objects whose layer
cannot be resolved. This was verified pre-existing at `c9fe3a3` and is documented as item 1 of
`.planning/quick/260821-nac-middle-click-pan-marquee-select-auto-ret/deferred-items.md`.
</verification>

<success_criteria>
- A map band of 2+ objects + Delete removes every banded shape, marker and portal after one confirm;
  the underlying people and groups survive.
- The single selected-shape Delete path is byte-for-byte the behaviour it is today: no confirm.
- Grabbing any banded object moves the whole selection by one delta, with connectors following live,
  no per-frame writes, and one persist per object on drag-end.
- One action re-layers every banded shape AND marker/portal; portals keep `targetMapId`, markers keep
  `layerId`/`width`/`height`/`rotation`.
- Locked-layer objects are never moved, re-layered or deleted by a group action.
- On the graph a plain left-drag on empty background bands; middle-drag and Alt+left-drag pan; touch
  panning is unchanged; dragging a selected node moves the whole selection with ONE position write.
- A modifier-click on the graph extends the selection without opening a profile or re-egoing.
- `db.people`, `db.groups` and `db.relationshipLinks` are byte-identical after any graph gesture.
- The GraphView file header no longer contradicts its own code.
- No new dependency; no backend; no change to the PROJECT.md viewer-only principle.
- Every touched file lints clean and typechecks; full vitest suite and the listed e2e specs pass.
</success_criteria>

<output>
Create `.planning/quick/260902-nfs-marquee-multi-select-move-and-delete-on-/260902-nfs-SUMMARY.md`
when done, following the SUMMARY shape of
`.planning/quick/260821-nac-middle-click-pan-marquee-select-auto-ret/260821-nac-SUMMARY.md`
(frontmatter with requires/provides/affects/decisions, a What Was Built section keyed by task with
commit SHAs, a Verification table, Deviations, Threat Mitigations Applied, and a Self-Check).
</output>

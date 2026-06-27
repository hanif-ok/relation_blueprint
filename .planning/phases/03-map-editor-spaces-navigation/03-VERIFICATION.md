---
phase: 03-map-editor-spaces-navigation
verified: 2026-06-27T10:35:00Z
status: human_needed
score: 4/7 must-haves verified
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "The map editor stays responsive (no jank) when a map holds many markers"
    test: "Open a map with 100+ markers (seed via testBridge), pan and zoom, observe render smoothness"
    expected: "No visible jank or dropped frames during pan/zoom at high marker counts"
    why_human: "Performance is only observable at runtime with real canvas rendering; grep cannot detect dropped frames"
  - truth: "User can select a placed marker and resize/rotate it via on-canvas transform handles, with the new size/rotation persisting across reloads"
    test: "Click a marker (select it), drag a Transformer corner handle to resize and a rotation handle to rotate, then reload the page"
    expected: "Transformer handles appear on selection, pointer events resize/rotate the marker, and the new width/height/rotation survive a page reload"
    why_human: "Transformer handle interactivity requires real canvas pointer events; unit tests prove the persist logic (computeTransformPersist) and the E2E proves persistence through a bridge call, but the live handle drag path needs browser observation"
  - truth: "User can resize/transform the map background image via handles, and the change persists"
    test: "Click 'Edit background', drag the background image to reposition it and use Transformer handles to scale/rotate, then reload"
    expected: "Background Transformer handles appear, allow drag/scale/rotate, MapDoc.backgroundTransform persists after reload, and already-placed markers stay anchored to their physical spot (not their screen position)"
    why_human: "Background Transformer interactivity and the marker-anchoring invariant require real canvas pointer events and visual verification; the anchoring property is unit-tested (coords.test.ts) and E2E-tested (transform-background.spec.ts via bridge) but the live drag path needs browser observation"
human_verification:
  - test: "Responsive map with many markers"
    expected: "No jank during pan/zoom with 100+ markers"
    why_human: "Performance requires runtime observation — viewport culling is wired but jank can only be seen in a browser"
  - test: "On-canvas marker transform handles"
    expected: "Amber Transformer handles appear on marker selection, allow pointer-drag resize and rotation, and the result persists across reload"
    why_human: "Canvas Transformer handle interaction requires real pointer events and visual confirmation that the amber handles are rendered and grabbable"
  - test: "On-canvas background image transform"
    expected: "Edit-background toggle attaches Transformer to the KonvaImage; drag/scale/rotate updates MapDoc.backgroundTransform; markers stay anchored; change persists on reload"
    why_human: "Background Transformer interaction and the visual confirmation that markers stay anchored under a re-fit background require browser observation"
---

# Phase 3: Map Editor — Spaces & Navigation Verification Report

**Phase Goal:** A user can build real spatial maps — drawing rooms/areas with shapes/zones on layers, linking maps together with portal markers into floor→building→street hierarchies, and placing one person across multiple maps at once.
**Verified:** 2026-06-27T10:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can draw shapes, lines, and zones on a map to mark rooms/areas and organize them into layers | VERIFIED | `ShapeNode.tsx` renders Rect/Ellipse/Line/polygon-closed via Konva primitives composed through `imageToStage`; `ZoneLabel.tsx` renders labeled shapes as Konva Text (XSS-safe); `LayersPanel.tsx` + pure `layers.ts` model provides create/rename/reorder/show-hide/lock; all persist through `updateMap`. `shapes.test.ts`, `useToolMode.test.ts`, `layers.test.ts` all pass (34 tests spot-checked live). `draw-shapes.spec.ts` + `layers.spec.ts` E2E exist. |
| 2 | User can place a portal location-link marker with a distinctive unique shape that navigates to another map | VERIFIED | `PortalGlyph.tsx` renders a door-arch (upright `Rect` + inner `Path` in `colors.portal #3E6B8C`, NOT a Circle per D-06); `onClick`/`onTap` select, `onDblClick`/`onDblTap` navigate. `PortalTargetPicker.tsx` shows create-or-pick Dialog with "Where does this portal go?" copy + cancel removes via `deleteMarker`. Deleted-target path: muted glyph + "destination deleted" message (T-03-10). `portal.test.ts` passes (6 cases). `portal.spec.ts` E2E exists and asserts descend + select-vs-navigate. |
| 3 | User can nest maps into spatial map-groups (floor→building→street) and navigate up and down the hierarchy | VERIFIED | Up: `Breadcrumb.tsx` walks `MapDoc.parentId` via pure `mapHierarchy.buildAncestorChain` (visited-Set + `MAX_CHAIN_DEPTH=32` cycle/depth guard); `aria-current="page"` on current crumb; ancestor crumbs are buttons that set that map active. Down: `PortalGlyph.tsx` `onDblClick`/`onDblTap` → `onNavigate(targetMapId)` → App `setActiveMapId`. Hierarchy established by `PortalTargetPicker` `updateMap(child.id, { parentId: currentMapId })`. `hierarchy.test.ts` passes all 6 cases (chain, top-level, cycle terminate, dangling, depth cap). `map-switch.spec.ts` + `portal.spec.ts` E2E exist. |
| 4 | A single person placed on multiple maps stays one canonical record — edits propagate to every placement | VERIFIED | `PersonPicker.tsx` calls `upsertMarker({ kind:'person', personId, mapId, x, y, layerId })` with NO `id`, so each placement is a new Marker row (D-13). `multiPlacement.test.ts` asserts 2 markers / 1 person (passes live). `appearsOn.test.ts` `criterion 4` asserts rename leaves 1 Person + both markers with per-placement x/y intact (passes live). `ProfileSidebar.tsx` shows "Appears on:" section via `db.markers.where('personId')` + `groupPlacementsByMap`. `onJumpToPlacement` wired end-to-end in App.tsx. `place-person.spec.ts` E2E exists and asserts the full MAP-05 flow. |
| 5 | The map editor stays responsive (no jank) when a map holds many markers | PRESENT_BEHAVIOR_UNVERIFIED | Code exists: `useViewportCulling.ts` (pure `getVisibleRect`/`intersects` + debounced hook wired to Stage `onDragEnd`/`onWheel`); 3 physical Konva Layers (confirmed — L0 bg, L1 content, L2 transformer); `makeSyntheticMarkers` fixture for perf spike. `coords.test.ts` passes culling geometry. Runtime performance requires browser observation. |
| 6 | User can select a placed marker and resize/rotate via on-canvas transform handles, with new size/rotation persisting across reloads | PRESENT_BEHAVIOR_UNVERIFIED | Code exists: `TransformerOverlay.tsx` attaches a single amber Konva.Transformer to the selected node (ref+useEffect, idempotent); `computeTransformPersist` bakes scaleX/scaleY into width/height (clamps to MIN), passes rotation, calls `upsertMarker` for markers; `boundBoxFunc` enforces min size; `AvatarMarker.tsx` consumes `width`/`height`/`rotation`. All unit tests pass (6 `transformerOverlay` cases). `transform-marker.spec.ts` E2E asserts persistence via bridge. Live handle drag-interact requires browser observation. |
| 7 | User can resize/transform the map background image via handles, and the change persists | PRESENT_BEHAVIOR_UNVERIFIED | Code exists: MapView "Edit background" toggle makes L0 interactive + attaches Transformer to `KonvaImage`; `handleBackgroundTransformEnd` reads node x/y/scaleX/rotation → persists `MapDoc.backgroundTransform` via `updateMap`. Markers compose through `imageToStage(transform)` so a re-fit keeps them anchored (image-space x/y unchanged). `bgTransform.anchor.test.ts` + `transform-background.spec.ts` both exist and prove persistence + anchoring through bridge. Live background drag-interact requires browser observation. |

**Score:** 4/7 truths verified (3 present, behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/types.ts` | Marker transform/portal fields; MapDoc parentId/backgroundTransform/shapes/layers; Shape/Layer/BackgroundTransform interfaces | VERIFIED | `MarkerKind`, `Shape`, `Layer`, `BackgroundTransform` interfaces present; `Marker.kind/targetMapId/width/height/rotation` added; `MapDoc.parentId/backgroundTransform/shapes[]/layers[]` added |
| `src/domain/schemas.ts` | Zod schemas mirroring new types, all optional-with-default; satisfies locks preserved | VERIFIED | `ShapeSchema`, `LayerSchema`, `BackgroundTransformSchema`, `MarkerKindSchema` present; all new fields have `.optional()` or `.default()`; `satisfies` locks present |
| `src/db/schema.ts` | Dexie version(4) upgrade backfilling marker kind + map backgroundTransform/layers/shapes defaults | VERIFIED | `this.version(4)` block confirmed at line 99; migrates marker `kind='person'` + map identity `backgroundTransform` + empty `shapes` + default "Markers" layer |
| `src/db/repository.ts` | Extended `upsertMarker` accepting kind/targetMapId/width/height/rotation/layerId | VERIFIED | `UpsertMarkerInput` includes all fields (lines 314-322); `upsertMarker` passes `kind ?? 'person'`, `targetMapId`, `layerId`, `rotation` |
| `src/features/person-map/coords.ts` | `imageToStage`/`stageToImage` composition for image-space anchoring | VERIFIED | Both functions exported; identity-safe; `scale===0` guard present; `coords.test.ts` passes identity/round-trip/anchoring/guard cases |
| `src/features/person-map/editor/useViewportCulling.ts` | `visibleStageRect` + `intersects` culling hook | VERIFIED | `getVisibleRect`, `intersects`, `useViewportCulling` all exported; debounced recompute on pan/zoom END; geometry functions pure + unit-tested |
| `src/features/person-map/editor/MapSwitcher.tsx` | Radix DropdownMenu active-map switcher + "+ New map" item | VERIFIED | File exists; feeds `useLiveQuery(() => db.maps.toArray())`; "+ New map" item present |
| `src/features/person-map/editor/Breadcrumb.tsx` | Parent-chain breadcrumb (cycle-safe) | VERIFIED | Wraps `buildAncestorChain` from `mapHierarchy.ts`; `aria-current="page"` on current crumb; ancestor crumbs are buttons |
| `src/features/person-map/editor/mapHierarchy.ts` | Pure cycle-safe chain builder (not in plan, extracted as key decision) | VERIFIED | `MAX_CHAIN_DEPTH=32` + `visited Set`; `buildAncestorChain` exported |
| `src/features/person-map/editor/useToolMode.ts` | Pan/draw/select interaction state machine | VERIFIED | `useToolMode` exported; `deriveStageDraggable`/`isDrawMode`/`beginDraw`/`updateDraw`/`commitDraw`/polygon helpers all exported; `useToolMode.test.ts` passes (12 cases) |
| `src/features/person-map/editor/ToolPalette.tsx` | 7 tool buttons (Select/Rect/Ellipse/Line/Polygon/Portal/Person) | VERIFIED | All 7 Lucide glyphs imported and used (MousePointer2/Square/Circle/Slash/Pentagon/DoorOpen/UserPlus) |
| `src/features/person-map/editor/ShapeNode.tsx` | Renders Shape descriptor; drag-persists via updateMap | VERIFIED | All 4 Konva primitives (Rect/Ellipse/Line/Line-closed); composes through `imageToStage`; drag-end converts via `stageToImage`; persists via `updateMap` |
| `src/features/person-map/editor/ZoneLabel.tsx` | XSS-safe Konva Text chip for shape labels | VERIFIED | Renders via `<Text text={label} />`; the only `dangerouslySetInnerHTML` mention is in a comment saying it is NEVER used |
| `src/features/person-map/editor/StylePopover.tsx` | 5-preset palette + fill toggle + zone label + move-to-layer | VERIFIED | Preset swatches, fill toggle (disabled for lines), label input, layer dropdown all present; persists via `updateMap` |
| `src/features/person-map/editor/layers.ts` | Pure logical-layer model: `resolveLayer`, `orderObjectsForRender`, CRUD transforms | VERIFIED | All 8 CRUD functions + `resolveLayer`/`orderObjectsForRender`/`ensureLayers`/`layersTopToBottom` exported; `deleteLayer` refuses last layer |
| `src/features/person-map/editor/LayersPanel.tsx` | Per-map layers panel: create/rename/reorder/show-hide/lock + D-20 toggle | VERIFIED | Eye/EyeOff/Lock/LockOpen glyphs; `updateMap` for all persistence; "Show name labels" checkbox wired to `showLabels`; delete disabled when only one layer |
| `src/features/person-map/editor/TransformerOverlay.tsx` | Single Konva.Transformer with amber handles, scale-reset-to-1, boundBoxFunc | VERIFIED | `computeTransformPersist` exported; `colors.amber` on anchor/border stroke; `boundBoxFunc` enforces `MIN_TRANSFORM_SIZE`; idempotent `useEffect` attach |
| `src/features/person-map/editor/PortalGlyph.tsx` | Door-arch portal marker; single-click select / double-click navigate | VERIFIED | Renders `Rect` + `Path` (NOT Circle); `colors.portal` fill; all 4 event handlers (`onClick/onTap/onDblClick/onDblTap`) present; deleted-target degradation |
| `src/features/person-map/editor/PortalTargetPicker.tsx` | Create-or-pick inline; sets parentId; cancel removes portal | VERIFIED | `createMap`/`updateMap`/`upsertMarker`/`deleteMarker` all called; "Where does this portal go?" copy; `parentId = currentMapId` set on inline-create |
| `src/features/person-map/editor/PersonPicker.tsx` | Searchable people list; fires `onPick(personId)` | VERIFIED | `useLiveQuery(db.people.orderBy('name'))` reactive read; `onPick` prop; all text rendered as React children (no innerHTML); empty state present |
| `src/features/profile/ProfileSidebar.tsx` | "Appears on:" section with jump-to-placement | VERIFIED | `db.markers.where('personId')` query; `groupPlacementsByMap` pure helper exported; "APPEARS ON" eyebrow; `onJumpToPlacement` prop wired; "(deleted map)" degradation |
| `src/app/App.tsx` | `activeMapId` state lifted; `jumpToPlacement`; `onJumpToPlacement` into ProfileSidebar | VERIFIED | `activeMapId` state at line 38; `jumpToPlacement` at line 206; `onJumpToPlacement` wired to ProfileSidebar at line 310; `focusMarkerId` state threaded into MapView |
| `src/features/person-map/MapView.tsx` | 3 physical Konva Layers; image-space compose; draw wiring; single-select; background transform; portal + person tool wiring | VERIFIED | Exactly 3 `<Layer>` elements (L0/L1/L2); `imageToStage` + `useViewportCulling` imports; `ToolPalette`/`ShapeNode`/`TransformerOverlay`/`PortalGlyph`/`PersonPicker` all imported and mounted; `stageDraggable` from `useToolMode`; `backgroundTransform` consumed |
| `tests/db/markerCoordMigration.test.ts` | Load-bearing migration round-trip test | VERIFIED | Passes live: x/y UNCHANGED after v4 upgrade, identity transform, default layer backfilled |
| `tests/db/multiPlacement.test.ts` | MAP-05 multi-placement | VERIFIED | Passes live: 2 markers / 1 person; edit leaves 1 person |
| `tests/features/transformerOverlay.test.ts` | `computeTransformPersist` unit tests | VERIFIED | Passes live: 6 cases (bake/clamp/rotation/image-space/marker-payload/shape-payload) |
| `tests/features/hierarchy.test.ts` | Ancestor chain (MAP-07) incl. cycle detection | VERIFIED | Passes live: chain build, top-level, unknown, cycle terminates, dangling degrades, depth cap |
| `tests/features/portal.test.ts` | Portal placement + hierarchy + cancel + deleted-target | VERIFIED | Passes live: 6 cases |
| `tests/features/appearsOn.test.ts` | Grouping + canonical-record propagation (criterion 4) | VERIFIED | Passes live: 5 cases incl. rename-propagation |
| `tests/features/layers.test.ts` | Layer ordering/visibility/locking/CRUD/last-layer-guard | VERIFIED | Passes live: 14 cases |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `src/app/App.tsx` | `src/features/person-map/MapView.tsx` | `activeMapId` prop (line 265) | VERIFIED |
| `src/features/person-map/MapView.tsx` | `src/features/person-map/coords.ts` | `imageToStage` import (line 30) used at render for each marker/shape | VERIFIED |
| `src/features/person-map/editor/Breadcrumb.tsx` | `src/features/person-map/editor/mapHierarchy.ts` | `buildAncestorChain` import (line 18) | VERIFIED |
| `src/features/person-map/editor/TransformerOverlay.tsx` | `src/db/repository.ts` | `upsertMarker`/`updateMap` in `computeTransformPersist` persist paths | VERIFIED |
| `src/features/person-map/AvatarMarker.tsx` | `src/features/person-map/coords.ts` | `stageToImage` import (line 25) used in `handleDragEnd` | VERIFIED |
| `src/features/person-map/editor/PortalGlyph.tsx` | `src/app/App.tsx` via prop | `onNavigate(targetMapId)` → `setActiveMapId` (double-click descend, D-07) | VERIFIED |
| `src/features/person-map/editor/PortalTargetPicker.tsx` | `src/db/repository.ts` | `createMap`/`updateMap`/`upsertMarker`/`deleteMarker` all called (line 24) | VERIFIED |
| `src/features/profile/ProfileSidebar.tsx` | `src/db/schema.ts` | `db.markers.where('personId').equals(id)` at line 204 | VERIFIED |
| `src/features/profile/ProfileSidebar.tsx` | `src/app/App.tsx` | `onJumpToPlacement` prop wired at line 310 | VERIFIED |
| `src/features/person-map/editor/ShapeNode.tsx` | `src/db/repository.ts` | `updateMap` import (line 24) called on drag-end | VERIFIED |
| `src/features/person-map/editor/LayersPanel.tsx` | `src/db/repository.ts` | `updateMap` import (line 23) called for all layer CRUD | VERIFIED |
| `src/features/person-map/MapView.tsx` | `src/features/person-map/editor/useToolMode.ts` | `useToolMode` import (line 45); `stageDraggable` drives `Stage.draggable` (line 745) | VERIFIED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `MapView.tsx` markers render | `markers` + `map` | `useLiveQuery(() => db.maps.get(activeMapId))` + `useLiveQuery(() => db.markers.where('mapId').equals(...))` | Yes — Dexie IndexedDB queries on real data | FLOWING |
| `ProfileSidebar.tsx` "Appears on" | `placements` | `db.markers.where('personId').equals(id)` (line 204) | Yes — indexed Dexie query, reactive | FLOWING |
| `LayersPanel.tsx` layer rows | `map.layers` | `MapDoc.layers` via `useLiveQuery(db.maps.get(...))` in MapView → prop | Yes — MapDoc sub-object from real DB record | FLOWING |
| `PersonPicker.tsx` people list | `people` | `useLiveQuery(() => db.people.orderBy('name').toArray())` (line 80) | Yes — Dexie query, reactive | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration: x/y unchanged after v4 upgrade | `npx vitest run tests/db/markerCoordMigration.test.ts --no-file-parallelism` | 1/1 PASS (35ms) | PASS |
| Multi-placement: 2 markers / 1 person | `npx vitest run tests/db/multiPlacement.test.ts --no-file-parallelism` | 2/2 PASS (8ms+23ms) | PASS |
| Portal placement + hierarchy + cancel + deleted-target | `npx vitest run tests/features/portal.test.ts --no-file-parallelism` | 6/6 PASS | PASS |
| Ancestor chain (incl. cycle terminate) | `npx vitest run tests/features/hierarchy.test.ts --no-file-parallelism` | 6/6 PASS | PASS |
| Layers ordering/visibility/locking/CRUD | `npx vitest run tests/features/layers.test.ts --no-file-parallelism` | 14/14 PASS | PASS |
| Appears-on grouping + canonical propagation | `npx vitest run tests/features/appearsOn.test.ts --no-file-parallelism` | 5/5 PASS | PASS |
| computeTransformPersist (scale-reset-to-1 bake) | `npx vitest run tests/features/transformerOverlay.test.ts --no-file-parallelism` | 6/6 PASS | PASS |
| coords: identity, round-trip, anchoring, scale:0 guard | `npx vitest run tests/features/coords.test.ts --no-file-parallelism` | 7/7 PASS | PASS |
| PersonPicker placement: new row per pick; 2 maps / 1 person | `npx vitest run tests/features/personPicker.test.ts --no-file-parallelism` | 3/3 PASS | PASS |
| E2E tests (exist and non-stub) | Inspect `e2e/*.spec.ts` created this phase | `draw-shapes`, `layers`, `map-switch`, `portal`, `place-person`, `transform-marker`, `transform-background` all exist with real assertions | PASS (existence) |
| E2E tests (runtime) | Requires browser/dev-server | Not run (server required) | SKIP |

### Probe Execution

No probes declared in PLAN files. Phase does not follow the migration/tooling probe convention.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| MAP-02 | Plans 03, 04 | User can draw shapes, lines, and zones on a map to mark rooms/areas | SATISFIED | `ShapeNode`, `useToolMode`, `StylePopover`, `ZoneLabel` all wired; `shapes.test.ts` + `draw-shapes.spec.ts` |
| MAP-03 | Plan 05 | User can organize map content into layers | SATISFIED | `layers.ts` pure model + `LayersPanel` + logical-layer render in MapView; `layers.test.ts` + `layers.spec.ts` |
| MAP-05 | Plan 07 | A single person can be placed on multiple maps at once | SATISFIED | `PersonPicker` + upsert-no-id = new row; `multiPlacement.test.ts` + `appearsOn.test.ts` + `place-person.spec.ts` |
| MAP-06 | Plan 06 | User can place a location-link marker with a distinctive shape that navigates to another map | SATISFIED | `PortalGlyph` (door-arch, not round) + `PortalTargetPicker` + `portal.test.ts` + `portal.spec.ts` |
| MAP-07 | Plans 02, 06 | User can nest maps into spatial map-groups and navigate the hierarchy | SATISFIED | `Breadcrumb` (ascend) + portal `onDblClick` (descend) + `mapHierarchy.buildAncestorChain` (cycle-safe) + `hierarchy.test.ts` + `map-switch.spec.ts` + `portal.spec.ts` |

No orphaned requirements found. All 5 phase requirements (MAP-02/03/05/06/07) are claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/features/person-map/MapView.tsx` | 9 | Stale comment: "empty placeholder layer, populated by 03-04 (Transformer)" — L2 IS now populated (TransformerOverlay at line 877) | INFO | No functional impact; documentation drift only |
| `src/features/person-map/MapView.tsx` | 463 | Stale comment: "polygon arrives alongside the Transformer in 03-04" — Polygon was not wired in 03-04 or any later plan | INFO | Stale reference; see polygon warning below |
| `src/features/person-map/editor/ToolPalette.tsx` + `MapView.tsx` | — | Polygon tool exists in ToolPalette (armed, shortcut P) but pointer-down no-ops in MapView (comment: "deferred to 03-04"). Pure polygon helpers (`addPolygonVertex`/`closePolygon`) exist in `useToolMode.ts` and are unit-tested, but multi-click wiring in MapView was never delivered in any of Plans 03-07. The plan-03 must_have explicitly listed Polygon. | WARNING | Polygon tool button is non-functional; does not block the phase goal (Rect/Ellipse/Line satisfy MAP-02 "draw shapes/zones") but is an unfulfilled plan-level must_have. No later phase covers it. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-modified source files.

No empty-return stubs (`return null`, `return {}`, `return []`, `=> {}`) found in key rendering paths.

### Human Verification Required

#### 1. Map editor responsiveness with many markers

**Test:** Open the app with a database containing 100+ person markers on one map (seed via `window.__rb` or the synthetic-markers fixture). Pan the map by dragging, then zoom in and out via scroll wheel or pinch. Observe for dropped frames, lag, or janky scrolling.
**Expected:** Smooth pan/zoom at 60fps with no visible jank; off-screen markers should not be mounted (viewport culling via `useViewportCulling` is wired).
**Why human:** Performance can only be observed at runtime in a real browser with real canvas rendering and real GPU compositing. Grep cannot detect a dropped frame.

#### 2. On-canvas marker resize and rotate via Transformer handles

**Test:** Open a map with a placed person marker. Click the marker to select it. Amber Transformer handles should appear (from `TransformerOverlay.tsx` in L2). Drag a corner handle to resize. Drag the rotation knob to rotate. Reload the page and inspect the marker.
**Expected:** Amber Transformer handles render and are interactive (pointer-drag resizes; rotation handle rotates). After reload the marker's `width`, `height`, and `rotation` are the persisted values (the `computeTransformPersist` bake is unit-tested; the bridge E2E in `transform-marker.spec.ts` proves persistence; this step confirms the live canvas path).
**Why human:** Transformer handle rendering and pointer-event interactivity require a real browser canvas. The E2E covers persistence through a bridge call; the live handle-drag path has not been exercised by automated tests.

#### 3. On-canvas background image resize/transform, markers stay anchored

**Test:** Open a map with a placed person marker. Click "Edit background" (the toggle in MapView that enables background-transform mode). The background image should become draggable and show Transformer handles. Drag to reposition, use a corner handle to scale, use the rotation knob to rotate. Confirm the "Transforming background — markers stay anchored." hint chip appears. Reload the page.
**Expected:** After the background transform: (a) `MapDoc.backgroundTransform` persists (offset/scale/rotation changed); (b) the marker's stored image-space `x`/`y` are UNCHANGED; (c) the marker visually appears to stay in the same physical spot on the image (it moves with the background). The unit test (`bgTransform.anchor.test.ts`) and bridge E2E (`transform-background.spec.ts`) prove the data invariants; this step confirms the live UI affordance.
**Why human:** The visual confirmation that the "Edit background" toggle works, that handles appear on the background image, and that the anchor-in-place behavior looks correct to a user requires real browser interaction.

---

## Gaps Summary

No blocking gaps. All 7 phase success criteria have implementing code in place.

**Notable warning (non-blocking):** The Polygon drawing tool appears in the ToolPalette (armed with shortcut P) but does not draw — `handlePointerDown` in MapView is a no-op for the polygon tool (the comment says "polygon is multi-click — deferred to 03-04"). The pure `addPolygonVertex`/`closePolygon` helpers in `useToolMode.ts` are tested, but the multi-click wiring was never delivered across Plans 03-07. This was an explicit plan-03 must_have and no later phase covers it. The phase-level success criterion 1 ("draw shapes, lines, and zones") is satisfied by Rect/Ellipse/Line, so this is not a blocking gap for the phase goal. To formally accept this deviation, add an override entry to this file's frontmatter.

---

_Verified: 2026-06-27T10:35:00Z_
_Verifier: Claude (gsd-verifier)_

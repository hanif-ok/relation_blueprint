---
phase: 03-map-editor-spaces-navigation
reviewed: 2026-07-02T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/app/App.tsx
  - src/app/tokens.ts
  - src/db/repository.ts
  - src/db/schema.ts
  - src/db/testBridge.ts
  - src/domain/schemas.ts
  - src/domain/types.ts
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/MapView.tsx
  - src/features/person-map/coords.ts
  - src/features/person-map/editor/Breadcrumb.tsx
  - src/features/person-map/editor/LayersPanel.tsx
  - src/features/person-map/editor/MapSwitcher.tsx
  - src/features/person-map/editor/PersonPicker.tsx
  - src/features/person-map/editor/PortalGlyph.tsx
  - src/features/person-map/editor/PortalTargetPicker.tsx
  - src/features/person-map/editor/ShapeNode.tsx
  - src/features/person-map/editor/StylePopover.tsx
  - src/features/person-map/editor/ToolPalette.tsx
  - src/features/person-map/editor/TransformerOverlay.tsx
  - src/features/person-map/editor/ZoneLabel.tsx
  - src/features/person-map/editor/layers.ts
  - src/features/person-map/editor/mapHierarchy.ts
  - src/features/person-map/editor/useToolMode.ts
  - src/features/person-map/editor/useViewportCulling.ts
  - src/features/profile/ProfileSidebar.tsx
  - tests/features/markerTransform.roundtrip.test.ts
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-02
**Depth:** standard
**Files Reviewed:** 27 source files (+ selected tests)
**Status:** issues_found

## Summary

This is a RE-REVIEW pass. The previously-reported CR-01/CR-02 and WR-01..WR-05 findings are
confirmed fixed (see the `fix(03):` commits) and are NOT re-reported. The coordinate-transform
math (`coords.ts`), the layer/hierarchy pure modules, the Dexie version(4) migration, and the
marker (person/portal) transform-bake path are all correct and well-guarded — the scale/rotation
inverse in `stageToImage` was verified by hand, the breadcrumb cycle/dangling guards are present,
and `layerId` is correctly threaded through the marker persist paths.

Two **BLOCKER** correctness defects remain in the current code, both in core editor flows: (1) the
shape Transformer discards node translation, so resizing a rect/ellipse/line/polygon from any
non-anchor handle jumps the shape to a wrong position; and (2) deleting the currently-active map
strands the entire Map surface blank with no in-surface recovery. Three WARNINGs cover a
stale-snapshot lost-update race on `MapDoc.shapes`, a test-bridge fidelity bug that drops
`layerId`, and cull-rect staleness on viewport resize. Three Info items are lower-severity items
the prior Critical+Warning fix pass would have skipped.

## Critical Issues

### CR-01: Shape Transformer resize discards node translation — rect/ellipse/line/polygon jump on resize

**File:** `src/features/person-map/editor/TransformerOverlay.tsx:120-155` (shape branch); wired via `src/features/person-map/editor/ShapeNode.tsx:115-130`

**Issue:** The marker branch of `computeTransformPersist` inverse-composes the node's post-transform
position back to image space (`stageToImage({ x: node.x(), y: node.y() }, transform)`, line 159). The
**shape branch never reads `node.x()`/`node.y()`** — it bakes only `width`/`height`/`rotation` (and,
for line/polygon, scales `points` about their centroid) and returns `{ ...s, width, height, rotation }`
with `s.x`/`s.y` unchanged. `ShapeNode.handleTransformEnd` resets only the node's scale (`resetScale`),
not its position, so on the next render the shape is re-placed at its **stale** stored origin
(`Rect x={origin.x}` where `origin = imageToStage(shape.x)`; Ellipse re-derives its center from the
stale box origin).

Konva's Transformer only leaves `x`/`y` unchanged when the user drags the bottom-right anchor of a
top-left-origin node. Dragging the top or left anchors (or resizing an Ellipse, whose `x`/`y` is the
center) moves the node's position — and that translation is thrown away. The shape visibly snaps back
to its old origin with the new size, so 3 of the 4 corner handles produce (and persist) wrong
geometry for a core D-14/D-15 resize operation.

**Fix:** Capture and persist the shape's new position in the shape branch, mirroring the marker
branch. For rect: inverse-compose `node.x()/node.y()` to image space and store it as `x`/`y`. For
ellipse: inverse-compose the center then derive the box origin (`center − halfSize`). For
line/polygon: fold the node's translation delta into the scaled points. Example (rect):

```ts
// shape branch, before building `next`:
const originImg = stageToImage({ x: node.x(), y: node.y() }, transform);
// ...
return { ...s, x: originImg.x, y: originImg.y, width: imgWidth, height: imgHeight, rotation: ownRotation };
```

### CR-02: Deleting the active map strands the Map view blank with no recovery affordance

**File:** `src/app/App.tsx:38,94-96,349-356`; `src/features/person-map/MapView.tsx:681-716,939`

**Issue:** `activeMapId` is only ever seeded when it is `null` (`App.tsx:95`:
`if (activeMapId === null && firstMap) setActiveMapId(firstMap.id)`). Nothing resets it when the map
it points at is deleted. Deleting the currently-active Location (browse-list delete or the
ProfileSidebar cascade — `deleteEntity('maps', id)`, `App.tsx:349-356`) leaves `activeMapId` pointing
at a now-missing row.

In `MapView`, `map = db.maps.get(activeMapId)` becomes `undefined`, so `hasMap` is false and the
entire toolbar — **including the `MapSwitcher` and `Breadcrumb`** — is gated behind `hasMap &&`
(`MapView.tsx:688`) and is not rendered. The empty-state upload block is gated behind `!hasAnyMap`
(`MapView.tsx:939`), which is also false because other maps still exist. Result: the primary Map
surface renders as an empty dark `<div>` with no switcher, no breadcrumb, and no empty state — the
user cannot select another map from within the Map view, and no effect re-seeds `activeMapId`.

**Fix:** Add an effect that re-seeds `activeMapId` once the active map is confirmed gone (guarding the
transient `undefined` while `useLiveQuery` is still loading):

```ts
useEffect(() => {
  // activeMap === undefined only after the query resolved with no row (deleted).
  if (activeMapId && activeMap === undefined) {
    setActiveMapId(firstMap?.id ?? null);
  }
}, [activeMapId, activeMap, firstMap]);
```

## Warnings

### WR-01: Lost-update race on `MapDoc.shapes` — stale-snapshot read-modify-write

**File:** `src/features/person-map/MapView.tsx:376-406` (`commitShape`); `src/features/person-map/editor/ShapeNode.tsx:55-58` (`persistShapePatch`); `src/features/person-map/editor/StylePopover.tsx:50-54` (`patchShape`)

**Issue:** Every shape mutation rebuilds the **entire** `shapes` array from the `map` snapshot held by
`useLiveQuery` and writes it via `updateMap(map.id, { shapes })` (a full overwrite). Because
`useLiveQuery` refreshes asynchronously, two shape writes issued before the local snapshot updates
both read the same stale `map.shapes`, and the second overwrites the first. Concretely: draw shape A
(`void updateMap` with `[…, A]`), then immediately drag or restyle a pre-existing shape B before the
live query re-runs — `persistShapePatch`/`patchShape` reads a `map.shapes` that lacks A and writes it
back, silently dropping A. The fire-and-forget `void updateMap` in `commitShape` and the transform
handlers widens the window.

**Fix:** Apply the mutation against the freshly-read row inside the write (e.g. an `updateMap`
overload accepting `shapes: (prev: Shape[]) => Shape[]`, computed from `existing.shapes` read inside
the transaction), or add a single-shape upsert/patch-by-id repository helper instead of overwriting
the whole array from a render-closure snapshot.

### WR-02: `transformMarker` test bridge drops `layerId`, reassigning the marker to the default layer

**File:** `src/db/testBridge.ts:135-150`

**Issue:** `transformMarker` re-`upsertMarker`s the existing marker with new width/height/rotation but
does **not** pass `layerId: existing.layerId`. Since `upsertMarker` does a full validated `put`, the
omitted `layerId` becomes `undefined`, silently moving the marker to the default/first layer at render
— the exact hazard the production paths explicitly guard against (`AvatarMarker.tsx:94-97`,
`PortalGlyph.tsx:86-90`, `TransformerOverlay.tsx:50-53`). This helper ships in the bundle and is the
path the criterion-6 E2E drives, so the E2E does not faithfully reproduce the real Transformer (which
preserves layer organization) and could mask a layer-loss regression.

**Fix:** Thread `layerId: existing.layerId` through the `upsertMarker` call in `transformMarker`,
matching the production transform-persist payloads.

### WR-03: Viewport cull rect not recomputed on container resize — markers can stay hidden

**File:** `src/features/person-map/MapView.tsx:212-220`; `src/features/person-map/editor/useViewportCulling.ts:93-116`

**Issue:** `culling.recompute(stage)` is wired only to `onWheel` and `onDragEnd`. The `ResizeObserver`
effect updates `size` (and thus the Stage `width`/`height`) but never calls `recompute`. After the
user has panned at least once (so `visibleRect` is non-null), enlarging the window/pane leaves the
cull rect computed from the **old, smaller** viewport; markers in the newly-revealed edge region are
filtered out by `isVisible` and stay unmounted until the next wheel/drag triggers a recompute. (Before
the first pan, `visibleRect` is null → "show all", so the bug only manifests after a pan.)

**Fix:** Call `culling.recompute(stageRef.current)` from the resize handler (guarding for a mounted
stage) so the visible rect tracks the container size:

```ts
const update = () => {
  setSize({ width: el.clientWidth, height: el.clientHeight });
  if (stageRef.current) culling.recompute(stageRef.current);
};
```

## Info

### IN-01: Portal markers are processed twice in the content render set

**File:** `src/features/person-map/MapView.tsx:577-619,818-844`

**Issue:** `visibleMarkers` runs `orderObjectsForRender(markers ?? [], layers)` over the **full**
markers list (person + portal), composes/culls every entry, then in JSX renders `null` for any marker
whose `personId` has no matching person — which is every portal. Portals are independently handled by
`visiblePortals`. The portal rows in `visibleMarkers` are dead work and obscure the render path.

**Fix:** Filter `visibleMarkers` to `m.kind === 'person'` (mirroring `visiblePortals`' `kind === 'portal'`
filter) so each pass owns exactly one marker kind.

### IN-02: `commitShape` always rewrites `layers`, churning sync even when unchanged

**File:** `src/features/person-map/MapView.tsx:401`

**Issue:** `commitShape` always passes `layers: ensured.layers` to `updateMap`, even when the map
already had layers (the common case) and the array is identical. `updateMap` unconditionally stamps
`updatedAt`/`dirty`, so every shape commit marks the layers sub-object dirty for sync with no real
change. Only `placePortal`/`placePerson` correctly gate the layers write on `map.layers.length === 0`
(lines 422-424 / 445-447).

**Fix:** Include `layers` in the patch only when `ensureDefaultLayer` actually materialized one
(`map.layers.length === 0`).

### IN-03: Misleading/inaccurate comment in `PortalGlyph.handleTransformEnd`

**File:** `src/features/person-map/editor/PortalGlyph.tsx:99-104`

**Issue:** The comment ("We re-thread the portal's targetMapId after via upsertMarker is unnecessary
because persistTransformResult re-reads through the repository which preserves it — but to be safe…")
is self-contradictory and inaccurate: `persistTransformResult` does not re-read the existing marker;
`targetMapId`/`layerId` survive only because they are passed explicitly into `computeTransformPersist`
(which the code does do). The comment describes a mechanism that doesn't exist and could mislead a
maintainer into removing the correct explicit threading.

**Fix:** Replace with an accurate note: the portal's `targetMapId`/`layerId` are preserved because
they are passed explicitly into `computeTransformPersist`, which carries them into the upsert payload.

---

_Reviewed: 2026-07-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

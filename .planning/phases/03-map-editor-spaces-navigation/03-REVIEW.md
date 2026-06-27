---
phase: 03-map-editor-spaces-navigation
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/db/repository.ts
  - src/db/schema.ts
  - src/db/testBridge.ts
  - src/domain/schemas.ts
  - src/domain/types.ts
  - src/app/App.tsx
  - src/app/tokens.ts
  - src/features/person-map/MapView.tsx
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/coords.ts
  - src/features/person-map/editor/TransformerOverlay.tsx
  - src/features/person-map/editor/ShapeNode.tsx
  - src/features/person-map/editor/PortalGlyph.tsx
  - src/features/person-map/editor/LayersPanel.tsx
  - src/features/person-map/editor/MapSwitcher.tsx
  - src/features/person-map/editor/Breadcrumb.tsx
  - src/features/person-map/editor/PersonPicker.tsx
  - src/features/person-map/editor/PortalTargetPicker.tsx
  - src/features/person-map/editor/StylePopover.tsx
  - src/features/person-map/editor/ToolPalette.tsx
  - src/features/person-map/editor/ZoneLabel.tsx
  - src/features/person-map/editor/layers.ts
  - src/features/person-map/editor/mapHierarchy.ts
  - src/features/person-map/editor/useToolMode.ts
  - src/features/person-map/editor/useViewportCulling.ts
  - src/features/profile/ProfileSidebar.tsx
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-27
**Depth:** standard
**Files Reviewed:** 26 source files (test/e2e given a lighter correctness pass)
**Status:** issues_found

## Summary

Phase 3 adds the map editor: tools/draw state machine, logical layers, background-transform
composition, portals + nested-map navigation, multi-placement, and a Transformer for resize/rotate.
The pure modules (`coords.ts`, `layers.ts`, `mapHierarchy.ts`, `useToolMode.ts`) are well-guarded
(scale-0 / NaN guards, cycle/depth caps, dangling-layer fallback) and the XSS boundary on canvas
text (Konva `Text`, never `innerHTML`) is consistently honored. Validation through zod on every
repository write is intact.

The defects cluster around the **marker write-back paths**. The single most important interaction —
dragging a placed marker — silently drops the marker's `layerId`, reassigning it to the default
layer (CR-01). The marker/portal Transformer resize path bakes its new size from a Konva `Group`'s
`width()`, which is `0` for a Group, so a marker resize collapses to the minimum size; the unit
tests never catch this because they feed a mock node with an explicit `width()`. Two dialog write
paths lack the try/catch their sibling upload path has, so a failed `storeMedia` permanently locks
the dialog. None of these are caught by the existing suite because the tests exercise the pure
helpers with hand-built inputs rather than the live Konva nodes.

## Critical Issues

### CR-01: Dragging or transforming a marker/portal silently drops its `layerId` (loses layer membership)

**File:** `src/features/person-map/AvatarMarker.tsx:87-101` (drag-end), `src/features/person-map/editor/TransformerOverlay.tsx:45-57,116-133` (transform payload), `src/features/person-map/editor/PortalGlyph.tsx:105-120` (transform-end)

**Issue:** `AvatarMarker.handleDragEnd` reconstructs the marker via `upsertMarker({...})` but omits
`layerId`. Because `upsertMarker` does a full `MarkerSchema.parse` of exactly the fields it is
handed, the persisted marker comes back with `layerId === undefined`. `resolveLayer` then silently
falls the marker back to the default (lowest-order) layer. So **every drag of a person marker that
lives on a non-default layer moves it to the default layer** — destroying the user's explicit layer
organization (and changing its visibility/lock behavior if the default layer is hidden/locked).

The same root cause hits the Transformer path: `MarkerPersistPayload` (TransformerOverlay.tsx:45-57)
has **no `layerId` field**, so `computeTransformPersist`'s marker branch and `persistTransformResult
→ upsertMarker(payload)` can never re-thread it. This drops `layerId` on resize/rotate for both
person markers (AvatarMarker.handleTransformEnd) and portals (PortalGlyph.handleTransformEnd) — even
though `PortalGlyph.handleDragEnd` *does* correctly preserve `layerId`, proving the omission is an
oversight, not intent.

No test catches this: `appearsOn.test.ts` / `multiPlacement.test.ts` never assert `layerId`
survival, and `transformerOverlay.test.ts` asserts only the payload's width/height/x/y.

**Fix:** Thread `layerId` through every reconstruction path.

```ts
// AvatarMarker.handleDragEnd
void upsertMarker({
  id: marker.id,
  mapId: marker.mapId,
  kind: marker.kind,
  personId: person.id,
  layerId: marker.layerId,          // <-- preserve layer membership
  x: img.x,
  y: img.y,
  width: marker.width,
  height: marker.height,
  rotation: marker.rotation,
});
```

```ts
// TransformerOverlay.ts — add layerId to MarkerPersistPayload + ComputeTransformPersistArgs,
// pass it from AvatarMarker/PortalGlyph (computeTransformPersist({ ..., layerId: marker.layerId }))
// and include it in the returned marker payload so upsertMarker re-persists it.
export interface MarkerPersistPayload {
  id: string;
  mapId: string;
  kind: MarkerKind;
  personId?: string;
  targetMapId?: string;
  layerId?: string;   // <-- add
  x: number; y: number; width: number; height: number; rotation: number;
}
```

## Warnings

### WR-01: Marker/portal Transformer resize bakes size from `Group.width()` (= 0), collapsing the marker to the minimum size

**File:** `src/features/person-map/editor/TransformerOverlay.tsx:91-95,116-133`; consumed by `src/features/person-map/AvatarMarker.tsx:106-128`

**Issue:** For a marker the node passed to `computeTransformPersist` is the marker's Konva `Group`
(AvatarMarker:107, PortalGlyph:106). `width = Math.max(MIN_TRANSFORM_SIZE, node.width() * scaleX)`.
A Konva `Group`/`Container` has no intrinsic `width` attr, so `node.width()` returns `0` — the
Transformer resizes a Group by mutating `scaleX/scaleY`, not `width`. The bake therefore computes
`max(12, 0 * scaleX) = 12` regardless of how far the user dragged the handle, so every marker resize
persists `width = height = MIN_TRANSFORM_SIZE`. AvatarMarker then renders `scaleX = marker.width /
(2*R) = 12/48 = 0.25`, shrinking the avatar to a quarter size. The unit test masks this by injecting
a fake node with `width: () => 50` (transformerOverlay.test.ts:34), and the E2E `transformMarker`
bridge bypasses `computeTransformPersist` entirely by setting width/height directly.

**Fix:** Derive the marker's pre-transform base size from a known constant rather than `node.width()`
(e.g. pass `baseWidth/baseHeight = 2*R` for a person, `PORTAL_W/PORTAL_H` for a portal into
`computeTransformPersist`, and compute `width = max(MIN, baseWidth * scaleX)`), or read the box from
`node.getClientRect({ skipTransform: true })` instead of `node.width()`.

### WR-02: Transformer resize of a line/polygon writes width/height that the renderer ignores — the geometry never changes

**File:** `src/features/person-map/editor/TransformerOverlay.tsx:100-114`; renderer `src/features/person-map/editor/ShapeNode.tsx:67-75,190-205`

**Issue:** The shape branch always rewrites `{ ...s, width, height, rotation }`. For `line`/`polygon`
shapes the geometry lives in `points` (ShapeNode renders from `stagePoints`, never from width/height),
so a Transformer resize of a line/polygon updates ignored fields and leaves the visible geometry
unchanged (only rotation takes effect). The user drags a resize handle and nothing happens to the
line.

**Fix:** In the shape branch, when `kind` is `line`/`polygon`, scale the stored `points` about the
shape's centroid by `scaleX/scaleY` instead of (or in addition to) writing width/height; reserve the
width/height bake for `rect`/`ellipse`.

### WR-03: PortalTargetPicker pick/create paths have no error handling — a failed write locks the dialog open

**File:** `src/features/person-map/editor/PortalTargetPicker.tsx:84-107,109-145`

**Issue:** `pickTarget` and `createTarget` set `setBusy(true)` and then `await` repository/`storeMedia`
calls with no try/catch (unlike `MapView.handleFile`, which wraps `storeMedia`/`createMap` in
try/catch). If `storeMedia`, `createMap`, `updateMap`, or `upsertMarker` rejects (e.g. a decode
failure or quota error), `busy` is never reset, so every button stays `disabled` and the user is
stuck in a dialog they can only escape by reloading — and the just-dropped portal is left dangling
(cancel is also disabled). This is a realistic path given uploads of large/corrupt images.

**Fix:** Wrap each async body in `try { … } catch { /* surface error */ } finally { setBusy(false); }`
and present a retry affordance, mirroring `handleFile`'s `UPLOAD_ERROR` handling.

### WR-04: `useViewportCulling` debounce timer is never cleared on unmount (setState-after-unmount)

**File:** `src/features/person-map/editor/useViewportCulling.ts:93-105`

**Issue:** `recompute` schedules `setTimeout(() => setVisibleRect(...), debounceMs)` but the hook has
no cleanup effect to `clearTimeout(timer.current)` on unmount. If the MapView unmounts (view switch)
within the debounce window after a wheel/drag, the pending timer fires `setVisibleRect` on an
unmounted component — a React warning and wasted work.

**Fix:** Add `useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);`.

## Info

### IN-01: `testBridge.transformMarker` also omits `layerId` (mirrors CR-01; weakens E2E fidelity)

**File:** `src/db/testBridge.ts:135-150`

**Issue:** The E2E transform bridge re-upserts a marker without `layerId`, so the criterion-6 E2E
cannot catch the CR-01 layer-drop regression. Once CR-01 is fixed, add `layerId: existing.layerId`
here so the bridge faithfully mirrors the production transform-end write.

**Fix:** Include `layerId: existing.layerId` in the `upsertMarker` call.

### IN-02: `createLayer` auto-name can collide after deletions

**File:** `src/features/person-map/editor/layers.ts:128-131`

**Issue:** `nextLayerName` derives `"Layer " + (layers.length + 1)`. After deleting an intermediate
layer and adding a new one, the count-based name can duplicate an existing layer's name (e.g. two
"Layer 3"s). Harmless to data (ids are unique), but confusing in the panel.

**Fix:** Base the suffix on `1 + max(existing "Layer N" suffixes)` rather than `layers.length`.

---

_Reviewed: 2026-06-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

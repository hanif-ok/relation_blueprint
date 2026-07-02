---
phase: 03-map-editor-spaces-navigation
reviewed: 2026-07-02T00:00:00Z
depth: standard
files_reviewed: 28
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
  - tests/features/transformerOverlay.test.ts
  - tests/features/markerTransform.roundtrip.test.ts
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-02
**Depth:** standard
**Files Reviewed:** 28 (source + the two transform tests)
**Status:** issues_found

## Summary

Phase 3 adds the Konva map editor: a tool-mode/gesture state machine, image-space↔stage-space
coordinate composition, logical layers, background-transform anchoring, portals + nested-map
navigation, person multi-placement, and a Transformer for resize/rotate. The pure modules
(`coords.ts`, `layers.ts`, `mapHierarchy.ts`, `useToolMode.ts`, `useViewportCulling.ts`) are
carefully guarded (scale-0 / NaN guards, cycle/depth caps, dangling-layer fallback) and the XSS
boundary on all canvas text (Konva `Text`, never `innerHTML`) is consistently honored. zod
validation on every repository write is intact. No in-scope security defect was found.

Every defect of substance lives in the **Transformer transform-end persist path**
(`TransformerOverlay.computeTransformPersist` + its consumers `AvatarMarker` / `PortalGlyph` /
`ShapeNode`). Two are BLOCKER-class:

1. **Rotation unit mismatch** — `computeTransformPersist` stores `node.rotation()` (Konva **degrees**)
   verbatim, but every renderer reads the stored value as **radians** (`* 180/π`). A rotate corrupts
   the angle on the next render. (This one is new — not in the prior 06-27 review.)
2. **`layerId` is dropped** on marker drag-end and on every marker/portal transform-end, silently
   reassigning the object to the default layer.

Both slip past the suite because the unit tests feed a hand-mocked node whose getters don't match
real Konva semantics. A cluster of correctness warnings around the same helper (`Group.width()` == 0
collapsing marker resize; line/polygon resize writing ignored fields) share that root blind spot.

## Critical Issues

### CR-01: Transform-end stores rotation in degrees but every renderer reads it as radians

**File:** `src/features/person-map/editor/TransformerOverlay.tsx:93,108,130`
**Issue:** `computeTransformPersist` reads `const rotation = node.rotation();` and persists it
unchanged as the marker/shape rotation. Konva's `node.rotation()` returns **degrees**. Every renderer
interprets the stored `rotation` as **radians** and multiplies by `180/π`:

- `AvatarMarker.tsx:129` — `rotationDeg = marker.rotation ? (marker.rotation * 180) / Math.PI : 0`
- `PortalGlyph.tsx:126` — `rotationDeg = marker.rotation ? (marker.rotation * 180) / Math.PI : 0`
- `ShapeNode.tsx:84` — `rotationDeg = ((transform.rotation + shape.rotation) * 180) / Math.PI`

So a user rotate to 90° persists `rotation = 90`, and the next render applies `90 * 180/π ≈ 5157°`.
The object jumps to a garbage angle the instant the transform commits and again on any reload. The
shape branch adds a second unit mix at `TransformerOverlay.tsx:108`: `ownRotation = rotation -
transform.rotation` subtracts **radians** (`transform.rotation`, per `BackgroundTransform` doc) from
**degrees** (`node.rotation()`).

Note the drag-end paths are self-consistent (they re-persist the already-stored `marker.rotation`),
so the corruption is specific to the Transformer rotate. The unit test
`tests/features/transformerOverlay.test.ts:77` ("passes rotation through unchanged (radians)") masks
it by mocking `node.rotation()` to `1.25` and asserting pass-through — assuming a radian getter that
real Konva does not provide.

**Fix:** Convert at the boundary and keep the shape subtraction in one unit:
```ts
// computeTransformPersist
const rotationRad = (node.rotation() * Math.PI) / 180;
// marker branch: rotation: rotationRad
// shape branch:  const ownRotation = rotationRad - transform.rotation; // both radians
```
Then update the unit test to feed degrees and assert the radian result.

### CR-02: Dragging or transforming a marker/portal silently drops its `layerId`

**File:** `src/features/person-map/AvatarMarker.tsx:87-101` (drag-end),
`src/features/person-map/editor/TransformerOverlay.tsx:46-57,116-133` (transform payload),
`src/features/person-map/editor/PortalGlyph.tsx:105-120` (transform-end)
**Issue:** `upsertMarker` does a full `put` of exactly the fields it is handed, so any omitted field
is cleared. Two marker persist paths omit `layerId`:

1. `AvatarMarker.handleDragEnd` calls `upsertMarker({ id, mapId, kind, personId, x, y, width, height,
   rotation })` — **no `layerId`**. Dragging a person marker on a non-default layer wipes its
   `layerId`; `resolveLayer` then falls it back to the default/first layer. Every drag of such a
   marker moves it to the default layer, destroying the user's layer organization (and changing its
   visibility/lock behavior if the default layer is hidden/locked).
2. `MarkerPersistPayload` (TransformerOverlay.tsx:46-57) has **no `layerId` field**, so the marker
   branch of `computeTransformPersist` cannot carry it. Every marker **and portal** transform-end
   (`AvatarMarker.handleTransformEnd`, `PortalGlyph.handleTransformEnd`) therefore also clears it.

`PortalGlyph.handleDragEnd` (line 90) *does* preserve `layerId: marker.layerId`, and
`PortalTargetPicker` preserves it too — proving the omission is an oversight. No test asserts
`layerId` survival.

**Fix:** Thread `layerId` through both paths:
```ts
// AvatarMarker.handleDragEnd
void upsertMarker({ id: marker.id, mapId: marker.mapId, kind: marker.kind,
  personId: person.id, layerId: marker.layerId, x: img.x, y: img.y,
  width: marker.width, height: marker.height, rotation: marker.rotation });
```
Add `layerId?: string` to `MarkerPersistPayload` and `ComputeTransformPersistArgs`, set it in the
marker branch payload, and pass `layerId: marker.layerId` from both consumers. Also add
`layerId: existing.layerId` to `testBridge.transformMarker` (IN-01) so the E2E can catch regressions.

## Warnings

### WR-01: Marker/portal resize bakes size from `Group.width()` (= 0), collapsing to the minimum size

**File:** `src/features/person-map/editor/TransformerOverlay.tsx:91-95`; consumed by
`src/features/person-map/AvatarMarker.tsx:106-128`, `src/features/person-map/editor/PortalGlyph.tsx:105-120`
**Issue:** For a marker/portal the node passed to `computeTransformPersist` is the Konva `Group`.
`width = Math.max(MIN_TRANSFORM_SIZE, node.width() * scaleX)`. A Konva `Group` has no intrinsic
`width` attr (the Transformer resizes a Group by mutating `scaleX/scaleY`, not `width`), so
`node.width()` returns `0`. The bake computes `max(12, 0 * scaleX) = 12` regardless of drag distance,
so every marker resize persists `width = height = MIN_TRANSFORM_SIZE`. `AvatarMarker` then renders
`scaleX = marker.width / (2*R) = 12/48 = 0.25`, shrinking the avatar to a quarter size. Rect/ellipse
shapes are unaffected (their nodes carry a real `width()`), which is why it wasn't noticed; the unit
test injects `width: () => 50`, and the E2E `transformMarker` bridge bypasses the helper entirely.

**Fix:** Read the box from `node.getClientRect({ skipTransform: true })`, or pass a known base size
(`2*R` for a person, `PORTAL_W/PORTAL_H` for a portal) into `computeTransformPersist` instead of
relying on `node.width()`.

### WR-02: Transformer resize of a line/polygon writes width/height the renderer ignores — geometry never changes

**File:** `src/features/person-map/editor/TransformerOverlay.tsx:100-114`; renderer
`src/features/person-map/editor/ShapeNode.tsx:67-75,190-205`
**Issue:** The shape branch always rewrites `{ ...s, width, height, rotation }`. For `line`/`polygon`
shapes the geometry lives in `points` (ShapeNode renders from `stagePoints`, never from width/height),
so resizing a line/polygon with the Transformer updates fields the renderer ignores and leaves the
visible geometry unchanged (only rotation takes effect). The user drags a resize handle and nothing
happens to the line.

**Fix:** In the shape branch, when `kind` is `line`/`polygon`, scale the stored `points` about the
shape's centroid by `scaleX/scaleY`; reserve the width/height bake for `rect`/`ellipse`.

### WR-03: PortalTargetPicker pick/create paths have no error handling — a failed write wedges the pick/create controls

**File:** `src/features/person-map/editor/PortalTargetPicker.tsx:84-107,109-145`
**Issue:** `pickTarget` and `createTarget` set `setBusy(true)` then `await` repository/`storeMedia`
calls with no try/catch (unlike `MapView.handleFile`, which wraps `storeMedia`/`createMap`). If
`storeMedia`, `createMap`, `updateMap`, or `upsertMarker` rejects (large/corrupt image decode, quota
error), `busy` is never reset, so the list items, "Create map", and "Back" (all `disabled={busy}`)
stay disabled with no error surfaced. The bottom Cancel button (line 287) is *not* `disabled`, so the
user can still back out (and the portal is cleaned up) — the dialog isn't fully locked — but the
happy-path controls are dead and the failure is invisible.

**Fix:** Wrap each async body in `try { … } catch { /* surface an error message */ } finally {
setBusy(false); }`, mirroring `handleFile`'s `UPLOAD_ERROR` handling.

### WR-04: `useViewportCulling` debounce timer is never cleared on unmount (setState-after-unmount)

**File:** `src/features/person-map/editor/useViewportCulling.ts:93-105`
**Issue:** `recompute` schedules `setTimeout(() => setVisibleRect(...), debounceMs)` into
`timer.current`, but the hook has no cleanup effect to `clearTimeout` on unmount. If MapView unmounts
(view switch) within the debounce window after a wheel/drag, the pending timer fires
`setVisibleRect` on an unmounted component — a leaked timer and wasted state update.

**Fix:** Add `useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);`.

### WR-05: `showOnMap` opens the profile in marker context even when the person is not placed

**File:** `src/app/App.tsx:194-201`
**Issue:** `showOnMap` sets `openedFrom: 'marker'` unconditionally. When the person has no marker
(`marker` is undefined) `activeMapId` is left unchanged and the profile still opens in marker
context, so `ProfileSidebar` renders the "Remove from map" action (ProfileSidebar.tsx:427) for
someone on no map. `markerId` resolves to undefined and the action no-ops, but the control is
misleading.

**Fix:** `setProfile({ type: 'people', id, openedFrom: marker ? 'marker' : 'list' })`, or short-circuit
`showOnMap` when no marker exists.

## Info

### IN-01: `testBridge.transformMarker` also omits `layerId` (mirrors CR-02; weakens E2E fidelity)

**File:** `src/db/testBridge.ts:135-150`
**Issue:** The E2E transform bridge re-upserts a marker without `layerId`, so the criterion-6 E2E
cannot catch the CR-02 layer-drop regression. Once CR-02 is fixed, add `layerId: existing.layerId`
here so the bridge faithfully mirrors the production transform-end write.

### IN-02: `createLayer` auto-name can collide after deletions

**File:** `src/features/person-map/editor/layers.ts:128-131`
**Issue:** `nextLayerName` derives `"Layer " + (layers.length + 1)`. After deleting an intermediate
layer and adding a new one, the count-based name can duplicate an existing layer name (e.g. two
"Layer 3"s). Harmless to data (ids are unique), but confusing in the panel.
**Fix:** Base the suffix on `1 + max(existing "Layer N" suffixes)` rather than `layers.length`.

### IN-03: `handleSaved` auto-places an *edited* person, contradicting its own comment

**File:** `src/app/App.tsx:159-182`
**Issue:** The comment says "Edits leave any existing marker untouched," but the branch keys only on
`form.type === 'people' && activeMap` and `existing === 0`. Editing a person who has no marker (e.g.
created before any map existed) auto-places them on the active map on save — a create-time side
effect firing during an edit.
**Fix:** Gate the auto-place on `form.editingId == null` (create only), or correct the comment.

---

_Reviewed: 2026-07-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

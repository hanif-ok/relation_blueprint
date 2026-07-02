---
phase: 03-map-editor-spaces-navigation
fixed_at: 2026-07-02T00:00:00Z
review_path: .planning/phases/03-map-editor-spaces-navigation/03-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-07-02
**Source review:** .planning/phases/03-map-editor-spaces-navigation/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (Critical + Warning; Info findings IN-01/IN-02/IN-03 out of scope)
- Fixed: 7
- Skipped: 0

Verification: every fix passed a full-project `tsc --noEmit` typecheck; the transform-path fixes
(CR-01, CR-02, WR-01, WR-02) were additionally exercised against
`tests/features/transformerOverlay.test.ts` and `tests/features/markerTransform.roundtrip.test.ts`
(8 tests, all green).

## Fixed Issues

### CR-01: Transform-end stored rotation in degrees but every renderer read it as radians

**Files modified:** `src/features/person-map/editor/TransformerOverlay.tsx`, `tests/features/transformerOverlay.test.ts`
**Commit:** 64ed7a0
**Applied fix:** `computeTransformPersist` now converts `node.rotation()` (Konva degrees) to radians
at the boundary — `const rotation = (node.rotation() * Math.PI) / 180` — so both the marker payload
and the shape-branch `ownRotation = rotation - transform.rotation` subtraction stay in radians,
matching every renderer's `* 180/π` read. Updated the two masking unit tests to feed degrees (90)
and assert the radian result (π/2), replacing the pass-through assertions that hid the bug.

### CR-02: Dragging/transforming a marker or portal silently dropped its `layerId`

**Files modified:** `src/features/person-map/editor/TransformerOverlay.tsx`, `src/features/person-map/AvatarMarker.tsx`, `src/features/person-map/editor/PortalGlyph.tsx`
**Commit:** a89e60f
**Applied fix:** Added `layerId?: string` to both `MarkerPersistPayload` and
`ComputeTransformPersistArgs`, threaded it into the marker-branch payload, and now pass
`layerId: marker.layerId` from `AvatarMarker.handleTransformEnd` and `PortalGlyph.handleTransformEnd`.
Also added the previously-missing `layerId: marker.layerId` to `AvatarMarker.handleDragEnd`. The
marker's editor layer now survives every drag and transform-end (upsertMarker does a full `put`, so
an omitted field was clearing it). `UpsertMarkerInput`/`MarkerSchema` already accept `layerId`, so no
repository change was needed.

### WR-01: Marker/portal resize baked size from `Group.width()` (== 0), collapsing to the minimum

**Files modified:** `src/features/person-map/editor/TransformerOverlay.tsx`, `src/features/person-map/AvatarMarker.tsx`, `src/features/person-map/editor/PortalGlyph.tsx`
**Commit:** 348b743
**Applied fix:** Added optional `baseWidth`/`baseHeight` to `ComputeTransformPersistArgs`; the bake now
uses `args.baseWidth ?? node.width()` (and height), so a Konva Group with no intrinsic `width()` no
longer collapses every resize to `MIN_TRANSFORM_SIZE`. `AvatarMarker` passes `2 * R`, `PortalGlyph`
passes `PORTAL_W`/`PORTAL_H`. Real shape nodes (rect/ellipse) still fall back to `node.width()`, so
that path is unchanged.

### WR-02: Transformer resize of a line/polygon wrote width/height the renderer ignores

**Files modified:** `src/features/person-map/editor/TransformerOverlay.tsx`
**Commit:** 56d9c05
**Applied fix:** In the shape branch, when the target shape is a `line`/`polygon` with `points`, the
stored points are now scaled about their centroid by `scaleX`/`scaleY` (image-space; scale is a
dimensionless ratio) and only `rotation` is additionally updated — instead of writing width/height the
renderer never reads. Rect/ellipse retain the width/height bake. NOTE: this introduces a new geometry
algorithm (centroid scaling) whose visual correctness is not yet covered by an automated test — flagged
for human verification (drag a line/polygon resize handle and confirm the geometry scales as expected).

### WR-03: PortalTargetPicker pick/create had no error handling — a failed write wedged the controls

**Files modified:** `src/features/person-map/editor/PortalTargetPicker.tsx`, `src/features/person-map/editor/PortalTargetPicker.module.css`
**Commit:** 9d7c534
**Applied fix:** Wrapped both `pickTarget` and `createTarget` async bodies in `try { … } catch { …
setError(…) } finally { setBusy(false) }`, mirroring `handleFile`'s upload-error pattern, so a rejected
`storeMedia`/`createMap`/`updateMap`/`upsertMarker` releases `busy` and re-enables the list/create/back
controls instead of leaving them permanently disabled. Added an `error` state (reset on dialog open), a
`role="alert"` error message (`data-testid="portal-target-error"`), and a matching `.error` CSS class.

### WR-04: `useViewportCulling` debounce timer was never cleared on unmount

**Files modified:** `src/features/person-map/editor/useViewportCulling.ts`
**Commit:** b9fcd7d
**Applied fix:** Imported `useEffect` and added an unmount cleanup effect that clears the pending
`timer.current` via `clearTimeout`, so a settled wheel/drag within the debounce window can no longer
call `setVisibleRect` on an unmounted MapView.

### WR-05: `showOnMap` opened the profile in marker context even when the person was not placed

**Files modified:** `src/app/App.tsx`
**Commit:** f9f67ec
**Applied fix:** `showOnMap` now sets `openedFrom: marker ? 'marker' : 'list'`, so an unplaced person
opens in list context and `ProfileSidebar` no longer renders a misleading "Remove from map" action for
someone on no map.

## Skipped Issues

None — all in-scope findings were fixed.

The three Info findings (IN-01 `testBridge.transformMarker` layerId, IN-02 `createLayer` name
collision, IN-03 `handleSaved` auto-place on edit) were out of scope for the `critical_warning` fix
run and were intentionally not addressed. IN-01 in particular is worth a follow-up now that CR-02 is
fixed, so the E2E can catch a layerId-drop regression.

---

_Fixed: 2026-07-02_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

---
phase: 03-map-editor-spaces-navigation
fixed_at: 2026-07-02T00:00:00Z
review_path: .planning/phases/03-map-editor-spaces-navigation/03-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-07-02
**Source review:** .planning/phases/03-map-editor-spaces-navigation/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (fix scope: all — Critical + Warning + Info)
- Fixed: 8
- Skipped: 0

Every fix was type-checked with `tsc --noEmit` (exit 0) and committed atomically. The two
Transformer/state logic fixes (CR-01, CR-02) are flagged **requires human verification** because
syntax/type checks cannot confirm geometric/state-machine correctness. The existing pure-logic
suites (`transformerOverlay.test.ts` — 6 tests, `markerTransform.roundtrip.test.ts` — 2 tests) were
re-run and still pass, confirming the changes are backward-compatible for their covered cases.

## Fixed Issues

### CR-01: Shape Transformer resize discards node translation

**Files modified:** `src/features/person-map/editor/TransformerOverlay.tsx`, `src/features/person-map/editor/ShapeNode.tsx`
**Commit:** 7e75285
**Status:** fixed: requires human verification
**Applied fix:** In the `shape` branch of `computeTransformPersist`, the node's post-transform
position (`node.x()/node.y()`) is now inverse-composed to image space (`stageToImage`) and persisted,
mirroring the marker branch. Per shape kind: **rect** stores that image point as the box origin
(`x`/`y`); **ellipse** treats it as the box CENTER and derives the origin as `center − halfSize` from
the new baked size; **line/polygon** fold the node's translation delta (`nodePosImg − zeroImg`) into
the existing centroid-scaled points. `ShapeNode.handleTransformEnd` now also resets a line/polygon
node's position to `{0,0}` after persisting (those nodes have no controlled x/y prop, unlike
rect/ellipse, so the Transformer's translation would otherwise compound). **Human verification note:**
the rect/ellipse position persistence is exact; the line/polygon centroid-scale + translation-delta
approach follows the reviewer's stated fix and is an approximation that is exact at the identity
background transform — confirm resize-from-each-handle behavior for line/polygon on a non-identity
background.

### CR-02: Deleting the active map strands the Map view blank

**Files modified:** `src/app/App.tsx`
**Commit:** 4cf1616
**Status:** fixed: requires human verification
**Applied fix:** Added an effect that re-seeds `activeMapId` to `firstMap?.id ?? null` once the active
map's row resolves to `undefined` (i.e. it was deleted), guarded by `if (activeMapId && activeMap ===
undefined)`. Verified against the dexie-react-hooks source that `useLiveQuery` RETAINS the previous
resolved value across a deps change (the `monitor` ref keeps `result`/`hasResult`; it does not revert
to the default), so `activeMap === undefined` fires only on a genuine resolution-to-none — never
transiently during map-to-map navigation — so the re-seed cannot mis-fire mid-navigation. **Human
verification note:** confirm the recovery UX end-to-end (delete the active Location via both the
browse-list delete and the ProfileSidebar cascade; the MapSwitcher/empty-state should reappear).

### WR-01: Lost-update race on `MapDoc.shapes`

**Files modified:** `src/db/repository.ts`, `src/features/person-map/MapView.tsx`, `src/features/person-map/editor/ShapeNode.tsx`, `src/features/person-map/editor/StylePopover.tsx`
**Commit:** f3318e1
**Applied fix:** Added `updateMapFrom(id, mutate)` and a thin `updateMapShapes(id, updater)` to the
repository: both read the CURRENT map row inside a single `rw` transaction and compute the next value
from the freshly-read row (then validate/stamp/emit exactly like `updateMap`). Converted the three
render-snapshot read-modify-write sites — `commitShape` (append via `updateMapFrom`),
`ShapeNode.persistShapePatch` and `StylePopover.patchShape` (patch-by-id via `updateMapShapes`) — so a
second shape write issued before the `useLiveQuery` snapshot refreshes can no longer clobber the
first. **Scope note:** the Transformer transform-persist path (`persistTransformResult` →
`updateMap`) computes its whole array inside the pure `computeTransformPersist` and was left as-is,
matching the reviewer's explicit finding scope (converting it would require restructuring the pure
function into a per-id patch and was avoided to keep CR-01 isolated).

### WR-02: `transformMarker` test bridge drops `layerId`

**Files modified:** `src/db/testBridge.ts`
**Commit:** 6152da2
**Applied fix:** Threaded `layerId: existing.layerId` through the `upsertMarker` call in
`transformMarker`, matching the production transform-persist payloads, so the E2E-driven helper no
longer silently reassigns the marker to the default layer via the full validated `put`.

### WR-03: Viewport cull rect not recomputed on container resize

**Files modified:** `src/features/person-map/MapView.tsx`
**Commit:** 59c5d0a
**Applied fix:** The `ResizeObserver` `update` handler now also calls
`culling.recompute(stageRef.current)` (guarded on a mounted stage) so the visible cull rect tracks the
container size after a resize, not only after a wheel/drag gesture. `culling.recompute` is a stable
`useCallback`, so the mount-time reference remains valid for the observer's lifetime; the effect keeps
`[]` deps with an `eslint-disable-next-line react-hooks/exhaustive-deps` (adding `culling` to deps
would re-create the observer on every pan and could loop via the observe-time callback).

### IN-01: Portal markers processed twice in the content render set

**Files modified:** `src/features/person-map/MapView.tsx`
**Commit:** 6e56986
**Applied fix:** `visibleMarkers` now filters `markers` to `kind === 'person'` before ordering/culling
(mirroring `visiblePortals`' `kind === 'portal'` filter), so portals are no longer composed + culled
only to render `null` in the JSX. Each pass now owns exactly one marker kind.

### IN-02: `commitShape` always rewrites `layers`

**Files modified:** `src/features/person-map/MapView.tsx`
**Commit:** b2c3389
**Applied fix:** `commitShape` now includes `layers` in the patch only when the freshly-read map has
none yet (`m.layers.length === 0`, i.e. the default layer is actually being materialized); the common
case (layers already exist) writes only `shapes`, so a shape commit no longer stamps the identical
layers sub-object dirty for sync. Layered on top of the WR-01 `updateMapFrom` read-modify-write.

### IN-03: Misleading comment in `PortalGlyph.handleTransformEnd`

**Files modified:** `src/features/person-map/editor/PortalGlyph.tsx`
**Commit:** 86da071
**Applied fix:** Replaced the self-contradictory comment with an accurate note: the portal's
`targetMapId`/`layerId` survive the transform because they are passed EXPLICITLY into
`computeTransformPersist` (which carries them into the upsert payload); `persistTransformResult` does
NOT re-read the existing marker, so the explicit threading is the only thing preserving them and must
not be removed.

---

_Fixed: 2026-07-02_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

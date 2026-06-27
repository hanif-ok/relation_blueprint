---
phase: 03-map-editor-spaces-navigation
plan: 04
subsystem: map-editor
tags: [konva, react-konva, transformer, scale-reset-to-1, image-space-coords, single-select, background-transform, anchoring, xss-safe-canvas-text]

# Dependency graph
requires:
  - phase: 03-map-editor-spaces-navigation
    plan: 03
    provides: "ToolPalette + useToolMode (pan/draw/select); ShapeNode/ZoneLabel/StylePopover; shapes persist on MapDoc.shapes via ensureDefaultLayer; MapView 3-layer structure with empty L2"
  - phase: 03-map-editor-spaces-navigation
    plan: 02
    provides: "coords.ts imageToStage/stageToImage; AvatarMarker position prop; updateMap covers MapDoc sub-objects; testBridge.updateMap"
  - phase: 03-map-editor-spaces-navigation
    plan: 01
    provides: "Marker width/height/rotation fields + MarkerSchema; MapDoc.backgroundTransform + BackgroundTransformSchema; upsertMarker extended with transform fields"
provides:
  - "computeTransformPersist: the PURE scale-reset-to-1 bake (read scaleX/scaleY → bake into width/height clamped to MIN_TRANSFORM_SIZE → rotation passthrough → marker payload (image-space x/y via stageToImage) | shape branch (image-space size via /bgScale, own rotation)) — never persists raw scale"
  - "TransformerOverlay: a single imperative Konva.Transformer attached via ref+effect (idempotent, StrictMode-safe), amber handles, coarse-pointer 24px anchors, boundBoxFunc min-size guard; persistTransformResult routes through upsertMarker/updateMap only"
  - "AvatarMarker (upgraded): composes through backgroundTransform, drag-end converts back to image space, consumes width/height/rotation (Group scale+rotation), exposes node via onNodeRef, optional XSS-safe name label (D-20 default hidden), onTransformEnd bakes via computeTransformPersist"
  - "ShapeNode (upgraded): exposes node + onTransformEnd for resize/rotate"
  - "MapView: single-select (marker|shape) + TransformerOverlay in L2; Edit-background affordance persisting MapDoc.backgroundTransform with the markers-stay-anchored hint chip; click-empty-canvas deselects"
  - "testBridge: transformMarker + setBackgroundTransform (both route through the repository)"
affects: [layers panel + z-ordering (03-05), portal placement (03-06)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Transformer persist as a PURE helper (computeTransformPersist) taking a NodeLike + injectable resetScale, so the scale-reset-to-1 bake is unit-tested with a fake node and NO DOM (RESEARCH Pattern 1, Anti-pattern 'never persist raw scale')"
    - "Imperative Transformer attach via ref + useEffect that sets nodes() to exactly [node] or [] every run — idempotent so React StrictMode's double-invoke never double-attaches (RESEARCH Pitfall 1)"
    - "Selected object's LIVE Konva node mirrored into MapView state via an onNodeRef callback gated on selection, so the L2 TransformerOverlay attaches to the right node without prop-drilling refs"
    - "Background transform persists by reading the dragged/transformed <KonvaImage> node's x/y/scaleX/rotation back into MapDoc.backgroundTransform; markers compose THROUGH it (imageToStage) so a re-fit never rewrites a marker coordinate (the D-16 anchoring payoff)"
    - "Shape transform bakes stage-space size back to IMAGE space (÷ bg scale) and subtracts the bg rotation, so a shape resize at a non-identity background stores correct image-space geometry"

key-files:
  created:
    - src/features/person-map/editor/TransformerOverlay.tsx
    - tests/features/transformerOverlay.test.ts
    - e2e/transform-marker.spec.ts
    - e2e/transform-background.spec.ts
  modified:
    - src/features/person-map/AvatarMarker.tsx
    - src/features/person-map/MapView.tsx
    - src/features/person-map/MapView.module.css
    - src/features/person-map/editor/ShapeNode.tsx
    - src/db/testBridge.ts

key-decisions:
  - "Persistence lives on the selectable NODE (AvatarMarker/ShapeNode onTransformEnd) via the shared computeTransformPersist helper; TransformerOverlay owns ONLY the handles + attach/detach lifecycle + boundBoxFunc. This keeps each component's repository call colocated with the object it edits and lets the pure persist logic be DOM-free unit-tested."
  - "Background transform is gated behind an explicit 'Edit background' toggle (S16b) rather than select-the-bg-when-nothing-hit, so the background is never grabbed by accident; while active the L0 layer becomes listening + the bg image draggable, and the L2 Transformer attaches to the bg node."
  - "Shape transform-end divides the baked stage size by the background scale and subtracts the bg rotation to store IMAGE-space geometry; at the identity transform (the common case + the E2E) this is a no-op, but it keeps a non-identity-background shape resize correct (Rule 1 correctness, not in the literal plan text)."
  - "E2E drives the transforms through bridge helpers (transformMarker/setBackgroundTransform) — the exact upsertMarker/updateMap calls transform-end fires — keeping the assertion on PERSISTENCE + ANCHORING (the criteria) rather than brittle canvas handle-drag pixel math (the plan's explicit fallback)."

patterns-established:
  - "Pure-helper-for-imperative-Konva: any imperative Konva side-effect (here the Transformer scale-reset bake) is factored into a pure function over a NodeLike with injectable side-effects, so the genuinely-new logic is unit-tested without a renderer"

requirements-completed: [MAP-02]

# Metrics
duration: 11min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 04: Transformer Overlay, Image-Space Marker Transform & Background Anchoring Summary

**Delivered the deferred Phase-1 UAT criteria 6 & 7 as a vertical slice: a single amber Konva Transformer giving resize+rotate handles to any single-selected object (scale-reset-to-1 baked into width/height, RESEARCH Pattern 1), the AvatarMarker composing/persisting through the background transform in image space and consuming its width/height/rotation, and an "Edit background" affordance that persists MapDoc.backgroundTransform while every placed marker stays anchored in image space (D-16) — a user can now resize/rotate markers and shapes and re-fit the background without losing placements.**

## Performance
- **Duration:** ~11 min
- **Started:** 2026-06-27T00:48:19Z
- **Tasks:** 3 (Task 1 TDD)
- **Files:** 9 (4 created, 5 modified)
- **Tests:** 234 unit (41 files) green; transform-marker + transform-background E2E (2 tests) green

## Accomplishments
- **computeTransformPersist** is the heart of criterion 6: a PURE function over a `NodeLike` that reads scaleX/scaleY, BAKES them into width/height (clamped to `MIN_TRANSFORM_SIZE`), passes rotation through, and returns the right repository-shaped payload — the marker branch inverse-composes the node's stage x/y back to IMAGE space via `stageToImage` (Pattern 7), the shape branch rewrites the map's shapes array (÷ bg scale to image-space size, minus the bg rotation). The injectable `resetScale` callback resets the LIVE node's scale to 1; the value applied is `(1, 1)`, NEVER the raw scale (the Anti-pattern the whole helper exists to avoid). Six unit tests pin scale-reset/bake/clamp/rotation-passthrough/image-space-x-y/correct-branch with a fake node and no DOM.
- **TransformerOverlay** mounts a single `Konva.Transformer` in the L2 overlay layer and attaches it via a ref + `useEffect` that sets `nodes()` to exactly `[selectedNode]` or `[]` every run (idempotent → StrictMode-safe, Pitfall 1). Amber `anchorStroke`/`borderStroke`; `anchorSize` 24 on a coarse pointer else 12 (D-19); `rotateEnabled`, `flipEnabled={false}`; a `boundBoxFunc` returning the old box when the new one drops below `MIN_TRANSFORM_SIZE`.
- **AvatarMarker** now composes through `backgroundTransform`, converts the dropped stage point back to image space on drag-end (so the stored coordinate is always image-space), consumes `width`/`height`/`rotation` (an even uniform Group scale + rotation, RESEARCH A3: attach to the Group), exposes its Group node via `onNodeRef` when selected, and renders an optional name label (D-20 default hidden) as a Konva `Text` child — user text flows straight into the `text` prop, never as raw HTML.
- **ShapeNode** exposes its node + an `onTransformEnd` that bakes through the same `computeTransformPersist` (shape branch), so a selected shape resizes/rotates through the L2 Transformer and persists on `MapDoc.shapes`.
- **MapView** does single-select across markers AND shapes (one object at a time; selecting one clears the other and exits bg-edit), mirrors the selected object's live node into state for the Transformer, and adds the **"Edit background"** toggle (S16b): while active the L0 layer becomes interactive, the `<KonvaImage>` is draggable, the L2 Transformer attaches to it, and transform/drag-end persists `MapDoc.backgroundTransform` via `updateMap` — with the "Transforming background — markers stay anchored." hint chip. Because markers/shapes compose through the transform, the re-fit keeps them anchored with no per-marker rewrite.
- **testBridge** gains `transformMarker` (routes through `upsertMarker`) and `setBackgroundTransform` (routes through `updateMap`) so the E2E proves criteria 6 & 7 end-to-end without driving brittle canvas handle-drags or writing straight to Dexie.

## Task Commits
1. **Task 1: TransformerOverlay scale-reset-to-1 persist + test (TDD)** — `77992db` (feat)
2. **Task 2: image-space marker transform + single-select + background transform** — `f4d71a3` (feat)
3. **Task 3: E2E marker-transform persist + background-anchor (criteria 6/7)** — `8773d71` (feat)

## Decisions Made
See `key-decisions` frontmatter. Headlines: persistence lives on the selectable node via the shared pure helper (Transformer owns only handles + lifecycle); the background transform is behind an explicit toggle (never grabbed by accident); the shape branch bakes back to image space (÷ bg scale, − bg rotation); the E2E asserts persistence + anchoring through bridge helpers rather than pixel-level handle drags (the plan's explicit fallback).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] shape transform-end would store stage-space size/rotation at a non-identity background**
- **Found during:** Task 2 (ShapeNode onTransformEnd wiring)
- **Issue:** A shape node renders at STAGE size (`imageSize × bg.scale`) and STAGE rotation (`bg.rotation + shape.rotation`). Baking `node.width()*scaleX` / `node.rotation()` verbatim into the shape descriptor would store stage-space geometry — correct only at the identity background, wrong (off by the bg scale, and double-counting the bg rotation) once the background is scaled/rotated.
- **Fix:** The shape branch of `computeTransformPersist` divides the baked width/height by the (guarded) background scale and subtracts the background rotation, so it stores IMAGE-space geometry. At the identity transform this is a no-op (so the unit + E2E assertions are unchanged).
- **Files modified:** src/features/person-map/editor/TransformerOverlay.tsx
- **Committed in:** `f4d71a3` (Task 2).

**Total deviations:** 1 auto-fixed (Rule 1 correctness). No scope creep; no architectural changes.

## Threat Mitigations Applied
- **T-03-13** (a transform write bypassing the repository): `persistTransformResult` calls ONLY `upsertMarker`/`updateMap` (validate→stamp→emit); AvatarMarker/ShapeNode transform-end + the E2E bridge helpers all route through the repository — never straight to Dexie. Asserted by the Task-3 grep (0 raw `db.markers/maps.put` in the specs).
- **T-03-12** (corrupt/degenerate transform fields): `boundBoxFunc` + the `MIN_TRANSFORM_SIZE` clamp in `computeTransformPersist` prevent a degenerate size at edit time; the 03-01 MarkerSchema/BackgroundTransformSchema still guard at-rest/cloud data on load.
- **T-03-07** (background transform shifting existing markers): image-space anchoring — markers compose through the transform, so the `transform-background` E2E asserts the marker's stored image-space x/y are UNCHANGED while its composed stage point moves.
- **T-03-01** (XSS via canvas text exfiltrating the Drive token): the optional name label renders the person name as a Konva `Text` child only, never as raw HTML (asserted by the Task-2 grep: 0 `dangerouslySetInnerHTML`).

## Known Stubs
- **`showLabels` is hard-wired to `false` in MapView** — the prop threads end-to-end (MapView → AvatarMarker → XSS-safe Konva `Text`) and the label renders correctly when true; only the UI toggle that flips it is deferred to the 03-05 layers panel. This is a real wiring seam (not a dead prop), and the default-hidden behavior is the D-20 intent, so it is safe to ship now. No data hazard.
- **Polygon multi-click + Esc-cancel** remain deferred from 03-03's note — NOT in this plan's scope (this plan owned the Transformer, not polygon drawing). Still pending for a later plan; the pure `addPolygonVertex`/`closePolygon` helpers exist and are tested.

## User Setup Required
None — no external service configuration, no new package installed (T-03-SC: accept, satisfied).

## Self-Check: PASSED

All 4 created files exist on disk (TransformerOverlay.tsx, transformerOverlay.test.ts, transform-marker.spec.ts, transform-background.spec.ts); all 3 task commits (77992db, f4d71a3, 8773d71) present in git history. `npx tsc --noEmit` exits 0; 234/234 unit tests green (41 files); `npx playwright test e2e/transform-marker.spec.ts e2e/transform-background.spec.ts` 2/2 green. Acceptance greps satisfied: TransformerOverlay has the scale-reset-to-1 (`resetScale?.(1, 1)`), `boundBoxFunc`, and `colors.amber`; AvatarMarker uses imageToStage/stageToImage + consumes marker.width/height/rotation + 0 raw-HTML; MapView references TransformerOverlay + backgroundTransform + selectedNode; both E2E specs assert persistence + anchoring through the bridge with 0 direct Dexie writes.

---
*Phase: 03-map-editor-spaces-navigation*
*Completed: 2026-06-27*

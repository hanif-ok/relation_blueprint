---
phase: 03-map-editor-spaces-navigation
plan: 05
subsystem: map-editor
tags: [layers, logical-layers, single-konva-layer, z-order, show-hide, lock, layer-crud, d-20-labels, move-to-layer, xss-safe-text]

# Dependency graph
requires:
  - phase: 03-map-editor-spaces-navigation
    plan: 04
    provides: "TransformerOverlay single-select; AvatarMarker showLabels prop threaded end-to-end (hard-wired false); MapView 3-physical-layer Stage with single-select across markers+shapes"
  - phase: 03-map-editor-spaces-navigation
    plan: 03
    provides: "ToolPalette/useToolMode draw; ShapeNode/StylePopover; shapes persist on MapDoc.shapes via ensureDefaultLayer; Shape.layerId"
  - phase: 03-map-editor-spaces-navigation
    plan: 01
    provides: "Layer interface + MapDoc.layers + LayerSchema; MarkerSchema; upsertMarker; version(4) default-layer backfill"
provides:
  - "layers.ts — the PURE DOM-free logical-layer model: resolveLayer (absent/dangling layerId → default layer, T-03-14), orderObjectsForRender (sort by layer order bottom→top, exclude hidden, tag locked → opacity 0.6 + non-interactive), and CRUD transforms (createLayer/renameLayer/reorderLayers/moveLayer/setLayerVisible/setLayerLocked/deleteLayer with last-layer-undeletable + ensureLayers/layersTopToBottom helpers)"
  - "Marker.layerId (optional) on types + MarkerSchema + UpsertMarkerInput/upsertMarker — markers carry a layerId like shapes; absent resolves to the default layer at render (NO migration)"
  - "LayersPanel — docked-right paper panel: TOP-row-first list, per-row move up/down + inline rename (Enter/Esc) + Eye/EyeOff show-hide + Lock/LockOpen + object-count pill + brick-confirm delete (disabled when only layer), + New layer, collapsible to a Layers icon, and the D-20 'Show name labels' toggle; all writes via updateMap"
  - "MapView logical-layer render: shapes+markers ordered by layer in ONE physical content layer (hidden excluded, locked dimmed+listening=false); owns activeLayerId + showLabels; new shapes land on the active layer; per-layer object counts"
  - "StylePopover move-to-layer dropdown (fills the 03-03 seam): sets shape.layerId via updateMap"
  - "testBridge.visibleObjectIds + lockedObjectIds — the editor's own render set exposed to E2E"
affects: [portal placement (03-06), graph view (Phase 4)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Logical-over-physical layers (RESEARCH Pattern 3): user 'layers' are MapDoc.layers sub-objects; ALL objects render into a SINGLE Konva content layer ordered by their layer's `order` — never one Konva Layer per user layer (Pitfall 2). `grep -c '<Layer' MapView` stays 3."
    - "Pure layer model in layers.ts: ordering/visibility/locking/CRUD are plain layers[]->layers[] / objects->RenderItem[] functions unit-tested with data and no renderer (mirrors the computeTransformPersist pure-helper pattern from 03-04)."
    - "Layer CRUD has NO repository function — layers write through updateMap(mapId,{layers}) since they are MapDoc sub-objects (RESEARCH Don't-Hand-Roll)."
    - "Locked + hidden rendering is a react-konva <Group opacity listening> WRAPPER per object, so the existing ShapeNode/AvatarMarker stay untouched and the dimming/non-interactivity is composed in at the layer level."
    - "Dangling/absent layerId resolves to the default layer (resolveLayer) so corrupt layer data never drops an object or crashes the render (T-03-14)."

key-files:
  created:
    - src/features/person-map/editor/layers.ts
    - src/features/person-map/editor/LayersPanel.tsx
    - src/features/person-map/editor/LayersPanel.module.css
    - tests/features/layers.test.ts
    - e2e/layers.spec.ts
  modified:
    - src/domain/types.ts
    - src/domain/schemas.ts
    - src/db/repository.ts
    - src/features/person-map/MapView.tsx
    - src/features/person-map/editor/StylePopover.tsx
    - src/db/testBridge.ts

key-decisions:
  - "Reorder is move-up/down buttons (instant), NOT pointer drag. The plan allowed either; up/down satisfies pointer + keyboard reorder, is reduced-motion-correct by construction (no drag animation), and avoids a drag library — keeping the panel dependency-free (T-03-SC: no new package)."
  - "Layer CRUD lives entirely in the PURE layers.ts module (layers[]->layers[]) and persists via updateMap — there is intentionally no repository function for layers. This keeps the model unit-testable with plain data and honors RESEARCH Don't-Hand-Roll (layers are MapDoc sub-objects)."
  - "Locked/hidden render is applied by WRAPPING each object in a <Group opacity={…} listening={!locked}> rather than threading flags into ShapeNode/AvatarMarker. The components keep their existing contracts; the layer-driven dimming/non-interactivity is composed at the MapView render level."
  - "delete-layer is a brick confirm but NON-destructive to data: objects whose layer is deleted fall back to the default layer at render via resolveLayer, so nothing is lost — the confirm copy says so. The last remaining layer is undeletable (deleteLayer returns unchanged + the delete button is disabled)."
  - "Marker placement in App.tsx (create-person auto-place) is left WITHOUT an explicit layerId: it resolves to the default layer at render. The active-layer concept is editor-local (MapView), and App has no access to it; an absent layerId is the correct, dangle-free default. New SHAPES (which MapView owns) do land on the active layer."
  - "E2E asserts the layer-driven behavior through a bridge-exposed read of the editor's OWN render set (visibleObjectIds/lockedObjectIds via orderObjectsForRender) — the plan's explicit fallback — rather than brittle canvas pixel/handle math. visibleObjectIds returns a COMBINED z-ordered list (shapes+markers by layer order, markers above same-layer shapes) so a reorder is observable as a flipped z-order."

patterns-established:
  - "Logical layers: organize content with MapDoc sub-objects + a pure resolve/order helper, render into one physical canvas layer. Reusable for any future canvas layering (portals, annotations)."

requirements-completed: [MAP-03]

# Metrics
duration: 14min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 05: Logical Layers Panel & Marker/Shape Layer Membership Summary

**Delivered MAP-03 as a vertical slice: a per-map logical-layers panel (D-04) where the curator creates/renames/reorders layers and toggles show/hide/lock, with both shapes AND markers carrying a `layerId`, rendered into the SINGLE physical Konva content layer in logical order (RESEARCH Pattern 3 — never one Konva Layer per user layer), plus the D-20 marker name-label show/hide toggle and a move-to-layer dropdown in the style popover — a user can now organize map content into layers and control visibility, locking, and z-order.**

## Performance
- **Duration:** ~14 min
- **Started:** 2026-06-27T01:03:07Z
- **Tasks:** 3 (Task 1 TDD)
- **Files:** 11 (5 created, 6 modified)
- **Tests:** 248 unit (42 files) green incl. 14 new layers tests; 3 layers E2E green; tsc clean

## Accomplishments
- **`layers.ts` — the pure logical-layer model.** `resolveLayer` maps an object's `layerId` to its effective layer, falling back to the default (lowest-order) layer when the id is absent OR dangling (T-03-14). `orderObjectsForRender` produces the flat render list sorted by layer `order` (bottom→top) then array order within a layer, EXCLUDING hidden-layer objects and tagging each survivor with `locked` + `opacity` (0.6 when locked). The CRUD transforms (`createLayer`/`renameLayer`/`reorderLayers`/`moveLayer`/`setLayerVisible`/`setLayerLocked`/`deleteLayer`, plus `ensureLayers`/`layersTopToBottom`) are plain `layers[] -> layers[]` functions; `deleteLayer` REFUSES the last remaining layer. All DOM-free and unit-tested with plain data.
- **Markers carry a `layerId`.** Added `Marker.layerId?: string` to `types.ts` + `MarkerSchema` (optional-with-default — no migration; an absent layerId resolves to the default layer) and threaded it through `UpsertMarkerInput`/`upsertMarker`.
- **MapView renders the logical-layer model.** The L1 content layer now orders shapes + markers by their resolved layer (via `orderObjectsForRender`), wraps each object in a `<Group opacity listening>` so a locked layer's objects render dimmed + non-interactive, and excludes hidden-layer objects — all inside the SINGLE physical content layer (`grep -c '<Layer'` stays 3). MapView owns `activeLayerId` (new shapes land on it) + `showLabels`, and computes per-layer object counts.
- **LayersPanel (S11).** A docked-right paper panel listing layers TOP-first (highest order = topmost on canvas). Each row: move up/down (instant reorder), inline rename (double-click → Enter/blur commit, Esc cancel), Eye/EyeOff show-hide, Lock/LockOpen, an object-count mono pill, and a delete button (brick `ConfirmDialog`, disabled when it is the only layer). A neutral `+ New layer`, a collapse-to-`Layers`-icon toggle, and the D-20 `Show name labels` checkbox. Layer names render as React text / plain-text input values (T-03-01). All persistence via `updateMap`.
- **StylePopover move-to-layer.** Filled the 03-03 seam with a layer dropdown (top→bottom, mirroring the panel) that sets the selected shape's `layerId` via `updateMap`.
- **E2E (`layers.spec.ts`).** Seeds a map with two layers + a shape on one and a marker on the other, then asserts: hiding a layer removes its objects from the render set (showing restores them), locking a layer puts its objects in the non-interactive set (still visible), and reordering layers flips the canvas z-order — all via a bridge read of the editor's own render set (`visibleObjectIds`/`lockedObjectIds`), routed through the repository with no direct Dexie writes.

## Task Commits
1. **Task 1: marker layerId + logical-layer model + layers unit test (TDD)** — `ecfcefc` (feat)
2. **Task 2: LayersPanel UI + move-to-layer in StylePopover** — `7b9efce` (feat)
3. **Task 3: layers E2E (hide/show, lock, reorder)** — `77c95af` (test)

## Decisions Made
See `key-decisions` frontmatter. Headlines: reorder is up/down buttons (no drag library, reduced-motion-correct); layer CRUD is pure `layers.ts` persisted via `updateMap` (no repository function); locked/hidden render is a `<Group>` wrapper (components untouched); delete-layer is non-destructive (objects fall back to the default layer); the E2E asserts the editor's own render set rather than canvas pixels.

## Deviations from Plan

### Auto-fixed Issues
None — the plan executed as written.

### Scope Adjustments
- **Reorder UI is up/down buttons, not pointer drag-handle.** The plan offered drag OR keyboard reorder ("mirror FieldManager reorder"); FieldManager itself uses keyboard arrow reorder. Up/down buttons are operable by both pointer and keyboard, are instant (reduced-motion safe with no special-casing), and avoid pulling in a drag dependency (T-03-SC). The pure `reorderLayers`/`moveLayer` helpers support an arbitrary top→bottom ordering, so a drag affordance can be layered on later with no model change.
- **Marker auto-placement (App.tsx create-person) keeps no explicit layerId.** Active-layer is editor-local state in MapView; App has no access to it. An absent layerId resolves to the default layer at render (dangle-free), satisfying "an object lands on a real layer." New shapes drawn in the editor DO land on the active layer. No change to App.tsx (out of this plan's file scope).

**Total deviations:** 0 auto-fixed bugs; 2 in-scope adjustments (both keep the must-haves true). No architectural changes; no new package.

## Threat Mitigations Applied
- **T-03-01** (Information Disclosure via rendered layer names): every layer name renders as a React text child or a plain-text `<input value>` in LayersPanel — never `dangerouslySetInnerHTML`. The on-canvas name label (D-20) likewise flows person text into a Konva `Text` child (inherited from 03-04 AvatarMarker).
- **T-03-14** (Tampering — dangling `object.layerId` pointing at a deleted layer): `resolveLayer` resolves an unknown/absent layerId to the default (first) layer rather than dropping the object or crashing the render. Unit-tested + relied on by `deleteLayer` (deleted-layer objects fall back, not lost).
- **T-03-15** (Tampering — malformed `MapDoc.layers` from cloud/backup): `LayerSchema` validates on load (03-01); `reorderLayers`/`deleteLayer` always recompute contiguous `order` so the array can never carry stale/cyclic orders.
- **T-03-SC** (npm installs): accept — NO new package installed (reorder uses buttons, not a drag library; the panel reuses the installed Radix ConfirmDialog + lucide-react glyphs).

## Known Stubs
None. The D-20 `showLabels` seam from 03-04 (previously hard-wired `false`) is now driven by the LayersPanel toggle — the stub is resolved.

## User Setup Required
None — no external service configuration, no new package.

## Self-Check: PASSED

All 5 created files exist on disk (layers.ts, LayersPanel.tsx, LayersPanel.module.css, layers.test.ts, layers.spec.ts); all 3 task commits (ecfcefc, 7b9efce, 77c95af) present in git history. `npx tsc --noEmit` exits 0; 248/248 unit tests green (42 files) incl. 14 new layers tests; `npx playwright test e2e/layers.spec.ts` 3/3 green. Acceptance greps satisfied: `layerId` in repository.ts; `grep -c '<Layer' MapView.tsx` = 3 (background/content/transformer — not one per user layer); LayersPanel has 11 Eye/EyeOff/Lock/LockOpen references (≥4), `updateMap`, and the `showLabels` toggle; StylePopover wires `layerId`; the E2E uses `window.__rb` (18 refs) with 0 direct Dexie writes.

---
*Phase: 03-map-editor-spaces-navigation*
*Completed: 2026-06-27*

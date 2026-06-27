---
phase: 03-map-editor-spaces-navigation
plan: 02
subsystem: map-editor
tags: [konva, react-konva, image-space-coords, viewport-culling, breadcrumb, radix, hierarchy]

# Dependency graph
requires:
  - phase: 03-map-editor-spaces-navigation
    plan: 01
    provides: "Marker image-space x/y + MapDoc.backgroundTransform/parentId/shapes/layers, BackgroundTransform type, version(4) backfill, extended upsertMarker/updateMap"
provides:
  - "coords.ts: imageToStage/stageToImage composition (Pattern 7), identity-safe + scale:0-guarded"
  - "useViewportCulling.ts: pure getVisibleRect/intersects + debounced visible-rect hook (Pattern 5)"
  - "MapView generalized to an active-map editor across 3 physical Konva layers (bg-transform / culled image-space markers / transformer-overlay)"
  - "MapSwitcher (D-05) + '+ New map' quick-create (D-18)"
  - "Breadcrumb (D-10) + pure cycle-safe mapHierarchy.buildAncestorChain (MAP-07)"
  - "App lifts activeMapId; show-on-map opens the SPECIFIC map; person auto-place targets the active map"
  - "AvatarMarker renders at a composed stage position (position prop) instead of reading marker.x/y"
  - "testBridge exposes updateMap (E2E parentId seeding)"
affects: [map editor tools, transformer overlay, portal navigation, layers panel, person picker]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Image-space → stage-space composition centralized in coords.ts (was inline in 03-01 tests); imageToStage at render, stageToImage on drag-end"
    - "Viewport culling: pure geometry (getVisibleRect/intersects) + a React hook that recomputes the visible rect on pan/zoom END (debounced), filtering markers before mount"
    - "Fixed 3 physical Konva layers (never one-per-user-layer) — RESEARCH Pattern 3 / Pitfall 2"
    - "Cycle/dangling-safe parent-chain walk extracted to a pure module (visited-Set + depth cap) so the DoS guard is unit-testable without rendering"

key-files:
  created:
    - src/features/person-map/coords.ts
    - src/features/person-map/editor/useViewportCulling.ts
    - src/features/person-map/editor/MapSwitcher.tsx
    - src/features/person-map/editor/MapSwitcher.module.css
    - src/features/person-map/editor/Breadcrumb.tsx
    - src/features/person-map/editor/Breadcrumb.module.css
    - src/features/person-map/editor/mapHierarchy.ts
    - tests/features/coords.test.ts
    - tests/features/hierarchy.test.ts
    - e2e/map-switch.spec.ts
  modified:
    - src/features/person-map/MapView.tsx
    - src/features/person-map/MapView.module.css
    - src/features/person-map/AvatarMarker.tsx
    - src/app/App.tsx
    - src/db/testBridge.ts

key-decisions:
  - "Extracted the cycle-safe chain builder into mapHierarchy.ts (plan-endorsed) so the T-03-09 DoS guard is unit-tested as a pure function; Breadcrumb is a thin React wrapper over it"
  - "AvatarMarker gained a required `position` prop (composed stage point) instead of reading marker.x/y; drag-end still persists the stage point (= image space at identity, the only reachable transform until 03-04 wires stageToImage)"
  - "MapView empty-state now gates on db.maps.count()===0 (no map at all), while the active-map render gates on the activeMapId-driven query — so switching to a map with no background still shows the toolbar"
  - "App keeps a firstMap seed query (activeMapId defaults to it once) so existing single-map DBs render unchanged; a separate activeMap query drives auto-placement onto the right map"

patterns-established:
  - "Pattern: compose-at-render image anchoring is now a shared coords.ts import (imageToStage), replacing the inline compose helpers in 03-01 migration/anchor tests"
  - "Pattern: culling geometry is pure + exported (getVisibleRect/intersects) and unit-tested independently of React"

requirements-completed: [MAP-07]

# Metrics
duration: 14min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 02: Active-Map Editor, Switcher, Breadcrumb & Image-Space Anchoring Summary

**Generalized the single-map Konva skeleton into an active-map editor: a map switcher (D-05) with a "+ New map" quick-create, a cycle-safe parent-chain breadcrumb (D-10/MAP-07), image-space marker anchoring composed through the background transform (coords.ts, Pattern 7), and viewport culling baked into the render path from the start (Pattern 5) — across a fixed 3 physical Konva layers.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-26T23:55:07Z
- **Completed:** 2026-06-27T00:09:00Z
- **Tasks:** 3 (Tasks 1 & 3 TDD)
- **Files:** 15 (10 created, 5 modified)
- **Tests:** 212 unit (38 files) green; map-switch E2E green (23.4s)

## Accomplishments
- **coords.ts** centralizes the image-space ↔ stage-space composition that 03-01 asserted inline: `imageToStage` (offset → uniform scale → rotation) and `stageToImage` (exact inverse), identity-safe and `scale:0`-guarded (threat T-03-08).
- **useViewportCulling.ts** exposes pure `getVisibleRect`/`intersects` (RESEARCH visibleStageRect/intersects, default 200px margin) plus a hook that recomputes the visible rect on pan/zoom END (debounced 80ms) and a memoized `isVisible` predicate.
- **MapView** is now an active-map editor: the `maps[0]` query is replaced by an `activeMapId`-driven `db.maps.get`; the Stage renders across **exactly three** physical Konva layers — L0 background (with `backgroundTransform` offset/scale/rotation applied to the `<KonvaImage>`), L1 markers (each composed via `imageToStage` and filtered by culling so off-screen markers are never mounted), L2 an empty transformer-overlay placeholder for 03-04.
- **MapSwitcher** (Radix DropdownMenu mirroring NewEntityMenu) lists all maps live, checkmarks the active one, and offers a separated "+ New map" item that routes through App's existing create-Location flow (D-18).
- **Breadcrumb** + **mapHierarchy.buildAncestorChain** walk `parentId` UP with a NON-negotiable cycle/depth guard (visited-Set + `MAX_CHAIN_DEPTH=32`); the current crumb is `aria-current="page"`, ancestor crumbs are buttons that set the ancestor active, deep chains collapse the middle to `…`.
- **App** lifts `activeMapId` next to `activeView`, seeds it to the first map once, makes "show on map" open the SPECIFIC map (resolving the person's marker's `mapId`), and auto-places new people on the ACTIVE map rather than `maps[0]`.
- **AvatarMarker** renders at a composed stage `position` instead of reading `marker.x/y` directly, so placements stay anchored under a non-identity background transform.
- **testBridge** now exposes `updateMap` so the E2E can seed a `parentId` hierarchy.

## Task Commits

1. **Task 1 (RED): coords + culling geometry tests** — `e835546` (test)
2. **Task 1 (GREEN): coords.ts + useViewportCulling.ts** — `ab64027` (feat)
3. **Task 2: generalize MapView + lift activeMapId + MapSwitcher (+ Breadcrumb/mapHierarchy as compile deps)** — `d6b2250` (feat)
4. **Task 3 (test): hierarchy chain unit test + map-switch E2E + bridge updateMap** — `a8aa944` (test)

## Decisions Made
See `key-decisions` frontmatter. Headline: the cycle-safe walk lives in a pure `mapHierarchy.ts` (plan-endorsed extraction) so the T-03-09 DoS guard is unit-tested without rendering; AvatarMarker gained a `position` prop for compose-at-render anchoring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `useLiveQuery` ternary returned a Dexie `PromiseExtended`, not the unwrapped value**
- **Found during:** Task 2 (`tsc --noEmit`)
- **Issue:** `useLiveQuery(() => activeMapId ? db.maps.get(id) : Promise.resolve(undefined), …)` typed the result as `PromiseExtended<MapDoc | undefined>` (the two ternary branches produced mismatched promise types), so every `.id`/`.name`/`.background`/`.backgroundTransform` access failed to compile in both App.tsx and MapView.tsx.
- **Fix:** Wrapped each query body in an `async` arrow that `await`s the get, unifying the return type to `MapDoc | undefined`.
- **Files modified:** src/app/App.tsx, src/features/person-map/MapView.tsx
- **Verification:** `npx tsc --noEmit` exits 0; full suite 212 green.
- **Committed in:** `d6b2250` (Task 2).

**Total deviations:** 1 auto-fixed (Rule 3 blocking). No scope creep.

### Structural note (not a deviation)
The plan assigns `Breadcrumb.tsx`/`Breadcrumb.module.css` to Task 3, but Task 2's `MapView` renders `<Breadcrumb>` and therefore needs it to compile. The Breadcrumb component + its pure `mapHierarchy` chain-builder were created and committed in **Task 2** (the compilable unit); Task 3 then added the hierarchy **unit test**, the **E2E**, and the bridge `updateMap`. This preserves atomic, always-green commits without reordering the plan's intent.

## Threat Mitigations Applied
- **T-03-08** (corrupt `backgroundTransform` scale 0 / NaN): `stageToImage` and `getVisibleRect` treat a zero/non-finite scale as 1 — no divide-by-zero, no NaN propagation. Unit-tested.
- **T-03-09** (cyclic `parentId` DoS): `buildAncestorChain` caps the walk at `MAX_CHAIN_DEPTH=32` AND tracks a visited-id Set; a cycle terminates. Unit-tested (the cycle case would time out if it looped).
- **T-03-10** (dangling `parentId` → deleted map): the walk ends on a missing parent and degrades the map to top-level. Unit-tested.

## Known Stubs
- **L2 transformer-overlay layer** is an intentional empty `<Layer />` placeholder — the Konva Transformer is attached in **03-04** per the plan. Documented and expected; the three-physical-layer structure is required now so later plans don't retrofit it.
- **Breadcrumb deep-chain overflow** renders a non-interactive `…` (the skipped-ancestors DropdownMenu is deferred, as the plan permits). The cycle/depth cap — the non-negotiable part — is present and tested.
- **stageToImage on drag-end** is not yet wired into AvatarMarker (arrives in 03-04); drag-end persists the stage point, which equals image space at the identity transform (the only transform reachable until 03-04 adds a background-edit affordance). No data hazard.

## User Setup Required
None — no external service configuration, no new package installed.

## Self-Check: PASSED

All 10 created files exist on disk; all 4 commits (e835546, ab64027, d6b2250, a8aa944) present in git history. `tsc --noEmit` clean; full unit suite 212/212 green; map-switch E2E green.

---
*Phase: 03-map-editor-spaces-navigation*
*Completed: 2026-06-27*

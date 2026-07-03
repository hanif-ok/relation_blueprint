---
phase: 260703-et9-add-open-map-action-to-locations-browse
plan: 01
subsystem: browse
tags: [browse, navigation, maps, profile, e2e]
status: complete
requirements:
  - QUICK-260703-et9
dependency_graph:
  requires:
    - App.setActiveMapId + App.setActiveView('map') (existing active-map plumbing)
    - window.__rb test bridge (createMap / storeMedia)
  provides:
    - isOpenableMap(type) helper
    - browse-open-map row action (Locations)
    - profile-open-map footer action (Location profile)
    - App.openMap(id) handler
  affects:
    - src/features/browse/BrowseRow.tsx
    - src/features/browse/BrowseList.tsx
    - src/features/profile/ProfileSidebar.tsx
    - src/app/App.tsx
tech_stack:
  added: []
  patterns:
    - "Row action branch on entity type (isOpenableMap) — semantically distinct from isSpatial"
    - "lucide 'Map as MapIcon' alias to avoid shadowing the Map constructor"
key_files:
  created:
    - e2e/open-map.spec.ts
  modified:
    - src/features/browse/browseTypes.ts
    - src/features/browse/BrowseRow.tsx
    - src/features/browse/BrowseList.tsx
    - src/app/App.tsx
    - src/features/profile/ProfileSidebar.tsx
decisions:
  - "openMap sets active map + view only (no focusMarkerId) — a Location IS the map, not a placement to center."
  - "Open map and Show on map are separate row branches with separate testids; the People path is behaviorally unchanged."
metrics:
  tasks_completed: 3
  files_created: 1
  files_modified: 5
  completed: 2026-07-03
---

# Phase 260703-et9 Plan 01: Add Open map action to Locations browse Summary

Added an enabled "Open map ↗" action to Location browse rows and the Location profile sidebar that opens that exact map on the canvas, wired to a new `App.openMap(id)` handler reusing the existing `setActiveMapId` + `setActiveView('map')` plumbing — plus an e2e regression proving the correct (non-first) map opens.

## What was built

- **Task 1 (`20a67f5`)** — Core vertical slice:
  - `browseTypes.ts`: added `isOpenableMap(type)` (maps-only) next to `isSpatial`, kept distinct because "Show on map" (place a spatial entity onto a map) and "Open map" (navigate to the map a Location IS) are different actions.
  - `BrowseRow.tsx`: branched the right-side action on `isOpenableMap(type)` — Locations render an enabled `browse-open-map` button (`Map as MapIcon`, `stopPropagation` → `onOpenMap(entity.id)`); People/Groups/relationship-links keep the unchanged `browse-show-on-map` button. Added required `onOpenMap` to `BrowseRowProps`.
  - `BrowseList.tsx`: threaded required `onOpenMap` through `BrowseListProps` to each row.
  - `App.tsx`: added `openMap(id) { setActiveMapId(id); setActiveView('map'); }` (no `focusMarkerId`), wired `onOpenMap` onto `<BrowseList>`.
- **Task 2 (`43f72c3`)** — Profile parity:
  - `ProfileSidebar.tsx`: added optional `onOpenMap`; renders a neutral `profile-open-map` footer action (reusing the `edit` button style) only when `type === 'maps'`, before Edit. Imported the glyph aliased as `Map as MapIcon` — a bare `Map` import would shadow the `new Map()` constructor used by `groupPlacementsByMap`/`mapNameById`.
  - `App.tsx`: passed `onOpenMap` to `<ProfileSidebar>`, reusing the Task 1 handler.
- **Task 3 (`259d866`)** — `e2e/open-map.spec.ts`: seeds two maps (Head Office first = seeded-active, Warehouse second), clicks the Warehouse row's `browse-open-map`, and asserts the Map view mounts with `map-switcher-trigger` reading "Warehouse" (proving it switched away from the seeded first map).

## Verification results

- `npm run typecheck` — PASS (exit 0). The required `onOpenMap` prop through `BrowseListProps`/`BrowseRowProps` guarantees a missing wire fails compilation.
- `npm run lint` — my six touched files introduce ZERO new lint problems (verified by linting them in isolation). The repo has a pre-existing baseline of `32 problems (15 errors, 17 warnings)` — identical before and after this change — all in unrelated pre-existing code (see Deferred Issues). Per the executor scope boundary these are out of scope and were not fixed.
- `npx playwright test open-map.spec.ts` — PASS (1 passed, ~1.0m).

## Regression guard

The People `browse-show-on-map` path (fixed in commit `e6d7121`) is behaviorally unchanged: the diff of that button is a pure 2-space indentation shift from being nested in the new `else` branch — every attribute (`data-testid`, `disabled`, `onShowOnMap` guard, `ExternalLink` icon) is identical. Groups/relationship-links still render the disabled "Show on map" and no "Open map".

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

Pre-existing lint baseline (NOT introduced by this task, out of scope per the executor scope boundary — unrelated files / unrelated pre-existing lines):
- `src/features/profile/ProfileSidebar.tsx` — `react-hooks/refs` (ref write during render, `lightboxOpenRef`) and `react-hooks/set-state-in-effect` (`setPhotoBlob`) plus exhaustive-deps warnings. All on code untouched by this task.
- `src/app/App.tsx` — `react-hooks/set-state-in-effect` on the pre-existing seed/re-seed `activeMapId` effects (lines 96/114). Not on the new `openMap` function.
- `src/features/pwa/usePersistentStorage.ts` — `no-useless-assignment`; `src/features/pwa/InstallPrompt.tsx` — `react-refresh/only-export-components` warning.

## Self-Check: PASSED

- Commits `20a67f5`, `43f72c3`, `259d866` all present in `272f004..HEAD`.
- All modified/created files exist on disk.

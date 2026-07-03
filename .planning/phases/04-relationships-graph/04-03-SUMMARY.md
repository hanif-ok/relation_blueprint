---
phase: 04-relationships-graph
plan: 03
subsystem: ui
tags: [konva, react-konva, connectors, map, relationships, drag, rAF]

# Dependency graph
requires:
  - phase: 04-relationships-graph (04-01)
    provides: "RelationshipLink endpoints (fromType/fromId/toType/toId/directed) + fromId/toId indexes + listRelationshipsFor"
  - phase: 03-map-editor
    provides: "imageToStage/stageToImage image-space composition, AvatarMarker drag-persist path, 3-physical-layer Stage, LayersPanel Names-toggle precedent"
provides:
  - "buildConnectors pure map-projection geometry (person↔person both-placed only, B6 primary-only, group/endpoint-less/unplaced filtered, directed carried, drag override)"
  - "ConnectorLayer Konva Arrow render (arrowhead only when directed, translucent hairline default / amber when selected, perfectDrawEnabled=false)"
  - "MapView dedicated non-interactive connectors Layer between L0 and L1 + relationshipLinks live query + transient drag state"
  - "AvatarMarker onDragMove (rAF-throttled live-follow) + onDragEnd transient-clear signal"
  - "LayersPanel Relationship-labels toggle (default OFF, D-09)"
affects: [04-04-graph-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure viewer-only projection: connector geometry derived from links + marker positions, never persisted (D-10)"
    - "rAF-throttled transient drag state for live-follow without per-frame Dexie writes (Pitfall 1 / T-04-11)"
    - "Physical Konva layer insertion (listening=false) distinct from logical MapDoc.layers"

key-files:
  created:
    - src/features/person-map/connectors.ts
    - src/features/person-map/editor/ConnectorLayer.tsx
    - tests/features/connectors.test.ts
    - e2e/connectors.spec.ts
  modified:
    - src/features/person-map/MapView.tsx
    - src/features/person-map/AvatarMarker.tsx
    - src/features/person-map/editor/LayersPanel.tsx

key-decisions:
  - "Connector endpoints compose through imageToStage (shared with markers) so lines stay anchored on background re-fit and follow drags"
  - "Drag-follow overlays a transient {markerId,x,y} STAGE-space override in buildConnectors; persistence stays on dragEnd only (no per-frame writes)"
  - "Default connector stroke is a warm translucent hairline (rgba(216,210,196,0.55)); amber reserved for selection; direction is an arrowhead shape, never a color"
  - "Connector labels render via Konva Label/Tag/Text (canvas text) — never HTML injection (T-04-01)"

patterns-established:
  - "buildConnectors is the single new geometry piece; ConnectorLayer/MapView are thin projections of it (unit-tested pure, DOM-free)"
  - "A marker's onDragMove reports live stage position up to the parent; onDragEnd clears the transient override so useLiveQuery recomputes from source"

requirements-completed: [REL-03]

# Metrics
duration: 32min
completed: 2026-07-03
status: complete
---

# Phase 4 Plan 03: Map Connectors Summary

**Authored person↔person relationships now render automatically as data-driven Konva Arrow connectors on the active map — drawn in image-space beneath the markers on a dedicated non-interactive layer, following markers live during a drag (rAF-throttled, no per-frame writes) and recomputing from source on release, with an opt-in Relationship-labels toggle (off by default).**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-07-03T15:10Z
- **Completed:** 2026-07-03T15:42Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- `buildConnectors` pure geometry: derives one connector per person↔person link whose BOTH endpoints have a marker on the active map, composing each endpoint via `imageToStage`; filters group-involving / endpoint-less / unplaced links, picks the primary (first) placement for a multi-placed person (B6), and carries the normalized `directed` flag. Fully unit-tested (7/7) with no DOM.
- `ConnectorLayer` renders each connector as a Konva `Arrow` — arrowhead (pointerLength/pointerWidth) only when directed (D-01), translucent warm hairline default / `colors.amber` when selected, `perfectDrawEnabled={false}` — mounted in a dedicated `<Layer listening={false}>` inserted between L0 (background) and L1 (content) so lines paint beneath markers and never intercept a drag/click (D-08/D-10/B7).
- Live drag-follow: `AvatarMarker.onDragMove` (rAF-throttled) reports the dragging marker's live stage position to a transient MapView `{markerId,x,y}` state that `ConnectorLayer` overlays for that one marker — no per-frame Dexie write; `onDragEnd` persists via the existing `upsertMarker` path and clears the override so `useLiveQuery` recomputes the line from the source of truth (Pitfall 1 / T-04-11).
- `LayersPanel` gained a "Relationship labels" toggle mirroring the D-20 Names toggle, default OFF (D-09); when ON, each connector draws its `label` in a paper-shade Konva `Label/Tag/Text` pill at the segment midpoint (canvas text — never HTML injection, T-04-01).

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Failing pure-geometry unit + drag-follow E2E (RED)** - `e192551` (test)
2. **Task 2: connectors.ts geometry + ConnectorLayer + MapView layer insertion (GREEN)** - `ca211d3` (feat)
3. **Task 3: Live drag-follow (onDragMove + transient state) + LayersPanel label toggle** - `fc19c26` (feat)

_No REFACTOR commit needed — the GREEN implementations were already minimal._

## Files Created/Modified
- `src/features/person-map/connectors.ts` - Pure `buildConnectors(links, markers, transform, opts)` projection + `Connector`/`DragOverride` types.
- `src/features/person-map/editor/ConnectorLayer.tsx` - Konva `Arrow` render of the geometry + optional midpoint label pill.
- `src/features/person-map/MapView.tsx` - `relationshipLinks` live query, the `<Layer listening={false}>` connectors layer between L0/L1, transient `draggingMarker` state, `showConnectorLabels` state, wiring to `AvatarMarker` + `LayersPanel` + `ConnectorLayer`.
- `src/features/person-map/AvatarMarker.tsx` - `onDragMove` (rAF-throttled live-follow) + `onDragEnd` (transient-clear) props; rAF cleanup on unmount / drag-end.
- `src/features/person-map/editor/LayersPanel.tsx` - "Relationship labels" controlled checkbox (default OFF).
- `tests/features/connectors.test.ts` - 7 pure geometry assertions (render rule, B6, filters, directed, drag override).
- `e2e/connectors.spec.ts` - connector renders → follows marker mid-drag → persists on release (REL-03).

## Decisions Made
- Connectors are NOT culled (unlike markers): a connector to a partially off-screen marker still draws. Connector count ≤ link count (modest in v1); the RESEARCH note to cull both-off-screen connectors is deferred until load demands it.
- The translucent hairline stroke is a named module constant in `ConnectorLayer` (derived from `colors.hairline` #D8D2C4 @55%) rather than a new `tokens.ts` entry, since `tokens.ts` was outside this plan's file set; amber selection reads `colors.amber` directly.
- `selectedRelationshipId` is threaded through `buildConnectors`/`ConnectorLayer` (amber path exists) but not yet wired to a selection source — connector selection is set when a relationship is opened from a profile/graph, which lands in 04-04 (graph) / the authoring surface, never by clicking the non-interactive line.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] E2E seed must materialize a default layer so directly-seeded markers render**
- **Found during:** Task 3 (E2E verification of drag-follow)
- **Issue:** The connectors E2E seeds markers directly via `upsertMarker`. A map created by `createMap` ships with `layers: []` (MapDocSchema defaults `layers` to `[]`), and `orderObjectsForRender` DROPS any marker whose layer cannot be resolved (`resolveLayer` returns `undefined` with zero layers). So the seeded markers never mounted as Konva nodes and the drag harness could not address them. (Connectors themselves were unaffected — they ignore layers and rendered correctly.)
- **Fix:** The E2E seed now materializes the default "Markers" layer via `updateMap(..., { layers: [...] })` and assigns both markers a `layerId` — exactly the state the app reaches the moment a person is placed (per the recent `55f3541` auto-place-onto-materialized-layer fix). This is a test-realism fix; no production code changed.
- **Files modified:** e2e/connectors.spec.ts
- **Verification:** `npx playwright test e2e/connectors.spec.ts` — 1 passed (connector renders at [200,160,400,300], tracks the marker to [300,220,400,300] mid-drag, persists x=300/y=220 on release).
- **Committed in:** `fc19c26` (Task 3 commit)

**2. [Rule 3 - Blocking] Removed an unused `markerB` binding flagged by tsc**
- **Found during:** Task 2 (tsc gate)
- **Issue:** The E2E seed captured `const markerB = await upsertMarker(...)` but never used it → `tsc --noEmit` TS6133.
- **Fix:** Dropped the binding (the second marker is still created; only its id was unused).
- **Files modified:** e2e/connectors.spec.ts
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `ca211d3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both in the E2E test only)
**Impact on plan:** No production-code scope creep. Both fixes were needed to make the E2E exercise the real drag-follow path; the connector implementation matches the plan exactly.

## Issues Encountered
- **Root-caused a pre-existing marker-render gap.** During E2E bring-up, both the new connectors E2E and the existing `e2e/marker.spec.ts` showed markers not mounting. Reverting `MapView`/`AvatarMarker`/`LayersPanel` to the base commit (`0d159202`) reproduced `marker.spec` red, proving the cause was pre-existing (layerless-map render drop, above) and NOT introduced by this plan. Logged to `.planning/phases/04-relationships-graph/deferred-items.md` as an out-of-scope follow-up (e.g. seed the default layer in `createMap`, or render layer-less objects on an implicit default). REL-03 connectors are fully verified against a realistic layered map.

## Threat Coverage
- **T-04-01** (connector-label XSS): mitigated — labels render as Konva `Label/Tag/Text` (canvas), never `dangerouslySetInnerHTML`.
- **T-04-10** (endpoint deleted/unplaced): mitigated — `buildConnectors` filters endpoint-less/unplaced/group-involving links; a missing marker yields no connector, never a throw.
- **T-04-11** (per-frame drag writes): mitigated — transient rAF-throttled override + persist on dragEnd only; no per-frame Dexie writes.

## Known Stubs
None — `buildConnectors` is fully wired to the `db.relationshipLinks` live query and real marker positions; no placeholder/mock data paths.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 04-04 (graph view) can reuse the same `db.relationshipLinks` live query + `directed`/endpoint normalization; the `selectedRelationshipId` amber-selection seam is already threaded and awaits a selection source.
- Deferred (non-blocking): the layerless-map marker-render gap (`deferred-items.md`) — a small debug/quick task independent of Phase 4.
- Manual/UAT: visual quality of connectors on a real map (stroke weight, arrowhead, label pill) is the remaining `/gsd-verify-work` check; the "Locations list → open map" path is already resolved (commit 76c55d8), so REL-03's end-to-end user sign-off is unblocked.

## Verification
- `npx vitest run tests/features/connectors.test.ts` — 7/7 green.
- `npx playwright test e2e/connectors.spec.ts` — 1 passed (render + drag-follow + persist).
- `npx tsc --noEmit` — clean.
- `npx vitest run` (full suite) — 297/297 across 50 files green (290 base + 7 new).
- `npx eslint` (changed files) — 0 errors (6 pre-existing warnings, none new).

## Self-Check: PASSED

All 4 created files exist on disk; all 3 task commits (`e192551` test, `ca211d3` feat, `fc19c26` feat) present in git history.

---
*Phase: 04-relationships-graph*
*Completed: 2026-07-03*

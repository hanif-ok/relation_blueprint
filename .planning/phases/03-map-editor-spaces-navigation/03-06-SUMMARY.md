---
phase: 03-map-editor-spaces-navigation
plan: 06
subsystem: map-editor
tags: [portals, marker-variant, door-arch-glyph, konva, descend-hierarchy, parentId, create-or-pick, radix-dialog, navigation, xss-safe-konva-text]

# Dependency graph
requires:
  - phase: 03-map-editor-spaces-navigation
    plan: 05
    provides: "logical-layer render (orderObjectsForRender); markers carry layerId; MapView L1 single content layer; useToolMode tool selection; showLabels driven by LayersPanel"
  - phase: 03-map-editor-spaces-navigation
    plan: 04
    provides: "AvatarMarker draggable-Group template; TransformerOverlay computeTransformPersist/persistTransformResult (kind:'portal' branch); single-select node mirroring"
  - phase: 03-map-editor-spaces-navigation
    plan: 02
    provides: "Breadcrumb walks MapDoc.parentId via mapHierarchy.buildAncestorChain (the ascend half); App active-map setter (onActiveMapChange)"
  - phase: 03-map-editor-spaces-navigation
    plan: 01
    provides: "Marker.kind/targetMapId + MarkerSchema; upsertMarker(kind/targetMapId/layerId); MapDoc.parentId + updateMap patches it; colors.portal token"
provides:
  - "PortalGlyph — a draggable Konva Group rendering a portal-blue DOOR-ARCH (Rect body + inner door Path, never a Circle; D-06); single-click/tap selects (amber Transformer handles), double-click/tap navigates to targetMapId (D-07); composes x/y through backgroundTransform like AvatarMarker; persists drag via upsertMarker(kind:'portal'); deleted-target → muted glyph + 'destination deleted' message (T-03-10); optional XSS-safe target-name label (D-20 parity)"
  - "PortalTargetPicker (+ .module.css) — Radix Dialog 'Where does this portal go?': searchable list of existing maps (current map excluded) + a prominent 'Create a new map…' inline flow; picking sets targetMapId; creating sets targetMapId AND child.parentId = current map (the descend hierarchy, D-09/D-10); cancel/Esc removes the target-less portal via deleteMarker"
  - "MapView portal wiring — the Portal tool drops a portal one-shot via upsertMarker (returns to Select), renders PortalGlyph children in the L1 content layer (composed + culled + layered), double-click descends via the App active-map setter; the deleted-destination status surfaces inline"
  - "repository doc comments confirming portal placement/delete = upsertMarker(kind:'portal')/deleteMarker (no portal-specific function, no new EntityType) and the MAP-07 child.parentId set via updateMap"
affects: [graph view (Phase 4), search/browse of maps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Portal = Marker variant (RESEARCH Pattern 5a, discriminated kind:'portal'): rides the markers shard and reuses the AvatarMarker drag/select/transform machinery + computeTransformPersist's 'portal' branch — NO new EntityType, NO portal-specific repository function. Placement = upsertMarker(kind:'portal'); delete/cancel = deleteMarker."
    - "Down-navigation pairs with up-navigation: a portal's double-click sets the target map active (descend, MAP-07), the exact inverse of the 03-02 breadcrumb's parentId ascend. The picker's inline-create sets child.parentId = current map, so the SAME breadcrumb resolves parent ▸ child with no new hierarchy code."
    - "Dangling targetMapId is detectable, not fatal (T-03-10): the lookup against the live maps set returning undefined drives both a muted glyph and a 'destination deleted' status — navigation no-ops to the message instead of crashing (mirrors the resolveLayer dangling-id discipline from 03-05)."
    - "Create-or-pick inline (RESEARCH Pattern 5): the target picker reuses createMap + updateMap + upsertMarker + deleteMarker — no bespoke flow — and excludes the current map from targets to blunt trivial self-cycles (T-03-09)."

key-files:
  created:
    - src/features/person-map/editor/PortalGlyph.tsx
    - src/features/person-map/editor/PortalTargetPicker.tsx
    - src/features/person-map/editor/PortalTargetPicker.module.css
    - tests/features/portal.test.ts
    - e2e/portal.spec.ts
  modified:
    - src/features/person-map/MapView.tsx
    - src/db/repository.ts

key-decisions:
  - "PortalTargetPicker was created in Task 1 (not Task 2 alone) because MapView imports it — MapView cannot compile (Task 1's tsc gate) without it. Task 2's substantive deliverable is therefore the portal+hierarchy UNIT TEST (the TDD subject), which pins the repository contract the picker orchestrates. The picker UI itself has no separate unit test (it is a thin Radix-Dialog orchestrator over already-tested repository primitives)."
  - "The portal glyph group origin sits at the BOTTOM-CENTER threshold (the doorway 'stands' on the geographic point), mirroring how the avatar stem tip anchors. The door-arch is a radius-md-cornered upright Rect (32×44) with an inner door Path — deliberately NOT a Circle (D-06 distinctiveness), verified by the acceptance grep."
  - "The picker's inline-create requires a background image (createMap's schema requires a background MediaRef). UI-SPEC says 'name + OPTIONAL background'; since MapDoc.background is non-optional in the schema, the create-commit button stays disabled until both a name and an image are supplied — the most faithful reading that doesn't violate the schema. A future plan could relax this with a placeholder background."
  - "Portal placement is a one-shot pointer-DOWN drop (like Person): arming the Portal tool and clicking the canvas commits a target-less portal then returns to Select, and the picker owns the rest. The portal lands on the active layer (ensureDefaultLayer) so it never dangles."
  - "computeTransformPersist is called with kind:'portal' + targetMapId so a portal's resize/rotate bakes width/height/rotation through the repository and preserves its target — reusing the 03-04 transform path verbatim (the 'portal' branch already existed)."

patterns-established:
  - "Marker-variant objects (portal today, any future map glyph): add a kind discriminant + per-kind fields to Marker, render a dedicated Konva Group that reuses the AvatarMarker drag/select/transform skeleton, place/delete through upsertMarker/deleteMarker — no new table, no new repository function."

requirements-completed: [MAP-06, MAP-07]

# Metrics
duration: 12min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 06: Portals — Door-Arch Glyph, Create-or-Pick Target, Descend Navigation Summary

**Delivered MAP-06 + the MAP-07 descend half as a vertical slice: a distinct portal-blue DOOR-ARCH glyph (D-06) that single-click-selects / double-click-navigates (D-07), an inline create-or-pick target picker (D-08) that sets the new child's `parentId` to build the descend hierarchy (pairing with the 03-02 breadcrumb ascend), and graceful 'destination deleted' degradation — a user can now link maps with portals and build floor→building→street hierarchies fluidly.**

## Performance
- **Duration:** ~12 min
- **Started:** 2026-06-27T01:21:02Z
- **Completed:** 2026-06-27T01:33:xxZ
- **Tasks:** 3 (Task 2 TDD)
- **Files:** 7 (5 created, 2 modified)
- **Tests:** 254 unit (43 files) green incl. 6 new portal tests; 2 portal E2E green; tsc clean

## Accomplishments
- **`PortalGlyph` — the signature portal object.** A draggable Konva `Group` rendering a door-arch (a `radius-md`-cornered upright `Rect` 32×44 in `colors.portal` #3E6B8C with an inner paper door `Path`, a paper outline + drop shadow) — deliberately NOT a `Circle` (round = person, D-06). It composes its image-space x/y through `backgroundTransform` and persists drag-end via `upsertMarker({ kind:'portal' })`; `onClick`/`onTap` select (amber Transformer handles, single-select reuse) and `onDblClick`/`onDblTap` navigate to `targetMapId`. A deleted target renders the glyph muted and surfaces the "destination deleted" message on navigate (T-03-10). An enlarged transparent hit-rect gives a ≥44/48px touch target; an optional XSS-safe Konva `Text` target-name label honors `showLabels` (D-20 parity).
- **`PortalTargetPicker` (S15).** A Radix Dialog titled "Where does this portal go?" with a live searchable list of existing maps (the current map excluded — no self-portal) plus a prominent "Create a new map…" inline flow. Picking sets the dropped portal's `targetMapId`; creating runs `createMap` (name + background) then sets `targetMapId` AND `updateMap(child.id, { parentId: currentMapId })` — the descend hierarchy (D-09/D-10). Cancel / Esc / overlay-close removes the target-less portal via `deleteMarker` (no dangling doorway). "No maps match. Create a new one?" empty-search copy. All map names render as React children / plain-text input values (T-03-01).
- **MapView portal placement + navigation.** The Portal tool (already in the 03-03 palette) now drops a portal one-shot on pointer-down (`upsertMarker(kind:'portal')` on the active layer → opens the picker → returns to Select). Portal markers (`kind==='portal'`) render as `PortalGlyph` children in the SINGLE L1 content layer (composed from image space, viewport-culled, layer-ordered). Double-click descends via the App active-map setter (`onActiveMapChange`) — the down-navigation that pairs with the breadcrumb. The deleted-destination message renders inline as a dismissible status.
- **Repository confirmation (no new code path).** Added doc comments to `upsertMarker` (portal = `kind:'portal' + targetMapId`, no `personId`), `deleteMarker` (portal delete/cancel = marker-only, no cascade), and `updateMap` (the MAP-07 `child.parentId` set) — confirming portals reuse existing primitives with no new `EntityType` and no portal-specific function.
- **Tests.** `tests/features/portal.test.ts` (6 cases) pins: portal row shape (kind/targetMapId/no personId, upsert-by-id no duplicate), create-or-pick child sets `parentId` + targets the child (and picking an existing map does NOT reparent it), cancel removes the portal, and a deleted target resolves to `undefined` (T-03-10 detectability). `e2e/portal.spec.ts` (2 cases) proves the full flow: drop a portal → inline-create child "Floor 2" → portal targets C with `C.parentId === A` → double-click descends to C with an A▸C breadcrumb → crumb walks back up to A; and single-click selects (Transformer attaches) WITHOUT navigating (D-07).

## Task Commits
1. **Task 1: PortalGlyph door-arch + portal placement & navigation in MapView** — `7a91b55` (feat)
2. **Task 2: portal placement + descend-hierarchy unit test (TDD)** — `4c5e860` (test)
3. **Task 3: portal E2E — place, inline-create child, descend + ascend, select-vs-navigate** — `cbf2188` (test)

## Files Created/Modified
- `src/features/person-map/editor/PortalGlyph.tsx` (created) — the portal-blue door-arch Konva Group; select/navigate; deleted-target affordance.
- `src/features/person-map/editor/PortalTargetPicker.tsx` (created) — create-or-pick target dialog; sets targetMapId + child.parentId; cancel removes the portal.
- `src/features/person-map/editor/PortalTargetPicker.module.css` (created) — paper dialog styling (mirrors StylePopover tokens).
- `tests/features/portal.test.ts` (created) — portal row shape + descend hierarchy + cancel + deleted-target unit tests.
- `e2e/portal.spec.ts` (created) — place/create/descend/ascend + select-vs-navigate E2E.
- `src/features/person-map/MapView.tsx` (modified) — Portal tool drop, PortalGlyph render in L1, double-click navigate, picker + error status.
- `src/db/repository.ts` (modified) — portal-placement/delete/parentId doc comments (no behavior change).

## Decisions Made
See `key-decisions` frontmatter. Headlines: the PortalTargetPicker was created in Task 1 (MapView imports it / Task 1 tsc gate) so Task 2's TDD subject is the portal+hierarchy unit test that pins the repository contract; the glyph origin sits at the doorway threshold (bottom-center); the inline-create requires a background image because `MapDoc.background` is schema-required (UI-SPEC's "optional background" can't be honored without relaxing the schema — deferred); portal placement is a one-shot pointer-down drop landing on the active layer; resize/rotate reuses `computeTransformPersist`'s existing `kind:'portal'` branch.

## Deviations from Plan

### Auto-fixed Issues
None — no bugs, missing-critical, or blocking issues were encountered.

### Scope Adjustments
- **PortalTargetPicker committed under Task 1 rather than Task 2.** The plan lists the picker file under Task 2, but MapView (Task 1) imports it and Task 1's verify gate is `tsc --noEmit` — which cannot pass without the picker existing. The component was therefore created and committed in Task 1; Task 2 delivered its TDD subject (the unit test) plus the repository doc comment. Every Task 2 acceptance grep still resolves against the picker on disk. No must-have is affected.
- **Inline-create requires a background image (UI-SPEC says "optional").** `MapDoc.background` is a required `MediaRefSchema` field (03-01), so `createMap` cannot produce a backgroundless map. The create-commit button stays disabled until both a name and an image are provided — the closest faithful reading that does not violate the schema. Documented as a future relaxation (a placeholder background) rather than a schema change in this plan.

**Total deviations:** 0 auto-fixed bugs; 2 in-scope adjustments (both keep the must-haves true). No architectural changes; no new package.

## Threat Mitigations Applied
- **T-03-10** (dangling/deleted portal target): the navigate path and the glyph both check `targetMapId` against the live maps set. A missing target renders the glyph muted (`colors.paperShade` + ink-muted inner mark) and `navigatePortal` surfaces "This portal's destination map was deleted. Pick a new one or remove the portal." instead of calling the active-map setter — no crash. Unit-tested (deleted-target resolves to `undefined`).
- **T-03-09** (portal-created parentId cycle): the picker EXCLUDES the current map from the target list (no trivial self-portal), and the existing 03-02 `buildAncestorChain` cycle/depth guard bounds any breadcrumb walk. The unit test also confirms picking an existing map does not reparent it (so an existing-map pick can't silently form a back-edge).
- **T-03-01** (portal target-name label / map names): the optional canvas label flows into a Konva `Text` child; every map name in the picker renders as a React child or a plain-text `<input value>` — never `dangerouslySetInnerHTML`.
- **T-03-SC** (npm installs): accept — NO new package. The picker reuses the installed `@radix-ui/react-dialog` (mirroring StylePopover), not the optional `@radix-ui/react-popover`.

## Known Stubs
None. The PortalTargetPicker is fully wired (create + pick + cancel all hit the repository); portals render, select, navigate, and degrade. No placeholder/empty-data paths remain.

## Issues Encountered
- **Import path for `coords` from `editor/`.** `PortalGlyph` lives in `editor/` but `coords.ts` is in the parent `person-map/`; the initial `./coords` import failed tsc. Fixed to `../coords` (the `TransformerOverlay` import is `./` because that file IS in `editor/`). Caught immediately by the Task 1 tsc gate.

## User Setup Required
None — no external service configuration, no new package.

## Next Phase Readiness
- MAP-06 + MAP-07 (descend) complete: portals link maps, double-click descends, the breadcrumb ascends, deleted targets degrade gracefully.
- Phase 4 (graph view) can treat portals as map→map edges if desired (the `targetMapId` + `parentId` pair already encodes the hierarchy).
- Open follow-up (non-blocking): the inline-create's background requirement could be relaxed with a placeholder background if a backgroundless child map is ever wanted.

## Self-Check: PASSED

All 5 created files exist on disk (PortalGlyph.tsx, PortalTargetPicker.tsx, PortalTargetPicker.module.css, portal.test.ts, portal.spec.ts); all 3 task commits (7a91b55, 4c5e860, cbf2188) present in git history. `npx tsc --noEmit` exits 0; 254/254 unit tests green (43 files) incl. 6 new portal tests; `npx playwright test e2e/portal.spec.ts` 2/2 green. Acceptance greps satisfied: `colors.portal` in PortalGlyph; 4 of onClick/onTap/onDblClick/onDblTap; Rect+Path body with 0 Circle; `kind:'portal'` in MapView; PortalTargetPicker uses createMap/updateMap/deleteMarker and the "Where does this portal go?" copy; the E2E uses `window.__rb` (11 refs) and asserts targetMapId, double-click descend, the A▸C breadcrumb, and single-click select-without-navigate.

---
*Phase: 03-map-editor-spaces-navigation*
*Completed: 2026-06-27*

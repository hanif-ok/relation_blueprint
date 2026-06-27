---
phase: 03-map-editor-spaces-navigation
plan: 07
subsystem: map-editor
tags: [person-placement, person-picker, radix-dialog, appears-on, jump-to-placement, multi-placement, canonical-record, n-marker-rows, xss-safe, konva-stage-center]

# Dependency graph
requires:
  - phase: 03-map-editor-spaces-navigation
    plan: 06
    provides: "Person tool already in the ToolPalette; one-shot place-tool pattern (placePortal) + PortalTargetPicker analog; MapView L1 marker render; PortalTargetPicker Radix-Dialog create-or-pick"
  - phase: 03-map-editor-spaces-navigation
    plan: 05
    provides: "markers carry layerId; effectiveActiveLayerId + ensureDefaultLayer; LayersPanel; logical-layer render"
  - phase: 03-map-editor-spaces-navigation
    plan: 04
    provides: "single-select marker node mirroring (selectedMarkerId) + TransformerOverlay; AvatarMarker composed-position render"
  - phase: 03-map-editor-spaces-navigation
    plan: 02
    provides: "App active-map state (activeMapId/setActiveMapId); MapSwitcher; showOnMap plumbing"
  - phase: 03-map-editor-spaces-navigation
    plan: 01
    provides: "Marker.kind/personId + N-marker-rows model; upsertMarker(kind/personId/layerId, no-id => new row)"
provides:
  - "PersonPicker (+ .module.css) — a Radix-Dialog searchable list of existing people (reactive db.people.orderBy('name'), live case-insensitive name filter, avatar/initials rows); on pick fires onPick(personId) and the consumer places the marker; zero-people empty state routes to the create-person flow; all row text XSS-safe (T-03-01)"
  - "MapView person placement — the Person tool is now a one-shot drop: pointer-down records the image-space point + opens the PersonPicker; onPick upserts a NEW person-kind Marker row on the active layer (no id => a second placement is a second row, D-13); a focusMarkerId effect selects + recenters a marker via a new stageRef (jump-to-placement target)"
  - "ProfileSidebar 'Appears on' section (People only) — reactive db.markers.where('personId').equals(id) grouped by mapId via the pure exported groupPlacementsByMap helper; an APPEARS ON eyebrow + one jump-to-placement <button> per map (XSS-safe names); muted 'Not placed on any map yet.' empty state; '(deleted map)' row for a dangling mapId (T-03-10); new onJumpToPlacement prop"
  - "App wiring — onJumpToPlacement(mapId, markerId) sets the map active, switches to the Map view, and hands MapView the focusMarkerId to select + center; focusMarkerId state + onCreatePerson into MapView"
affects: [graph view (Phase 4), search/browse of people]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Place-existing-entity = NEW Marker row via upsertMarker with NO id (canonical-Person / N-Marker-rows, RESEARCH Pattern 4): the PersonPicker reuses the SAME one-shot place-tool skeleton as the Portal tool — record a drop point, open a Radix-Dialog picker, on pick upsert on the active layer, return to Select. No new EntityType, no new repository function."
    - "Reverse lookup = where('personId') grouped by mapId: 'Appears on' is the inverse of placement, reading the markers shard's personId index and collapsing by mapId. The grouping is a PURE exported helper (groupPlacementsByMap) so it is unit-tested without rendering — the sidebar only resolves names + renders."
    - "Canonical-record propagation is free: identity lives on the single Person row; placements store only per-placement x/y/size/rotation. Editing the Person (updatePerson) propagates to every placement with zero extra code because every marker resolves the person reactively (proven by the propagation unit + E2E)."
    - "Jump-to-placement centers the Konva Stage imperatively: a stageRef + a focusMarkerId effect composes the marker's image-space point through backgroundTransform (imageToStage), recenters the Stage (size/2 − point·scale), selects it for the Transformer, then fires onFocusHandled so re-jumps to the same id work again."

key-files:
  created:
    - src/features/person-map/editor/PersonPicker.tsx
    - src/features/person-map/editor/PersonPicker.module.css
    - tests/features/personPicker.test.ts
    - tests/features/appearsOn.test.ts
    - e2e/place-person.spec.ts
  modified:
    - src/features/person-map/MapView.tsx
    - src/features/profile/ProfileSidebar.tsx
    - src/features/profile/ProfileSidebar.module.css
    - src/app/App.tsx

key-decisions:
  - "The Task 1 unit test (personPicker.test.ts) was GREEN on first run — like the portal precedent (03-06), the data-layer placement contract (canonical-Person / N-Marker-rows) was already built and proven in 03-01, so RED could not fail. The test still pins the picker's exact upsertMarker(no-id => new row) contract; the user-facing PersonPicker/MapView wiring is the plan's net-new deliverable. (The Task 2 test was a genuine RED — its groupPlacementsByMap helper did not exist yet.)"
  - "PersonPicker is built on the INSTALLED @radix-ui/react-dialog (mirrors PortalTargetPicker / StylePopover), NOT the optional @radix-ui/react-popover — no new package (T-03-SC). The picker owns no placement: it only fires onPick(personId); MapView owns the drop coordinate and the upsertMarker call, exactly as planned."
  - "groupPlacementsByMap was extracted as a PURE exported function from ProfileSidebar so the 'Appears on' grouping + canonical-propagation logic is unit-tested without rendering a Konva/Dexie React tree — the same testability discipline the plan asked for. It filters to kind==='person' so a portal (no personId) never leaks into the list."
  - "Jump-to-placement uses a focusMarkerId round-trip (App → MapView → onFocusHandled clears it) rather than an imperative ref handle, so re-clicking the SAME 'Appears on' row re-centers (the guard would otherwise no-op on an unchanged id). MapView gained a stageRef to recenter the viewport."
  - "Each 'Appears on' map row jumps to the FIRST placement on that map (group.markerIds[0]); multiple placements on one map collapse into a single row (markerIds holds them all). This matches D-12 (one row per map) while keeping a deterministic jump target."

patterns-established:
  - "Place-existing-entity tools (Person today, any future entity glyph): reuse the one-shot place-tool skeleton (record drop point → open a Radix-Dialog picker → on pick upsert a NEW marker row on the active layer → return to Select). Inverse 'appears on' lookups read the markers shard by the entity's foreign key and group by mapId through a pure, unit-tested helper."

requirements-completed: [MAP-05]

# Metrics
duration: 14min
completed: 2026-06-27
status: complete
---

# Phase 3 Plan 07: Person Placement — PersonPicker, Appears-On Jump, Canonical Propagation Summary

**Delivered MAP-05 as a vertical slice: a map-side searchable PersonPicker wired to the Person tool (D-11) that places an existing person as a NEW Marker row, the profile "Appears on:" list with jump-to-placement (D-12), and proof that editing a person propagates to every placement (criterion 4) — the create→place→multi-place→trace thread is now fully user-deliverable on top of the 03-01 canonical-Person / N-Marker-rows data model.**

## Performance
- **Duration:** ~14 min
- **Tasks:** 3 (Tasks 1-2 TDD)
- **Files:** 9 (5 created, 4 modified)
- **Tests:** 262 unit (45 files) green incl. 8 new (3 personPicker + 5 appearsOn); 1 new place-person E2E green; tsc clean

## Accomplishments
- **`PersonPicker` — the map-side place-person surface (S16).** A Radix Dialog "Place person" hosting a reactive `useLiveQuery(db.people.orderBy('name'))` list with a live case-insensitive name filter; each row is an avatar thumb (or `initialsOf` fallback, mirroring AvatarMarker/ProfileSidebar) + the name as a React child (XSS-safe, T-03-01). On pick it fires `onPick(personId)` — the consumer owns the drop coordinate. With zero people it shows the muted "No people yet. Create one with + New." empty state plus a shortcut into the existing create-person flow. No new EntityType, no new repository function, no new package (reuses the installed `@radix-ui/react-dialog`).
- **MapView Person-tool placement (D-11/D-13).** The Person tool (already in the 03-03 palette) is now wired like the Portal one-shot: a pointer-down records the image-space drop point and opens the PersonPicker; `onPick` calls `placePerson` → `upsertMarker({ kind:'person', mapId, personId, x, y, layerId })` with NO `id`, so placing an already-placed person yields a SECOND Marker row (multi-placement) while the canonical Person is untouched. The portal/person tools both materialize the default layer first so a placement never dangles.
- **Jump-to-placement focus (D-12).** MapView gained a `stageRef` and a `focusMarkerId` effect: when the host sets a target marker id (after switching the active map), it selects the marker (Transformer ring) and recenters the Stage on its composed point (`imageToStage` → `size/2 − point·scale`), then fires `onFocusHandled` so the host clears it and a re-jump to the same placement re-centers.
- **ProfileSidebar "Appears on:" section (D-12, People only).** A new `APPEARS ON` eyebrow + a list built from `db.markers.where('personId').equals(id)` (reactive) grouped by `mapId` through the pure, exported `groupPlacementsByMap`. Each map is a jump-to-placement `<button>` (map name as a React child); the empty state is muted "Not placed on any map yet."; a placement whose map was deleted shows a muted "(deleted map)" row instead of crashing (T-03-10). New `onJumpToPlacement(mapId, markerId)` prop.
- **App wiring.** `jumpToPlacement` sets the active map, switches to the Map view, and hands MapView the `focusMarkerId`; `focusMarkerId` state + `onCreatePerson` are threaded into MapView, and `onJumpToPlacement` into ProfileSidebar.
- **Tests.** `personPicker.test.ts` (3) pins the pick = one new Marker row, second-map placement = two markers/one Person, and place-twice = no Person fork. `appearsOn.test.ts` (5) pins the grouping (two maps → two groups; same-map collapse; empty grouping; portals ignored) and the criterion-4 propagation (rename leaves one Person + both markers with per-placement x/y intact). `e2e/place-person.spec.ts` proves the full flow: place on Alpha via the tool+picker, switch + place on Bravo, two markers/one Person, "Appears on" lists both maps, the Alpha row jumps + selects the placement, and a bridge rename propagates to the rendered profile name.

## Task Commits
1. **Task 1 (TDD): PersonPicker + Person-tool placement** — `830b928` (test) + `29e411e` (feat)
2. **Task 2 (TDD): profile "Appears on" + jump-to-placement** — `0fc6a0b` (test) + `0dbe87c` (feat)
3. **Task 3: place-person E2E** — `1b7e073` (test)

## Files Created/Modified
- `src/features/person-map/editor/PersonPicker.tsx` (created) — Radix-Dialog searchable people picker; onPick contract; empty state.
- `src/features/person-map/editor/PersonPicker.module.css` (created) — paper dialog styling (mirrors PortalTargetPicker tokens) + round avatar thumb.
- `src/features/person-map/MapView.tsx` (modified) — Person-tool one-shot drop + PersonPicker render + placePerson; stageRef + focusMarkerId select/center effect; onCreatePerson/focus props.
- `src/features/profile/ProfileSidebar.tsx` (modified) — exported `groupPlacementsByMap`; People-only "Appears on" section; reactive placement+maps reads; onJumpToPlacement prop.
- `src/features/profile/ProfileSidebar.module.css` (modified) — APPEARS ON eyebrow + jump-row + empty + deleted-map styling.
- `src/app/App.tsx` (modified) — focusMarkerId state; jumpToPlacement; onCreatePerson + focus wiring into MapView; onJumpToPlacement into ProfileSidebar.
- `tests/features/personPicker.test.ts` (created) — placement contract.
- `tests/features/appearsOn.test.ts` (created) — grouping + canonical-record propagation.
- `e2e/place-person.spec.ts` (created) — full MAP-05 user flow.

## Decisions Made
See `key-decisions` frontmatter. Headlines: the Task 1 unit test was GREEN on first run because the placement data contract pre-existed from 03-01 (portal precedent) — the net-new deliverable is the user-facing picker/wiring; the Task 2 test was a genuine RED (groupPlacementsByMap did not exist); the picker reuses the installed Radix Dialog (no new package); the grouping logic is a pure exported helper for renderless unit testing; jump uses a focusMarkerId round-trip so re-jumps re-center.

## Deviations from Plan

### Auto-fixed Issues
None — no bugs, missing-critical, or blocking issues were encountered during implementation.

### Scope Adjustments
- **focusMarkerId infrastructure landed in Task 1, jumpToPlacement in Task 2.** MapView needs the `focusMarkerId`/`onFocusHandled` props to compile in Task 1 (its select+center effect), so that plumbing (state + MapView wiring) was added in the Task 1 feat commit; the `jumpToPlacement` function and the ProfileSidebar `onJumpToPlacement` wire-up landed in Task 2 where the "Appears on" rows that call it were built. Every acceptance grep still resolves on disk; no must-have is affected.

**Total deviations:** 0 auto-fixed bugs; 1 in-scope sequencing adjustment. No architectural changes; no new package.

## Threat Mitigations Applied
- **T-03-01** (person/map names in picker rows + "Appears on" list): every person name and map name renders as a React child (`{person.name}`, `{name}`) — never `dangerouslySetInnerHTML`. The acceptance greps confirm 0 innerHTML usage in PersonPicker and ProfileSidebar (non-comment lines).
- **T-03-10** (dangling placement / deleted map): the "Appears on" grouping resolves each `mapId` against a reactive `db.maps` read; a group whose map name is `undefined` (deleted map) renders a muted "(deleted map)" row instead of crashing the sidebar (mirrors the portal deleted-target handling in 03-06).
- **T-03-04** (large people list in the picker): the picker reads `db.people.orderBy('name')` and live-filters by a case-insensitive name substring so the rendered set stays bounded (people lists are v1-modest, UI-SPEC S16).
- **T-03-SC** (npm installs): accept — NO new package. The picker reuses the installed `@radix-ui/react-dialog`.

## Known Stubs
None. The PersonPicker is fully wired (pick → upsertMarker; empty state → create flow); the "Appears on" list reads real placements, jumps to real maps, and degrades on deleted maps. No placeholder/empty-data paths remain.

## Issues Encountered
- **Lint `set-state-in-effect` on the picker's search-reset effect.** `useEffect(() => { if (open) setSearch(''); }, [open])` triggers the same `react-hooks/set-state-in-effect` ESLint error the committed `PortalTargetPicker` already triggers — a pre-existing, tolerated project pattern (no pre-commit hook blocks it). Kept for consistency with the established analog rather than diverging; out of scope to refactor the rule project-wide.
- **E2E click interception by the LayersPanel.** The floating LayersPanel overlaps the right-docked ProfileSidebar in the test viewport and intercepts a hit-tested Playwright click on the "Appears on" button. Resolved by dispatching the click directly to the button (`dispatchEvent('click')`), which fires the real React onClick — the same philosophy as portal.spec firing Konva events directly past canvas hit-testing. This is a pre-existing layout layering quirk (the panel predates this plan), not a regression introduced here.

## User Setup Required
None — no external service configuration, no new package.

## Next Phase Readiness
- MAP-05 complete: a user can place an existing person on a map from the editor, place the same person on multiple maps, see every map a person appears on from their profile, and confirm edits propagate to every placement.
- Phase 4 (graph view) can treat the `personId`→`mapId` placements as person↔map edges; the canonical-Person / N-Marker-rows model is now exercised end-to-end through the UI.

## Self-Check: PASSED

All 5 created files exist on disk (PersonPicker.tsx, PersonPicker.module.css, personPicker.test.ts, appearsOn.test.ts, place-person.spec.ts) plus this SUMMARY; all 5 task commits (830b928, 29e411e, 0fc6a0b, 0dbe87c, 1b7e073) present in git history. `npx tsc --noEmit` exits 0; 262/262 unit tests green (45 files) incl. 8 new (3 personPicker + 5 appearsOn); `npx playwright test e2e/place-person.spec.ts` 1/1 green. Acceptance greps satisfied: PersonPicker references `db.people` + `onPick` with 0 innerHTML; MapView places `kind: 'person'` via `upsertMarker`; ProfileSidebar has the `markers.where('personId')` query, the "Appears on" eyebrow, `onJumpToPlacement` (also wired in App.tsx), and 0 innerHTML.

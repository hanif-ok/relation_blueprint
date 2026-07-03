---
status: resolved
trigger: "the map bug, from the list, no option to go to the map location from the object list"
created: 2026-07-03T00:00:00Z
updated: 2026-07-03T13:05:00Z
resolved: 2026-07-03T13:05:00Z
---

## Current Focus

hypothesis: PRESENT-but-broken. The browse-list "Show on map ↗" affordance EXISTS (BrowseRow → onShowOnMap → App.showOnMap) and is enabled for People, but it only switches the active map + the view to Map and opens the profile — it never sets `focusMarkerId`, which is the ONLY mechanism that selects the target marker AND recenters the Stage on it. So the action reaches the map but not the LOCATION; for any map larger than the viewport the person's marker is off the fresh (0,0)/scale-1 Stage and gets culled before mount → invisible.
test: (done) Compared App.showOnMap vs App.jumpToPlacement; read MapView focusMarkerId effect (l.672-685); read coords.imageToStage (identity at default transform); confirmed Stage mounts with no initial fit-to-viewport and off-screen markers are culled; confirmed via git history that focusMarkerId centering (03-07) postdates showOnMap (02-03) and showOnMap was never updated; confirmed 03-UI-SPEC.md l.254 specifies the placement-focus jump "extends Phase-2 D-16 'show on map'".
expecting: Adding `setFocusMarkerId(marker.id)` to showOnMap (reusing the exact tested plumbing jumpToPlacement uses) will select + recenter the placement, making "Show on map" go to the LOCATION.
next_action: "RESOLVED — human-verified 2026-07-03 (UAT passed). Fix committed in e6d7121; regression e2e e2e/show-on-map.spec.ts green. No further action."

reasoning_checkpoint:
  hypothesis: "The browse-list 'Show on map' handler (App.showOnMap) never sets focusMarkerId, so MapView never selects/recenters the person's marker; it only switches map+view. focusMarkerId is the sole select+recenter mechanism (MapView effect l.672-685)."
  confirming_evidence:
    - "App.showOnMap (App.tsx l.207-216) sets activeMapId + activeView + profile + announce, but NOT focusMarkerId — unlike App.jumpToPlacement (l.221-225) which sets focusMarkerId."
    - "MapView's focusMarkerId effect (l.672-685) is the only code that setSelectedMarkerId + stage.position(recenter) on the composed marker point; nothing else recenters on a marker."
    - "coords.imageToStage is identity at the default transform; MapView mounts the Stage with no x/y/scale props (default 0,0,1) and no fit-to-viewport, and useViewportCulling drops off-screen markers before mount — so an un-centered marker on a large map is invisible."
    - "03-UI-SPEC.md l.254 specifies the 'Appears on' jump 'extends Phase-2 D-16 show on map' (focuses/centers the placement); git shows focusMarkerId added in 03-07 (0dbe87c) AFTER showOnMap in 02-03 (fc4c63f), and showOnMap was never updated."
  falsification_test: "If, after adding setFocusMarkerId(marker.id) to showOnMap, clicking 'Show on map' for a person placed off-viewport did NOT recenter/select the marker, the hypothesis would be wrong (the recenter path would have to be broken for jumpToPlacement too, which its tests/UAT contradict)."
  fix_rationale: "Root cause is a missing call to the existing, tested centering plumbing from the older caller. Adding setFocusMarkerId(marker.id) makes showOnMap use the same select+recenter path as jumpToPlacement — addresses the cause (no focus signal), not a symptom."
  blind_spots: "Have not yet run the app to visually confirm the recenter for the browse path specifically; relying on the shared focusMarkerId effect already proven for jumpToPlacement. Multi-placement: showOnMap targets markers.first() (arbitrary among placements) — acceptable parity with jumpToPlacement's markerIds[0], not a regression."

## Symptoms

expected: From the object/entity list (browsing people / places / groups), there should be an option/action to jump to that object's location on the map — i.e. click it and the map opens/pans/centres on the entity's placement (its marker), selecting it. The data to locate the placement exists (Phase 3 Marker rows + `markers.where('personId')` reverse index).
actual: The object list offers no way to go to an object's map location. There is no "go to map location" affordance on list entries; you cannot navigate from a list entry to its placement on the map.
errors: None reported (this presents as a missing/absent affordance, not a crash or console error). To be confirmed during investigation.
reproduction: Open the object list (the browse/list view of people/places/groups), pick an entry, and look for a control to jump to its location on the map — it is absent.
started: Unknown — likely never implemented (no prior "go to map location" feature confirmed). To be verified against git history / roadmap during investigation.

## Eliminated

- hypothesis: "The list→map affordance is FULLY absent (never implemented)."
  evidence: "BrowseRow.tsx renders a 'Show on map ↗' icon button (data-testid=browse-show-on-map) wired to onShowOnMap, passed from BrowseList → App.onShowOnMap → App.showOnMap. The affordance exists and is enabled for People (isSpatial). So it is present-but-broken, not absent."
  timestamp: 2026-07-03T12:00:00Z

## Evidence

- timestamp: 2026-07-03T12:00:00Z
  checked: "src/features/browse/BrowseRow.tsx (l.111-124), BrowseList.tsx (onShowOnMap prop), browseTypes.ts (isSpatial)"
  found: "A 'Show on map ↗' button exists on every browse row; enabled only for People (isSpatial → type==='people'); disabled with a tooltip for maps/groups/relationship-links. onShowOnMap(entity.id) fires on click."
  implication: "The affordance is present, so the bug is in what it DOES, not its absence. Focus shifts to App.showOnMap behavior."

- timestamp: 2026-07-03T12:00:00Z
  checked: "src/app/App.tsx — showOnMap (l.207-216) vs jumpToPlacement (l.221-225); MapView props focusMarkerId/onFocusHandled (l.284-285)"
  found: "showOnMap does setActiveMapId(marker.mapId) + setActiveView('map') + setProfile(...) + setAnnounce(...), but does NOT set focusMarkerId. jumpToPlacement does setActiveMapId + setActiveView('map') + setFocusMarkerId(markerId). focusMarkerId is the differentiator."
  implication: "showOnMap switches to the map and opens the profile but never signals MapView to select/recenter the marker."

- timestamp: 2026-07-03T12:00:00Z
  checked: "src/features/person-map/MapView.tsx focusMarkerId effect (l.672-685); coords.ts imageToStage (l.32-39); Stage mount (l.759-781, no x/y/scale props); useViewportCulling"
  found: "The focusMarkerId effect is the ONLY code that setSelectedMarkerId + stage.position() to recenter on a marker's composed point. Stage mounts at default (0,0)/scale 1 with no fit-to-viewport; imageToStage is identity at the default transform; off-screen markers are culled before mount (visibleMarkers filter)."
  implication: "Without focusMarkerId, the marker is neither selected nor centered; on a map larger than the viewport it is culled and invisible — the user reaches the map but not the location."

- timestamp: 2026-07-03T12:00:00Z
  checked: "git log -S focusMarkerId / -S showOnMap; .planning/phases/03.../03-UI-SPEC.md l.215,254; 03-07-SUMMARY.md l.84"
  found: "focusMarkerId centering was introduced in 0dbe87c feat(03-07). showOnMap was authored earlier in fc4c63f feat(02-03) and never updated afterward. UI-SPEC l.254: the 'Appears on' placement-focus jump 'extends Phase-2 D-16 show on map' — i.e. show-on-map was meant to focus/center the placement."
  implication: "Classic 'new capability (focusMarkerId) added later; pre-existing caller (showOnMap) never wired to it.' The intended contract (per UI-SPEC) is that show-on-map focuses/centers the placement."

- timestamp: 2026-07-03T12:40:00Z
  checked: "New e2e e2e/show-on-map.spec.ts driving the REAL browse→map flow; ran WITH and WITHOUT the fix"
  found: "WITH fix: after clicking a People row's 'Show on map', the Stage recenters on the placement (stageX/Y = viewport-center − marker point) AND a Konva Transformer attaches to the marker node (select) AND the marker Group mounts on-screen — green in 2.2s. WITHOUT fix (setFocusMarkerId removed): the Transformer never attaches (Stage stays at origin, marker culled off-screen) — the poll times out → red. Confirmed via diagnostic dump: without the fix the effect never selects/centers (0 attached transformers, marker Group absent)."
  implication: "The single missing setFocusMarkerId call is precisely what makes 'Show on map' reach the LOCATION. Fix reproduces red→green cleanly."

- timestamp: 2026-07-03T12:40:00Z
  checked: "Seeding sanity while writing the e2e — a marker created via upsertMarker with NO layerId on a createMap (empty layers) did not render"
  found: "orderObjectsForRender drops objects whose layer can't resolve; resolveLayer returns undefined when MapDoc.layers is empty. The real place paths (Person tool / version(4) upgrade) always ensure a default 'Markers' layer, so placed people render. NOTE (out of scope here): App.handleSaved auto-places a new Person via upsertMarker with NO layerId — if that person's active map has an empty layers array, the auto-placed marker would not render until a layer exists. Flagged for a separate look; not part of this navigation fix."
  implication: "The e2e now seeds a default layer + layerId'd marker to reproduce the normal renderable placed-person state."

## Resolution

root_cause: "The browse-list 'Show on map ↗' action (BrowseRow → onShowOnMap → App.showOnMap) switched the active map + view and opened the profile, but never set `focusMarkerId` — the sole signal that makes MapView select the target marker and recenter the Stage on it (MapView effect, MapView.tsx l.672-685). MapView unmounts on view-switch and remounts with a fresh (0,0)/scale-1 Stage and no fit-to-viewport; off-screen markers are culled before mount. So 'Show on map' reached the map but not the LOCATION (and on a map larger than the viewport the placement was culled/invisible). The centering plumbing was added in Phase 3 (03-07) for the profile 'Appears on' jump; the pre-existing 02-03 showOnMap caller was never wired to it, despite 03-UI-SPEC l.254 specifying show-on-map focuses/centers the placement."
fix: "In src/app/App.tsx `showOnMap`, when a marker is found, also call `setFocusMarkerId(marker.id)` — reusing the exact tested plumbing `jumpToPlacement` uses. This makes MapView select + recenter the placement, so the action lands on the person's location. Added regression e2e e2e/show-on-map.spec.ts (green with the fix; red without — the Transformer never attaches)."
verification: "Self-verified: `npm run typecheck` clean for the changed files (App.tsx + new spec); `npm test` 275/275 pass; new e2e green with the fix (Stage recenters on the marker + Transformer attaches + marker Group mounts on-screen) and red with the fix removed (proves reproduction). HUMAN-VERIFIED 2026-07-03 (UAT passed): browse-list 'Show on map' now lands on the person's LOCATION. Fix committed in e6d7121. The earlier note about an uncommitted tests/connect/useSyncEngine.test.tsx import breaking tsc is now moot — build:e2e is green (open-map.spec.ts passed through the Playwright webServer)."
files_changed:
  - "src/app/App.tsx — showOnMap now sets focusMarkerId(marker.id) so the browse-list 'Show on map' selects + recenters the placement (goes to the LOCATION, not just the map)."
  - "e2e/show-on-map.spec.ts — new regression e2e: browse-list 'Show on map' recenters + selects the off-screen placement."

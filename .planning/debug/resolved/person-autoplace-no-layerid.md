---
status: resolved
trigger: "New-Person auto-placement omits layerId, so the marker is dropped on maps with an empty layers array. App.handleSaved auto-places a new Person via upsertMarker with NO layerId; on a map whose layers array is empty, orderObjectsForRender drops any object lacking a layerId, so the new person's marker never renders until a layer exists."
created: 2026-07-03T00:00:00Z
updated: 2026-07-03T14:38:00Z
resolved: 2026-07-03T14:38:00Z
---

## Current Focus

hypothesis: CONFIRMED — `App.handleSaved` auto-places a new person via `upsertMarker({ mapId, personId, x, y })` with NO `layerId`; a fresh map starts with `layers: []` (schema default); `MapView` renders markers via `orderObjectsForRender(persons, map.layers ?? [])`, which drops any object whose layer can't resolve — and `resolveLayer` returns `undefined` when `layers.length === 0`. So a person created on a fresh (layer-less) map is auto-placed but silently culled from render.
test: implementing the fix — extract the auto-place core into an exported helper (`src/app/autoPlacePerson.ts`) that mirrors `MapView.placePerson`/`placePortal`: materialize a default layer on the target map when it has none (`ensureLayers` + `updateMap`) and stamp its id on the marker. `App.handleSaved` becomes a thin caller. Add a data-layer unit test (repository + `orderObjectsForRender`) proving the auto-placed marker renders on a fresh map.
expecting: With the helper, the auto-placed marker always carries a valid `layerId` and the map always has ≥1 layer, so `orderObjectsForRender` includes it. Test RED before fix (marker dropped), GREEN after.
next_action: "RESOLVED — committed in 55f3541 on the strength of automated regression (typecheck clean; full suite 47 files / 282 tests green, re-run on the working tree pre-commit; the new tests/app/autoPlacePerson.test.ts proves the exact mechanism RED/GREEN — marker survives orderObjectsForRender on a fresh map). Manual browser UAT NOT performed (user delegated + away); the failure mode is covered by the unit regression. No further action."

reasoning_checkpoint:
  hypothesis: "App.handleSaved auto-places a new person with no layerId; on a fresh map (layers: []) orderObjectsForRender/resolveLayer drop the layer-less marker, so it never renders."
  confirming_evidence:
    - "App.tsx:180-185 — upsertMarker({ mapId, personId, x, y }) passes NO layerId on person CREATE."
    - "schemas.ts:119 — layers: z.array(LayerSchema).default([]); createMap (repository.ts:246) passes no layers → fresh maps have layers: []."
    - "layers.ts:66 — resolveLayer returns undefined when layers.length === 0; orderObjectsForRender:93 drops objects with no resolvable layer."
    - "MapView.tsx:359 — const layers = map?.layers ?? []; markers render via orderObjectsForRender(persons, layers) (line 599) using the RAW map.layers (no ensureLayers), so a layer-less map drops the marker."
    - "MapView.placePerson/placePortal (MapView.tsx:429-473) already materialize the default layer (ensureDefaultLayer + updateMap when map.layers.length===0) and stamp layerId — the App path never did."
  falsification_test: "After the fix, seed a fresh map (layers: []) + auto-place a new person via the helper; if orderObjectsForRender([marker], map.layers) does NOT include the marker, the hypothesis/fix is wrong."
  fix_rationale: "Mirrors the proven MapView materialization: guarantees the map has ≥1 layer AND the marker carries a valid layerId → resolveLayer never returns undefined for it → orderObjectsForRender keeps it. Addresses root cause (missing layer materialization on the App auto-place path), not a render-side symptom."
  blind_spots: "Not testing the full React handleSaved via <App/> render (Konva/sync deps make jsdom rendering impractical); the helper is unit-tested instead and App.handleSaved is reduced to a thin caller so the tested code IS the shipped code."

## Symptoms

expected: A newly created Person is ALWAYS visible on the active map — auto-placed as a marker at map center (Phase-1 decision: on person CREATE the new person is auto-placed at map center). This must hold on any map, including one that has no layers yet.
actual: On a map whose `layers` array is empty, the auto-placed marker has no `layerId`, and `orderObjectsForRender` drops it — so the new person's marker never renders (invisible) until a layer exists on that map.
errors: None (silent drop — no crash, no console error). To confirm during investigation.
reproduction: Create/have active a map with NO layers (empty `layers` array), then create + save a new Person while that map is active. The person is auto-placed at map center but does not appear on the canvas.
started: Latent since Phase 3 introduced layer-ordering (`orderObjectsForRender`) + the logical `layers` model — the App-level auto-place path in `handleSaved` was never updated to materialize a layer the way `MapView.placePerson`/`placePortal` do. Flagged by gsd-debugger during the list-no-goto-map-location session as a separate latent bug.

## Resolution

root_cause: "App.handleSaved auto-places a newly-created person via upsertMarker WITHOUT a layerId. A fresh map starts with layers: [] (MapDocSchema default; createMap passes no layers). MapView renders person markers via orderObjectsForRender(persons, map.layers ?? []), and resolveLayer returns undefined when layers.length===0, so orderObjectsForRender culls the layer-less marker. Result: a person created while a layer-less (fresh) map is active is auto-placed in the DB but never rendered. MapView.placePerson/placePortal avoid this by materializing a default layer (ensureDefaultLayer + updateMap) before placing; the App auto-place path was never given the same materialization."
fix: "Extracted the D-05 auto-place core into a new exported helper `autoPlaceNewPerson(map, personId)` (src/app/autoPlacePerson.ts) that MIRRORS MapView.placePerson/placePortal: it no-ops when the person is already placed, else calls ensureLayers(map.layers), persists the materialized default layer via updateMap(map.id, { layers }) when the map had none, and stamps the marker with the default (lowest-order) layer's id via upsertMarker({ mapId, personId, x: width/2, y: height/2, layerId }). App.handleSaved now calls this helper instead of the inline upsertMarker-with-no-layerId (removed the now-unused upsertMarker import). Net effect: the auto-placed marker always resolves to a real layer, so orderObjectsForRender never culls it — even on a brand-new map."
verification: "Self-verified: (1) typecheck clean (tsc --noEmit); (2) eslint clean on changed files — the 2 remaining App.tsx lint errors are PRE-EXISTING (react-hooks/set-state-in-effect at the activeMapId seeding effects, confirmed on baseline via git stash, out of scope); (3) new unit test tests/app/autoPlacePerson.test.ts (6 tests) proves: the pre-fix mechanism (layer-less marker + empty layers → orderObjectsForRender drops it), the fix materializes a layer + stamps layerId on a fresh map, the marker SURVIVES orderObjectsForRender on the fresh map (the fix; would fail without materialization), center placement, no-op-when-already-placed, and lands on an existing layer without redundant materialization; (4) full suite green: 47 files / 282 tests. PENDING: human UAT — create a Person while a brand-new (never-edited) map is active and confirm the marker is visible at map center."
files_changed:
  - "src/app/autoPlacePerson.ts (new — auto-place helper with layer materialization mirroring MapView)"
  - "src/app/App.tsx (handleSaved calls autoPlaceNewPerson; removed direct upsertMarker import)"
  - "tests/app/autoPlacePerson.test.ts (new — 6 unit tests)"

## Eliminated

## Evidence

- timestamp: 2026-07-03T01:00:00Z
  checked: "src/app/App.tsx handleSaved (lines 172-195)"
  found: "On form.type==='people' && activeMap && no existing marker, calls upsertMarker({ mapId: activeMap.id, personId: savedId, x: width/2, y: height/2 }) — NO layerId passed."
  implication: "The auto-placed marker has an absent layerId (confirms leg 1 of the hypothesis)."

- timestamp: 2026-07-03T01:00:00Z
  checked: "src/domain/schemas.ts:119 + src/db/repository.ts createMap (246-263)"
  found: "MapDocSchema defines layers: z.array(LayerSchema).default([]); createMap never passes layers, so MapDocSchema.parse defaults it to []."
  implication: "A freshly-created map starts with an EMPTY layers array (confirms leg 3 — reproducible on any fresh map)."

- timestamp: 2026-07-03T01:00:00Z
  checked: "src/features/person-map/editor/layers.ts resolveLayer (65-73) + orderObjectsForRender (82-116)"
  found: "resolveLayer returns undefined iff layers.length===0; orderObjectsForRender skips (drops) any object whose resolveLayer is undefined (line 93). With ≥1 layer, an absent/dangling layerId falls back to the default (lowest-order) layer — so the drop ONLY happens when layers is empty."
  implication: "A layer-less marker on a layer-less map is culled from the render set (confirms leg 2). The bug is scoped precisely to the empty-layers case."

- timestamp: 2026-07-03T01:00:00Z
  checked: "src/features/person-map/MapView.tsx:359 + marker render (594-618)"
  found: "const layers = map?.layers ?? []; visibleMarkers = orderObjectsForRender(persons, layers) — renders using the RAW map.layers (NOT ensureLayers). So on a fresh map, orderObjectsForRender receives [] and drops the auto-placed person marker."
  implication: "The render path does not backfill a layer, so the auto-place path MUST materialize one (confirms the full chain: invisible marker on a fresh map)."

- timestamp: 2026-07-03T01:00:00Z
  checked: "src/features/person-map/MapView.tsx placePerson/placePortal (429-473) + ensureDefaultLayer (76-80)"
  found: "The in-canvas place tools call ensureDefaultLayer(map.layers), and when map.layers.length===0 persist it via updateMap(map.id, { layers: ensured.layers }) BEFORE upsertMarker({ ..., layerId }). This is the materialization pattern the App auto-place path is missing."
  implication: "Fix = mirror this on the App auto-place path (ensureLayers + updateMap-when-empty + stamp layerId). upsertMarker already accepts layerId (repository.ts:362,380)."

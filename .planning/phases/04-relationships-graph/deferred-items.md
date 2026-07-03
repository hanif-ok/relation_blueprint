# Phase 04 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed here per the executor scope boundary).

## Pre-existing E2E failure: `browse-and-create.spec.ts` "sort toggle reorders the list"

- **Discovered during:** 04-02 execution (Task 3 verification).
- **Symptom:** `e2e/browse-and-create.spec.ts:139` fails clicking `sort-recent` — the ProfileSidebar
  (opened automatically after the last `createViaMenu` group create, App `handleSaved` line ~189)
  is docked `position: fixed; right: 0` and intercepts pointer events over the sort toolbar.
- **Confirmed pre-existing:** the identical failure reproduces on the pre-Task-3 base (committed
  Task-2 HEAD, before any 04-02 Relationships-section changes) — it is NOT caused by plan 04-02.
- **Root cause (unrelated to 04-02):** creating an entity via the +New menu auto-opens its profile
  sidebar; the sidebar overlaps the browse-list sort controls, so a subsequent `sort-recent` click
  is blocked. A test-hygiene fix would close the sidebar (or assert against it) before toggling sort,
  or the app could close the sidebar on view switch.
- **Disposition:** DEFERRED — out of scope for 04-02 (relationship authoring). Flag for a follow-up
  quick fix / debug pass.

## [04-03] Pre-existing: markers on a layerless map do not render (e2e/marker.spec.ts red at base)

**Discovered during:** 04-03 (map connectors) E2E verification.

**What:** At the base commit for this wave (`0d159202`), `e2e/marker.spec.ts` FAILS — a map created via
`createMap` ships with `layers: []` (MapDocSchema defaults `layers` to `[]`), and
`orderObjectsForRender` DROPS any marker whose layer cannot be resolved (`resolveLayer` returns
`undefined` when there are zero layers). So a marker seeded directly via `upsertMarker` with no
`layerId` never mounts as a Konva node → `marker.spec` times out waiting for the marker Group.

**Why out of scope:** This is a PRE-EXISTING condition unrelated to REL-03 connectors (verified by
reverting MapView/AvatarMarker/LayersPanel to the base commit and re-running `marker.spec` — still
red). The recent fix `55f3541` ("auto-place new Person onto a materialized layer so it renders on
fresh maps") addresses the UI placement path but NOT direct `upsertMarker` seeding or any map left
with markers but zero layers.

**Impact:** Connectors themselves are unaffected (they ignore layers and render regardless). The
04-03 E2E works around it by materializing a default layer in its own seed (the realistic app state
once a person is placed).

**Suggested follow-up (a debug/quick task, not this plan):** either (a) have `createMap` seed the
default "Markers" layer so a fresh map is never layerless, or (b) make `orderObjectsForRender`
fall back to rendering layer-less objects on an implicit default instead of dropping them, and
update `marker.spec` accordingly.

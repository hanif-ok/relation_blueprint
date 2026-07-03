# Phase 04 — Deferred / Out-of-Scope Discoveries

Items found during execution that are OUT OF SCOPE for the current plan (logged, not fixed).

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

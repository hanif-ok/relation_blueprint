# Deferred items — quick-260821-nac

Out-of-scope discoveries found while executing this quick task. Logged, NOT fixed (they are not
caused by this task's changes).

## 1. Markers never render on a map that has no logical layers (3 failing e2e specs)

**Found during:** plan-level verification (step 4 of `<verification>`), after fixing
`playwright.config.ts` so e2e could run at all again.

**Failing specs (all pre-existing — reproduced against the pre-change source at `c9fe3a3`):**

- `e2e/marker.spec.ts:63` — "a placed person renders a round avatar marker on the Stage"
- `e2e/marker.spec.ts:90` — "dragging the marker persists its new position after reload"
- `e2e/transform-marker.spec.ts:65` — "resizing + rotating a marker persists width/height/rotation
  across reload"

**Cause:** `createMap` produces a map with an EMPTY `layers` array (only the schema version(4)
upgrade backfills the default "Markers" layer, and only for pre-existing maps). These specs seed a
map with `createMap` and then `upsertMarker` straight onto it, so the marker carries no resolvable
layer. `orderObjectsForRender` (`src/features/person-map/editor/layers.ts:93`) drops any object
whose layer cannot be resolved:

```ts
const layer = resolveLayer(object, layers);
if (!layer) return; // no layers at all — degenerate
```

so the marker Group is never mounted and the specs time out waiting for `marker-<personId>` in the
Konva scene graph.

`MapView.commitShape` / `placePortal` / `placePerson` all call `ensureDefaultLayer` and materialize
the default layer before writing — but `upsertMarker` called directly (as the test bridge does, and
as any future caller might) has no such protection.

**Likely fix (a separate task):** either default `MapDoc.layers` to the "Markers" layer inside
`createMap`, or make `orderObjectsForRender` fall back to a synthetic default layer when `layers` is
empty rather than rendering nothing.

**Why deferred:** unrelated to the three canvas gestures this task delivers, and it touches map
creation / render-set semantics that the whole editor depends on. Verified pre-existing by running
the same specs against `c9fe3a3` source with only the playwright base-path fix applied: the same
failures occur.

## 2. Repo-wide lint debt

`npm run lint` reports 16 errors / 17 warnings across the repo (e.g.
`react-hooks/set-state-in-effect` in `ProfileSidebar.tsx`, `no-useless-assignment` in
`usePersistentStorage.ts`). None are in files this task touched — the six files changed here lint
with **0 errors**. Not addressed.

# Deferred items — quick-260902-nfs

Out-of-scope discoveries found while executing this task. Per the scope boundary, these were
**logged, not fixed**: none is caused by this task's changes, and each was verified against the
task's base commit `3c357ea`.

---

## 1. Nondeterministic active-map seeding makes every multi-map e2e spec flaky

**Status:** pre-existing, verified on base. **Not caused by this task.**

`App.tsx` seeds the active map with:

```ts
const firstMap = useLiveQuery(() => db.maps.toArray().then((m) => m[0] ?? null), [], null);
```

Dexie returns rows in **primary-KEY order**, and map ids are random `nanoid`s — so `m[0]` is an
arbitrary map, not the first one created. Any spec that seeds **two or more maps** therefore opens a
*random* one, and everything that follows (marker/portal rendering, the map-switcher label) is a
coin flip.

This is the same root cause the connectors module already documents for marker primacy
(`connectors.ts`, WR-05: "Dexie returns ordered by primary KEY … NOT insertion time"), where it was
solved by an explicit deterministic ordering rule. `db.maps` never received the equivalent fix.

Affected specs, measured on the task's base commit:

| Spec | Base result |
|------|-------------|
| `e2e/portal.spec.ts:182` — single-click a portal SELECTS it | flaky: **9 failures / 24 runs** (~38%) |
| `e2e/place-person.spec.ts:135` — place on two maps, jump, edit propagates | failed on base (map-switcher showed "Bravo", expected "Alpha") |

For comparison, the same 24-run measurement on this task's HEAD gave 12/24 for
`portal.spec.ts:182` — statistically indistinguishable from the 9/24 base rate, and both consistent
with the ~50% coin flip the root cause predicts.

`portal.spec.ts:182` additionally fires at the portal's Konva node **without first waiting for it to
exist** (`firePortalEvent` immediately after `expect(canvas).toBeVisible()`), so even on the right
map it races the `useLiveQuery` marker read.

**Suggested fixes (either or both):**
- App: order maps deterministically when seeding (e.g. by `createdAt`, or by `updatedAt` tie-broken
  by `id`, mirroring the `connectors.ts` WR-05 rule) so a multi-map DB always opens the same map.
- Specs: select the intended map explicitly through the MapSwitcher before asserting. This task's own
  `e2e/marquee-multi-edit.spec.ts` re-layer test does exactly that and is stable as a result:
  ```ts
  await page.locator('[data-testid="map-switcher-trigger"]').click();
  await page.locator(`[data-testid="map-switcher-item-${mapId}"]`).click();
  ```
  Plus a `waitForFunction` on the portal node before firing at it.

---

## 2. Markers never render on a map whose `layers` array is empty

**Status:** pre-existing, already documented as item 1 of
`.planning/quick/260821-nac-middle-click-pan-marquee-select-auto-ret/deferred-items.md`.

`createMap` yields an empty `layers` array, and `orderObjectsForRender` drops any object whose layer
cannot be resolved — so a marker seeded onto a layer-less map is never mounted.

Known-failing specs: `e2e/marker.spec.ts:63`, `e2e/marker.spec.ts:90`,
`e2e/transform-marker.spec.ts:65`.

**Newly observed to belong to this same class:** `e2e/delete-vs-remove.spec.ts:85`. Its `seed()`
creates a map via `createMap` (no layers) and a marker with no `layerId`, so `clickFirstMarker` times
out waiting for a `marker-*` Group that is never rendered. Verified failing identically on base
`3c357ea` with this task's source reverted.

---

## 3. Repo-wide lint debt in untouched files

**Status:** pre-existing, already documented as item 2 of the `260821-nac` deferred items.

Every file this task touched lints clean (0 errors). The one remaining warning in
`src/features/person-map/MapView.tsx` (`react-refresh/only-export-components`, from the long-standing
`useBlobImage` re-export at the bottom of the file) is also pre-existing.

Incidentally **fixed** by this task, since it sat directly on a line being edited: the six
`react-hooks/exhaustive-deps` warnings about `layers` invalidating dependent hooks on every render.
`layers` is now memoized.

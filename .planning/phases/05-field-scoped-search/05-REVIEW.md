---
phase: 05-field-scoped-search
reviewed: 2026-08-05T15:30:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - e2e/search-incremental.spec.ts
  - e2e/search-scope.spec.ts
  - e2e/search.spec.ts
  - src/app/App.tsx
  - src/features/nav/ViewSwitcher.tsx
  - src/features/search/ScopePanel.tsx
  - src/features/search/SearchResultRow.tsx
  - src/features/search/SearchView.module.css
  - src/features/search/SearchView.tsx
  - src/features/search/searchIndex.ts
  - src/features/search/snippet.ts
  - src/features/search/useScopeSelection.ts
  - src/features/search/useSearchIndex.ts
  - tests/features/searchIncremental.test.ts
  - tests/features/searchIndex.test.ts
  - tests/features/searchScope.test.ts
  - tests/features/snippet.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-08-05T15:30:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

> Fresh re-review of the CURRENT code. The earlier WR-01 (photo scope exclusion via the shared
> `isIndexableDef` predicate), WR-02 (initial-build event buffering in `pendingEventsRef`), and WR-03
> (serial `maintenanceQueueRef` with a live `.catch`) fixes are confirmed present and correct. The
> two coordination defects raised in the prior 05-REVIEW.md (CR-01 rebuild/incremental clobber and
> WR-01 lost writes during a rebuild) were NOT patched in the current tree — `handleEvent` still
> publishes `bundleRef.current` unconditionally and the `onChange` handler still buffers only when
> the bundle is null. They are therefore re-reported below against the code as it stands now.

## Summary

The field-scoped search slice is well-structured and the advertised XSS boundary (T-05-01) genuinely
holds: every snippet fragment, field label, matched `<mark>`, and echoed query renders as a React
child — there is no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or any injection surface in scope.
The pure cores (`searchIndex.ts`, `snippet.ts`, `useScopeSelection.ts`) are clean and well-tested.

All remaining defects live in `useSearchIndex.ts`, where the **coarse rebuild** path (a
`useLiveQuery(listFieldDefs)` effect) and the **incremental maintenance** path (the serial
`onChange` queue) both write `bundleRef.current` with no coordination. Only the *initial* build
(null bundle) is protected; *rebuilds* are not. This yields one BLOCKER (an in-flight incremental
event overwrites a completed rebuild, pinning the index to a stale field schema) and one related
WARNING (people writes during the rebuild window land on the about-to-be-discarded index and are
lost). Both are reachable through a normal action — a People custom-field type change, which makes
`repository.applyFieldTypeChange` emit `fieldDefs:update` **and** a `people:update` per coerced row
in the same tick, deliberately racing the rebuild against the incremental events. A separate,
independent WARNING covers the windowed results list going blank when a query is narrowed while the
list is scrolled.

## Critical Issues

### CR-01: In-flight incremental `handleEvent` clobbers a completed coarse rebuild, pinning the index to a stale field schema

**File:** `src/features/search/useSearchIndex.ts:68-81` (races `:99-123`)

**Issue:** `handleEvent` captures `current = bundleRef.current` at entry, then `await`s
(`db.people.get`, then `applyChange`), and finally writes `bundleRef.current = swapped` where
`swapped` wraps `current.index` — **unconditionally**, with no check that `bundleRef.current` is
still `current`. The build effect (`:99-123`) is the only other writer of `bundleRef.current`; it is
driven by a separate `useLiveQuery(listFieldDefs('people'))` and is completely uncoordinated with the
maintenance queue.

Race, reliably set up by a People field **type change** (`applyFieldTypeChange` emits
`fieldDefs:update` **and** `people:update` per coerced row in the same post-commit tick):

1. A `people:update` event is enqueued while `bundleRef` still holds the OLD bundle; `handleEvent`
   captures `current = bundleOld` and suspends on `await db.people.get(...)` / `await applyChange(...)`.
2. The `fieldDefs` write causes `customDefs` to re-resolve; the build effect rebuilds and sets
   `bundleRef.current = bundleNew` — a fresh index over the NEW field set.
3. `handleEvent` resumes and runs `bundleRef.current = swapped`, **overwriting `bundleNew` with a
   wrapper around the stale `bundleOld.index`.**

The index then reflects the *old* field schema: a just-retyped/removed field keeps matching stale
text, or a newly indexable field never appears. It is sticky — subsequent incremental events capture
the clobbered old bundle and keep extending it, so recovery requires a later rebuild that happens to
have no racing in-flight event, or a full reload. This is persistent, user-visible search
incorrectness (and the scope panel can advertise a field the index no longer actually covers). The
window is intermittent (it only clobbers when the rebuild's async chain finishes before the last
in-flight `handleEvent`), but multi-row coercions queue several `people:update` events, widening it.

**Fix:** Never let a stale maintenance step publish over a newer bundle, and re-enqueue rather than
drop the event so it still lands on the fresh index:

```ts
const handleEvent = useCallback(async (ev: ChangeEvent) => {
  const current = bundleRef.current;
  if (!current) return;
  const person = ev.op === 'delete' ? undefined : await db.people.get(ev.entityId);
  const personById = new Map<string, Person>();
  if (person) personById.set(person.id, person);
  await applyChange(current.index, current.fieldTextById, ev, personById, customDefsRef.current);
  // A rebuild swapped the bundle out from under us mid-await: our result belongs to a discarded
  // index. Don't publish over the fresh bundle — re-enqueue so the event lands on the new index.
  if (bundleRef.current !== current) {
    enqueueMaintenance(ev);
    return;
  }
  const swapped: SearchIndexBundle = { index: current.index, fieldTextById: current.fieldTextById };
  bundleRef.current = swapped;
  setBundle(swapped);
}, [enqueueMaintenance]);
```

(Adding `enqueueMaintenance` to the dep array is safe: it is a stable empty-chain callback.) Robust
alternative: run the rebuild itself *through* `maintenanceQueueRef` so a build and an apply can never
interleave — that also resolves WR-01.

## Warnings

### WR-01: People writes during a coarse REBUILD window are applied to the about-to-be-discarded index and lost

**File:** `src/features/search/useSearchIndex.ts:129-140` (interacts with `:99-118`)

**Issue:** The initial-build buffering fires only when `bundleRef.current` is null, which holds
**only during the very first build**. During a *rebuild* (any `fieldDefs` create / update /
soft-delete / reorder — e.g. adding a custom field), `bundleRef.current` still holds the OLD bundle,
so the `onChange` handler takes the `enqueueMaintenance` branch and applies the write to the old
index. When the rebuild then swaps in a fresh bundle built from its own `db.people.toArray()`
snapshot (`:103`), a person created *after* that snapshot but whose event was applied to the old
index is dropped from the search index — unsearchable until the next rebuild or reload. (An `update`
self-heals via `applyChange`'s `index.has` → `add` fallback the next time that person is touched; a
plain `create` does not.)

**Fix:** Buffer/replay across rebuilds, not just the null-bundle initial build — e.g. serialize the
rebuild through `maintenanceQueueRef` and drain `pendingEventsRef` after every swap, or capture the
`toArray()` snapshot *inside* the serial queue so no event can land between the snapshot and the
swap. Shares a root cause with CR-01.

### WR-02: Windowed results list renders blank when a query is narrowed while scrolled

**File:** `src/features/search/SearchView.tsx:94-124` (interacts with `:182-204`)

**Issue:** `scrollTop` is a `useState` updated only from the container's `onScroll`; nothing resets
it when `results` shrinks. When a user scrolls a long result set (e.g. `sm` → 100 hits, scrolled to
the bottom, `scrollTop ≈ 6400`) and then narrows the query (`smith` → 3 hits) while the scroll
container stays mounted, the windowing memo computes `first = floor(6400/64) - OVERSCAN = 94`,
`last = min(3, 94+visible) = 3`, so `results.slice(94, 3)` is empty and `padTop = 94*64 = 6016`. The
list paints a tall blank spacer with no rows. It only self-corrects as the browser clamps the DOM
`scrollTop` against the shrunken content and re-fires `onScroll`, which converges over several janky
frames of blank/partial content. The user sees an empty results panel even though 3 rows match.

**Fix:** Reset `scrollTop` (and scroll the container to top) when the active result set changes —
e.g. an effect keyed on `debouncedQuery`/`activeFields` that sets `scrollTop` to 0 and assigns
`scrollRef.current.scrollTop = 0`, or clamp `first` to `max(0, count - visible)` in the windowing
memo so it can never point past the end.

## Info

### IN-01: Redundant `photo` guard in `projectFieldText` (dead defensive branch)

**File:** `src/features/search/searchIndex.ts:199-202`

**Issue:** `projectFieldText` iterates `activeDefs` and does `if (def.type === 'photo') continue;`,
but every caller passes `activeDefs = customDefs.filter(isIndexableDef)` (`buildIndex:220`,
`applyChange:311`) and `isIndexableDef` already excludes `type === 'photo'`. The inner branch is
unreachable — two owners of the same invariant that could silently disagree later.

**Fix:** Drop the inner branch and rely on the pre-filter, or push the `isIndexableDef` filter fully
into `projectFieldText` — pick one owner, not both.

### IN-02: Search rows depend on two independently-updating live sources (`peopleById` vs the index)

**File:** `src/features/search/SearchView.tsx:53-58, 79-87`

**Issue:** `results` filters index hits through `peopleById`, a *separate*
`useLiveQuery(() => db.people.toArray())` from the index's own `db.people` projection. The two
refresh on independent async schedules, so right after a create/delete a hit produced by the index
may be skipped because `peopleById` has not yet refreshed (or vice-versa). Eventually consistent, and
the e2e retrying assertions mask it, but a valid row can transiently vanish/appear.

**Fix:** Acceptable as eventual-consistency; if tightened, source each row's `Person` from a single
snapshot (e.g. off the index projection / `fieldText`) rather than a second live query.

---

_Reviewed: 2026-08-05T15:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

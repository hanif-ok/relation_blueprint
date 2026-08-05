---
phase: 05-field-scoped-search
reviewed: 2026-08-05T12:00:00Z
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
  warning: 1
  info: 2
  total: 4
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-08-05T12:00:00Z
**Depth:** standard
**Status:** issues_found

> This is a fresh, second-cycle review of the CURRENT code. The prior cycle's WR-01 (photo scope
> exclusion), WR-02 (initial-build event buffering), and WR-03 (serial maintenance queue) are all
> confirmed present and correctly applied. The findings below are NEW.

## Summary

The field-scoped search slice is largely well-constructed and the security boundary it advertises
(T-05-01) genuinely holds: every snippet fragment, field label, and echoed query renders as a React
child, and there is no `dangerouslySetInnerHTML` / `innerHTML` / `eval` / injection surface anywhere
in scope. The prior review-fix cycle landed cleanly — `isIndexableDef` is now the single shared
predicate for index/scope-panel/resolver (so the photo mismatch and the all-fields-off guard are
consistent), initial-build events buffer in `pendingEventsRef` and drain synchronously after the
swap, and incremental maintenance chains through `maintenanceQueueRef` with a live `.catch`.

The remaining defects are in the coordination between the **coarse rebuild** path and the
**incremental maintenance** path in `useSearchIndex.ts`. Both write `bundleRef.current` with no
coordination, and only the *initial* build (null bundle) is protected — *rebuilds* are not. This
yields one BLOCKER (an in-flight incremental event can overwrite a completed rebuild, pinning the
index to a stale field schema) and one related WARNING (writes during a rebuild window land on a
soon-discarded index and are lost). Both are reachable by a normal action: changing a People custom
field's type. `repository.applyFieldTypeChange` emits a `fieldDefs:update` **and** a `people:update`
per coerced row in the same tick — deliberately racing the rebuild it triggers against the
incremental events it emits.

## Critical Issues

### CR-01: In-flight incremental `handleEvent` overwrites a completed coarse rebuild, pinning the index to a stale field schema

**File:** `src/features/search/useSearchIndex.ts:68-81` (interacts with `:99-123`)

**Issue:** `handleEvent` captures `current = bundleRef.current` at entry, then `await`s
(`db.people.get`, then `applyChange`), and finally writes `bundleRef.current = swapped` where
`swapped` wraps `current.index` — **unconditionally**, with no check that `bundleRef.current` is
still `current`. The build effect (`:99-123`) is the only other writer of `bundleRef.current`, driven
by a separate `useLiveQuery(listFieldDefs('people'))` and completely uncoordinated with the
maintenance queue.

Race (reliably provoked by a People field **type change**, since `applyFieldTypeChange` emits
`fieldDefs:update` **and** `people:update` per coerced row in the same tick):

1. A `people:update` event is enqueued while `bundleRef` still holds the OLD bundle; `handleEvent`
   captures `current = bundleOld` and suspends on `await db.people.get(...)`.
2. The `fieldDefs` change re-runs `customDefs`; the build effect rebuilds and sets
   `bundleRef.current = bundleNew` — a fresh index over the NEW field set.
3. `handleEvent` resumes, applies the change to `bundleOld.index`, then runs
   `bundleRef.current = swapped` — **clobbering `bundleNew` with a wrapper around the stale
   `bundleOld.index`.**

The index then reflects the *old* field schema: a just-removed/retyped field still matches with stale
text, or a newly added field is absent. It is sticky — later incremental events capture the clobbered
old bundle and keep using it; recovery needs a rebuild with no racing in-flight event, or a reload.
This is persistent, user-visible incorrectness of search results (and the scope panel can list a
field the index does not actually cover), not a transient flash.

**Fix:** Never let a stale maintenance step publish over a newer bundle, and don't silently drop the
event. Minimal guard (prevents the clobber; re-enqueues so the event still lands on the fresh index):

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

Robust alternative: run the rebuild itself *through* `maintenanceQueueRef` so build and apply can
never interleave, resetting/replaying the queue at each rebuild boundary. That also fixes WR-01.

## Warnings

### WR-01: People writes during a coarse REBUILD window are applied to the about-to-be-discarded index and lost

**File:** `src/features/search/useSearchIndex.ts:129-140` (interacts with `:99-118`)

**Issue:** The initial-build buffering only fires when `bundleRef.current` is null, which holds
**only during the very first build**. During a *rebuild* (any `fieldDefs` create / update /
soft-delete / reorder), `bundleRef.current` still holds the OLD bundle, so the `onChange` handler
takes the `enqueueMaintenance` branch and applies the write to the old index. When the rebuild swaps
in a fresh bundle built from its own `db.people.toArray()` snapshot, any person created *after* that
snapshot but whose event was applied to the old index is dropped from the search index —
unsearchable until the next rebuild or reload. (An `update` self-heals via `applyChange`'s
`index.has` → `add` fallback the next time that person is touched; a plain `create` does not.)

**Fix:** Buffer/replay across rebuilds, not just the null-bundle initial build — e.g. serialize the
rebuild through `maintenanceQueueRef` and drain `pendingEventsRef` after every swap, or capture the
rebuild snapshot inside the serial queue so no event can land between `toArray()` and the swap. Shares
a root cause with CR-01.

## Info

### IN-01: Redundant `photo` guard in `projectFieldText` (dead defensive branch)

**File:** `src/features/search/searchIndex.ts:199-202`

**Issue:** `projectFieldText` iterates `activeDefs` and does `if (def.type === 'photo') continue;`,
but every caller passes `activeDefs = customDefs.filter(isIndexableDef)` (`buildIndex:220`,
`applyChange:311`) and `isIndexableDef` already excludes `type === 'photo'`. The inner branch is
unreachable. Two owners of the same invariant that could silently disagree later.

**Fix:** Drop the inner branch (rely on the pre-filter) or push the filter fully into
`projectFieldText` — pick one owner, not both.

### IN-02: Search rows depend on two independently-updating live sources (`peopleById` vs the index)

**File:** `src/features/search/SearchView.tsx:53-58, 79-87`

**Issue:** `results` filters index hits through `peopleById`, a *separate*
`useLiveQuery(() => db.people.toArray())` from the index's own `db.people` projection. The two refresh
on independent async schedules, so right after a create/delete a hit may be produced by the index but
skipped because `peopleById` has not yet updated (or vice-versa). Eventually consistent, and the e2e
retrying assertions mask it, but a valid row can transiently vanish/appear.

**Fix:** Acceptable as eventual-consistency; if tightened, source the row's Person from a single
snapshot (e.g. off the index projection) rather than a second live query.

---

_Reviewed: 2026-08-05T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

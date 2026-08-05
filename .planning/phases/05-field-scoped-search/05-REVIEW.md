---
phase: 05-field-scoped-search
reviewed: 2026-08-05T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - e2e/search-incremental.spec.ts
  - e2e/search-scope.spec.ts
  - e2e/search.spec.ts
  - package.json
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
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-08-05
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the Field-Scoped Search feature: the MiniSearch index service (`searchIndex.ts`), the
subscription-driven incremental-index hook (`useSearchIndex.ts`), the persisted subtractive scope
selection (`useScopeSelection.ts`), the snippet highlighter (`snippet.ts`), and the UI
(`SearchView.tsx`, `ScopePanel.tsx`, `SearchResultRow.tsx`) plus wiring in `App.tsx`/`ViewSwitcher.tsx`.

**Security is clean.** The XSS boundary the phase was built around holds: user-authored names, the
echoed query, field labels, and the matched substring all render as genuine React children. There is
no `dangerouslySetInnerHTML`, no HTML-string assembly, and no `eval`/injection surface. The `<mark>`
is a real `createElement('mark', …)` node with string children. No hardcoded secrets. The index is
never serialized to the cloud (threat T-05-NS respected).

I confirmed the core index mechanism against the vendored MiniSearch source: per-call `search`
options merge over the constructor `searchOptions` (including `processTerm`), so the query genuinely
keeps `DEFAULT_PROCESS_TERM` and is **not** suffix-expanded, while the index is — the "smith matches
blacksmith" design is correct. Auto-vacuum is on by default, so the `discard`/`replace` tombstones do
**not** leak (the leak risk the brief flagged is mitigated by the library default).

The defects that remain concentrate in the **incremental / subscription lifecycle** (correctness of
the derived index under concurrent or racing writes) and one **windowing** UX bug. All are WARNING —
the index is a derived, rebuildable projection that self-heals on reload or a field-schema change, so
none is a data-loss BLOCKER, but each produces user-visible wrong results under realistic sequences.

## Warnings

### WR-01: Incremental index handlers run concurrently with no sequencing → out-of-order completion leaves a stale/ghost document

**File:** `src/features/search/useSearchIndex.ts:76-95` (with `src/features/search/searchIndex.ts:276-306`)
**Issue:** Every repository change fires a fresh `void (async () => { … await db.people.get() … await applyChange() … setBundle() })()` with no ordering guarantee. `db.people.get()` is captured at emit time, but the two `await`s let handlers interleave and **complete out of order**. Two realistic sequences corrupt the index until the next full rebuild:
- **Racing updates (bulk sync-pull / import).** Update U1 then U2 commit. Handler-1's `get()` (issued at U1's emit, before U2 committed) reads the old row; Handler-2 reads the new row. If Handler-2's async chain resolves first and Handler-1 finishes last, the index ends on U1's **stale** text. Searching the new value then misses the person.
- **create→delete reorder.** A `create` handler's `get()` may resolve *after* the `delete` handler has already run `index.discard` (delete has no `await` before discard, create awaits `get`). The create then `index.add`s a **ghost** row that should not exist.

This matters because MEMORY notes bulk sync push/pull paths exist; those can emit many change events in quick succession without the caller awaiting each. The hook's comment ("All emits are post-commit, so a fresh read reflects the persisted row") addresses the read but not out-of-order *completion*.
**Fix:** Serialize applyChange work behind a single promise chain so handlers apply in emit order:
```ts
const queue = useRef<Promise<void>>(Promise.resolve());
// inside onChange:
queue.current = queue.current.then(async () => {
  const current = bundleRef.current;
  if (!current || ev.entityType !== 'people') return;
  const person = ev.op === 'delete' ? undefined : await db.people.get(ev.entityId);
  const personById = new Map<string, Person>();
  if (person) personById.set(person.id, person);
  await applyChange(current.index, current.fieldTextById, ev, personById, customDefsRef.current);
  const swapped = { index: current.index, fieldTextById: current.fieldTextById };
  bundleRef.current = swapped;
  setBundle(swapped);
});
```

### WR-02: Writes committed during the initial async build are silently dropped

**File:** `src/features/search/useSearchIndex.ts:56-95`
**Issue:** The build effect snapshots `await db.people.toArray()` then `await buildIndex(...)`. The incremental subscription is installed in a separate effect and becomes active immediately. During the async build window, `bundleRef.current` is `null`, so any change event hits the early return `if (!current) return;` and is skipped — with the comment claiming "the initial build will read the persisted row." But if the write commits **after** `toArray()` snapshotted (and before `buildIndex` finishes), that row is in neither the snapshot nor the incremental path, so it is missing from the index until the next coarse rebuild (a field-schema change) or reload. The same gap applies to the coarse rebuild path on a schema change.
**Fix:** After the build resolves and `bundleRef` is set, drain any changes missed during the window — simplest is to re-read the affected rows, or capture a "changed during build" set and re-apply. Minimal patch: on build completion, re-run a `db.people.toArray()`-diff, or record `pendingEvents` while `bundleRef.current === null` and flush them right after `setBundle(next)`:
```ts
const pending = useRef<ChangeEvent[]>([]);
// in onChange, when current is null: pending.current.push(ev); return;
// after setBundle(next) in the build effect: flush pending.current through applyChange.
```

### WR-03: `link-to-entity` indexed text goes stale when the TARGET entity is renamed

**File:** `src/features/search/searchIndex.ts:160-165` (`stringifyCustomValue`) with `applyChange` at `:276-306`
**Issue:** A `link-to-entity` custom field is indexed as the *target's* display name (`target?.name`). The incremental path only re-indexes the entity named in the `ChangeEvent`. When target person B is renamed, the change event is for **B**, so person A (whose link field points at B) is never re-projected and keeps B's **old** name in its indexed text and snippet. Searching B's new name won't surface A through the link field, and A's snippet shows the outdated name, until a full rebuild (schema change) or reload. This is the same one-directional-update class the project already tripped on (MEMORY "sync push/pull gap").
**Fix:** On an update/delete of any entity, invalidate/refresh the documents whose `link-to-entity` fields reference it. If a reverse index (referrer → referenced ids) is too heavy for this phase, at minimum document the limitation and rebuild on a broader signal, or re-project referrers of the changed id. A pragmatic option: when `ev.entityType === 'people'` and the row is a link target, re-index referrers found via `db.people` scan of link fields (bounded by field count).

### WR-04: Windowing does not reset `scrollTop` on query/scope change → result list can render blank when it should show matches

**File:** `src/features/search/SearchView.tsx:94-124` and `:172-204`
**Issue:** `scrollTop` is React state updated only by `onScroll`. The results scroll container is conditionally mounted (`showList`). Sequence: user scrolls a long result set (state `scrollTop` = e.g. 2000) → narrows the query so a state panel shows (container **unmounts**, `scrollTop` state retained) → types a new query with few matches (container **remounts**, DOM `scrollTop` = 0). Windowing then computes `first = floor(2000/64) - 6 = 25`, `end = min(count, 25+visible)` — with `count = 3`, `start(25) > end(3)` so `results.slice(25, 3)` is `[]` and `padTop = 25*64`. Because the DOM `scrollTop` is a valid 0, **no scroll event fires**, so the stale state never corrects: the user sees an empty list for a query that has matches. (The container-stays-mounted variant self-heals via browser scroll clamping; the unmount/remount-through-a-state-panel variant does not.)
**Fix:** Reset scroll position when the query or active scope changes:
```ts
useEffect(() => {
  setScrollTop(0);
  if (scrollRef.current) scrollRef.current.scrollTop = 0;
}, [debouncedQuery, activeFields]);
```

## Info

### IN-01: Suffix (infix) indexing multiplies index term count by ~average token length

**File:** `src/features/search/searchIndex.ts:73-88`
**Issue:** `indexTermWithSuffixes` emits every suffix of each token down to 2 chars, so a token of length *n* yields *n − 1* index terms. For `description`/`notes` free text this can inflate the index several-fold, which bears on the project's explicit "degrade gracefully from dozens to thousands+" constraint (CLAUDE.md). Flagged as INFO because pure performance is out of v1 review scope; noting only because it intersects a stated non-functional requirement.
**Fix:** Consider capping suffix expansion (e.g. only tokens ≤ N chars, or a max suffixes-per-token), or gating infix indexing to the fields where "blacksmith" semantics matter (name/tags/custom) and leaving long-text fields prefix-only. Benchmark against a few-thousand-person DB before shipping large datasets.

### IN-02: `number`/`date` custom fields are indexed as their raw stringified value

**File:** `src/features/search/searchIndex.ts:155-156`
**Issue:** `case 'number': case 'date': return String(value);`. A `date` stored as an epoch-ms number is indexed/snippeted as e.g. `"1699999999999"`, which is neither human-searchable nor a meaningful snippet. Not incorrect, but effectively dead text in the index.
**Fix:** Format dates to a searchable string (ISO date, `YYYY-MM-DD`) before indexing; leave numbers as-is or format consistently.

### IN-03: Subscription callback can call `setBundle` after unmount

**File:** `src/features/search/useSearchIndex.ts:76-95`
**Issue:** The build effect guards its async completion with a `cancelled` flag, but the subscription effect does not: an `applyChange` chain in flight when the component unmounts will still run `setBundle(swapped)`. Harmless under React 19 (no-op on an unmounted component), but inconsistent with the build effect's guarding and worth aligning if the WR-01 queue is introduced.
**Fix:** Add an `unmounted`/`cancelled` ref checked before `setBundle` in the subscription callback (naturally folds into the WR-01 queue refactor).

---

_Reviewed: 2026-08-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

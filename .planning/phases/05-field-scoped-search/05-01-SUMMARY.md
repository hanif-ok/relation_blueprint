---
phase: 05-field-scoped-search
plan: 01
subsystem: search
tags: [minisearch, react, dexie, fuzzy-search, typescript, vitest, playwright]

# Dependency graph
requires:
  - phase: 02-entity-model
    provides: Person built-ins (name/phone/description/tags/notes), BrowseRow/BrowseList windowed list, useEntityThumb, initialsOf, ViewSwitcher rail, ProfileSidebar
  - phase: 04-relationships
    provides: ViewSwitcher 'graph' view + App render-branch pattern reused for 'search'
provides:
  - MiniSearch index service (buildIndex + field-restricted search over built-in People fields)
  - useSearchIndex hook (rebuild-from-live-snapshot, stable search callback)
  - Search view (debounced input + windowed results + pre-query/zero-match states + live region)
  - SearchResultRow (BrowseRow-variant, opens ProfileSidebar + Show-on-map)
  - 'search' ViewKey wired through ViewSwitcher + App shell
affects: [05-02 field-scope checkboxes, 05-03 matched-field snippet + incremental index]

# Tech tracking
tech-stack:
  added: [minisearch@^7.2.0]
  patterns:
    - "Index as a local, rebuildable projection of db.people (never synced to cloud/backup)"
    - "Stable built-in field-key ids ('builtin:*') double as MiniSearch field names AND plan-02 scope keys"
    - "Query-time { fields } restriction as the scoping seam; constructor searchOptions hold fuzzy/prefix/boost defaults"

key-files:
  created:
    - src/features/search/searchIndex.ts
    - src/features/search/useSearchIndex.ts
    - src/features/search/SearchView.tsx
    - src/features/search/SearchResultRow.tsx
    - src/features/search/SearchView.module.css
    - tests/features/searchIndex.test.ts
    - e2e/search.spec.ts
  modified:
    - src/features/nav/ViewSwitcher.tsx
    - src/app/App.tsx
    - package.json

key-decisions:
  - "Fuzzy example uses a single-edit typo ('smyth'→'Smith') — MiniSearch fuzzy:0.2 allows ~1 edit for a 5-char term; the plan's illustrative 'smtih' is a 2-edit distance and would not match"
  - "useSearchIndex.search wrapped in useCallback keyed on the index so SearchView can memoize results without per-render recompute"
  - "FieldManager guard in App widened so activeView==='search' falls back to People (search has no custom-field schema of its own)"

patterns-established:
  - "Search view reuses BrowseList windowing (64px rows) + BrowseList.module.css classes + BrowseRow row skeleton rather than forking"
  - "All user text (entity name, echoed {query}) renders as React children — zero dangerouslySetInnerHTML in src/features/search (T-05-01)"

requirements-completed: [SRCH-01]

# Metrics
duration: 15min
completed: 2026-08-05
status: complete
---

# Phase 5 Plan 01: Field-Scoped Search Spine Summary

**A dedicated "Search" rail view where a debounced query runs main-thread MiniSearch (fuzzy + prefix, name-boosted) over People's built-in fields, each result opening the existing ProfileSidebar — proven by unit + e2e tests.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-05T09:10:00Z
- **Completed:** 2026-08-05T09:24:51Z
- **Tasks:** 3 (Task 1 human pre-approved; Tasks 2-3 executed)
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments
- Installed the one net-new dependency `minisearch@^7.2.0` (human-approved package-legitimacy gate).
- Built the MiniSearch index service + hook: field-restricted fuzzy/prefix search with name-boosted ranking and a 2-char threshold, all proven by 6 unit assertions (prefix, fuzzy, field-restriction, threshold, empty-scope, boost ordering).
- Wired a first-class `'search'` view into the ViewSwitcher rail and App shell, with a paper-chrome Search view (debounced input, windowed results, distinct pre-query + zero-match states, aria-live announcements).
- E2E proves the full thread: type "smi" → Smith surfaces (Jones does not) → row click opens the ProfileSidebar; state copy renders correctly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy gate (minisearch)** — human pre-approved before dispatch (no commit; authorized the Task 2 install)
2. **Task 2: Install minisearch + index service and hook** — `b7a6112` (feat)
3. **Task 3: Wire Search view into nav + shell + input/results/states** — `a914f53` (feat)

_Note: Task 2 is a TDD task; test + implementation were co-committed as a single feat commit (index service is pure logic; the failing-then-passing cycle was run locally before commit)._

## Files Created/Modified
- `src/features/search/searchIndex.ts` — MiniSearch index service: built-in field keys/labels/boosts, `buildIndex(people)`, field-restricted `search()`, `SearchHit`/`MatchInfo` exports.
- `src/features/search/useSearchIndex.ts` — hook owning one index, rebuilt from the live people snapshot; stable `search` callback.
- `src/features/search/SearchView.tsx` — debounced native search input, main-thread query over all built-in fields, windowed 64px results, pre-query + zero-match panels, sr-only live region.
- `src/features/search/SearchResultRow.tsx` — BrowseRow-variant result row (round avatar/initials, name, tags/updated-ago secondary, enabled Show-on-map).
- `src/features/search/SearchView.module.css` — token-only input treatment (mirrors PersonPicker `.input`) + visually-hidden live region.
- `tests/features/searchIndex.test.ts` — 6 unit assertions for the index service.
- `e2e/search.spec.ts` — type→match→open + state-copy end-to-end.
- `src/features/nav/ViewSwitcher.tsx` — `'search'` ViewKey + VIEW_ITEMS entry (Search glyph) + NO_PILL membership; widened EntityViewKey.
- `src/app/App.tsx` — `'search'` render branch (SearchView wired to `openFromList('people')`/`showOnMap`); widened EntityView; FieldManager guard.
- `package.json` / `package-lock.json` — `minisearch@^7.2.0` dependency.

## Decisions Made
- **Fuzzy test uses a single-edit typo.** MiniSearch scales fuzzy tolerance as `round(0.2 × termLength)` ≈ 1 edit for a 5-char term. The plan's illustrative `smtih` is Levenshtein distance 2 from `smith` and would not reliably match, so the test asserts `smyth`→`Smith` (distance 1) to prove fuzzy tolerance faithfully.
- **Stable search callback.** `useSearchIndex` returns a `useCallback`-wrapped `search` keyed on the index instance so `SearchView` memoizes its result set without recomputing on every scroll/render.
- **Package-legitimacy checkpoint** (Task 1, `gate="blocking-human"`) was resolved with the human BEFORE dispatch (user verified `minisearch` on npmjs.com — name `minisearch`, author lucaong, MIT, 7.2.x, maintained, pure logic lib — and typed "approved"), authorizing the `npm install` in Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Widened the App FieldManager entityType guard for `'search'`**
- **Found during:** Task 3 (App shell wiring)
- **Issue:** App's `FieldManager entityType` guard only mapped `'map'`/`'graph'` → `'people'`; with `'search'` now a possible `activeView`, opening Fields while Search is active would pass the invalid `'search'` as an entity type.
- **Fix:** Added `|| activeView === 'search'` to the fallback so Search (which has no custom-field schema of its own) resolves to People, matching map/graph.
- **Files modified:** src/app/App.tsx
- **Verification:** `npm run typecheck` passes; no runtime path passes `'search'` to FieldManager.
- **Committed in:** a914f53 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for correctness; no scope creep.

## Issues Encountered
- **Whole-repo `npm run lint` was already red at the phase base.** 16 pre-existing errors live in files this plan never touched (ProfileSidebar, usePersistentStorage, InstallPrompt, and App's pre-existing seed-map effects) — verified byte-identical to base commit b5acd28 via `git diff`. All files 05-01 authored/modified are lint-clean (0 errors, 0 warnings). Logged to `deferred-items.md`; out of scope per the SCOPE BOUNDARY.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - the search spine is fully wired end-to-end (live index over db.people, real results, real profile navigation). The field-scope checkbox panel and matched-field snippet are intentionally deferred to plans 05-02 and 05-03 respectively, with clear seams left (query-time `{ fields }` restriction already threaded; `match`/`terms` retained on each `SearchHit`).

## Next Phase Readiness
- **Ready for 05-02** (field-scope checkboxes): `searchIndex.search(index, query, fields)` already restricts by field set; the built-in field keys + labels are exported for the scope panel; `useScopeSelection` can pass a subset of `BUILTIN_FIELD_KEYS` unchanged. The all-fields-off guard seam is left un-folded (distinct from zero-match).
- **Ready for 05-03** (snippet + incremental index): `SearchHit` retains `match`/`terms`; the current full-rebuild in `useSearchIndex` is the documented seam to replace with incremental add/replace/discard over the repository change signal.

---
*Phase: 05-field-scoped-search*
*Completed: 2026-08-05*

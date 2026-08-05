---
phase: 05-field-scoped-search
verified: 2026-08-05T10:43:40Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: Field-Scoped Search Verification Report

**Phase Goal:** A user can fuzzy-search people across their attributes and use per-attribute checkboxes to scope which fields a query matches — so "smith" can match the name field while excluding the job field (no blacksmiths).
**Verified:** 2026-08-05T10:43:40Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can fuzzy-search people across their attributes and get tolerant, relevant matches | ✓ VERIFIED | `src/features/search/searchIndex.ts` builds a MiniSearch index (`fuzzy: 0.2`, `prefix: true`, name-boosted) over all built-in + custom fields; `tests/features/searchIndex.test.ts` (7 assertions: prefix, fuzzy typo tolerance, field restriction, 2-char threshold, boost ordering) — 7/7 pass. `e2e/search.spec.ts` drives the real UI (type "smi" → "Smith" surfaces, "Jones" does not → row click opens ProfileSidebar) — 2/2 pass. |
| 2 | User can toggle per-attribute checkboxes to scope which fields a search matches (e.g. "smith" with the job field off matches names, not blacksmiths) | ✓ VERIFIED | `src/features/search/ScopePanel.tsx` + `useScopeSelection.ts` + index-time suffix expansion (`indexTermWithSuffixes`) make "smith" match inside "blacksmith". `e2e/search-scope.spec.ts` test `unchecking "Job" makes "smith" match names but not blacksmiths (SRCH-02, persisted)` drives the real browser UI: seeds "Jane Smith" + "Alex Black" (Job="blacksmith"), confirms both surface with Job ON, unchecks the Job checkbox, confirms only Jane Smith remains, reloads the page, and confirms the un-check and the filtered result set both persist. 3/3 scope e2e tests pass. |

**Score:** 2/2 roadmap success criteria verified (both with real-browser behavioral evidence, not presence-only).

### Plan-Level Must-Have Truths (05-01 / 05-02 / 05-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 3 | "Search" entry in ViewSwitcher rail, no count pill (D-01) | ✓ VERIFIED | `ViewSwitcher.tsx` `VIEW_ITEMS` includes `{ key: 'search', label: 'Search', icon: Search }`; `NO_PILL` set includes `'search'`; `EntityViewKey` excludes `'search'`. `e2e/search.spec.ts` clicks `view-search`. |
| 4 | Selecting Search swaps to a debounced Search view (D-02) | ✓ VERIFIED | `App.tsx:335-341` renders `<SearchView>` on `activeView === 'search'`; `SearchView.tsx` debounces 200ms before querying (main thread, no worker). |
| 5 | Typing "smi" surfaces "Smith" via prefix+fuzzy (D-06, SRCH-01) | ✓ VERIFIED | `e2e/search.spec.ts` test passes; unit test `searchIndex.test.ts` proves prefix + fuzzy (1-edit) tolerance. |
| 6 | Row click opens ProfileSidebar; Show-on-map navigates (D-10) | ✓ VERIFIED | `SearchResultRow.tsx` `onClick={() => onOpen(entity.id)}`; `App.tsx` wires `onOpen={(id) => openFromList('people', id)}` and `onShowOnMap={(id) => void showOnMap(id)}`; `e2e/search.spec.ts` asserts the profile sidebar opens with `profile-name` "Smith". |
| 7 | Results begin at 2nd typed char; 0-1 chars show pre-query prompt (D-08/D-11) | ✓ VERIFIED | `MIN_QUERY_LENGTH = 2` gate in `search()`; `SearchView.tsx` renders the distinct `search-prequery` panel below threshold; `e2e/search.spec.ts` asserts the "Search people" heading for a 1-char query. |
| 8 | Scope panel: checkbox per built-in + every non-deleted custom field, live from FieldDef schema (D-03) | ✓ VERIFIED | `ScopePanel.tsx` renders `BUILTIN_FIELD_KEYS` + `useLiveQuery(() => listFieldDefs('people'))`; `e2e/search-scope.spec.ts` test "the scope panel renders built-ins + the live custom field, all checked by default" passes. |
| 9 | Every checkbox defaults ON; subtractive unchecking (D-04) | ✓ VERIFIED | `resolveActiveFields`/`applyScopeChange` in `useScopeSelection.ts` — checking DELETES the map entry, absent = ON; `tests/features/searchScope.test.ts` (part of the 32 passing unit assertions) proves default-ON, subtractive-uncheck, rename-stable, soft-delete-ignored, all-off. |
| 10 | Blacksmith scoping is the signature behavior (SRCH-02) | ✓ VERIFIED | See roadmap truth #2 above — real-browser e2e passes. |
| 11 | Scope selection persists across sessions keyed by stable FieldDef.id (D-05) | ✓ VERIFIED | `db.meta.put({ key: 'searchFieldScope', value })` keyed by `builtin:*`/`FieldDef.id` (never label); `e2e/search-scope.spec.ts` reloads the page mid-test and asserts the un-check and filtered results both survive. |
| 12 | All-fields-off shows a distinct guard, not empty list (D-11) | ✓ VERIFIED | `SearchView.tsx` renders `search-all-off` (heading "Nothing to search") as a third, distinct branch before the zero-match branch; `e2e/search-scope.spec.ts` test "unchecking EVERY field shows the distinct all-fields-off guard (D-11)" passes and explicitly asserts `search-zero-match` has count 0. |
| 13 | Non-name match shows a matched-field snippet with `<mark>` (D-09) | ✓ VERIFIED | `snippet.ts` `buildSnippet` returns real React children incl. a genuine `createElement('mark', …)`; `tests/features/snippet.test.ts` (9 assertions, part of the 32 passing) asserts the mark is a React element (`type === 'mark'`), not an HTML string; `e2e/search-incremental.spec.ts` test "a non-name match shows the matched-field snippet with the term in a real `<mark>`" passes. |
| 14 | Name-only match falls back to the normal BrowseRow line, no redundant snippet (D-09/B6) | ✓ VERIFIED | `pickMatchedField` in `snippet.ts` explicitly excludes `builtin:name` from candidates; `SearchResultRow.tsx` falls back to tags/`updatedAgo` when `matchedKey` is undefined. Unit-tested in `snippet.test.ts`. |
| 15 | Incremental index update via repository change signal, not full rebuild per load/edit (SRCH-01 criterion 3) | ✓ VERIFIED | `searchIndex.ts` `applyChange` maps `create→add / update→replace / delete→discard`; `useSearchIndex.ts` builds once on mount then subscribes to `repository.onChange`. `tests/features/searchIncremental.test.ts` (6 assertions) proves the builder runs once and every subsequent mutation flows through `applyChange` only. `e2e/search-incremental.spec.ts` test "a person created while Search is open appears in results with no reload" passes — genuine state-transition behavior exercised, not presence alone. |

**Score:** 13/13 plan-level must-have truths verified (all with either unit-test or real-browser e2e behavioral evidence).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/search/searchIndex.ts` | MiniSearch index service (build, search, applyChange, custom-field text) | ✓ VERIFIED | 307 lines; exports `buildIndex`, `search`, `applyChange`, `BUILTIN_FIELD_KEYS/LABELS/BOOSTS`, `SearchHit`. Wired into `useSearchIndex.ts`. |
| `src/features/search/useSearchIndex.ts` | Hook owning the index, incremental maintenance | ✓ VERIFIED | Builds once from `db.people.toArray()` + live `FieldDef`s, subscribes to `onChange` from `@/db/repository`. |
| `src/features/search/SearchView.tsx` | Search view — input, scope panel, windowed results, 3 distinct states, live region | ✓ VERIFIED | 214 lines; renders `ScopePanel`, `SearchResultRow` list, `search-prequery`/`search-zero-match`/`search-all-off` distinct panels, `aria-live` region. |
| `src/features/search/SearchResultRow.tsx` | BrowseRow-variant result row with snippet | ✓ VERIFIED | Renders thumbnail/name/snippet-or-fallback/Show-on-map; uses `pickMatchedField`/`buildSnippet`. |
| `src/features/search/ScopePanel.tsx` | Native fieldset checkbox panel | ✓ VERIFIED | Built-ins fixed + live custom defs via `useLiveQuery(listFieldDefs('people'))`; ink-accent styling. |
| `src/features/search/useScopeSelection.ts` | Persisted subtractive scope hook + pure resolver | ✓ VERIFIED | `resolveActiveFields`, `isFieldChecked`, `applyScopeChange` (pure) + `useScopeSelection` (Dexie meta, transactional write). |
| `src/features/search/snippet.ts` | Pure highlight helper | ✓ VERIFIED | 108 lines; `pickMatchedField` + `buildSnippet`, React children only. |
| `src/features/nav/ViewSwitcher.tsx` | 'search' ViewKey wired | ✓ VERIFIED | `search` in `ViewKey`, `VIEW_ITEMS`, `NO_PILL`; `EntityViewKey` excludes it. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `SearchView.tsx` | `useSearchIndex.ts` | `search(debouncedQuery, activeFields)` | ✓ WIRED | Confirmed at `SearchView.tsx:80`. |
| `App.tsx` | `SearchView.tsx` | render branch on `activeView === 'search'` | ✓ WIRED | Confirmed at `App.tsx:335-341`; `onOpen`/`onShowOnMap` wired to existing `openFromList('people', …)`/`showOnMap`. |
| `ScopePanel.tsx` | `src/db/repository.ts` | `useLiveQuery(() => listFieldDefs('people'))` | ✓ WIRED | Confirmed at `ScopePanel.tsx:55`. |
| `SearchView.tsx` | `searchIndex.ts` | active scope-key subset passed to `search(...)` | ✓ WIRED | Confirmed at `SearchView.tsx:63-67,80`. |
| `useScopeSelection.ts` | `src/db/schema.ts` | `db.meta.put/get` under `searchFieldScope` | ✓ WIRED | Confirmed at `useScopeSelection.ts:73-85`. |
| `useSearchIndex.ts` | `src/db/repository.ts` | `onChange(ev => applyChange(...))` filtered to `people` | ✓ WIRED | Confirmed at `useSearchIndex.ts:77-93`. |
| `SearchResultRow.tsx` | `snippet.ts` | renders snippet children from hit match metadata + `fieldTextById` | ✓ WIRED | Confirmed at `SearchResultRow.tsx:61-67`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `SearchView.tsx` results | `results` (person+hit pairs) | `useSearchIndex().search()` ← `db.people.toArray()` (live Dexie query) via `useSearchIndex`'s build effect | Yes — real Dexie table read, not static | ✓ FLOWING |
| `ScopePanel.tsx` checkboxes | `customDefs` | `listFieldDefs('people')` (real repository query) | Yes | ✓ FLOWING |
| `useScopeSelection` `stored` | scope map | `db.meta.get('searchFieldScope')` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests (index, scope, snippet, incremental) exist and pass | `npx vitest run tests/features/searchIndex.test.ts tests/features/searchScope.test.ts tests/features/snippet.test.ts tests/features/searchIncremental.test.ts` | 4 files, 32 tests passed | ✓ PASS |
| Typecheck clean | `npm run typecheck` | no errors | ✓ PASS |
| Lint clean on search feature | `npx eslint src/features/search/` | no output (0 errors) | ✓ PASS |
| No XSS injection / debt markers in search feature | `grep -rn "dangerouslySetInnerHTML=" / "TBD|FIXME|XXX" / "TODO|HACK|PLACEHOLDER" src/features/search/` | no matches on any pattern | ✓ PASS |
| Production/e2e build succeeds | `npm run build:e2e` | built in 13.53s, sw generated | ✓ PASS |
| E2E: full spine, scope, incremental+snippet | `npx playwright test e2e/search.spec.ts e2e/search-scope.spec.ts e2e/search-incremental.spec.ts` | 7 tests passed (37.0s), including the smith-vs-blacksmith signature scenario driven through the real browser UI with a persisted-across-reload assertion | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SRCH-01 | 05-01, 05-03 | User can fuzzy-search people across their attributes | ✓ SATISFIED | Index service + view spine (05-01) + incremental freshness (05-03), all behaviorally proven above. |
| SRCH-02 | 05-02 | User can toggle per-attribute checkboxes to scope which fields a search matches | ✓ SATISFIED | ScopePanel + subtractive persisted selection + infix indexing, proven by the real-browser blacksmith e2e. |

No orphaned requirements: REQUIREMENTS.md maps only SRCH-01 and SRCH-02 to Phase 5, and both are claimed and delivered. (Note: REQUIREMENTS.md's checkbox/traceability rows for SRCH-01/SRCH-02 still show unchecked/"Pending" — this appears to be a documentation-sync step deferred to the milestone-close/ship workflow, not a code gap; flagged for the ship step, not a phase-goal failure.)

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no `dangerouslySetInnerHTML`, no stub returns (`return null`/`{}`/`[]` used as a placeholder), no hardcoded-empty props in `src/features/search/`.

**Noted (non-blocking, from 05-REVIEW.md — 0 critical / 4 warnings, all advisory):**
- WR-01: incremental change handlers can complete out of order under rapid/concurrent repository events (e.g. bulk sync pull), transiently leaving a stale or ghost document until the next coarse rebuild/reload.
- WR-02: a write committed during the initial async index-build window can be silently missed until the next coarse rebuild/reload.
- WR-03: a `link-to-entity` indexed value goes stale when the *target* entity is renamed, until a full rebuild.
- WR-04: results-list `scrollTop` isn't reset on query/scope change, which can transiently render a blank list when the container unmounts/remounts through a state panel.

These concern the incremental-index *lifecycle under racing/edge-case sequences*, not the core SRCH-01/SRCH-02 goal: the index is a rebuildable local projection that self-heals on reload or the next field-schema rebuild, so none is a data-loss or goal-blocking defect. Recommended as follow-up hardening, not a re-open of this phase.

### Human Verification Required

None. Both roadmap success criteria and all 13 plan-level must-have truths are proven by passing automated tests that exercise real behavior (unit tests directly driving the pure index/scope/snippet logic, and Playwright e2e tests driving the actual rendered UI in a real browser — including the signature "smith"/"blacksmith" scoping scenario with a reload-persistence assertion). No visual-only or subjective-judgment criteria remain unverified for this phase's goal.

### Gaps Summary

No gaps. All must-haves across 05-01/05-02/05-03 verified with artifact + wiring + behavioral evidence; both roadmap success criteria hold. The four code-review warnings are advisory hardening items for the incremental-index lifecycle under concurrent/racing edit sequences and do not block the phase goal.

---

_Verified: 2026-08-05T10:43:40Z_
_Verifier: Claude (gsd-verifier)_

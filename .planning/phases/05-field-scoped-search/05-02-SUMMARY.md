---
phase: 05-field-scoped-search
plan: 02
subsystem: search
tags: [minisearch, react, dexie, fuzzy-search, field-scope, typescript, vitest, playwright]

# Dependency graph
requires:
  - phase: 05-field-scoped-search
    plan: 01
    provides: MiniSearch index service + useSearchIndex hook, SearchView (input/results/states), SearchResultRow, 'search' view wired into ViewSwitcher + App
  - phase: 02-custom-fields-full-entity-model
    provides: FieldDef schema (listFieldDefs), CustomValues map, CustomFieldRows.LinkValue target-name resolution, QUARANTINE_KEY_PREFIX
provides:
  - Persisted subtractive field-scope selection (useScopeSelection + resolveActiveFields) over a local searchFieldScope Dexie meta row
  - ScopePanel — native <fieldset> checkbox panel (built-ins + live custom People fields, ink-accent, keyed by stable id)
  - Index extended to custom-field values (stringified number/date, tags joined, link-to-entity -> target name; photo/quarantine skipped) keyed by FieldDef.id
  - Infix/suffix indexing so a substring query ("smith") matches inside a token ("blacksmith") — the SRCH-02 signature behavior
  - fieldTextById projection (per-person, per-field exact indexed text) exported for plan 03's matched-field snippet
  - All-fields-off guard state (distinct from zero-match, D-11)
affects: [05-03 matched-field snippet + incremental index]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope selection as a LOCAL, subtractive Dexie-meta preference (records only un-checks; absent = ON) — never synced (B8)"
    - "Query-time { fields } restriction driven by resolveActiveFields(builtinKeys, liveCustomDefs, storedSelection)"
    - "Index-time suffix expansion via MiniSearch processTerm for infix matching; search-time processTerm left default so the query is not expanded"
    - "Async index build returning { index, fieldTextById } (link-to-entity name resolution needs a Dexie read)"

key-files:
  created:
    - src/features/search/useScopeSelection.ts
    - src/features/search/ScopePanel.tsx
    - tests/features/searchScope.test.ts
    - e2e/search-scope.spec.ts
  modified:
    - src/features/search/searchIndex.ts
    - src/features/search/useSearchIndex.ts
    - src/features/search/SearchView.tsx
    - src/features/search/SearchView.module.css
    - tests/features/searchIndex.test.ts

key-decisions:
  - "Infix (suffix) indexing added so 'smith' matches the 'blacksmith' Job value — MiniSearch prefix only matches token starts; verified against MiniSearch docs (Context7). The signature behavior is impossible without it."
  - "Scope map is subtractive: a checked field stores NO entry (re-checking deletes the key), so a newly-added field defaults ON and a soft-deleted field's stale false is ignored by the resolver."
  - "setFieldChecked wraps its read-modify-write in a Dexie rw transaction so rapid concurrent un-checks are not lost."
  - "E2E uses .click() + retrying assertions (not Playwright .uncheck()) because the checkbox is a controlled input backed by the async Dexie-meta write (the persisted selection is the source of truth)."

patterns-established:
  - "Field-scope panel + index both derive live from listFieldDefs('people') so add/rename/soft-delete re-derive with no reload; keyed by stable FieldDef.id (rename-safe, D-05)"
  - "fieldTextById retains the ORIGINAL per-field text (not the suffix-expanded index terms) as the single source of truth for plan 03's snippet"

requirements-completed: [SRCH-02]

# Metrics
duration: 20min
completed: 2026-08-05
status: complete
---

# Phase 5 Plan 02: Field-Scoped Search — Scope Panel + Custom-Field Indexing Summary

**A live field-scope checkbox panel (built-ins + every custom People field) that drives which fields a query matches — default-ON and subtractive, persisted by stable field id — plus custom-field indexing and infix matching so "smith" finds a person named Smith AND a blacksmith, and unchecking "Job" drops the blacksmith while the name match remains.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 (both executed)
- **Files:** 9 (4 created, 5 modified)

## Accomplishments

- **Persisted subtractive scope selection (Task 1, TDD):** a pure `resolveActiveFields(builtinKeys, customDefs, stored)` resolver (default-ON, records only un-checks, drops soft-deleted candidates, rename-stable via `FieldDef.id`) + a `useScopeSelection` hook that live-reads and transactionally writes the single local `searchFieldScope` Dexie meta row. 10 unit assertions including a real meta round-trip. No repository/serializer/SyncEngine involvement (B8).
- **Custom-field indexing (Task 2):** the index field set is now the five built-ins plus every non-deleted, non-photo custom People field keyed by `FieldDef.id`. Values are stringified per type (number/date → string, tags → joined, `link-to-entity` → the target entity's display name resolved like `CustomFieldRows.LinkValue`; photo excluded, quarantine keys inherently skipped). The build is async and returns `{ index, fieldTextById }`.
- **Infix matching (the signature behavior):** index-time suffix expansion via MiniSearch `processTerm` so a substring query like "smith" matches inside the token "blacksmith" (MiniSearch prefix only matches token starts). Search-time `processTerm` is left default so the query itself is never expanded.
- **ScopePanel + all-fields-off guard:** a native `<fieldset>` of native checkboxes (built-ins fixed, custom rows live from `listFieldDefs('people')`), ink-accent checked styling (B3), keyed by stable id (D-05). `SearchView` threads the active scope keys into the search call and renders a distinct all-fields-off guard ("Nothing to search") when every checkbox is off (D-11/B9).
- **E2E proves the full thread:** all fields ON → "smith" surfaces both Jane Smith and Alex Black (via his "blacksmith" Job); unchecking Job drops the blacksmith and keeps the name match; the choice persists across reload; unchecking every field shows the all-fields-off guard, not a zero-match.

## Task Commits

1. **Task 1: Persisted subtractive field-scope selection (D-04/D-05)** — `453970c` (feat, TDD: test + resolver + hook)
2. **Task 2: Scope panel + custom-field indexing + all-off guard (SRCH-02)** — `74c116a` (feat)

## Decisions Made

- **Infix/suffix indexing is required, not optional.** MiniSearch `prefix` matches only from a token's start and `fuzzy` is edit-distance bounded (~1 edit for a 5-char term), so neither matches "smith" inside "blacksmith". Confirmed against MiniSearch docs via Context7. Index-time `processTerm` emits each token plus its suffixes (down to the 2-char threshold); the search-time `processTerm` stays default so the query is not itself suffix-expanded (which would over-match). This makes the phase's signature substring behavior real and is exactly what plan 03's `job: black[smith]` highlight depends on.
- **Subtractive map keeps only un-checks.** Checking a field deletes its key (rather than storing `true`), so the resolver treats absent/`true` as ON — a newly-added field defaults ON and a soft-deleted field's stale `false` is ignored because it is no longer a live candidate.
- **Transactional toggle write.** `setFieldChecked` serializes its read-modify-write in a Dexie `rw` transaction so rapid concurrent un-checks compose over the latest persisted map instead of losing updates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added index-time infix (suffix) matching**
- **Found during:** Task 2 (writing the blacksmith e2e).
- **Issue:** The plan's signature behavior (must-have truth #3) requires "smith" to match the Job value "blacksmith", where "smith" is a *substring/suffix* of the token. MiniSearch's `prefix` matches only from a token's start and `fuzzy` is edit-distance bounded, so with the plan-01 config the blacksmith would never surface — the phase's headline feature would silently fail.
- **Fix:** Added an index-time `processTerm` (`indexTermWithSuffixes`) that indexes each normalized token plus its suffixes; left the search-time `processTerm` as the default so the query is not expanded. Verified against MiniSearch docs (Context7).
- **Files modified:** src/features/search/searchIndex.ts
- **Verification:** New unit assertion (custom-field match via Job) + the e2e blacksmith scenario both pass.
- **Committed in:** 74c116a

**2. [Rule 3 - Blocking] Updated the plan-01 searchIndex.test.ts to the new index contract**
- **Found during:** Task 2 (searchIndex signature change).
- **Issue:** `buildIndex` became async and returns `{ index, fieldTextById }` (per the plan), which broke the plan-01 test's synchronous `buildIndex([...])` calls. Separately, its field-restriction test used notes `"a blacksmith by trade"` and asserted "smith" does NOT match it — an assertion that only held under the old token-boundary semantics and is now legitimately false with infix matching.
- **Fix:** Awaited `buildIndex(...).index` throughout; changed the field-restriction fixture's notes to `"a metalworker by trade"` so the test still proves field restriction without depending on the absence of substring matching; added a custom-field indexing assertion.
- **Files modified:** tests/features/searchIndex.test.ts
- **Verification:** `npx vitest run tests/features/searchIndex.test.ts` — 7 assertions pass.
- **Committed in:** 74c116a

**3. [Rule 1 - Bug] Serialized the scope-toggle write against a concurrent-update race**
- **Found during:** Task 2 (all-fields-off e2e clicking six checkboxes in succession).
- **Issue:** `setFieldChecked` did a non-atomic read-modify-write of the meta map; rapid successive toggles could interleave and lose an un-check (last-write-wins over a stale base map).
- **Fix:** Wrapped the read-modify-write in a Dexie `rw` transaction so overlapping toggles serialize and each composes over the latest persisted map.
- **Files modified:** src/features/search/useScopeSelection.ts
- **Verification:** The all-fields-off e2e (six sequential un-checks) reaches the guard reliably; scope unit round-trip still passes.
- **Committed in:** 74c116a

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 blocking, 1 bug)
**Impact on plan:** All necessary for correctness and to make the signature behavior work; no scope creep. The infix change is the only design-level addition and stays entirely within the index service.

## Known Limitations / Risk Flags

- **Suffix indexing multiplies index term count** by roughly the average token length. For the typical "dozens to thousands" People DBs this is comfortable; a DB with very large free-text notes at the tens-of-thousands scale would see a heavier index. The roadmap's optional Web-Worker offload (deferred, B10) remains the escape hatch if profiling ever demands it. Plan 03's incremental index will also reduce rebuild cost.

## Known Stubs

None. `fieldTextById` is fully populated with each person's real per-field text and exported via `useSearchIndex().fieldText` — a wired, documented seam for plan 03's snippet, not a placeholder. The scope panel, index, and all-fields-off guard are all live end-to-end.

## Threat Flags

None. The scope selection is a local, un-synced Dexie-meta preference (T-05-NS accepted); field labels and the echoed query render as React children with no `dangerouslySetInnerHTML` in `src/features/search/` (T-05-01 mitigated); `link-to-entity` names resolve through the same read path the profile already uses (T-05-02 accepted). No new security surface beyond the plan's threat model.

## User Setup Required

None.

## Next Phase Readiness

- **Ready for 05-03** (matched-field snippet + incremental index): each `SearchHit` still retains `match`/`terms`; `useSearchIndex().fieldText(personId)` returns the exact per-field indexed text (built-ins + custom, keyed by field key) so the snippet can render `{label}: …{context}[term]{context}…` synchronously without re-querying. The current full async rebuild in `useSearchIndex` is the documented seam to replace with incremental add/replace/discard over `repository.onChange`.

## Self-Check: PASSED

- Files created verified present: useScopeSelection.ts, ScopePanel.tsx, tests/features/searchScope.test.ts, e2e/search-scope.spec.ts.
- Files modified verified: searchIndex.ts, useSearchIndex.ts, SearchView.tsx, SearchView.module.css, tests/features/searchIndex.test.ts.
- Commits verified in git log: 453970c (Task 1), 74c116a (Task 2).
- Gates: `npm run typecheck` clean; search feature + new test/e2e files lint-clean; `npx vitest run` (searchIndex + searchScope) 17 passed; `npx playwright test e2e/search-scope.spec.ts` 3 passed; `accent-color: var(--ink)` bound; no `dangerouslySetInnerHTML` / serializer / SyncEngine usage in `src/features/search/`.

---
*Phase: 05-field-scoped-search*
*Completed: 2026-08-05*

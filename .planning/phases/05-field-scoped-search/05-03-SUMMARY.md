---
phase: 05-field-scoped-search
plan: 03
subsystem: search
tags: [minisearch, react, dexie, fuzzy-search, field-scope, incremental-index, snippet, xss, typescript, vitest, playwright]

# Dependency graph
requires:
  - phase: 05-field-scoped-search
    plan: 01
    provides: MiniSearch index service + useSearchIndex hook, SearchView, SearchResultRow, 'search' view
  - phase: 05-field-scoped-search
    plan: 02
    provides: custom-field indexing + infix/suffix matching, fieldTextById projection, SearchHit match/terms metadata
provides:
  - Pure snippet helper (pickMatchedField + buildSnippet) — highest-boosted NON-name matched field, matched substring in a real <mark>, React children only (no HTML injection)
  - SearchResultRow matched-field snippet secondary line (name-only matches keep the BrowseRow fallback line, B6)
  - Incremental index maintenance — searchIndex.applyChange (add/replace/discard) driven by repository.onChange, replacing plan-01's rebuild-on-change
  - SearchHit.queryTerms — the matched query terms, preferred over document terms for the highlight (avoids fuzzy suffix artifacts)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure string→React-children highlight helper (never an HTML string; the <mark> is a genuine React element) — the T-05-01 XSS boundary as code"
    - "Incremental index: build ONCE on mount, then repository.onChange → applyChange add/replace/discard per person; a fieldDefs schema change is the ONLY coarse rebuild (the searchable field SET changed, not one row)"
    - "New bundle wrapper (same mutated MiniSearch index) on each incremental change so memoized search/fieldText identities bump and open result views re-query live"
    - "Deterministic matched-field pick: highest boost → built-in outranks neutral custom → canonical order → alphabetical"

key-files:
  created:
    - src/features/search/snippet.ts
    - tests/features/snippet.test.ts
    - tests/features/searchIncremental.test.ts
    - e2e/search-incremental.spec.ts
  modified:
    - src/features/search/searchIndex.ts
    - src/features/search/useSearchIndex.ts
    - src/features/search/SearchResultRow.tsx
    - src/features/search/SearchView.tsx
    - src/features/search/SearchView.module.css

key-decisions:
  - "Highlight the QUERY term the user typed (SearchHit.queryTerms) before the matched document terms. With suffix indexing, query 'smith' over 'blacksmith' also fuzzy-matches the suffix 'ksmith'; preferring the query term keeps the highlight on 'smith' — the earlier-position 'ksmith' would otherwise be highlighted."
  - "Incremental path reads the changed person FRESH from Dexie inside the onChange handler (all emits are post-commit), so it never depends on an async-lagging useLiveQuery snapshot — race-free per-row freshness."
  - "A fieldDefs change (add/rename/type-change/soft-delete) rebuilds the whole index because the searchable field SET changed; this is NOT the criterion-3 per-entity path and a coarse rebuild is correct. Driven by useLiveQuery(listFieldDefs('people')), which never re-runs on a people edit."
  - "pickMatchedField excludes the name field entirely (B6) and breaks equal-boost ties deterministically (built-in over neutral custom), so notes/description outrank a custom field on a tie per D-07."

patterns-established:
  - "buildSnippet takes a PRIORITY-ORDERED term list (query terms first, document terms as fallback) and highlights the first term found in the value"
  - "SearchResultRow renders the snippet only for a non-name match with non-empty field text; otherwise the plan-01 BrowseRow fallback line (tags, else updated Nd ago)"

requirements-completed: [SRCH-01]

# Metrics
duration: 35min
completed: 2026-08-05
status: complete
---

# Phase 5 Plan 03: Matched-Field Snippet + Incremental Index Summary

**The matched-field snippet — visible EVIDENCE that scoping works (`Job: black[smith]`, the term in a real `<mark>`) — plus incremental index freshness: the index now updates through the repository change signal (add/replace/discard) as people change, instead of rebuilding on every load, so new/edited/deleted people reflect live and search stays fast toward thousands.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 (both executed, TDD)
- **Files:** 9 (4 created, 5 modified)

## Accomplishments

- **Matched-field snippet (Task 1, D-09):** a pure `snippet.ts` with `pickMatchedField` (collects matched field keys, EXCLUDES the name field per B6, returns the highest-boosted remainder with a fully-deterministic tie-break) and `buildSnippet` (a `{label}: ` prefix + a ~30-char context window + the matched substring in a real `<mark>`, ellipsized only when truncated). `SearchResultRow` renders it on the secondary line for non-name matches and keeps the plan-01 BrowseRow fallback (tags, else `updated Nd ago`) for name-only matches. The `<mark>` is an amber-tint highlight (B1) — the only non-focus amber in the view.
- **Incremental index (Task 2, SRCH-01 criterion 3):** `searchIndex.applyChange` is a pure `create→add / update→replace / delete→discard` path (replace guarded by `index.has`, delete drops the `fieldTextById` entry, non-people events ignored). `useSearchIndex` now builds ONCE on mount and subscribes to `repository.onChange`, routing people writes through `applyChange` — no per-load or per-edit rebuild. A `fieldDefs` schema change remains the one coarse rebuild (the searchable field SET changed). Swapping in a fresh bundle wrapper around the same mutated index bumps the memoized `search`/`fieldText` identities so an open result view re-queries and reflects the change live.
- **XSS boundary held (T-05-01):** the snippet, field label, matched term, and entity name all render as React children; `grep -rn "dangerouslySetInnerHTML={" src/features/search/` returns nothing, and the unit test asserts the `<mark>` is a React element (`type === 'mark'`), not an HTML string.
- **Proofs:** `snippet.test.ts` (9 assertions: name-excluded / highest-boosted pick, deterministic tie-break, mark-wrapped substring, context window + ellipsis, query-term-over-fuzzy-suffix priority) and `searchIncremental.test.ts` (6 assertions: add/replace/discard/guard/ignore + the coarse field-set rebuild) — the full builder runs once at setup, every mutation is `applyChange` only. `e2e/search-incremental.spec.ts` proves a non-name match renders a `<mark>` snippet AND a person created via `window.__rb.createPerson` while Search is open appears with no reload.

## Task Commits

1. **Task 1: Matched-field snippet evidence (D-09)** — `326111b` (feat, TDD)
2. **Task 2: Incremental index freshness via the change signal (criterion 3)** — `96a6bca` (feat, TDD)

## Decisions Made

- **Highlight the query term, not the fuzzy suffix.** Task 2's e2e surfaced that with index-time suffix expansion, query `smith` over the `blacksmith` value ALSO fuzzy-matches the indexed suffix `ksmith` (edit distance 1), and `ksmith` sits at an earlier position in the value. Highlighting by earliest matched *document* term wrongly boxed `ksmith`. Fix: expose MiniSearch's `queryTerms` on `SearchHit` and have `buildSnippet` take a PRIORITY-ORDERED list — the query term the user typed first, the matched document terms as a fallback (for genuine fuzzy hits where the query substring is absent). The first term found in the value wins.
- **Read the changed row fresh from Dexie in the onChange handler.** All repository emits are post-commit, so `db.people.get(id)` inside the handler always sees the persisted row — the incremental path never depends on an async-lagging `useLiveQuery` snapshot, which would race a just-created person.
- **fieldDefs change ⇒ coarse rebuild; people change ⇒ per-row applyChange.** The `useLiveQuery(listFieldDefs('people'))` dependency re-runs only on a field-def write (never on a people edit), so it cleanly separates "the searchable field SET changed" (rebuild) from "one row changed" (criterion-3 incremental).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired `SearchView.tsx` + `SearchView.module.css` to render the snippet**
- **Found during:** Task 1.
- **Issue:** The plan's `files_modified` and Task 1 `<files>` list `SearchResultRow.tsx` but not `SearchView.tsx` / `SearchView.module.css`. The row cannot render the snippet on its own — it needs the hit's `match`/`terms`/`queryTerms`, the person's per-field text, and the field labels, all of which only the parent (`SearchView`) holds. It also needs the `.snippet` + `<mark>` styling.
- **Fix:** `SearchView` now keeps each hit alongside its person, builds a `fieldKey → label` map (built-ins + live custom defs), reads `fieldText` from `useSearchIndex`, and threads them to `SearchResultRow`. Added `.snippet` + `.snippet mark` (amber-tint B1) to `SearchView.module.css` (imported into the row).
- **Files modified:** src/features/search/SearchView.tsx, src/features/search/SearchView.module.css
- **Verification:** typecheck + lint clean; the snippet renders in the e2e (`search-snippet` with a `<mark>`).
- **Committed in:** 326111b (Task 1) and 96a6bca (Task 2, queryTerms threading).

**2. [Rule 1 - Bug] Fuzzy suffix artifact was highlighted instead of the query term**
- **Found during:** Task 2 (writing the snippet `<mark>` e2e).
- **Issue:** Query `smith` over the `blacksmith` Job value fuzzy-matched the indexed suffix `ksmith` (dist 1), which sits at an earlier position than `smith`, so the highlight boxed `ksmith` — the e2e saw `<mark>ksmith</mark>` where `smith` was expected. A user-facing wrong-evidence bug.
- **Fix:** Added `queryTerms` to `SearchHit` (from MiniSearch's `SearchResult.queryTerms`) and made `buildSnippet` prefer them (query term first, document terms as fallback) via first-found selection. Locked in with a unit assertion (`['smith','ksmith']` → highlights `smith`).
- **Files modified:** src/features/search/searchIndex.ts, src/features/search/snippet.ts, src/features/search/SearchResultRow.tsx, src/features/search/SearchView.tsx, tests/features/snippet.test.ts
- **Verification:** the snippet e2e now asserts `<mark>` text is exactly `smith`; all unit tests pass.
- **Committed in:** 96a6bca

---

**Total deviations:** 2 auto-fixed (1 blocking wiring, 1 bug). No architectural changes, no scope creep. The `SearchView` wiring is the minimum necessary to render the snippet the plan specifies; the query-term fix corrects a highlight bug the plan's own e2e requirement exposed.

## Known Limitations / Risk Flags

- **Concurrent incremental changes** are applied optimistically (each `onChange` mutates the shared MiniSearch index; per-row builds may interleave for rapid same-id edits). Under the single-curator model (LWW, T-05-03 accept) this only affects transient ordering, never Dexie correctness, and the index is fully rebuildable on reload. A missed event degrades to a stale local projection, never a corrupt store.
- **Suffix-index fuzz breadth:** because suffixes are indexed, a query can fuzzy-match several suffix terms; the snippet's query-term-first rule keeps the *highlight* correct, and ranking is unchanged from plan 02.

## Known Stubs

None. The snippet renders real matched-field text from `fieldTextById`, and the incremental path is wired end-to-end (change signal → `applyChange` → live re-query), proven by unit + e2e tests.

## Threat Flags

None beyond the plan's threat model. T-05-01 (XSS) is MITIGATED: the `<mark>` and every fragment are React elements/children; no `dangerouslySetInnerHTML` in `src/features/search/` (grep-clean) and the unit test asserts the mark is a React element, not HTML. T-05-03 (incremental index vs. source of truth) is ACCEPTED: all `onChange` emits are post-commit, so the index only ever reflects persisted state.

## User Setup Required

None.

## Next Phase Readiness

Phase 05 (Field-Scoped Search) is complete: SRCH-01 (spine + incremental freshness) and SRCH-02 (field-scope panel + custom-field indexing) are delivered. The signature "smith vs blacksmith" scoping is trustworthy (visible snippet evidence) and stays live at scale (incremental index).

## Self-Check: PASSED

- Files created verified present: src/features/search/snippet.ts, tests/features/snippet.test.ts, tests/features/searchIncremental.test.ts, e2e/search-incremental.spec.ts.
- Files modified verified: searchIndex.ts, useSearchIndex.ts, SearchResultRow.tsx, SearchView.tsx, SearchView.module.css.
- Commits verified in git log: 326111b (Task 1), 96a6bca (Task 2).
- Gates: `npm run typecheck` clean; search feature + new tests lint-clean (16 whole-repo errors are pre-existing, out-of-scope, logged by 05-01); `npx vitest run` snippet (9) + incremental (6) + searchIndex (7) + searchScope (9) = 31 passed; `npx playwright test` search-incremental (2) + search (2) + search-scope (3) = 7 passed; `grep -rn "dangerouslySetInnerHTML={" src/features/search/` → no matches.

---
*Phase: 05-field-scoped-search*
*Completed: 2026-08-05*

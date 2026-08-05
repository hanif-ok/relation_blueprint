---
phase: 05-field-scoped-search
fixed_at: 2026-08-05T18:09:00Z
review_path: .planning/phases/05-field-scoped-search/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-08-05T18:09:00Z
**Source review:** .planning/phases/05-field-scoped-search/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — `fix_scope: critical_warning`)
- Fixed: 3
- Skipped: 0

The two Info findings (IN-01 result-count pluralization, IN-02 snippet constant
duplication) were out of scope for this run and were not touched.

Verification per fix: TypeScript (`tsc --noEmit`) passed clean for every change,
ESLint passed on the modified hook, and the four targeted search unit suites
(`searchIndex`, `searchScope`, `searchIncremental`, `snippet` — 32 tests) all
pass after the fixes.

## Fixed Issues

### WR-01: Photo custom fields render a scope checkbox that does nothing and breaks the all-fields-off guard

**Files modified:** `src/features/search/searchIndex.ts`, `src/features/search/ScopePanel.tsx`, `src/features/search/useScopeSelection.ts`
**Commit:** 7e5130a
**Applied fix:** Introduced a single exported predicate `isIndexableDef(def)` in
`searchIndex.ts` (`!def.deleted && def.type !== 'photo'`) as the one source of
truth for "is this custom field in the index?". Replaced the two inline
`filter((def) => !def.deleted && def.type !== 'photo')` sites in `buildIndex`
and `applyChange` with it, and applied the same predicate at the two candidate
sources that previously disagreed with the index: `ScopePanel` now filters its
`listFieldDefs('people')` result through `isIndexableDef` (so a photo field no
longer gets a dead checkbox), and `resolveActiveFields` in `useScopeSelection`
now filters candidates through `isIndexableDef` (so a checked photo field can no
longer keep `activeFields` non-empty and defeat the all-fields-off "Nothing to
search" guard, D-11/B9). This closes the drift the reviewer flagged: the scope
panel, the resolver, and the index now agree on the field set.

### WR-03: Concurrent `applyChange` calls are not atomic across their internal await and can leave stale index state

**Files modified:** `src/features/search/useSearchIndex.ts`
**Commit:** ef6570e
**Status:** fixed: requires human verification (concurrency/ordering fix — logic
cannot be confirmed by syntax checks alone)
**Applied fix:** Added a serial promise queue (`maintenanceQueueRef`) to
`useSearchIndex`. Extracted the per-event work into a stable `handleEvent`
callback (reads the *latest* `bundleRef.current` at execution time, so a prior
queued step's bundle swap is observed) and an `enqueueMaintenance` callback that
chains each event via `maintenanceQueueRef.current = maintenanceQueueRef.current
.then(() => handleEvent(ev)).catch(...)`. Because every emit is now appended to
one promise chain, two rapid updates to the same person apply strictly in emit
order — their variable-latency `projectFieldText` reads can no longer interleave
and leave the index holding the older field text. The `.catch` keeps the queue
alive if a single step throws (a rejected link would otherwise poison the chain
and drop every later event). This mirrors the deliberate rw-transaction
serialization already used by `useScopeSelection.setFieldChecked`.

### WR-02: A person created during the initial async index build is silently dropped from the index

**Files modified:** `src/features/search/useSearchIndex.ts`
**Commit:** 264b905
**Status:** fixed: requires human verification (race-window fix — timing
behavior cannot be confirmed by syntax checks alone)
**Applied fix:** Added an event buffer (`pendingEventsRef`). The `onChange`
subscription no longer drops events that arrive while `bundleRef.current` is
`null` (the build window between the `toArray()` snapshot and bundle
assignment); it now pushes them onto `pendingEventsRef` instead. When the build
resolves, immediately after setting `bundleRef.current`/`setBundle` — and only
on the non-cancelled path — it drains the buffer in emit order through the same
`enqueueMaintenance` serial queue from WR-03. The drain runs synchronously right
after `bundleRef` is set, so no new emit can interleave (later emits see a
non-null `bundleRef` and enqueue directly). Replaying a buffered event is
idempotent against the fresh snapshot: `applyChange`'s `index.has` guard turns
an already-present create into a `replace` and an already-absent delete into a
no-op. A row written during the build window is therefore searchable
immediately, without waiting for an unrelated coarse rebuild. Reusing the WR-03
queue for the drain also closes the ordering exposure the reviewer noted.

## Notes

- WR-02 and WR-03 both touch `useSearchIndex.ts` and were committed separately
  (WR-03 first — the serial queue — then WR-02 building the buffer/replay on top
  of it). The build effect gained `enqueueMaintenance` in its dependency array;
  that callback is stable (empty-dep chain), so it never re-triggers a rebuild.
- The existing e2e "created while Search is open" test only exercises the
  post-build path (as the review noted); the new build-window buffering in WR-02
  is not yet covered by an automated test. Consider adding a test that commits a
  `people.create` during the async build window before relying on this in
  production.

---

_Fixed: 2026-08-05T18:09:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

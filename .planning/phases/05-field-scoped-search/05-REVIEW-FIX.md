---
phase: 05-field-scoped-search
fixed_at: 2026-08-05T16:10:00Z
review_path: .planning/phases/05-field-scoped-search/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 2
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-08-05T16:10:00Z
**Source review:** .planning/phases/05-field-scoped-search/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical_warning): 3 (CR-01, WR-01, WR-02)
- Fixed: 3
- Skipped: 2 (IN-01, IN-02 — Info tier, out of scope)

All three in-scope findings live in the search slice's index/render coordination. CR-01 and WR-01
share a root cause (the coarse rebuild path was uncoordinated with the incremental maintenance
queue); both were addressed and the WR-01 fix hardens the root at the same time. Type check
(`tsc --noEmit`) passed after every fix.

## Fixed Issues

### CR-01: In-flight incremental `handleEvent` clobbers a completed coarse rebuild

**Files modified:** `src/features/search/useSearchIndex.ts`
**Commit:** 0972e5f
**Status:** fixed: requires human verification (concurrency/race fix — not verifiable by syntax/type check)
**Applied fix:** Added a staleness guard in `handleEvent`: after the `await applyChange`, it compares
`bundleRef.current !== current`. If a rebuild swapped the bundle mid-await, it no longer publishes
the stale wrapper over the fresh bundle — it re-enqueues the event so it re-applies to the new index.

**Adaptation note:** The review's literal suggestion added `enqueueMaintenance` to `handleEvent`'s
dependency array. That would create a circular `useCallback` dependency (handleEvent →
enqueueMaintenance → handleEvent) and, given declaration order, a temporal-dead-zone reference
error. Instead I introduced a late-bound `enqueueMaintenanceRef` (filled in an effect) that
`handleEvent` reads only at call time, keeping `handleEvent`'s deps `[]` and avoiding the cycle.
Same behavior, no lint/runtime hazard.

### WR-01: People writes during a coarse REBUILD window applied to the discarded index and lost

**Files modified:** `src/features/search/useSearchIndex.ts`
**Commit:** 923efb5
**Status:** fixed: requires human verification (concurrency serialization change — not verifiable by syntax/type check)
**Applied fix:** Took the review's "robust alternative" — the coarse rebuild now runs THROUGH
`maintenanceQueueRef`. The `db.people.toArray()` snapshot, `buildIndex`, and the bundle swap execute
as one atomic step ordered against every incremental apply, so a build and an apply can never
interleave. A people write racing a rebuild is serialized around it: enqueued before → applies to
the old index but the rebuild's fresh snapshot re-captures that row anyway (idempotent); enqueued
after → applies to the freshly-swapped bundle. No create is dropped in the rebuild window. Added a
`.catch` so a failed build keeps the queue alive, and preserved the null-bundle initial-build buffer
drain. This also closes CR-01 at the root (the CR-01 guard from the prior commit remains as a
harmless safety net).

### WR-02: Windowed results list renders blank when a query is narrowed while scrolled

**Files modified:** `src/features/search/SearchView.tsx`
**Commit:** 00a6a76
**Applied fix:** Clamped the window start in the windowing memo to
`Math.max(0, Math.min(floor(scrollTop/ROW_HEIGHT) - OVERSCAN, count - visible))`. When the result
set shrinks (query narrowed while scrolled down), `first` can no longer point past the end, so the
list never paints a tall blank spacer with zero rows. `count - visible` goes negative when
everything fits, which `max(0, …)` floors back to the top. Chose the clamp (self-contained,
guarantees correctness regardless of scroll state) over the scroll-reset-effect alternative.

## Skipped Issues

### IN-01: Redundant `photo` guard in `projectFieldText` (dead defensive branch)

**File:** `src/features/search/searchIndex.ts:199-202`
**Reason:** skipped: out of scope (Info tier; fix_scope is critical_warning)
**Original issue:** `projectFieldText`'s inner `if (def.type === 'photo') continue;` is unreachable
because every caller pre-filters with `isIndexableDef`, which already excludes photo defs.

### IN-02: Search rows depend on two independently-updating live sources

**File:** `src/features/search/SearchView.tsx:53-58, 79-87`
**Reason:** skipped: out of scope (Info tier; fix_scope is critical_warning)
**Original issue:** `results` filters index hits through a separate `peopleById` live query; the two
refresh on independent async schedules, so a valid row can transiently vanish/appear. The review
itself classifies this as acceptable eventual-consistency.

---

_Fixed: 2026-08-05T16:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

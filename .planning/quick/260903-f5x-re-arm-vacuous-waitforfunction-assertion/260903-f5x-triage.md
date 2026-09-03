# Triage — quick-260903-f5x: re-arming the vacuous `waitForFunction` assertions

## Verdict

**12 assertions re-armed across 6 specs.** All 12 were no-ops that passed unconditionally; the
classifier and `npm run lint` now both report zero async `waitForFunction` predicates in `e2e/`.

**How much of the suite was passing on nothing?** Of **69 tests**, **12 assertions across 12
distinct tests** were vacuous — but the honest measure is how many were *hiding a falsehood*, and
that is **2 of 69 (2.9%)**:

| | Count | Of 69 |
|---|---|---|
| Tests carrying a vacuous assertion | 12 | 17.4% |
| …of those, tests that were **green only because** the assertion was disarmed | **2** | **2.9%** |
| …of those, tests whose underlying behaviour was genuinely correct all along | 10 | 14.5% |

So the suite was **not** broadly fraudulent: 10 of the 12 vacuous assertions were asserting things
that were in fact true. But 2 were load-bearing lies, and both had been invisible for as long as the
wait stayed vacuous — one masking a **test bug** and one masking a **product defect**:

1. `canvas-pan-marquee.spec.ts:241` — bucket 1. The bulk-delete marquee test deleted **nothing**
   (survivors `["shape-a","shape-b"]`) because it never confirmed the blocking ConfirmDialog. It had
   claimed "Delete removes every hit shape" while removing none. **Fixed here (D77-DEF-2).**
2. `graph.spec.ts:324` — bucket 2. The fresh `cose` layout never persists a `graphPositions` row at
   all. **Logged, not fixed (F5X-DEF-1).**

**Status changes, baseline → final:** 3 tests, of which only **1 is a real change**; the other 2 are
the known coin-flip flake, confirmed 3/3 passing under `--repeat-each=3`.

**Buckets:** bucket 1 = **1** (fixed) · bucket 2 = **1** (logged, not fixed) · bucket 3 = **2**
status-changing flakes, plus 6 pre-existing failures recorded so they can never be mistaken for
regressions.

**Net suite effect:** baseline 62 pass / 7 fail → final 61 pass / 8 fail. The single extra red is
`graph.spec.ts:324`, which is now *legitimately* red: it reports F5X-DEF-1 instead of hiding it.
No test was made green by weakening it.


## WHY this task exists

`page.waitForFunction(async (…) => …)` **does not await** the promise its predicate returns.
Playwright truthiness-tests the returned value, and a `Promise` is **always truthy**, so the wait
resolves on its very first poll no matter what the predicate would have evaluated to. Every such
call site is a no-op that always passes.

This is **proven, not theorised** (D77-DEF-1, `.planning/quick/260903-d77-fix-marquee-hit-test-to-convert-the-band/260903-d77-deferred-items.md`):
during quick-260903-d77, with the marquee coordinate conversion deliberately bypassed, a
`page.evaluate` read showed the band had caught only **one** of two rects (survivors `["shape-a"]`),
while the sibling `waitForFunction(async … => m.shapes.length === 0)` over that exact same state
still went **green**.

The census was re-run against the working tree with an AST-shaped classifier (take the predicate
from the same line or the next; test whether it begins with `async`) rather than a line grep:

- **133** `waitForFunction` call sites across 29 specs.
- **121** are non-async and return a plain boolean — these are **correct** and were left untouched.
- **12** are async-predicate and therefore vacuous, across **6** specs.

This supersedes the earlier "~28 across 11 specs" figure in the 260903-d77 deferred-items file,
which counted every `waitForFunction` occurrence per file rather than async-predicate ones.

## Bucket definitions (verbatim from the task's locked scope boundary)

- **Bucket 1 — test-side bug.** The test asserts wrongly, or omits a step the product legitimately
  requires (e.g. clicking a blocking ConfirmDialog). → **FIX IT here.**
- **Bucket 2 — genuine product defect.** The app is actually wrong. → **DO NOT FIX.** Log to
  `260903-f5x-deferred-items.md` with spec+line, what the re-armed assertion expects, what actually
  happens, and the smallest repro. Each earns its own follow-up task. Fixing product bugs inside a
  test-integrity sweep would make this task unbounded and its commits non-atomic.
- **Bucket 3 — already-known pre-existing failure.** → Leave alone, record the bucket only.

## Run totals

| Run | When | Total | Pass | Fail | Flaky | Skip |
|-----|------|-------|------|------|-------|------|
| #1 baseline (pre-re-arm) | before any edit | 69 | 62 | 7 | 0 | 0 |
| #2 post-re-arm | after all 12 re-armed | 69 | 61 | 8 | 0 | 0 |
| #3 final | after bucket-1 fixes | 69 | 61 | 8 | 0 | 0 |

Artifacts on disk: `test-results/f5x/{baseline,run2,final}.{json,txt}`.

The bucket-1 fix landed in Task 1 (before run #2), so runs #2 and #3 agree — #3 confirms nothing
regressed and that the remaining reds are stable rather than flaky. The four specs carrying no known
pre-existing failure — `canvas-pan-marquee`, `draw-shapes`, `graph-multi-select`,
`marquee-multi-edit` — are **fully green in the final run**.

> Note on the `.txt` artifacts: Playwright wipes its `outputDir` (`test-results/`) at the *start* of
> every run, which destroys any line-reporter file being written into it. Each `.txt` is therefore
> rendered from that same run's JSON reporter output (written at the *end* of the run), so it is a
> faithful record of that completed run rather than a re-run.

## Baseline failures (all 7, recorded before any edit)

These were red **before** a single assertion was re-armed, so none of them can be a regression
caused by this task.

| Spec:line | Test | Bucket | Note |
|-----------|------|--------|------|
| `delete-vs-remove.spec.ts:85` | "Remove from map" removes the marker but the person stays in the database | **3** | Known pre-existing: the empty-`layers` render bug. Owned by `260902-nfs-deferred-items.md` §2. Not root-caused here. |
| `marker.spec.ts:63` | a placed person renders a round avatar marker on the Stage | **3** | Known pre-existing: the empty-`layers` render bug. Owned by `260902-nfs-deferred-items.md` §2. |
| `marker.spec.ts:90` | dragging the marker persists its new position after reload | **3** | Known pre-existing: the empty-`layers` render bug. Owned by `260902-nfs-deferred-items.md` §2. |
| `transform-marker.spec.ts:65` | resizing + rotating a marker persists width/height/rotation across reload | **3** | Known pre-existing: the empty-`layers` render bug. Owned by `260902-nfs-deferred-items.md` §2. |
| `place-person.spec.ts:135` | place a person on two maps, see both in "Appears on", jump, and edit propagates | **3** | Known pre-existing: nondeterministic active-map seeding (`db.maps.toArray()[0]` is Dexie primary-KEY order over random nanoids). Owned by `260902-nfs-deferred-items.md` §1. Observed: map-switcher showed "Bravo", expected "Alpha". |
| `browse-and-create.spec.ts:139` | the sort toggle reorders the list (Name A–Z ⇄ Recently updated) | **3** | Pre-existing, and **not** one of the six the plan pre-listed. Spec contains no vacuous site, so this task does not touch it. Baseline failure: 30s test timeout. |
| `pwa-install.spec.ts:19` | serves a web manifest scoped to the GitHub Pages subpath | **3** | Pre-existing, and **not** one of the six the plan pre-listed. The test still asserts the old GitHub Pages base `"/relation_blueprint/"`, but the deploy moved to the Cloudflare Pages domain root `"/"` (quick-260820-idf). Stale test. A *different* test from the vacuous site at `pwa-install.spec.ts:49`. |

Also recorded, though it **passed** on the baseline:

| Spec:line | Test | Bucket | Note |
|-----------|------|--------|------|
| `portal.spec.ts:182` | single-click a portal SELECTS it | **3** | Known pre-existing **flake** (measured ~38-50% failure), same root cause as `place-person.spec.ts:135`. Passed on the baseline. Recorded so a future red here is not mistaken for a regression. Owned by `260902-nfs-deferred-items.md` §1. |

## Triage table — tests whose status CHANGED once the assertions actually ran

| Spec:line | Test | Baseline | Post-re-arm | repeat-each x3 | Bucket | Verdict |
|-----------|------|----------|-------------|----------------|--------|---------|
| `canvas-pan-marquee.spec.ts:241` (site #1) | a Select-tool left drag on empty canvas marquee-selects, and Delete removes every hit shape | PASS (vacuously) | **FAIL** | 3/3 pass after fix | **1** | Test omitted a step the product legitimately requires. A 2+ selection routes through `requestDelete`'s **blocking** ConfirmDialog (T-NFS-01, quick-260902-nfs); nothing is written until the curator clicks **Delete** in it, and this test never clicked it. Observed RED with survivors `["shape-a","shape-b"]` — i.e. **nothing was deleted at all**, and only the vacuous wait had kept it green. Fixed here by confirming the dialog (D77-DEF-2). GREEN after. |
| `graph.spec.ts:324` (site #7) | ego focus is transient: exit restores the base and never overwrites graphPositions | PASS (vacuously) | **FAIL** | **3/3 fail** — deterministic, not flaky | **2** | **Genuine product defect — logged, NOT fixed (F5X-DEF-1).** The re-armed pre-focus barrier expects the initial `cose` to have persisted a `graphPositions` row, which is the documented design (`positionCache.ts:4`; the `layoutstop` handler at `GraphView.tsx:520-532`). Probed directly: the row is **entirely absent** (`DEBUG:null`), still null after a **30 s** wait — so not a slow-settle race. The ORIGINAL intent (`row?.value !== undefined`) fails identically, so this is not an artifact of the Form A conversion. The sibling `dragfree` save path works (site #5 passes), so the defect is specific to the `layoutstop` save on a fresh graph. This test is now *legitimately* red. |
| `portal.spec.ts:182` | single-click a portal SELECTS it (handles appear) and does NOT navigate (D-07) | PASS | **FAIL** in run #2, PASS in run #3 | **3/3 pass** → FLAKE | **3** | **Not a status change.** The known ~38-50% coin flip from nondeterministic active-map seeding, owned by `260902-nfs-deferred-items.md` §1. Sits in a spec this task does not edit and contains no vacuous site, so it cannot have been caused by the re-arming. |
| `place-person.spec.ts:135` | place a person on two maps, see both in "Appears on", jump, and edit propagates | FAIL | **PASS** in run #2, FAIL in run #3 | **3/3 pass** → FLAKE | **3** | **Not a status change.** Same root cause and same owner as `portal.spec.ts:182` — the coin landed differently across runs. Not caused by the re-arming. |

## The other 10 re-armed sites — re-armed and still green

These asserted things that were in fact true; the vacuous wait had simply never checked. Each now
polls a real value at its original timeout, so a future regression in any of them will be caught:

| Site | Spec:line | Test |
|------|-----------|------|
| #2 | `canvas-pan-marquee.spec.ts:267` | committing a rect draw re-arms the Select tool |
| #3 | `draw-shapes.spec.ts:108` | drawing a rectangle with the Rect tool persists a shape on the map |
| #4 | `draw-shapes.spec.ts:176` | picking a preset in the style popover persists it |
| #5 | `graph-multi-select.spec.ts:212` | dragging one node of a multi-selection moves them all (Form B, ±12 preserved) |
| #6 | `graph.spec.ts:214` | Reset layout clears the saved manual positions |
| #8 | `marquee-multi-edit.spec.ts:146` | a band over 2 shapes + 1 person marker deletes all three, and the person survives |
| #9 | `marquee-multi-edit.spec.ts:257` | a group drag moves every banded object by the same delta (Form B, ±2 preserved) |
| #10 | `marquee-multi-edit.spec.ts:355` | the bar re-layers a banded shape AND portal at once |
| #11 | `marquee-multi-edit.spec.ts:415` | a locked-layer object is never moved or deleted by a group action |
| #12 | `pwa-install.spec.ts:49` | registers a service worker and precaches the shell for offline open |

(Ten rows — sites #1 and #7 are the two that were hiding a falsehood and are triaged above.)

## Bucket tally

- **Bucket 1 (test-side bug, FIXED here): 1** — `canvas-pan-marquee.spec.ts:241` (D77-DEF-2).
- **Bucket 2 (genuine product defect, LOGGED not fixed): 1** — `graph.spec.ts:324` (F5X-DEF-1),
  written up in `260903-f5x-deferred-items.md`.
- **Bucket 3 (known pre-existing / flake, left alone): 8** — the two status-changing coin flips
  (`portal.spec.ts:182`, `place-person.spec.ts:135`) plus the six baseline failures recorded above.

**No bucket-2 defect was fixed.** Nothing under `src/` was changed — verified with
`git diff` against the task's base commit, which reports `src/` byte-identical.

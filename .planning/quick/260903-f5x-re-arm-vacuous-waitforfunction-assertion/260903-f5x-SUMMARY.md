---
phase: quick-260903-f5x
plan: 01
subsystem: e2e-test-integrity
tags: [playwright, e2e, test-integrity, eslint, assertions]
status: complete
requires:
  - quick-260903-d77 (D77-DEF-1 proof, D77-DEF-2 diagnosis, the canonical expect.poll form)
  - quick-260902-nfs (T-NFS-01 blocking ConfirmDialog; the bucket-3 pre-existing failures)
provides:
  - "12 re-armed e2e assertions that actually observe the state they claim to assert"
  - "rb-e2e/no-async-wait-predicate ESLint rule guarding e2e/**/*.ts"
  - "F5X-DEF-1: a genuine product defect surfaced and documented"
affects:
  - e2e/ (6 specs)
  - eslint.config.js
tech-stack:
  added: []
  patterns:
    - "expect.poll(() => page.evaluate(async …), { timeout }) as the Dexie/SW read barrier"
    - "expect(async () => {…}).toPass({ timeout }) where the assertion carries a numeric tolerance"
    - "inline flat-config ESLint plugin (no new dependency)"
key-files:
  created:
    - .planning/quick/260903-f5x-re-arm-vacuous-waitforfunction-assertion/260903-f5x-triage.md
    - .planning/quick/260903-f5x-re-arm-vacuous-waitforfunction-assertion/260903-f5x-deferred-items.md
  modified:
    - e2e/canvas-pan-marquee.spec.ts
    - e2e/draw-shapes.spec.ts
    - e2e/graph.spec.ts
    - e2e/graph-multi-select.spec.ts
    - e2e/marquee-multi-edit.spec.ts
    - e2e/pwa-install.spec.ts
    - eslint.config.js
decisions:
  - "Bucket-2 product defects are logged, never fixed, inside a test-integrity sweep (user-locked scope)"
  - "Form B (toPass) for tolerance-bearing predicates — toEqual would silently TIGHTEN the assertion into a rewrite"
  - "The guard is an AST ESLint rule, not a grep: the predicate sits on the line AFTER the call opens, which is what made the original census miscount"
metrics:
  duration_minutes: 55
  completed: 2026-09-03
actuals:
  tokens: 41000
  tasks: 3
  commits: 3
---

# Quick Task 260903-f5x: Re-arm vacuous `waitForFunction` assertions — Summary

Re-armed all 12 vacuous `page.waitForFunction(async …)` assertions across 6 e2e specs, measured the
fallout against a true pre-edit baseline, and found that **2 of the suite's 69 tests (2.9%) were
green only because their assertion was disarmed** — one hiding a test bug (fixed), one hiding a
product defect (logged, not fixed).

## The verdict

**Assertions re-armed:** 12, across 6 specs, in 12 distinct tests. Each preserves its original
condition and original timeout verbatim (15 000 everywhere except `pwa-install` at 30 000). The
classifier and `npm run lint` both now report **zero** async `waitForFunction` predicates in `e2e/`.

**How much of the suite was passing on nothing:**

| | Count | Of 69 tests |
|---|---|---|
| Tests carrying a vacuous assertion | 12 | 17.4% |
| …**green only because** the assertion was disarmed | **2** | **2.9%** |
| …asserting something that was in fact true all along | 10 | 14.5% |

The suite was **not** broadly fraudulent — 10 of the 12 vacuous waits were asserting true things.
But 2 were load-bearing lies, and both had been invisible for exactly as long as the wait stayed
vacuous.

**Tests that changed status (baseline → final):** 3 observed, of which only **1 is real**. The other
two are the known nondeterministic active-map coin flip, each confirmed **3/3 passing** under
`--repeat-each=3` and therefore recorded as flake, not change.

**Bucket-2 count: 1** — `graph.spec.ts:324` / F5X-DEF-1. Logged, **not fixed**.

**Net suite effect:** baseline 62 pass / 7 fail → final 61 pass / 8 fail. The one extra red is
`graph.spec.ts:324`, now *legitimately* red: it reports F5X-DEF-1 rather than hiding it. **No test
was made green by weakening it.**

## The two that mattered

**Bucket 1 — `canvas-pan-marquee.spec.ts:241` (fixed here, D77-DEF-2).** The test named "…and Delete
removes every hit shape" was removing **none**. Re-armed, it failed with survivors
`["shape-a","shape-b"]` — the band selected both rects correctly, but a 2+ selection routes through
`requestDelete`'s blocking ConfirmDialog (T-NFS-01), which the test never confirmed, so nothing was
ever written. Fixed by confirming the dialog, exactly as the two newer tests in the same file do.
Observed RED before the fix and GREEN after (3/3 under `--repeat-each=3`).

**Bucket 2 — `graph.spec.ts:324` (logged, NOT fixed, F5X-DEF-1).** The initial `cose` layout never
persists a `graphPositions` row. Probed directly: the meta row is **entirely absent** (`DEBUG:null`)
and still absent after a **30 s** wait, so it is not a slow-settle race. This contradicts the
documented design in two places in the source (`positionCache.ts:4`; the `layoutstop` handler at
`GraphView.tsx:520-532`) and defeats the D-13 `preset` fast-path for any graph never hand-arranged.
The sibling `dragfree` save path works (site #5 passes), isolating the defect to the `layoutstop`
save. Critically, the **original** predicate (`row?.value !== undefined`) fails identically — so
this is a real finding, not an artifact of the Form A conversion.

## Run evidence

Three full Playwright runs, each to completion, on disk at `test-results/f5x/`:

| Run | When | Pass | Fail |
|-----|------|------|------|
| baseline | before any edit | 62 | 7 |
| run2 | after all 12 re-armed | 61 | 8 |
| final | confirmation | 61 | 8 |

The four specs carrying no known pre-existing failure — `canvas-pan-marquee`, `draw-shapes`,
`graph-multi-select`, `marquee-multi-edit` — are **fully green in the final run**. Every failing
test in `final.txt` carries exactly one bucket verdict in the triage file (verified
programmatically: `UNTRIAGED=0`).

## The regression guard — observed to fire

`rb-e2e/no-async-wait-predicate`, an inline flat-config ESLint plugin in `eslint.config.js` (no new
dependency — ESLint 10 accepts a plugin object declared in the config file), registered at `error`
over `e2e/**/*.ts`. It reports a `waitForFunction` whose first argument is an `async` arrow/function
expression, and deliberately does **not** report non-async predicates returning plain booleans (121
of the suite's 133 call sites).

**Proven, not assumed:** reintroducing the vacuous form at `draw-shapes.spec.ts:109` made
`npx eslint e2e/` exit **1** with the intended message naming both replacement forms; reverting it
returned exit **0**. An AST rule rather than a grep because the predicate sits on the line *after*
the call opens — precisely what made the original census miscount ("~28 across 11 specs" vs the true
12 across 6).

## Deviations from plan

**1. [Rule 3 — blocking] `npm ci` in the worktree.** The executor worktree had no `node_modules`
(known project gotcha: a worktree gets `package.json`/lockfile but not installed deps). Ran
`npm ci`, which installs only the existing pinned lockfile versions — **no new dependency, no
`package.json` change**; `git status` confirmed the lockfile untouched afterwards.

**2. [Rule 3 — blocking] Run artifacts had to be written outside `test-results/`.** Playwright wipes
its `outputDir` (`test-results/`) at the *start* of every run, which destroyed the first baseline's
line-reporter file mid-write and then the JSON too on the next targeted run. Recovered by
re-measuring the baseline against the pre-edit spec (restored via `git checkout <base> -- <file>`,
never `git stash` — the stash stack is shared across worktrees) and writing all run output to a
durable scratch location, copying it into `test-results/f5x/` only after the last Playwright run.
The re-measured baseline reproduced the first **exactly** (62/7, identical failing set), so the
baseline is trustworthy. The `.txt` artifacts are rendered from each run's own JSON reporter output
(written at the end of the run) and are faithful records of those runs, not re-runs.

**3. Plan criterion "`npm run lint` exits 0" could not be met, and was not forced.** Lint reports 16
errors + 11 warnings, **every one in `src/` files this task never touched** — `git diff` against the
base commit shows `src/` byte-identical, so all of it is pre-existing debt (the same class recorded
as item 3 of the 260902-nfs deferred items). Clearing it would require editing application source,
which the locked scope forbids. `npx eslint e2e/` — the scope this task owns, and where the new
guard runs — exits **0**, and `npm run typecheck` exits **0**. Logged in the deferred-items file.

**4. Two pre-existing failures beyond the plan's documented six.** `browse-and-create.spec.ts:139`
(profile sidebar intercepts the `sort-recent` click; 30 s timeout) and `pwa-install.spec.ts:19`
(still asserts the old GitHub Pages base `/relation_blueprint/` after the Cloudflare move in
quick-260820-idf). Both were already red on the baseline and sit in specs containing no vacuous
site. Recorded as bucket 3; not investigated.

**5. Site #9 needed an explicit `undefined` guard.** Shape `x`/`y` are optional in the schema, so the
Form B conversion reproduced the original predicate's `near(v: number | undefined, want)` semantics
with an explicit throw — preserving "undefined fails" exactly rather than letting TS strictness push
the assertion somewhere looser.

## Scope compliance

- **Nothing under `src/` changed.** Verified: `git diff <base> -- src/` is empty. No test-only
  affordance was needed.
- **No bucket-2 defect was fixed.** F5X-DEF-1 is documented with spec+line, expectation, observed
  behaviour, and a smallest repro (both CLI and by-hand).
- **No new dependencies.** The guard uses only ESLint's own API.
- **No `git stash`** (shared stash stack across worktrees); the one revert used a per-file
  `git checkout`.
- **Non-async predicates untouched** — all 121 of them.
- No schema/migration push (`src/db/schema.ts` is Dexie, not Drizzle).

## Follow-up

- **F5X-DEF-1** — fix the `layoutstop` save so a fresh `cose` persists `graphPositions`; that turns
  `graph.spec.ts:324` green on its own merits. See `260903-f5x-deferred-items.md`.
- Pre-existing `src/` lint debt (16 errors) deserves its own cleanup task.
- `pwa-install.spec.ts:19` is simply stale post-Cloudflare and is a one-line fix.

## Self-Check: PASSED

- `e2e/canvas-pan-marquee.spec.ts`, `e2e/draw-shapes.spec.ts`, `e2e/graph.spec.ts`,
  `e2e/graph-multi-select.spec.ts`, `e2e/marquee-multi-edit.spec.ts`, `e2e/pwa-install.spec.ts`,
  `eslint.config.js` — all present and modified.
- `test-results/f5x/{baseline,run2,final}.{json,txt}` — all six present and non-empty.
- Triage and deferred-items files — both present.
- Commits `0076cae`, `c1ad1bd`, `33d95f2` — all present in `git log`.
- Classifier `VACUOUS_REMAINING=0`; `npm run typecheck` exit 0; `npx eslint e2e/` exit 0;
  final-run failure triage coverage `UNTRIAGED=0`.

# Deferred items — quick-260903-d77

Out-of-scope discoveries made while fixing the marquee screen→world hit-test. Logged, not fixed,
per the task's locked scope.

---

## D77-DEF-1 — `page.waitForFunction` with an ASYNC predicate is vacuous (suite-wide)

**Severity:** high — it silently disarms assertions across the e2e suite.

**What was found.** `page.waitForFunction(async (…) => { … })` does **not** await the promise the
predicate returns. It tests the returned value for truthiness, and a `Promise` is always truthy, so
the wait resolves on its first poll regardless of what the predicate would have evaluated to.

**How it was proven.** While RED-checking this task's new e2e tests against a deliberately
un-converted (pre-fix) band, the helper read the map back with `page.evaluate` and found survivors
`["shape-a"]` — i.e. the band had caught only one of the two rects — while the sibling
`await page.waitForFunction(async (id) => { const m = await …; return m.shapes.length === 0; })`
over that exact state still went green.

**Blast radius.** ~28 occurrences across 11 specs (every one whose predicate is `async` because it
awaits a Dexie read):

`canvas-pan-marquee.spec.ts` (2, pre-existing), `connectors.spec.ts` (1),
`delete-vs-remove.spec.ts` (2), `draw-shapes.spec.ts` (2), `graph-multi-select.spec.ts` (2),
`graph.spec.ts` (10), `marker.spec.ts` (2), `marquee-multi-edit.spec.ts` (4), `profile.spec.ts` (1),
`pwa-install.spec.ts` (1), `transform-marker.spec.ts` (1).

**Fix shape.** Replace each with `expect.poll(() => page.evaluate(async … ), { timeout }).toEqual(…)`
— `page.evaluate` DOES await, and polling a real value names the actual state on failure instead of
timing out anonymously. This task's two new tests already use that form; the two pre-existing ones
in the same file were deliberately left alone.

**Why deferred.** Auditing ~28 assertions means re-running the whole e2e suite and triaging whatever
turns out to have been passing vacuously — a task in its own right, and one likely to surface real
product defects (see D77-DEF-2, found exactly this way).

---

## D77-DEF-2 — the identity-view marquee e2e test never confirms the bulk-delete dialog

**Severity:** medium — the test does not prove what its name claims.

**What was found.** `canvas-pan-marquee.spec.ts` › "a Select-tool left drag on empty canvas
marquee-selects, and Delete removes every hit shape" presses `Delete` on a 2-shape marquee selection
and then waits for `map.shapes.length === 0`. But a 2+ selection routes through `requestDelete`'s
blocking `ConfirmDialog` (T-NFS-01, shipped in quick-260902-nfs) — nothing is written until the
curator clicks **Delete** in that dialog. The test never clicks it, so no delete ever happens; only
D77-DEF-1's vacuous wait keeps the test green.

**Fix shape.** Same as the two new tests in this file now do: after `keyboard.press('Delete')`,
assert the dialog (`getByRole('dialog')`, title `Delete 2 selected objects?`) and click its
`Delete` button, then assert the shape list with `expect.poll`.

**Why deferred.** It is quick-260902-nfs's test, and this task's locked scope forbids changing
anything shipped there beyond the coordinate-space correctness fix. Fixing it belongs with the
D77-DEF-1 sweep, where the surviving assertion can be re-triaged in one pass.

---

## Pre-existing failures NOT touched (carried over from 260902-nfs)

Confirmed still out of scope and not investigated here — all documented in
`.planning/quick/260902-nfs-marquee-multi-select-move-and-delete-on-/260902-nfs-deferred-items.md`:
`marker.spec.ts:63`, `marker.spec.ts:90`, `transform-marker.spec.ts:65`,
`delete-vs-remove.spec.ts:85` (the empty-`layers` render bug), `place-person.spec.ts:135` and the
flaky `portal.spec.ts:182` (nondeterministic active-map seeding).

---
phase: 260820-ibh-fix-flaky-connectors-e2e-by-awaiting-mar
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - e2e/connectors.spec.ts
autonomous: true
requirements:
  - QUICK-260820-ibh

must_haves:
  truths:
    - "The drag-persist test in e2e/connectors.spec.ts waits for the post-dragend marker write to LAND in Dexie before it calls page.reload()."
    - "The post-reload assertions still prove persistence: `expect(persisted?.x).toBe(300)` and `expect(persisted?.y).toBe(220)` are read after a full page.reload() and are unchanged."
    - "The test passes on every run of a repeat-each batch (no single-run green accepted as proof)."
    - "Only e2e/connectors.spec.ts changed — zero application/source files were modified."
    - "The other page.reload() sites in the file were audited and each has a stated verdict; only sites with the same unsynchronized-async-write hazard were changed."
    - "The second test in the file (the Layers-panel session-only toggle test) is byte-for-byte unmodified and still passes."
  artifacts:
    - path: "e2e/connectors.spec.ts"
      provides: "Pre-reload poll on db.markers so the dragend write is observed committed before the page is torn down"
      contains: "db.markers.get"
  key_links:
    - from: "e2e/connectors.spec.ts"
      to: "src/features/person-map/AvatarMarker.tsx"
      via: "handleDragEnd fires `void upsertMarker({...})` — an UNAWAITED Dexie write; the test must poll the repository for its result rather than assume the event dispatch completed it"
      pattern: "db\\.markers\\.get"
---

<objective>
Fix the confirmed pre-existing flake in `e2e/connectors.spec.ts` → `test('a relationship renders as a connector that follows a marker on drag and persists on release')`.

Purpose: at ~line 174 the test fires `dragend` through `page.evaluate`, then at ~line 178 immediately calls `await page.reload()`. `AvatarMarker.handleDragEnd` persists with `void upsertMarker({...})` — a **fire-and-forget, unawaited** Dexie write (confirmed at `src/features/person-map/AvatarMarker.tsx:129`). The event dispatch returns the moment the handler synchronously reaches that `void`, so `page.evaluate` resolves and the reload can tear the page down before IndexedDB commits. The post-reload read then returns the pre-drag seed value and the test fails with `Expected: 300 / Received: 200`.

The app behavior is CORRECT — a real curator never reloads inside the same tick as a drop. Only the test's synchronization is wrong.

Output: a single `expect.poll` inserted before the reload that waits for the repository to report the new position, plus a stated audit verdict for every other `page.reload()` site in the file.

Non-goals (explicitly out of scope — do NOT do these):
- NO application/source changes. Do not touch `AvatarMarker.tsx`, `MapView.tsx`, `testBridge.ts`, or anything under `src/`. Making `upsertMarker` awaited or adding a test-only flush hook is NOT this task.
- NO weakening of the assertion. The pre-reload poll is ADDITIVE. The post-reload `expect(persisted?.x).toBe(300)` / `expect(persisted?.y).toBe(220)` pair MUST survive verbatim — proving the value survives a full page teardown is the entire point of the test.
- NO restructuring: do not rename the test, do not extract helpers, do not reorder its steps.
- NO edits to the second test in the file beyond leaving it alone.
- NO retry/timeout band-aids: do not add `test.retry`, `test.slow()`, `page.waitForTimeout`, or a bare `sleep`. A fixed delay would re-introduce the same race on a slower machine.
- NO changes to `playwright.config.ts` (retries stay 0 locally).

## Established Evidence (do NOT re-litigate)

This was diagnosed during quick task `260820-ceg` and is settled:
- Proven pre-existing: the `260820-ceg` source changes were reverted to base commit `ed1a9ba` and the test reproduced the **byte-identical** failure with none of that task's code present.
- Genuinely non-deterministic: it both FAILED and PASSED at `--workers=1` and at `--workers=2` across 7 runs — load-sensitive, not a parallelism bug.
Do not re-run that investigation. Go straight to the fix.
</objective>

<execution_context>
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# THE file to fix — read it in full. Both tests, all six page.reload() sites, and the existing
# expect.poll / window.__rb idioms the fix must match.
@e2e/connectors.spec.ts

# The prior quick task that diagnosed this flake. Its "Pre-existing Flaky Test (NOT a regression)"
# section is the evidence base — read it, do not reproduce it.
@.planning/quick/260820-ceg-add-session-only-relationship-lines-show/260820-ceg-SUMMARY.md

# Context only, NEVER edit: handleDragEnd (~line 121) is where `void upsertMarker({...})` fires the
# unawaited Dexie write that the test currently fails to wait for.
@src/features/person-map/AvatarMarker.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Poll the repository for the committed drag position before the reload, and audit the file's other reload sites</name>
  <files>e2e/connectors.spec.ts</files>
  <action>
A single insertion into the first test, plus a read-only audit. Nothing else in the file changes.

**1. Insert the pre-reload poll.**

In `test('a relationship renders as a connector that follows a marker on drag and persists on release')`, locate step 3 — the `await page.evaluate((pid) => { ... group.fire('dragend', ...) }, personA);` block that currently ends around line 175. Immediately AFTER that `page.evaluate` closes and BEFORE the existing `// The move persisted to Dexie (read after a full reload).` comment and its `await page.reload();`, insert one `expect.poll` that waits for the repository to report the dropped position.

Read the marker through the SAME test bridge the next line already uses (`window.__rb!.db.markers.get(id)`), and return the coordinate pair so the poll asserts the whole write rather than half of it:

- Wrap the read in an `async` arrow inside `page.evaluate` and `await` the Dexie get, matching the file's existing `async`-arrow evaluate helpers (`resetDb`, `suppressPrivacyNotice`, `seed`). An `async` function returns a native promise, which is what Playwright's evaluate await path is guaranteed to resolve.
- Return the `x`/`y` pair as a two-element array when the marker is found, and `null` when it is not, so a not-yet-readable marker polls again instead of throwing.
- Assert it equals `[300, 220]` via `.toEqual`, using the file's established `expect.poll(..., { timeout: 15_000 })` shape — same timeout constant, same leading-`await expect` / `.poll(...)` / `.toEqual(...)` line break style the three existing `connectorPoints` polls use.
- Pass `markerAId` as the evaluate argument (it is already destructured from `seed(page)` at the top of the test).

Head the insertion with a comment at the surrounding density (the file's step comments run 2-4 lines). It must say three things: that `onDragEnd` persists through an UNAWAITED `void upsertMarker(...)` so firing the event does not mean the write committed; that reloading before it lands is the pre-existing flake, where the post-reload read returned the pre-drag seed position; and that this poll is a synchronization guard only — the reload and the assertions after it still carry the full burden of proving persistence. Do NOT paste the AvatarMarker implementation into the comment; describe the mechanism.

**2. Leave the existing assertions exactly as they are.**

`await page.reload();`, the `waitForFunction(() => !!window.__rb)`, the `const persisted = await page.evaluate(...)` read, `expect(persisted?.x).toBe(300);`, `expect(persisted?.y).toBe(220);`, the canvas visibility wait, and the final connector poll to `[300, 220, 400, 300]` all remain verbatim and in their current order. The new poll is inserted above them, never in place of them.

**3. Audit the file's other `page.reload()` sites (read-only analysis).**

There are five other reload calls: two in `test.beforeEach` (after `resetDb`, and after `suppressPrivacyNotice`), one after `seed(page)` in each of the two tests, and one near the end of the session-only toggle test. For each, decide whether the SAME hazard is present — an async write kicked off but not awaited before the reload — and change a site ONLY if it is. Expect most to be clean: a reload that follows a helper which already `await`s its own writes inside `page.evaluate` is fine, and a reload that follows session-only React state (which is deliberately never persisted) has no write to wait for at all.

Record a one-line verdict for every one of the six reload sites (line number + verdict + one-sentence reason) and carry it into the SUMMARY. State the finding whether or not anything needed changing — "audited, all clean" is a valid and expected result. If you do find a second genuine hazard, fix it with the same poll-the-repository pattern and call it out explicitly in the SUMMARY; do not fix a site defensively just because it is followed by a reload.
  </action>
  <verify>
    <automated>npm run typecheck && npx eslint e2e/connectors.spec.ts && grep -c 'db.markers.get' e2e/connectors.spec.ts && grep -c 'expect(persisted?.y).toBe(220)' e2e/connectors.spec.ts && git diff --name-only -- src | wc -l</automated>
  </verify>
  <done>typecheck and eslint on the spec both pass. `grep -c 'db.markers.get'` reports at least 2 (the new pre-reload poll plus the untouched post-reload read). `grep -c 'expect(persisted?.y).toBe(220)'` reports 1, proving the original assertions survived. `git diff --name-only -- src | wc -l` reports 0, proving no application code changed. A verdict is recorded for all six `page.reload()` sites.</done>
</task>

<task type="auto">
  <name>Task 2: Prove the flake is gone with repeat runs, not a single green</name>
  <files>e2e/connectors.spec.ts</files>
  <action>
A single green run proves nothing about a non-deterministic failure — the prior investigation logged runs that passed and then failed the same command. The decisive evidence is repetition.

Run the whole spec repeatedly with Playwright's repeat-each, which reruns each test N times in the same session:

`npx playwright test connectors.spec.ts --repeat-each=5`

`playwright.config.ts` declares a `webServer` that runs `npm run build:e2e && npm run preview` (and `reuseExistingServer` is on outside CI), so this command is self-contained — no separate dev server is needed. Both tests in the file run, so a passing batch is 10 green results (2 tests x 5 repeats). `retries` is 0 locally, so nothing is masked by a retry.

Require ALL runs green. If even one fails, that is a real signal, not noise:
- If the failure is again `expect(persisted?.x).toBe(300) / Received: 200`, the poll is not actually gating the reload — check that it was inserted BEFORE `page.reload()` and that it is `await`ed.
- If the failure is the new poll itself timing out at 15s, the dragend handler is not reaching the write at all under that run's conditions; report the actual observed value from the poll's error rather than raising the timeout to hide it.
- Do NOT respond to a failure by adding retries, extending timeouts past the file's `15_000` house value, or relaxing an assertion.

Record the exact command, the pass/fail count, and the wall-clock duration in the SUMMARY. If the machine is heavily loaded, a second confirming batch is worth running — the project has a documented pattern of load-induced false failures — but a load explanation must be evidenced (e.g. a clean repeat batch on a quiet machine), never assumed.
  </action>
  <verify>
    <automated>npx playwright test connectors.spec.ts --repeat-each=5</automated>
  </verify>
  <done>The command exits 0 with 10 passed / 0 failed / 0 flaky. Both `e2e/connectors.spec.ts` tests are green on every repeat, and the SUMMARY records the command, the counts, and the duration.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Test-only change. No application code, no new input parsing, no new persistence path, no network call, and no new trust boundary. The E2E `window.__rb` bridge is already gated behind the `--mode e2e` build (VITE_E2E) and is untouched by this task. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ibh-01 | Tampering | The drag-persist regression test itself | mitigate | The real risk here is a "fix" that silences the signal instead of the race — a weakened assertion, a retry, or a fixed sleep would let a genuine persistence regression ship green. Mitigated by the non-goals (the post-reload assertions are held verbatim), by the Task 1 grep gate on `expect(persisted?.y).toBe(220)`, and by requiring a full repeat-each batch rather than a single green run. |
| T-ibh-02 | Elevation of Privilege | `window.__rb` test bridge surface | accept | The new poll uses the already-exposed `db.markers.get` read through the existing bridge; it adds no new bridge method and no new mutation capability. The bridge remains tree-shaken out of the production build (WR-01). |
| T-ibh-SC | Tampering | Package installs | accept | No package-manager install occurs in this task — no new dependency is added, so no supply-chain surface is opened. |
</threat_model>

<verification>
- `npm run typecheck` — the spec compiles (`build:e2e` runs `tsc --noEmit` first, so a type error would also break the E2E webServer).
- `npx eslint e2e/connectors.spec.ts` — the changed file is lint-clean. (Repo-wide `npm run lint` has 16 documented pre-existing errors in `src/` files this task does not touch; scope the lint to the changed file.)
- `npx playwright test connectors.spec.ts --repeat-each=5` — 10/10 green. This is the decisive check.
- `git diff --name-only` lists `e2e/connectors.spec.ts` and nothing else.
- Read-back: the post-reload block still contains `expect(persisted?.x).toBe(300)` and `expect(persisted?.y).toBe(220)` after a real `page.reload()`.
</verification>

<success_criteria>
- The drag-persist test polls the repository until the post-`dragend` write is committed, and only then reloads.
- The pre-reload poll is additive: the post-reload persistence assertions are unchanged and still executed after a full page teardown.
- The test name, structure, ordering, and the file's second test are unmodified.
- Zero files under `src/` changed.
- All six `page.reload()` sites in the file have a stated audit verdict in the SUMMARY, and any site changed is justified by the same unsynchronized-async-write hazard.
- `npx playwright test connectors.spec.ts --repeat-each=5` is 10/10 green; typecheck and file-scoped eslint pass.
- No retry, no `waitForTimeout`, no raised timeout, and no `playwright.config.ts` change was used to reach green.
</success_criteria>

<output>
Create `.planning/quick/260820-ibh-fix-flaky-connectors-e2e-by-awaiting-mar/260820-ibh-SUMMARY.md` when done.

The SUMMARY must include:
1. The exact diff hunk inserted (it is small — show it).
2. A six-row table of every `page.reload()` site in the file: line, context, verdict (hazard / clean), one-sentence reason.
3. The repeat-run evidence: command, passed/failed counts, duration.
</output>

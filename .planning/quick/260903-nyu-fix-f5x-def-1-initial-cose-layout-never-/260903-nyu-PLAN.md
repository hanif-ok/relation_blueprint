---
phase: quick-260903-nyu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/graph/positionCache.ts
  - src/features/graph/GraphView.tsx
  - tests/features/positionCache.test.ts
  - e2e/graph.spec.ts
autonomous: true
requirements: [NYU-1, NYU-2, NYU-3, NYU-4, NYU-5, NYU-6, NYU-7]
user_setup: []

estimate:
  tokens: 75000
  raw_tokens: 55000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "NYU-1: Opening the graph for the first time on a DB with no saved positions leaves a `graphPositions` meta row containing a position for EVERY node in the graph — proven by a new e2e test that is RED before the fix and GREEN after."
    - "NYU-1: `e2e/graph.spec.ts` › 'ego focus is transient: exit restores the base and never overwrites graphPositions' passes (it is legitimately RED today because of this defect)."
    - "NYU-2: The transient ego-focus overlay still never overwrites the persisted base. The recovery save reads node positions SYNCHRONOUSLY at a point strictly earlier than any concentric layout can run (parent `useLayoutEffect` precedes the ego `useEffect`), and it consults the SAME `suspendSaveRef` fence the `layoutstop` handler consults."
    - "NYU-3: The initial layout is persisted exactly once. Once ANY `layoutstop` has reached the handler for a given Cytoscape core, the recovery path is permanently disabled for that core — so the Reset-layout path (whose cose DOES emit a heard `layoutstop`) does not double-save."
    - "NYU-3: A `preset` layoutstop no longer triggers a redundant re-save, so the save → load → setPosCache → preset-patch chain terminates instead of writing the row twice."
    - "NYU-4: The recovery never fires before the position cache has been probed, so a saved hand-arranged layout can never be clobbered by a fresh `cose` that raced the `loadPositions()` probe."
    - "NYU-5: The layout-persistence decision is a PURE exported helper in positionCache.ts with a unit truth-table covering all four gate inputs."
    - "NYU-6: The graph still writes ONLY the `graphPositions` meta row — `db.people` / `db.groups` / `db.relationshipLinks` are unchanged across a first-ever graph open (asserted in the new e2e test)."
    - "NYU-6: The stale claim at GraphView.tsx:514-519 (that every layout persists, 'not just the first') no longer asserts something the code does not achieve; the module header records the chosen mechanism AND why candidates (a), (b) and (d) were rejected, each with a source citation."
    - "NYU-7: `npm run typecheck` exits 0, `npm run test` (vitest) passes, `npx eslint e2e/` exits 0, and `npx eslint src/features/graph/GraphView.tsx src/features/graph/positionCache.ts` exits 0."
    - "NYU-7: A full `npx playwright test` run shows no failure outside the KNOWN PRE-EXISTING list (marker.spec.ts:63, marker.spec.ts:90, transform-marker.spec.ts:65, delete-vs-remove.spec.ts:85, place-person.spec.ts:135, portal.spec.ts:182, browse-and-create.spec.ts:139, pwa-install.spec.ts:19)."
  artifacts:
    - src/features/graph/positionCache.ts
    - src/features/graph/GraphView.tsx
    - tests/features/positionCache.test.ts
    - e2e/graph.spec.ts
    - .planning/quick/260903-nyu-fix-f5x-def-1-initial-cose-layout-never-/260903-nyu-SUMMARY.md
  key_links:
    - "`shouldPersistInitialLayout(...)` (positionCache.ts) ← consumed by the one-shot `useLayoutEffect` in GraphView. The helper's `saveSuspended` input is the SAME `suspendSaveRef.current` the `cy.on('layoutstop')` handler reads — one fence, two readers."
    - "`layoutStopSeenRef` — set as the FIRST statement of the `layoutstop` handler (before the fence bail, because the flag means 'the listener is live', not 'a save happened') ← read by the recovery gate. This is the single link that prevents a double-save on the Reset-layout path."
    - "`savePositions(cy)` builds its id→position map synchronously before its first `await` (positionCache.ts:28-34) ← this is why calling it from a layout effect captures the pre-concentric base even though the write resolves later."
    - "New e2e assertion ← `window.__rb.db.meta.get('graphPositions')`, expressed as `expect.poll(() => page.evaluate(async …))` so the `rb-e2e/no-async-wait-predicate` guard (eslint.config.js:37/96) stays satisfied."
---

<objective>
Fix F5X-DEF-1: the initial `cose` layout never persists a `graphPositions` row, because
react-cytoscapejs runs the layout during `patch()` and only afterwards invokes the `cy` callback
that attaches our `layoutstop` listener — so the initial `layoutstop` is emitted into a void and
never recovers.

Purpose: restore the D-13 `preset` fast-path for graphs that have never been hand-arranged. Today
every reopen pays a full physics layout and node positions are not stable across sessions, and
`e2e/graph.spec.ts` › "ego focus is transient…" is legitimately red as a result.

Output: a fenced, gated, one-shot recovery save in GraphView driven by a pure helper in
positionCache.ts; a unit truth-table for the helper; a new e2e regression test proving the row
exists after a first-ever graph open; and a corrected module header that records why the three
rejected alternatives were rejected.
</objective>

<execution_context>
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/cartr/git_stuff/relation_blueprint/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/260903-f5x-re-arm-vacuous-waitforfunction-assertion/260903-f5x-deferred-items.md

@src/features/graph/GraphView.tsx
@src/features/graph/positionCache.ts
@src/features/graph/graphElements.ts
@tests/features/positionCache.test.ts
@e2e/graph.spec.ts
</context>

<root_cause_verified>
Every citation below was re-verified against the INSTALLED sources during planning. Do NOT
re-investigate; verify by reading if you wish, then implement.

1. `node_modules/react-cytoscapejs/src/component.js:46-88` — `componentDidMount` constructs the
   Cytoscape core, optionally publishes it on `window[global]`, then calls
   `this.updateCytoscape(null, this.props)`. `updateCytoscape` runs `patch(cy, …)` FIRST and calls
   `newProps.cy(cy)` (our `registerCy`) SECOND.

2. `node_modules/react-cytoscapejs/src/patch.js:57-70` — `patch` ends with
   `if (isDiffAtKey(json1, json2, diff, 'layout')) patchLayout(...)`, and `patchLayout` does
   `cy.layout(layoutOpts).run()`. On first mount `json1` is `null`, so the layout always runs.

3. `node_modules/cytoscape/dist/cytoscape.cjs.js` (CoseLayout.prototype.run, ~21148-21176) — with
   `animate: false` the `else` branch runs the entire `while (loopRet) mainLoop(i)` simulation
   SYNCHRONOUSLY and then calls `done()`, which does
   `layout.emit({ type: 'layoutstop', layout: layout })` — still synchronously, still inside
   `patchLayout`, still before `registerCy` has ever run. The event has no listener and is lost.

4. It never recovers: `GraphView.tsx:211-213`'s `layout` memo only changes when
   `usePresetPositions` flips, and on a graph with no saved positions
   `usePresetPositions = posCache.probed && !partition.noneCached` stays false forever, so
   `isDiffAtKey(…, 'layout')` never fires again.

5. `dragfree` looks healthy because it is a later user gesture, long after `registerCy` attached.
   That asymmetry is exactly what the field write-up observed.

6. `node_modules/cytoscape/dist/cytoscape.cjs.js` (~35426-35438) — the layout emitter's
   `addEventFields` sets `evt.layout = layout` and `bubble()` returns true with `parent = cy`, so a
   `cy.on('layoutstop', e => …)` handler CAN read `e.layout.options.name`. `Layout` sets
   `this.options = options` (~35364-35366). This is what makes the `preset` skip in Task 2 possible.

7. `node_modules/react-cytoscapejs/src/patch.js:136-165` — `patchElement` patches the `position`
   key whenever it differs, so a `setPosCache` that adds positions to `elements` snaps live nodes.
   This is why the recovery's cache refresh must be reasoned about, not assumed inert.
</root_cause_verified>

<chosen_approach>
**(c) — a one-shot post-mount recovery save, in a parent `useLayoutEffect`, gated by a pure helper.**

Because the mount `cose` runs to completion SYNCHRONOUSLY inside `patch` (citation 3), by the time
any parent effect runs the nodes already sit at their final `cose` positions. So persisting them
from a parent layout effect reproduces EXACTLY what the missed `layoutstop` would have persisted.

Four gate inputs, each load-bearing for a different failure mode:

| Input | Why it is required |
|---|---|
| `probed` | `posCache.probed` can still be false when `CytoscapeComponent` mounts (the `loadPositions()` probe races three `useLiveQuery` reads). An ungated recovery would then persist a fresh `cose` OVER the curator's saved hand-arranged layout. Severe; must never happen. |
| `noneCached` | Restricts recovery to the only case where the missed event is load-bearing. `allCached`'s missed `preset` `layoutstop` would have been an identical no-op re-save. `partial`'s newcomer IS persisted, by the placement effect's own (heard) `cose` `layoutstop` — recovering there would race a newcomers-at-origin snapshot against it. |
| `!layoutStopSeen` | Once any `layoutstop` has reached the handler, the handler owns persistence forever. This is what keeps Reset layout (a heard `cose`) from double-saving. |
| `!saveSuspended` | The ego-focus fence, read from the SAME `suspendSaveRef` the `layoutstop` handler reads. |

Ordering guarantees this fix relies on (state them in the header; they are why `useLayoutEffect`
and not `useEffect`):
- React commits children before parents, so `CytoscapeComponent.componentDidMount` (which runs
  `patch` → the layout → `registerCy`) has finished before GraphView's layout effect runs.
  `cyRef.current` is therefore set, and any synchronous `layoutstop` has already been raised.
- Layout effects run before passive effects, so the recovery runs strictly BEFORE the concentric
  ego-overlay `useEffect` can raise the fence — the snapshot is unconditionally the pre-focus base.
  A plain `useEffect` would depend on hook declaration order, which is fragile.
- `savePositions(cy)` builds its map synchronously before its first `await`, so the captured
  positions are the ones present at that instant, even though the write resolves later.

**Interaction with the newcomer-placement effect (GraphView.tsx:379-401) — checked, not assumed:**
that effect is a passive `useEffect`, so it runs AFTER the recovery layout effect in the same
commit. It is gated on `!partition.noneCached && partition.missing.length > 0`, which is the exact
complement of the recovery's `noneCached` gate — the two can never both fire in one commit, so
`placedMissingRef` is untouched by this change and no ordering hazard exists between them.
</chosen_approach>

<rejected_approaches>
Record ALL THREE in the GraphView module header, with these citations. The previous attempt at this
exact bug failed precisely because its reasoning was not written down.

- **(a) Run the initial layout yourself inside `registerCy`, after attaching listeners.**
  REJECTED. react-cytoscapejs runs `patchLayout` on first mount whenever the `layout` prop is
  non-null (component.js:46-88 → patch.js:57-70); suppressing that means passing `layout={null}`
  and taking ownership of EVERY layout run — including the Reset-layout re-run and the `preset`
  application, both of which are driven today by the prop flipping on `usePresetPositions`. That is
  a far larger blast radius across two currently-green e2e specs ("Reset layout clears the saved
  manual positions", "adding an entity keeps saved positions…") for no additional correctness: the
  mount `cose` has already completed synchronously by the time a parent effect can run, so
  re-running it ourselves buys nothing.

- **(b) Attach the listeners before the first patch by some other route.**
  REJECTED. No such seam exists. `componentDidMount` constructs the core and calls
  `updateCytoscape(null, this.props)` in one synchronous block (component.js:46-77). The only
  pre-patch observation point is the `global` prop's `window[global] = cy` assignment, which could
  only be intercepted by installing a property setter on `window` — a hack, and `global` is
  e2e-gated here (`CY_GLOBAL`, GraphView.tsx:78) so it does not even exist in production builds.

- **(d) Make the `layout` prop identity change once listeners are attached.**
  REJECTED twice over. First, `isDiffAtKey` runs the configured `diff` (default `shallowObjDiff`)
  over the layout VALUE, not its identity — a fresh object with the same keys does not re-trigger
  `patchLayout`, so this would require smuggling a nonce key into the layout options. Second, even
  if it worked it would run the physics simulation TWICE on every first open, which is the exact
  cost the D-13 `preset` fast-path exists to avoid.
</rejected_approaches>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: Pure gate + unit truth-table + the failing e2e regression test (prove RED)</name>
  <files>src/features/graph/positionCache.ts, tests/features/positionCache.test.ts, e2e/graph.spec.ts</files>
  <precondition>Playwright is driven by the configured `webServer` (`npm run build:e2e && npm run preview`, playwright.config.ts), which sets `VITE_E2E=true` so `window.__rb` exists. Never run these specs against `npm run dev` — the test bridge is absent there and every seed call throws.</precondition>
  <behavior>
    Unit (tests/features/positionCache.test.ts), a truth table over `shouldPersistInitialLayout`:
    - probed:true, noneCached:true, layoutStopSeen:false, saveSuspended:false -> true (the only true row)
    - probed:false, noneCached:true, layoutStopSeen:false, saveSuspended:false -> false (probe still in flight; persisting here would clobber a saved layout)
    - probed:true, noneCached:false, layoutStopSeen:false, saveSuspended:false -> false (allCached/partial are not this defect)
    - probed:true, noneCached:true, layoutStopSeen:true,  saveSuspended:false -> false (the handler is live and owns persistence)
    - probed:true, noneCached:true, layoutStopSeen:false, saveSuspended:true  -> false (ego-focus fence)
    Assert the function is pure: calling it twice with the same input returns the same value and it
    has no observable effect on the Dexie `meta` table.

    E2E (e2e/graph.spec.ts), the new regression test, RED at the end of this task:
    - After seeding and opening the graph on a DB with no saved positions, a `graphPositions` meta
      row EXISTS and holds a position for every seeded node id (aliceId, bobId, teamId).
    - Entity tables are untouched across that open (people/groups/relationshipLinks counts unchanged).
  </behavior>
  <action>
    Export a new PURE function from `src/features/graph/positionCache.ts`:
    `shouldPersistInitialLayout(gate: { probed: boolean; noneCached: boolean; layoutStopSeen: boolean; saveSuspended: boolean }): boolean`
    returning `gate.probed &amp;&amp; gate.noneCached &amp;&amp; !gate.layoutStopSeen &amp;&amp; !gate.saveSuspended`.
    Reads only its argument and mutates nothing, exactly like `partitionCached` beside it. Give it a
    house-style doc comment naming F5X-DEF-1 and stating, one clause per input, the failure mode each
    gate prevents (use the table in this plan's `chosen_approach`, including the citation
    `react-cytoscapejs component.js:46-88` -> `patch.js:57-70` for WHY a gate is needed at all).
    Also update the module header's line 4 claim about `layoutstop` so it names the recovery path as
    the mechanism that makes the initial layout persist.

    Extend `tests/features/positionCache.test.ts` with a `describe('shouldPersistInitialLayout')`
    block covering the five rows in `behavior` above. Follow the file's existing style — data-only,
    no DOM, no Cytoscape instance.

    APPEND a new Playwright test as the FINAL test in `e2e/graph.spec.ts` (append, do not insert —
    inserting would shift every line number that the F5X deferred-items write-up and this task's
    scope boundary reference, notably `e2e/graph.spec.ts:324`). Title it exactly:
    `'the initial cose layout persists a graphPositions row on a first-ever graph open'`.
    Give it a house-style doc comment citing F5X-DEF-1 and the react-cytoscapejs mount ordering.
    Body: reuse the existing `seedGraph(page)` helper; click `view-graph`; wait for the seeded node
    to exist on `window.__cyGraph` using the same `page.waitForFunction` shape the neighbouring
    tests use (that predicate is synchronous, so it is legal under the guard); then assert with
    `expect.poll(() =&gt; page.evaluate(async () =&gt; …))` that
    `window.__rb!.db.meta.get('graphPositions')` yields a row whose value has an own property for
    each of aliceId/bobId/teamId — poll a derived count or boolean, never an async predicate handed
    to `waitForFunction`. Use a 15_000 ms timeout, matching the neighbouring polls. Finish with a
    single `page.evaluate` reading `db.people.count()`, `db.groups.count()` and
    `db.relationshipLinks.count()` and assert 2 / 1 / 2, pinning the viewer-only boundary
    (PROJECT.md lines 68 and 101).

    Do NOT modify GraphView.tsx in this task, and do NOT touch any of the 12 assertions re-armed in
    quick-260903-f5x or the ESLint guard.

    Then PROVE RED: run the new e2e test and capture its failure output verbatim for the SUMMARY.
  </action>
  <verify>
    <automated>npx vitest run tests/features/positionCache.test.ts --no-file-parallelism &amp;&amp; npx eslint e2e/ src/features/graph/positionCache.ts &amp;&amp; npm run typecheck &amp;&amp; ! npx playwright test e2e/graph.spec.ts -g "initial cose layout persists" --reporter=line</automated>
  </verify>
  <done>
    `shouldPersistInitialLayout` is exported and pure; its five-row unit truth-table passes under
    vitest; `npx eslint e2e/` and the touched src file exit 0; `npm run typecheck` exits 0; and the
    new e2e test FAILS with the row absent — the RED half of the proof, its output captured for the
    SUMMARY. Note in the SUMMARY that if `vitest run` reports fork-worker startup timeouts, the run
    must be repeated with `--no-file-parallelism` before treating it as a real failure (project
    memory: environmental, not a code defect).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the fenced one-shot recovery in GraphView and correct the stale comment (prove GREEN)</name>
  <files>src/features/graph/GraphView.tsx</files>
  <precondition>Task 1 is committed: `shouldPersistInitialLayout` is exported from positionCache.ts and the new e2e test exists and is RED.</precondition>
  <behavior>
    - First-ever open, no saved positions: the recovery fires once and the `graphPositions` row
      appears with every node — the new e2e test flips RED to GREEN.
    - Reset layout: the re-run `cose` emits a HEARD `layoutstop`, so the recovery is skipped and the
      row is written exactly once — "Reset layout clears the saved manual positions" still passes.
    - Adding an entity: the partial path is untouched (`noneCached` false), so "adding an entity
      keeps saved positions and auto-places only the newcomer" still passes.
    - Ego focus enter/exit: the persisted base is byte-identical across the cycle — both
      "ego focus is transient…" and "ego focus + concurrent entity-add… (WR-01 fence)" pass.
    - A `preset` layoutstop performs no save, so the save -> load -> setPosCache -> preset-patch
      chain terminates rather than writing the row a second time.
  </behavior>
  <action>
    In `src/features/graph/GraphView.tsx`:

    1. Add `layoutStopSeenRef = useRef(false)` beside `suspendSaveRef`, documented as meaning
       "our listener is live and has received at least one layout event for this core" — NOT
       "a save happened". Set it as the FIRST statement inside the `cy.on('layoutstop', …)`
       handler, BEFORE the `suspendSaveRef` bail, so a fenced ego `layoutstop` still counts as
       proof the listener is live.

    2. In that same handler, after the fence bail, skip the save when the layout that just stopped
       was a `preset` run. Read the name defensively off the event — the emitter sets
       `evt.layout` and `Layout` sets `this.options` (cytoscape.cjs.js ~35364 and ~35426), but
       `@types/cytoscape` does not model it, so narrow through an inline structural type rather
       than `any`. Skip ONLY on an exact `'preset'` match; an absent or unrecognised name must fall
       through to saving, preserving today's behaviour. Comment WHY: a `preset` run just re-applied
       positions that are already persisted, so saving them back is a redundant second write of
       identical bytes — and it is that redundant write which would otherwise turn the recovery's
       save -> load -> setPosCache -> `usePresetPositions` flip -> `preset` patch sequence into a
       second save of the same row.

    3. Add a parent `useLayoutEffect` — placed immediately AFTER the newcomer-placement effect and
       BEFORE `registerCy` — that performs the one-shot recovery. It reads `cyRef.current`, returns
       early when null, then calls `shouldPersistInitialLayout({ probed: posCache.probed,
       noneCached: partition.noneCached, layoutStopSeen: layoutStopSeenRef.current, saveSuspended:
       suspendSaveRef.current })` and returns when false. When true it runs the SAME chain the
       `layoutstop` handler runs — `void savePositions(cy).then(() =&gt; loadPositions().then(
       (positions) =&gt; setPosCache({ probed: true, positions })))` — so recovery and the normal
       path stay one behaviour, not two. Deps: `[posCache.probed, partition, elements]`, because the
       effect must also get a second chance in the commit where a probe that lost the race to the
       `useLiveQuery` reads finally resolves. No extra latch is needed: the four gate inputs already
       make it idempotent (`layoutStopSeen` goes true as soon as the resulting `preset` patch raises
       a heard `layoutstop`, and `noneCached` goes false as soon as the row lands).
       `useLayoutEffect` and not `useEffect` — record both ordering guarantees from this plan's
       `chosen_approach` in the comment.

    4. Rewrite the comment block that currently sits at GraphView.tsx:514-519. It asserts that
       `cy.on` makes every layout persist "not just the first"; that intent was right but mount
       ordering defeated it, so the text must now state what the code actually achieves: the
       listener catches every layout from the second one onward, and the one-shot recovery covers
       the first, whose event is raised before the listener exists.

    5. Extend the module header (the block ending at line 43) with a `LAYOUT PERSISTENCE
       (quick-260903-nyu / F5X-DEF-1)` section: the root cause with its two react-cytoscapejs
       citations, the chosen mechanism, the four gate inputs and the failure mode each prevents,
       and all three rejected alternatives from this plan's `rejected_approaches`, each opening with
       the literal token `REJECTED` and carrying its source citation. Match the WHY-heavy,
       citation-bearing style of marquee.ts / groupMove.ts / graphGesture.ts.

    Change nothing else. Do not touch the ego-focus enter/exit paths, `placedMissingRef`, the
    `layout` memo, or the `CytoscapeComponent` props. Add no dependency.

    Then PROVE GREEN and prove no regression, in this order:
      a. the new test alone, repeated, to show determinism;
      b. the whole `e2e/graph.spec.ts` plus `e2e/graph-multi-select.spec.ts`;
      c. one full `npx playwright test` run, comparing failures against the KNOWN PRE-EXISTING list.
  </action>
  <verify>
    <automated>npm run typecheck &amp;&amp; npx vitest run --no-file-parallelism &amp;&amp; npx eslint e2e/ src/features/graph/GraphView.tsx src/features/graph/positionCache.ts &amp;&amp; npx playwright test e2e/graph.spec.ts -g "initial cose layout persists" --repeat-each=3 --reporter=line &amp;&amp; npx playwright test e2e/graph.spec.ts e2e/graph-multi-select.spec.ts --reporter=line &amp;&amp; test "$(grep -c REJECTED src/features/graph/GraphView.tsx)" -ge 3</automated>
  </verify>
  <done>
    The new e2e test passes 3/3; every test in `e2e/graph.spec.ts` and `e2e/graph-multi-select.spec.ts`
    passes, including "ego focus is transient: exit restores the base and never overwrites
    graphPositions" (previously legitimately red) and "ego focus + concurrent entity-add… (WR-01
    fence)"; `grep -c "REJECTED"` reports at least 3; `npm run typecheck`, `npx vitest run` and
    `npx eslint e2e/ src/features/graph/GraphView.tsx src/features/graph/positionCache.ts` all exit
    0. A full `npx playwright test` run has been executed and its failures are a subset of the KNOWN
    PRE-EXISTING list, recorded test-by-test in the SUMMARY.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Dexie `meta` table ↔ GraphView | The only write this view performs. A regression here could widen the viewer-only write surface. |
| Persisted `graphPositions` row ↔ layout engine | Positions read back at open drive `preset`; a corrupt or partial row degrades rendering. |
| `node_modules` third-party behaviour ↔ our ordering assumptions | The fix depends on documented-by-reading behaviour of react-cytoscapejs and cytoscape, not on a public API contract. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-NYU-01 | Tampering | GraphView recovery save | medium | mitigate | The recovery calls only `savePositions`, which writes exactly one `meta` key (`graphPositions`). The new e2e test asserts people/groups/relationshipLinks counts are unchanged across a first-ever graph open, pinning PROJECT.md lines 68 and 101. |
| T-NYU-02 | Tampering | Saved hand-arranged layout | high | mitigate | The `probed` gate makes recovery impossible before `loadPositions()` has resolved, so a fresh `cose` that wins the race against the probe can never overwrite the curator's saved layout. Covered by a dedicated unit truth-table row. |
| T-NYU-03 | Tampering | Persisted base during ego focus | high | mitigate | The recovery reads the same `suspendSaveRef` fence as the `layoutstop` handler AND runs in a layout effect that is ordered strictly before the concentric `useEffect`, so its snapshot is always the pre-focus base. Both existing ego e2e specs must pass. |
| T-NYU-04 | Denial of Service | save → load → setPosCache chain | medium | mitigate | Skipping the save on a `preset` `layoutstop` plus the `layoutStopSeen` latch bounds the chain to a single write; the "3/3 repeat" and full-suite runs confirm no re-entrant write loop. |
| T-NYU-05 | Repudiation | Undocumented rationale | low | mitigate | The module header records the mechanism and all three rejected alternatives with citations; the `REJECTED` grep gate enforces their presence, so the next maintainer cannot repeat the previous attempt's failure mode. |
| T-NYU-SC | Tampering | npm/pip/cargo installs | n/a | accept | No packages are installed by this task (no new dependencies — locked constraint), so the package-legitimacy gate does not apply. |
</threat_model>

<verification>
1. `npm run typecheck` exits 0.
2. `npx vitest run --no-file-parallelism` passes, including the new `shouldPersistInitialLayout`
   truth-table. (A first run without the flag that reports fork-worker startup timeouts is
   environmental — re-run with the flag before concluding a real failure.)
3. `npx eslint e2e/` exits 0 and `npx eslint src/features/graph/GraphView.tsx
   src/features/graph/positionCache.ts` exits 0. The repo-wide `npm run lint` is expected to stay
   non-zero from ~16 PRE-EXISTING errors in untouched `src/` files — do not clear that debt.
4. `npx playwright test e2e/graph.spec.ts -g "initial cose layout persists" --repeat-each=3` — 3/3
   pass after the fix, and the same command was proven to fail before it.
5. `npx playwright test e2e/graph.spec.ts e2e/graph-multi-select.spec.ts` — all green.
6. One full `npx playwright test`; every failure is in the KNOWN PRE-EXISTING list
   (marker.spec.ts:63, marker.spec.ts:90, transform-marker.spec.ts:65, delete-vs-remove.spec.ts:85,
   place-person.spec.ts:135, portal.spec.ts:182, browse-and-create.spec.ts:139,
   pwa-install.spec.ts:19). Identify tests by TITLE as well as line, since the appended test may
   shift nothing in other files but line references age quickly.
7. Manual confirmation (optional, cheap): `npx vite --mode e2e`, open with an empty DB, create two
   people and a relationship, switch to Graph, let it settle, inspect IndexedDB →
   `relation-blueprint` → `meta` → `graphPositions`. The row is now PRESENT without any drag.
</verification>

<success_criteria>
- The `graphPositions` meta row exists after a first-ever graph open on a DB with no saved
  positions, with a position for every node — new e2e test proven RED then GREEN.
- `e2e/graph.spec.ts` › "ego focus is transient: exit restores the base and never overwrites
  graphPositions" passes.
- The ego-focus fence still holds: both ego specs pass, and the persisted base is byte-identical
  across a focus enter/exit cycle.
- Exactly one write per initial layout; the Reset-layout path does not double-save.
- A saved hand-arranged layout is never clobbered by a probe race (unit truth-table row).
- The graph writes ONLY the `graphPositions` meta row (asserted in e2e).
- GraphView's module header documents the mechanism and all three rejected alternatives with
  citations, and the previously-stale comment at 514-519 now describes what the code achieves.
- Scope held: no other logged defect touched, no dependency added, no re-armed assertion or ESLint
  guard modified, no schema/migration work.
</success_criteria>

<output>
Create `.planning/quick/260903-nyu-fix-f5x-def-1-initial-cose-layout-never-/260903-nyu-SUMMARY.md`
when done. It must contain, verbatim: the RED failure output from Task 1, the GREEN 3/3 output from
Task 2, and the full-suite failure list mapped test-by-test against the KNOWN PRE-EXISTING list.
</output>

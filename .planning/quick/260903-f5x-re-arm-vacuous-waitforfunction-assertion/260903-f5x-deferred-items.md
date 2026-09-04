# Deferred items — quick-260903-f5x

Genuine **product** defects exposed by re-arming the 12 vacuous `page.waitForFunction` assertions.
Per the task's locked scope boundary these are **logged, not fixed**: fixing product defects inside
a test-integrity sweep would make the task unbounded and its commits non-atomic. Each earns its own
follow-up task.

---

## F5X-DEF-1 — the initial `cose` layout never persists a `graphPositions` row

> **RESOLVED 2026-09-04 by quick-260903-nyu** (commits `e2b103f` RED, `3f2f85e` GREEN; merged `69de0a5`).
> Root cause: react-cytoscapejs's `componentDidMount` runs `patch()` — which runs the layout — BEFORE it
> calls the `cy` prop callback that attaches the `layoutstop` listener, so the synchronous `cose` stop was
> emitted into a void and the layout memo's identity never changed to trigger another. Fixed with a one-shot
> recovery in a parent `useLayoutEffect`, gated by the pure `shouldPersistInitialLayout`. `e2e/graph.spec.ts:324`
> is green again and `e2e/graph.spec.ts:560` now covers a first-ever open directly. Verified 11/11.
> The paragraph below is retained as the original field report.

**Severity:** medium — it silently defeats the D-13 `preset` fast-path for every graph that has
never been hand-arranged, so every reopen pays a full physics layout and node positions are not
stable across sessions.

**Spec + line.** `e2e/graph.spec.ts:324` › "ego focus is transient: exit restores the base and never
overwrites graphPositions". The re-armed barrier is at `e2e/graph.spec.ts:343-352`.

**What the re-armed assertion expects.** That opening the graph on a DB with no saved positions
runs a fresh `cose` whose `layoutstop` persists the resulting layout, so a `graphPositions` meta row
exists (with ≥1 node id) before the test enters ego focus. This is the documented design, stated in
two places in the source:

- `src/features/graph/positionCache.ts:4` — "Positions are written on `layoutstop` (fresh/reset/newcomer layouts)".
- `src/features/graph/GraphView.tsx:520-532` — the `layoutstop` handler runs `savePositions(cy)`,
  and its own comment describes re-saving idempotently on *each* `layoutstop`, explicitly including
  the initial `cose`.

**What actually happens.** No row is ever written. Probed directly by replacing the assertion with a
poll of `JSON.stringify(row ?? null)`: it returns **`DEBUG:null`** — i.e. the `meta` row is entirely
absent, not merely empty — and it is still `null` after a **30 s** wait, so this is not a slow-settle
race. The original vacuous wait (`row?.value !== undefined`) would fail here too, so this finding is
NOT an artifact of the Form A conversion: the re-arming merely made a pre-existing falsehood visible.

Note the neighbouring write path is fine: `dragfree` **does** persist (`e2e/graph-multi-select.spec.ts:212`,
site #5, re-armed to a ±12 tolerance check, passes). The defect is specific to the `layoutstop` save
on a fresh, never-arranged graph.

**Smallest repro.**

```bash
npx vite --mode e2e          # window.__rb requires e2e build mode; it is absent under `npm run dev`
npx playwright test e2e/graph.spec.ts -g "ego focus is transient" --repeat-each=3
# 3/3 fail, deterministically: Expected: > 0, Received: 0
```

By hand: open the app with an empty DB, create two people and a relationship between them, switch to
the Graph view, let the layout settle, then inspect IndexedDB →
`relation-blueprint` → `meta` → key `graphPositions`. The row is absent. Drag any node once and the
row appears — proving the `dragfree` path works and only the `layoutstop` path is broken.

**Why deferred.** The task's scope boundary is locked by the user: bucket-2 (genuine product
defects) are logged, never fixed, inside this test-integrity sweep. Fixing it means changing
`src/features/graph/GraphView.tsx`, which this task is forbidden to touch.

**Consequence for the suite.** `e2e/graph.spec.ts:324` was **legitimately red** at the time of writing —
no longer passing on nothing, but correctly reporting this defect. It went green when quick-260903-nyu
fixed the defect on 2026-09-04.

---

## Not a product defect, but blocking the plan's "lint exits 0" criterion

**Pre-existing repo-wide lint debt in `src/`.** `npm run lint` reports **16 errors + 11 warnings**,
every one of them in `src/` files this task never touched (`git diff` against the task's base commit
shows `src/` is byte-identical). Examples: `no-useless-assignment` in
`src/features/pwa/usePersistentStorage.ts:62`, plus errors in `App.tsx`, `useSyncEngine.ts`,
`EntityForm.tsx`, `PersonForm.tsx`, `PersonPicker.tsx`, `PortalTargetPicker.tsx`, `useMapImage.ts`,
`AddRelationshipDialog.tsx`, `PhotoLightbox.tsx`, `ProfileSidebar.tsx`.

This is the same class of pre-existing debt recorded as item 3 of
`.planning/quick/260902-nfs-marquee-multi-select-move-and-delete-on-/260902-nfs-deferred-items.md`,
though the count has grown since. `npx eslint e2e/` — the scope this task owns, and where the new
`rb-e2e/no-async-wait-predicate` guard runs — exits **0**. Fixing the `src/` debt would require
touching application source, which this task's scope boundary forbids.

---

## Bucket-3 rows left alone (owned elsewhere)

Not investigated here; all pre-existing and all failing on the pre-re-arm baseline. Owned by
`.planning/quick/260902-nfs-marquee-multi-select-move-and-delete-on-/260902-nfs-deferred-items.md`:

- Empty-`layers` render bug (§2): `marker.spec.ts:63`, `marker.spec.ts:90`,
  `transform-marker.spec.ts:65`, `delete-vs-remove.spec.ts:85`.
- Nondeterministic active-map seeding (§1): `place-person.spec.ts:135` and the flaky
  `portal.spec.ts:182`. Both were confirmed here to be coin flips rather than regressions —
  each passed 3/3 under `--repeat-each=3` despite failing in one of the full runs.

Two further pre-existing failures were found that the plan had **not** pre-listed. Neither is in a
spec this task edits, and both were already red on the baseline:

- `browse-and-create.spec.ts:139` — the sort toggle test times out at 30 s; the profile sidebar
  (`<h2 data-testid="profile-name">Zoe Team</h2>`) intercepts the click on `sort-recent`.
- `pwa-install.spec.ts:19` — still asserts the old GitHub Pages base `"/relation_blueprint/"`, but
  the deploy moved to the Cloudflare Pages domain root `"/"` in quick-260820-idf. A stale test, and
  a *different* test from the vacuous site at `pwa-install.spec.ts:49` that this task re-armed.

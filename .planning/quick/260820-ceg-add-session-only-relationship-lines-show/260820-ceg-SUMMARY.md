---
phase: 260820-ceg-add-session-only-relationship-lines-show
plan: 01
subsystem: person-map
tags: [map-editor, layers-panel, connectors, konva, view-state]
status: complete
requires:
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/person-map/editor/LayersPanel.tsx
provides:
  - showConnectorLines session-only view state in MapView
  - LayersPanel "Relationship lines" checkbox (show-connector-lines-toggle)
affects:
  - src/features/person-map/MapView.tsx
  - src/features/person-map/editor/LayersPanel.tsx
tech-stack:
  added: []
  patterns:
    - Session-only view state via useState in MapView (mirrors showLabels / showConnectorLabels)
    - Gate the ConnectorLayer CHILD, keep the physical Konva Layer mounted
    - Required (non-optional) panel props so a missing wire is a compile error
key-files:
  created: []
  modified:
    - src/features/person-map/MapView.tsx
    - src/features/person-map/editor/LayersPanel.tsx
    - src/features/person-map/editor/LayersPanel.module.css
    - e2e/connectors.spec.ts
decisions:
  - Default showConnectorLines to TRUE so the toggle is a zero-visual-change addition
  - Gate only the ConnectorLayer child, never the physical <Layer>, to avoid canvas churn
  - Disable (not reset) the Relationship labels toggle while lines are hidden
metrics:
  duration: ~35 min
  completed: 2026-08-20
---

# Quick Task 260820-ceg: Session-only Relationship lines show/hide toggle Summary

Adds a checked-by-default "Relationship lines" checkbox to the map Layers panel that gates the `<ConnectorLayer>` render as session-only React state — no persistence, no schema change.

## What Was Built

The connector layer previously drew unconditionally: it lives in a dedicated non-interactive physical Konva layer that is deliberately *not* one of the user-facing `MapDoc.layers`, so the panel's eye icons could never reach it. The panel only exposed the connector *labels* toggle and the per-map connector colour.

- **`MapView.tsx`** — `const [showConnectorLines, setShowConnectorLines] = useState(true)` sits immediately after the existing `showConnectorLabels` state, with a comment stating it is session-only and intentionally unpersisted. The pair is threaded into `<LayersPanel>` directly above the `showConnectorLabels` pair, preserving the panel's top-to-bottom prop order.
- **`MapView.tsx` connector render** — the `<Layer listening={false}>` element stays mounted and unconditional; only its `<ConnectorLayer>` child is wrapped in `{showConnectorLines && (...)}`. Because `buildConnectors(...)` is called inside `ConnectorLayer`'s function body, the unrendered component never executes it — hiding is strictly cheaper than the always-on baseline. All six existing `<ConnectorLayer>` props are untouched.
- **`LayersPanel.tsx`** — `showConnectorLines: boolean` and `onShowConnectorLinesChange: (show: boolean) => void` are **required** props (a missing wire is a compile error). The new checkbox renders between "Show name labels" and "Relationship labels" using the same `styles.labelsToggle` + native `<input type="checkbox">` shape, with `data-testid="show-connector-lines-toggle"` and its visible text as a plain React child (T-03-01).
- **`LayersPanel.tsx` labels row** — now carries `disabled={!showConnectorLines}`, swaps to `${styles.labelsToggle} ${styles.toggleDisabled}` while hidden, and gains an explanatory `title`. Its `showConnectorLabels` value is never reset or mutated, so the curator's label choice survives an off/on round-trip. `data-testid="show-connector-labels-toggle"` is unchanged.
- **`LayersPanel.module.css`** — a new `.toggleDisabled` rule (`opacity: 0.55; cursor: not-allowed`) directly after `.labelsToggle`. `.labelsToggle` and every Appearance rule are untouched.
- **`e2e/connectors.spec.ts`** — a second `test(...)` appended, reusing the file's existing `seed()`, `connectorPoints()` scene-graph reader, and `test.beforeEach`. No new helper; the existing test is unmodified.

## Non-Goals Held

- No persistence: no `mapAppearance`, `db.meta`, `MapDoc`, or Dexie write was added anywhere.
- No sync or schema change.
- No change to connector colour handling (`appearance.connectorColor`, `setMapColor`, `clearMapColor`).
- `src/features/person-map/editor/connectors.ts` and `ConnectorLayer.tsx` are byte-for-byte unmodified.

## Task Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Session-only state, panel checkbox, ConnectorLayer render gate | `7d73041` |
| 2 | e2e regression for the toggle | `48c3a2f` |

## Verification

| Check | Result |
| ----- | ------ |
| `npm run typecheck` | PASS (clean) |
| `npx eslint` on the two changed `.tsx` files | 0 errors (6 pre-existing warnings, unchanged in kind) |
| `grep -c 'show-connector-lines-toggle' LayersPanel.tsx` | 1 |
| `grep -c 'showConnectorLines' MapView.tsx` | 4 |
| New e2e test `relationship lines can be hidden and shown from the Layers panel (session-only)` | PASS in 5/5 runs |
| Pre-existing e2e test in the same file | FLAKY — pre-existing, see below |

Typecheck passing is itself the end-to-end plumbing proof: the new `LayersPanel` props are required, so an unwired `MapView` would not compile.

### `npm run lint` (repo-wide) — pre-existing failures, out of scope

`npm run lint` exits 1 with **16 errors** across `src/app/App.tsx`, `src/features/connect/useSyncEngine.ts`, `src/features/profile/ProfileSidebar.tsx`, `src/features/pwa/usePersistentStorage.ts` and others (`react-hooks/set-state-in-effect`, `react-hooks/refs`, `no-useless-assignment`). None are in a file this task touched. Running ESLint against only the two changed `.tsx` files reports **0 errors**. Per the scope boundary these pre-existing failures were left alone.

## Pre-existing Flaky Test (NOT a regression)

**Test:** `e2e/connectors.spec.ts:107 › a relationship renders as a connector that follows a marker on drag and persists on release`

**Failure:**
```
Error: expect(received).toBe(expected) // Object.is equality
Expected: 300
Received: 200
  > 181 |   expect(persisted?.x).toBe(300);
```
The marker's post-`dragend` position has not flushed to Dexie before the test's `page.reload()`, so the reload reads the pre-drag seed value (200,160). This is a race inside the *existing* test between the async `upsertMarker` write and the immediate reload — it has nothing to do with connector rendering, and the assertion is a plain `db.markers.get()` read.

**Evidence it predates this change (decisive):** the three source files were temporarily reverted to the base commit `ed1a9ba` via `git checkout ed1a9ba -- <files>` and the test re-run. It failed there with the **byte-identical** error (`Expected: 300 / Received: 200`), with none of this task's code present. The files were then restored from `HEAD` and the worktree confirmed clean.

**Observed flake pattern across 7 runs:**

| Run | Command | Old test | New test |
| --- | ------- | -------- | -------- |
| 1 | `connectors.spec.ts` (2 workers) | FAIL | PASS |
| 2 | `connectors.spec.ts --workers=1` | PASS | PASS |
| 3 | `connectors.spec.ts --workers=2` | FAIL | PASS |
| 4 | old test only, `--repeat-each=2 --workers=2` | PASS ×2 | n/a |
| 5 | + `layers.spec.ts`, 2 workers | FAIL | PASS |
| 6 | **base source `ed1a9ba`**, + `layers.spec.ts`, 2 workers | **FAIL (identical)** | FAIL (expected — toggle absent) |
| 7 | `connectors.spec.ts --workers=1` | FAIL | PASS |

It fails at both `--workers=1` and `--workers=2` and passes at both, so it is genuinely non-deterministic and load-sensitive rather than a parallelism bug — consistent with the project's known "test false-fails under machine load" pattern. Run 6's new-test failure is the useful inverse signal: with the toggle absent the new test cannot find `show-connector-lines-toggle`, confirming it really exercises the new control rather than passing vacuously.

**Not fixed here** — it is an unrelated pre-existing defect in a test this plan's non-goals told it not to modify ("do not modify the existing test"). Recommend a follow-up quick task to await the `upsertMarker` write (poll `db.markers.get()` for the new position) before the reload.

## Deviations from Plan

None — the plan executed exactly as written. No deviation rule was triggered.

## Threat Flags

None. The change is purely additive client-side view state: no new user input is parsed, no persistence path is opened, no network call is made, and the checkbox's visible text is a static string literal rendered as a React text child (inherits T-03-01). All three registered threats (T-ceg-01/02/03) were dispositioned `accept` and remain accurate as built.

## Known Stubs

None.

## Self-Check: PASSED

- `src/features/person-map/MapView.tsx` — FOUND, contains `showConnectorLines` (4 occurrences)
- `src/features/person-map/editor/LayersPanel.tsx` — FOUND, contains `show-connector-lines-toggle`
- `src/features/person-map/editor/LayersPanel.module.css` — FOUND, contains `toggleDisabled`
- `e2e/connectors.spec.ts` — FOUND, contains the new test
- Commit `7d73041` — FOUND in git log
- Commit `48c3a2f` — FOUND in git log
- Working tree clean; `connectors.ts` and `ConnectorLayer.tsx` unmodified

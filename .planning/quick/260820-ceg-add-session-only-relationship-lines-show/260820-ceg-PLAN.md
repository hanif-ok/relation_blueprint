---
phase: 260820-ceg-add-session-only-relationship-lines-show
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/person-map/MapView.tsx
  - src/features/person-map/editor/LayersPanel.tsx
  - src/features/person-map/editor/LayersPanel.module.css
  - e2e/connectors.spec.ts
autonomous: true
requirements:
  - QUICK-260820-ceg

must_haves:
  truths:
    - "The Layers panel shows a 'Relationship lines' checkbox (data-testid show-connector-lines-toggle) positioned directly ABOVE the existing 'Relationship labels' checkbox."
    - "On open the new checkbox is CHECKED — connector lines draw exactly as they do today, so the default is a zero-visual-change state."
    - "Unchecking it removes every connector Arrow from the Konva scene graph; the connector labels vanish with them (they are painted by the same layer)."
    - "Re-checking it brings the connectors back at their correct image-space-anchored endpoints."
    - "The toggle is SESSION-ONLY: a page reload returns it to ON and nothing is written to mapAppearance or db.meta."
    - "While lines are hidden the 'Relationship labels' checkbox is disabled; its own checked value is preserved and honored again once lines are shown."
  artifacts:
    - path: "src/features/person-map/MapView.tsx"
      provides: "Session-only showConnectorLines useState (default true) + the ConnectorLayer render gate"
      contains: "showConnectorLines"
    - path: "src/features/person-map/editor/LayersPanel.tsx"
      provides: "Relationship lines checkbox + the showConnectorLines / onShowConnectorLinesChange prop pair"
      contains: "show-connector-lines-toggle"
    - path: "src/features/person-map/editor/LayersPanel.module.css"
      provides: "Muted styling for a toggle row that is disabled because lines are hidden"
      contains: "toggleDisabled"
    - path: "e2e/connectors.spec.ts"
      provides: "Regression e2e — toggling the lines off/on removes/restores the connector Arrow"
  key_links:
    - from: "src/features/person-map/MapView.tsx"
      to: "src/features/person-map/editor/LayersPanel.tsx"
      via: "showConnectorLines / onShowConnectorLinesChange prop pair (same shape as showConnectorLabels)"
      pattern: "onShowConnectorLinesChange"
    - from: "src/features/person-map/MapView.tsx"
      to: "src/features/person-map/editor/ConnectorLayer.tsx"
      via: "the ConnectorLayer element is rendered only when showConnectorLines is true, so buildConnectors never runs while hidden"
      pattern: "showConnectorLines &&"
---

<objective>
Give the curator a "Relationship lines" show/hide toggle in the map Layers panel. Today the connector lines ALWAYS draw — the panel only toggles their labels (`showConnectorLabels`, default OFF) and the per-map connector colour — so there is no way to clear the canvas of relationship lines when reading a dense map.

Purpose: `<ConnectorLayer>` lives in a dedicated non-interactive physical Konva layer that is deliberately NOT one of the user-facing `MapDoc.layers`, so the Layers-panel eye icons cannot reach it. This adds the one missing control, modeled exactly on the existing `showConnectorLabels` pair.

Output: A session-only `showConnectorLines` state in MapView (default TRUE), threaded into LayersPanel as a checkbox above "Relationship labels", gating the `<ConnectorLayer>` render, plus an e2e regression test.

Non-goals (explicitly out of scope — do NOT do these):
- NO persistence. Do not write to `mapAppearance`, `db.meta`, `MapDoc`, or any Dexie table. The toggle resets to ON on reload, by design.
- NO sync or schema changes.
- NO change to connector colour handling (`appearance.connectorColor`, `setMapColor`, `clearMapColor`).
- NO change to `connectors.ts` geometry or to `ConnectorLayer.tsx` itself.
</objective>

<context>
@.planning/STATE.md

# The map canvas — owns the session-only showLabels / showConnectorLabels state and renders the
# connector Konva layer around line 856
@src/features/person-map/MapView.tsx

# The panel that renders the existing "Show name labels" + "Relationship labels" checkboxes
@src/features/person-map/editor/LayersPanel.tsx
@src/features/person-map/editor/LayersPanel.module.css

# The connector render — context only; buildConnectors is called in its component body, so NOT
# rendering the component is what skips the geometry work. This file needs NO change.
@src/features/person-map/editor/ConnectorLayer.tsx

# The e2e this extends — already has the seed + connectorPoints Konva scene-graph helper
@e2e/connectors.spec.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Session-only showConnectorLines state, panel checkbox, and the ConnectorLayer render gate</name>
  <files>src/features/person-map/MapView.tsx, src/features/person-map/editor/LayersPanel.tsx, src/features/person-map/editor/LayersPanel.module.css</files>
  <action>
One atomic wiring change across three files. Keep every naming choice a mirror of the existing `showConnectorLabels` pair — that symmetry is the whole point.

1. `MapView.tsx` — immediately AFTER the existing `const [showConnectorLabels, setShowConnectorLabels] = useState(false);` (around line 366), add the sibling state:

   `const [showConnectorLines, setShowConnectorLines] = useState(true);`

   Default TRUE is load-bearing: lines currently always draw, so ON must reproduce today's canvas byte-for-byte. Head it with a short comment stating it is a session-only view preference that is intentionally NOT persisted (a reload returns it to ON) — so a future reader does not "fix" it by routing it through mapAppearance. Do not add a `useEffect`, a Dexie read, or a meta write for it.

2. `MapView.tsx` — at the `<LayersPanel>` render site (around line 790), pass the new pair immediately BEFORE the existing `showConnectorLabels` pair, preserving the panel's top-to-bottom prop order:

   `showConnectorLines={showConnectorLines}` and `onShowConnectorLinesChange={setShowConnectorLines}`

3. `MapView.tsx` — gate the connector render (around line 856). Keep the `<Layer listening={false}>` element MOUNTED and unconditional, and gate only its `<ConnectorLayer>` child:

   `<Layer listening={false}>{showConnectorLines && (<ConnectorLayer ... />)}</Layer>`

   Do NOT wrap or conditionally render the `<Layer>` itself. That physical layer is deliberately positioned between L0 (background) and L1 (content); mounting/unmounting it churns a real `<canvas>` element and risks disturbing the fixed physical-layer stack the surrounding comment depends on. Gating the child is sufficient for the "no geometry computed when hidden" requirement, because `buildConnectors(...)` is called inside the `ConnectorLayer` function body — an unrendered component never executes it. Leave every prop already passed to `<ConnectorLayer>` (links, markers, transform, dragOverride, showConnectorLabels, connectorColor) exactly as it is.

4. `LayersPanel.tsx` — in `LayersPanelProps`, add the new pair immediately BEFORE the existing `showConnectorLabels` / `onShowConnectorLabelsChange` declarations, both REQUIRED (not optional) so a missing wire is a compile error:

   `showConnectorLines: boolean;` and `onShowConnectorLinesChange: (show: boolean) => void;`

   Give each a JSDoc line matching the house style of its neighbours, noting the default is ON and that the value is session-only. Destructure both in the component signature in the same relative position.

5. `LayersPanel.tsx` — render the new checkbox in the toggle block, positioned AFTER the "Show name labels" toggle and BEFORE the existing relationship-label toggle. Use the same `<label className={styles.labelsToggle}>` + native `<input type="checkbox">` shape as its neighbours: `checked={showConnectorLines}`, `data-testid="show-connector-lines-toggle"`, `onChange={(e) => onShowConnectorLinesChange(e.target.checked)}`, and the visible text `Relationship lines` inside a `<span>`. Text renders as a plain React child (never dangerouslySetInnerHTML), consistent with T-03-01.

6. `LayersPanel.tsx` — make the EXISTING relationship-label toggle reflect that labels cannot show while lines are hidden: add `disabled={!showConnectorLines}` to its `<input>`, and swap the wrapper `className` to `styles.labelsToggle` when lines are shown or `` `${styles.labelsToggle} ${styles.toggleDisabled}` `` when hidden. Add a `title` on the wrapper explaining the disabled reason when lines are hidden (something to the effect of labels being drawn on the lines). Do NOT reset, clear, or otherwise mutate `showConnectorLabels` when lines are hidden — the curator's label choice must survive an off/on round-trip untouched. Keep its `data-testid="show-connector-labels-toggle"` unchanged.

7. `LayersPanel.module.css` — add a small `.toggleDisabled` rule directly after the existing `.labelsToggle` block: muted `opacity` (around 0.55) and `cursor: not-allowed`. Do not touch `.labelsToggle` itself or any Appearance-block rule.
  </action>
  <verify>
    <automated>npm run typecheck && npm run lint && grep -c 'show-connector-lines-toggle' src/features/person-map/editor/LayersPanel.tsx && grep -c 'showConnectorLines' src/features/person-map/MapView.tsx</automated>
  </verify>
  <done>typecheck and lint pass; both greps report at least one match. The Layers panel renders a checked-by-default "Relationship lines" checkbox above "Relationship labels"; unchecking it stops `<ConnectorLayer>` from rendering (so no line, no label, and no `buildConnectors` call), and the relationship-label checkbox is disabled-and-muted while lines are hidden. Because the props are required, a missing wire fails compilation. No Dexie/mapAppearance write was added anywhere.</done>
</task>

<task type="auto">
  <name>Task 2: e2e regression — toggling relationship lines off removes the connector Arrow, on restores it</name>
  <files>e2e/connectors.spec.ts</files>
  <action>
Append a SECOND `test(...)` to the existing `e2e/connectors.spec.ts`, reusing that file's existing `seed(page)` helper, `connectorPoints(page, relId)` Konva scene-graph reader, and the existing `test.beforeEach` (reset DB, suppress privacy notice, wait for `window.__rb`). Add no new helper and do not modify the existing test.

This file is the right home: the assertion target is a connector Arrow in the Konva scene graph, and `connectorPoints` already reads it by its `connector-<relId>` node name. It also follows the `e2e/layers.spec.ts` precedent that a Layers-panel toggle is proven by the resulting canvas render, not by pixel math.

Test name it something like: relationship lines can be hidden and shown from the Layers panel (session-only).

Body:
1. `const { relId } = await seed(page);` then `await page.reload();` and `await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });` — same preamble as the existing test.
2. Wait for the canvas: `await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({ timeout: 15_000 });`
3. Baseline (default ON): `await expect.poll(() => connectorPoints(page, relId), { timeout: 15_000 }).toEqual([200, 160, 400, 300]);` — the seed's persisted marker positions. Assert the new checkbox is checked: `await expect(page.locator('[data-testid="show-connector-lines-toggle"]')).toBeChecked();`
4. Uncheck it (`.uncheck()` on that locator) and assert the Arrow is GONE from the scene graph: `await expect.poll(() => connectorPoints(page, relId), { timeout: 15_000 }).toBeNull();` — `connectorPoints` already returns null when no matching Arrow node exists.
5. Assert the label toggle is now unavailable: `await expect(page.locator('[data-testid="show-connector-labels-toggle"]')).toBeDisabled();`
6. Re-check the lines toggle and assert the connector returns at the same anchored endpoints: poll `connectorPoints` back to `[200, 160, 400, 300]`, and assert the label toggle is enabled again.
7. Prove the session-only contract: `await page.reload();` + wait for `window.__rb`, wait for the canvas, then assert the lines toggle is checked again AND the connector is drawn (poll to the same points) — i.e. nothing persisted the hidden state.

Keep the toggle interactions on Playwright DOM locators (the panel is plain DOM); only the connector assertions go through the Konva scene graph. Use `expect.poll` for every connector read (the render is async), and reuse the 15_000 timeout constant style already in the file.
  </action>
  <verify>
    <automated>npx playwright test connectors.spec.ts</automated>
  </verify>
  <done>Both tests in `e2e/connectors.spec.ts` pass. The new test proves: lines draw by default, unchecking removes the connector Arrow from the scene graph, the label toggle disables while hidden, re-checking restores the connector at its anchored endpoints, and a reload returns the toggle to ON (nothing was persisted).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Purely additive client-side view state. No new user input is parsed, no new persistence path is opened, no network call is made, and no new trust boundary is crossed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ceg-01 | Tampering (XSS) | New "Relationship lines" checkbox label | accept | The visible text is a STATIC string literal rendered as a React text child inside a `<span>`; no user-derived value reaches this control. Inherits the surface-wide render-as-children invariant (T-03-01). No new sink. |
| T-ceg-02 | Information Disclosure | Hiding lines as a privacy affordance | accept | The toggle is presentational only — relationship links remain in Dexie and remain visible in the profile sidebar and the graph view. It is a legibility control, not a security control, and is documented as session-only so no user can mistake it for a durable setting. |
| T-ceg-03 | Denial of Service | Connector render churn on rapid toggling | accept | Toggling mounts/unmounts one React subtree inside an already-mounted Konva `<Layer>`; the geometry pass (`buildConnectors`) is SKIPPED entirely while hidden, so the hidden state is strictly cheaper than today's always-on baseline. |
</threat_model>

<verification>
- `npm run typecheck` — the new LayersPanel props are required, so a missing wire from MapView fails compilation (proves the plumbing is complete end-to-end).
- `npm run lint` — hook and style rules pass.
- `npx playwright test connectors.spec.ts` — end-to-end proof that the toggle actually removes and restores the connector Arrow, and that the state does not survive a reload.
- Manual sanity (optional, `npx vite --mode e2e`): open a map with relationships — lines are visible on first paint with the checkbox already ticked (no behavior change from today), the "Relationship labels" row greys out when lines are hidden, and a previously-ticked labels choice reappears when lines are shown again.
</verification>

<success_criteria>
- A "Relationship lines" checkbox (`show-connector-lines-toggle`) sits directly above "Relationship labels" in the Layers panel, styled with the same `labelsToggle` pattern.
- It defaults to ON, so the map renders exactly as it does today until the curator changes it.
- Unchecking it stops `<ConnectorLayer>` from rendering — lines and labels both disappear and `buildConnectors` is not called.
- The "Relationship labels" checkbox is disabled and muted while lines are hidden, and its own checked value survives an off/on round-trip.
- Nothing is persisted: no `mapAppearance`, `db.meta`, `MapDoc`, schema, or sync change; a reload restores the ON default.
- `connectors.ts` geometry and `ConnectorLayer.tsx` are unmodified.
- typecheck, lint, and `e2e/connectors.spec.ts` all pass.
</success_criteria>

<output>
Create `.planning/quick/260820-ceg-add-session-only-relationship-lines-show/260820-ceg-SUMMARY.md` when done.
</output>

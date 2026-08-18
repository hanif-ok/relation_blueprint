# Phase 7: Relationships & Map Visual Polish - Research

**Researched:** 2026-08-18
**Domain:** Konva 10.3 canvas text/vector styling + Cytoscape 3.34 layout/interaction, over an existing React 19 + Dexie 4 PWA
**Confidence:** HIGH (every library API below verified against the installed `node_modules` type definitions — the authoritative ground truth, cross-checked with Cytoscape official docs via Context7)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** MAP-ONLY color scope — exactly two colors: (a) marker **name-label text** color, (b) **connector line** color. Graph colors stay token-driven. Unified map+graph config **deferred**.
- **D-02:** Color input is a native `<input type="color">` picker — full freedom, zero new deps. Legibility guaranteed structurally by the halo (D-04), NOT by restricting the palette.
- **D-03:** Controls live in the existing map `LayersPanel.tsx`, beside the Phase-3 D-20 toggles. No new top-level view.
- **D-04:** Legibility via a **text halo/outline** — Konva `Text` stroke + subtle shadow on the label; a matching outline/shadow on connectors. Any user color reads over light AND dark background images.
- **D-05:** Colors are **PER-MAP**, keyed by map id in the Dexie `meta` table (same key/value pattern as `graphPositions`/`scopeSelection`; **NO schema migration** — [[schema-gate-dexie-false-positive]]).
- **D-06:** Defaults keep today's look — default label = `colors.paper`, default connector = warm hairline @55%. Existing DBs render identically until customized.
- **D-07:** Graph nodes become **always draggable** — relax `autoungrabify`. Cytoscape natively separates a **tap** (→ ProfileSidebar, D-12 preserved) from a **drag**. No mode toggle. Dragging is layout-only, NEVER mutates data.
- **D-08:** Manual positions **STICKY-persist** — save on `dragfree` to the `graphPositions` meta row. **Changes the D-13 invalidation rule:** a node-set change keeps everyone's saved positions and only auto-places the newcomer(s), never a full-blow-away `cose`.
- **D-09:** A **'Reset layout'** control re-runs fresh `cose` and clears saved manual positions.
- **D-10:** Focusing re-lays-out the WHOLE graph around the ego (all nodes visible, reorganized by distance) — not just today's highlight+pan.
- **D-11:** Ego arrangement is **concentric** (ego center, rings by hop-distance). Cytoscape built-in.
- **D-12:** Ego is a **transient overlay** — NEVER overwrites persisted base positions. Enter = opening from a profile (`egoId` path) OR tapping a node (tap = open profile AND re-ego). Exit = explicit 'Exit focus'/'Reset view' control; closing the ProfileSidebar also exits focus.
- **D-13:** **Two distinct resets — do not conflate.** *Reset layout* (D-09) discards manual positions + re-runs `cose`. *Exit focus / Reset view* (D-12) drops the transient ego overlay + returns to the saved base, discarding nothing. Resting state is always the base layout; ego is a transient overlay.

### Claude's Discretion
- Ego-layout params (spacing, `minNodeSpacing`, animate-vs-snap, breadthfirst-vs-concentric for directed) — within "ego at center." (Concentric is locked by D-11; params are open.)
- Graph toolbar placement of Reset-layout / Exit-focus controls.
- Halo/outline stroke color, width, shadow values — must guarantee contrast on light AND dark backgrounds.
- Per-map meta shape (one row vs one-row-per-map) & exact default hexes within the halo-backed constraint.
- Large-graph performance of per-tap concentric + reset cose — reuse Phase-4 `animate:false`/viewport patterns.

### Deferred Ideas (OUT OF SCOPE)
- Unified map+graph appearance config / customizable graph edge+node-label colors.
- Curated preset swatches (chose native picker).
- Cross-device sync of appearance & manual-position prefs (device-local `meta` only, matching unsynced `graphPositions`).
- Breadthfirst/hierarchical ego layout (chose concentric).
- Neighborhood-only ego focus / dim-hide non-neighbors (chose whole-graph re-layout).
- Any change to the relationship/entity data model.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POL-01 | Customizable per-map marker-label + connector colors, persisted, legible over light/dark via structural halo/casing | §POL-01 impl approach + Legibility (Konva `fillAfterStrokeEnabled` VERIFIED); `relativeLuminance` formula; `mapAppearance` meta pattern |
| POL-02 | Viewer-only draggable graph nodes with sticky persistence + Reset-layout | §POL-02 — relax `autoungrabify`, `dragfree` persist, partial-cache place-newcomer-only via `node.lock()` + `cose` (VERIFIED); Reset clears the row |
| POL-03 | Dynamic concentric ego focus that follows taps and restores base on exit | §POL-03 — `bfs` hop-distance → `concentric`/`levelWidth`, transient overlay guarded from `layoutstop` save, base-snapshot restore |
</phase_requirements>

## Summary

This is a **surgical extension** phase: three deliverables land inside already-shipped components (Phase-3 Konva map, Phase-4 Cytoscape graph) with **zero new dependencies**. Every needed API is present in the installed libraries — I verified them directly in `node_modules/konva@10.3.0/lib/Shape.d.ts` and `node_modules/cytoscape@3.34.0/index.d.ts` rather than trusting training data.

The three mechanisms are independent and low-risk: **(POL-01)** thread two per-map hex colors from a new `meta` row through `AvatarMarker`/`ConnectorLayer`, adding a luminance-derived halo (Konva `Text` `stroke`+`fillAfterStrokeEnabled`+shadow) and a cased connector (a second underlay `Arrow`); **(POL-02)** drop the `autoungrabify` prop, persist on `dragfree`, and replace the binary preset-vs-cose cache gate with a three-way gate that locks cached nodes and runs `cose` only over newcomers; **(POL-03)** compute hop-distance from the ego with `eles.bfs()` and feed it to the built-in `concentric` layout as a transient overlay that is snapshotted-and-restored and **must be fenced off from the existing auto-save `layoutstop` handler**.

**Primary recommendation:** Extend, don't rewrite. Add three pure, unit-testable helper modules (`relativeLuminance`/`outlineColorFor` in `color.ts`; a `mapAppearance.ts` read/merge helper; a `partitionCached` function in `positionCache.ts`) so the physics/canvas-opaque behavior is validated at the pure-function seam, with a thin layer of `__cyGraph`-driven Playwright interaction tests and one manual legibility UAT over a light image (the original Phase-04 gap). The single biggest landmine is that the existing `cy.on('layoutstop', savePositions)` will clobber the persisted base layout the moment the transient concentric ego runs — the save must be gated.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-map color choice (input + persist) | Browser/Client (React DOM: LayersPanel + native picker) | Database/Storage (Dexie `meta`) | Native `<input type=color>` is a DOM control; value is a local appearance pref in IndexedDB |
| Marker-label halo + connector casing | Browser/Client (Konva canvas render) | — | Pure per-render canvas paint; no persistence, no data |
| Luminance→outline derivation | Browser/Client (pure TS function) | — | Deterministic pure function on a hex string; belongs in `common/color.ts` |
| Node drag + tap disambiguation | Browser/Client (Cytoscape core events) | — | Cytoscape owns pointer semantics; no server/data tier involved |
| Sticky position persistence | Browser/Client (Cytoscape → positionCache) | Database/Storage (Dexie `meta` `graphPositions`) | Regenerable local layout cache, same tier as today |
| Ego concentric re-layout | Browser/Client (Cytoscape layout, transient) | — | View-state overlay; explicitly NOT persisted (D-12) |

## Standard Stack

**No new packages.** Everything is already installed and pinned. Versions confirmed from `node_modules/*/package.json`:

### Core (all pre-installed)
| Library | Installed Version | Purpose this phase | Why Standard |
|---------|-------------------|--------------------|--------------|
| konva | **10.3.0** | `Text` halo (`stroke`/`strokeWidth`/`fillAfterStrokeEnabled`/`lineJoin`/shadow), cased `Arrow` | [VERIFIED: node_modules/konva/lib/Shape.d.ts] all props present |
| react-konva | **19.2.5** | Declarative Konva in AvatarMarker/ConnectorLayer | tracks konva 10 |
| cytoscape | **3.34.0** | `concentric` layout, `eles.bfs()`, `node.lock()`/`unlock()`/`grabbable()`, `dragfree` event, `eles.layout()` subset | [VERIFIED: node_modules/cytoscape/index.d.ts] all APIs present |
| react-cytoscapejs | **^2.0.0** | `CytoscapeComponent` host; drop `autoungrabify` prop | passthrough to core |
| dexie | **4.4.4** | `db.meta` key/value row for `mapAppearance` (no migration) | [VERIFIED: src/db/schema.ts] `meta` table exists at version(1) |
| dexie-react-hooks | **4.4.0** | `useLiveQuery` for real-time color re-render | existing pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fixed `luminance > 0.5` slate/paper split (UI-SPEC) | WCAG contrast-ratio choice: pick whichever of slate/paper has the higher contrast ratio vs the fill | Strictly more robust for mid-luminance colors, still a pure function; recommend this — see §POL-01 |
| `node.lock()` + `cose` over all for newcomer placement | `cy.collection(newcomers).layout({name:'cose'}).run()` on the isolated subset | Subset layout ignores edges to the fixed neighbors, so newcomers won't gravitate toward their real connections — **lock+full-cose is better** [CITED: cytoscape docs — locked nodes are skipped by `canSet`] |
| `concentric` for ego | `breadthfirst {circle:true}` | D-11 locks concentric; breadthfirst is deferred |

**Installation:** none — `git diff package.json` MUST be empty for this phase (UI-SPEC "New dependencies: none").

## Package Legitimacy Audit

Not applicable — **this phase installs zero external packages** (native color input; built-in Cytoscape layouts; existing Konva/Dexie). No registry verification needed. If the planner's plan introduces any `npm install`, that is a scope violation of D-02 / UI-SPEC "New dependencies: none" and must be rejected.

---

## POL-01 — Customizable per-map marker-label + connector colors

### Implementation approach (surgical)

**1. Persistence helper — new module `src/features/graph/`… actually `src/features/person-map/mapAppearance.ts`** (mirror `positionCache.ts`, keep it map-side):
- Meta key `mapAppearance`; value shape `Record<mapId, { labelColor: string; connectorColor: string }>` (single row — discretion resolved in UI-SPEC, mirrors single-row `graphPositions`).
- Pure/async helpers: `loadAppearance(): Promise<Record<...>>`, `getMapAppearance(record, mapId): {labelColor, connectorColor}` (returns D-06 defaults when the map is absent — pure, unit-testable), `setMapColor(mapId, field, hex)` (read-merge-put), `clearMapColor(mapId, field)` (Reset → delete the field so it falls back to default).
- Store solid `#rrggbb` straight from the picker. The connector's 55%-alpha default is applied **at render** via the existing `hexToRgba` — store the sentinel/absent → render `CONNECTOR_HAIRLINE`; store a chosen hex → render it (UI-SPEC says solid; recommend rendering a user-chosen connector hex at full alpha since the casing now guarantees legibility, or keep 55% — planner discretion, note it).

**2. Live read — a hook in MapView** (colors, unlike the local `useState` toggles at `MapView.tsx:349/353`, MUST persist and live-update):
```ts
const apAll = useLiveQuery(() => loadAppearance(), []); // db.meta.get('mapAppearance')
const appearance = getMapAppearance(apAll ?? {}, map.id); // { labelColor, connectorColor }
```
`useLiveQuery` re-renders on every `meta.put`, so dragging the native picker (which fires `onChange` continuously) updates the canvas in real time (UI-SPEC IC-1 "live feedback").

**3. Thread the colors** — `MapView.tsx:889` passes `appearance.labelColor` to each `<AvatarMarker>`; `MapView.tsx:839` passes `appearance.connectorColor` to `<ConnectorLayer>`. Both already receive per-render props, so this is additive.

**4. LayersPanel controls (`LayersPanel.tsx`)** — add an "Appearance" block after the two existing toggles (`LayersPanel.tsx:255–276`). Two `<label>`+`<input type="color">` rows writing `setMapColor(map.id, 'labelColor'|'connectorColor', e.target.value)`, plus a per-row "Reset" button calling `clearMapColor`. LayersPanel already has `map` (so `map.id` is in scope) — pass the current `appearance` + the two writers down as props from MapView (LayersPanel is presentational; keep the write path in MapView/the helper).

### Legibility Contract — verified Konva API

**Marker name label** (`AvatarMarker.tsx:257–269`, the `showLabels && <Text>`): the label currently hardcodes `fill={colors.paper}`. Replace with the threaded `labelColor` and add the halo:
```tsx
// Source: verified against node_modules/konva/lib/Shape.d.ts (lines 45,50,55-60,183)
<Text
  ...
  fill={labelColor}                       // was colors.paper (D-06 default = colors.paper)
  stroke={outlineColorFor(labelColor)}    // luminance-opposite neutral
  strokeWidth={2}
  fillAfterStrokeEnabled                  // fill paints OVER the stroke's inner half → glyph keeps color+weight
  lineJoin="round"
  shadowColor="#000000"
  shadowOpacity={0.55}
  shadowBlur={3}
  shadowOffsetY={1}
  listening={false}
/>
```
- `fillAfterStrokeEnabled` [VERIFIED: node_modules/konva/lib/Shape.d.ts:45,183] — present on `Shape`, inherited by `Text`. Without it Konva strokes AFTER fill and a 2px stroke visibly eats the glyph. This prop is the crux of the technique.
- `lineJoin`, `shadowColor/Blur/Opacity/OffsetY` all [VERIFIED: same file, lines 50,55–60,169,173].

**Connector cased-line** (`ConnectorLayer.tsx:94–109`): render a **casing `Arrow` first**, then the colored `Arrow` on top, both inside the existing `<Group listening={false}>`:
```tsx
const line = selected ? colors.amber : connectorColor;   // connectorColor default → CONNECTOR_HAIRLINE
const casing = hexToRgba(outlineColorFor(line), 0.6);
// underlay casing (same points/arrowhead geometry, +2 width)
<Arrow points={[a.x,a.y,b.x,b.y]} stroke={casing} fill={casing}
       strokeWidth={(selected?2.5:1.75)+2} pointerLength={directed?10:0} pointerWidth={directed?8:0}
       perfectDrawEnabled={false} listening={false} />
// existing colored line on top (unchanged widths)
<Arrow ... stroke={line} fill={line} strokeWidth={selected?2.5:1.75} ... />
```
- Selected still swaps the **top** line to amber (`ConnectorLayer.tsx:95` logic preserved); the casing stays so a selected line is also legible. Amber discipline (A8) intact — user color applies to the resting state only.
- `perfectDrawEnabled={false}` + `listening={false}` preserved on both arrows (no hit-area/perf regression; the layer is already `listening={false}` in MapView).

### `relativeLuminance` + `outlineColorFor` (new pure helpers in `src/features/common/color.ts`)

WCAG relative luminance (sRGB → linear):
```ts
// Source: WCAG 2.x relative-luminance definition
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const toLin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const r = toLin(parseInt(h.slice(0,2),16));
  const g = toLin(parseInt(h.slice(2,4),16));
  const b = toLin(parseInt(h.slice(4,6),16));
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
```
`outlineColorFor(hex)` — two options, both pure/testable:
- **UI-SPEC rule:** `relativeLuminance(hex) > 0.5 ? colors.slate : colors.paper`.
- **Recommended (more robust for mid-luminance colors):** pick the neutral with the higher WCAG contrast ratio — `contrast(hex, slate) >= contrast(hex, paper) ? colors.slate : colors.paper`, where `contrast(a,b) = (Lmax+0.05)/(Lmin+0.05)`. This never mis-picks a same-luminance halo for a mid blue/green. **[ASSUMED]** the 0.5 threshold is adequate for the default palette; the contrast-ratio variant removes that assumption. Flag to planner — either is a one-line pure function; the contrast-ratio form is strictly safer and equally cheap.

### Landmines (POL-01)
- **Do NOT** persist the connector's alpha into the stored hex — the picker returns solid `#rrggbb`; apply alpha at render or the picker will show a wrong swatch on reload.
- The label `<Text>` is inside a `<Group scaleX/scaleY>` (marker transform bake, `AvatarMarker.tsx:178–180`). `strokeWidth` scales with the group — acceptable (the halo scales with the label), but note `strokeScaleEnabled` [VERIFIED: Shape.d.ts:47] exists if a constant-width halo is ever wanted.
- Keep both colors in the `meta` `mapAppearance` row, NOT on `MapDoc` — putting them on `MapDoc` would (a) require a schema-shape change to the entity and (b) make them sync-travelling authored data, violating D-05's "device-local, unsynced, like graphPositions."

---

## POL-02 — Viewer-only draggable graph nodes + sticky persistence + Reset layout

### Implementation approach

**1. Enable drag (`GraphView.tsx:262`)** — delete the `autoungrabify` prop from `<CytoscapeComponent>`. Nodes default to `grabbable: true`. Keep `boxSelectionEnabled={false}` (prevents marquee select). That is the entire "enable drag" change.

**2. Tap-vs-drag is automatic.** [VERIFIED: node_modules/cytoscape/index.d.ts — `grabbable()`/`lock()`/`unlock()` at 2033/2088/2093; event names are string literals, not typed] Cytoscape fires `tap` on a node only when pressed+released without a drag; an actual drag fires `grab → drag(…) → free`/`dragfree` and **does not fire `tap`**. So the existing `cy.on('tap','node', …onSelectRef)` at `GraphView.tsx:192` stays correct and continues to open the ProfileSidebar (D-12 bridge preserved). No mode toggle, no conditional.

**3. Sticky persist on `dragfree`** — add one handler in the once-attach `registerCy` (`GraphView.tsx:188–213`), beside the existing `layoutstop` save:
```ts
cy.on('dragfree', 'node', () => {
  void savePositions(cy).then(() =>
    loadPositions().then((positions) => setPosCache({ probed: true, positions })));
});
```
Use `dragfree` (fires only when the node was actually dragged) not `free` (fires on any release, including a plain tap-release). `savePositions` already snapshots every node's `position()` (`positionCache.ts:20–26`) — no change needed there.

**4. Partial-cache "place only the newcomer" (D-08 — supersedes D-13 full-invalidation).** This is the substantive change. Replace the binary gate with a three-way decision:

Add a pure function to `positionCache.ts` (unit-testable, mirrors the existing `hasCachedPositions` test):
```ts
export function partitionCached(positions: GraphPositions | undefined, nodeIds: string[]) {
  const cached = nodeIds.filter((id) => positions && Object.prototype.hasOwnProperty.call(positions, id));
  const missing = nodeIds.filter((id) => !cached.includes(id));
  return { cached, missing, allCached: missing.length === 0 && !!positions, noneCached: cached.length === 0 };
}
```
Layout decision in GraphView:
- `noneCached` → `{ name: 'cose', animate: false }` (today's fresh path, unchanged).
- `allCached` → `{ name: 'preset' }` (today's fast path, unchanged).
- **partial (some cached, ≥1 missing)** → declarative `{ name: 'preset' }` so cached nodes snap to their saved spots, THEN an imperative effect places the newcomers:
```ts
// After render, when partial cache detected:
cy.batch(() => cy.collection(cachedNodes).lock());       // lock() VERIFIED index.d.ts:2088
cy.layout({ name: 'cose', animate: false, fit: false, randomize: false }).run(); // moves ONLY unlocked newcomers
cy.nodes().unlock();                                     // unlock() VERIFIED index.d.ts:2093
// then savePositions(cy) → now covers the newcomer too (allCached next time)
```
[CITED: cytoscape docs — locked nodes are skipped via `canSet`/`beforePositionSet`, so `cose` over the full graph relaxes only the unlocked newcomers around the fixed anchors, giving relational placement.] This is why lock+full-cose beats `cy.collection(newcomers).layout()` on an isolated subset (the subset run ignores the newcomer's edges to fixed neighbors).

**5. Reset layout (D-09, IC-3)** — a `<button data-testid="graph-reset-layout">` in the toolbar (`GraphView.tsx:243–254`, beside the labels toggle). onClick: `await db.meta.delete('graphPositions')` (add `clearPositions()` to `positionCache.ts`), reset `posCache` to `{ probed:true, positions: undefined }` → `usePreset` false → `{name:'cose', animate:false}` re-runs and re-caches via the existing `layoutstop` handler.

### Landmines (POL-02)
- **The existing e2e test asserts the opposite of the new behavior.** `e2e/graph.spec.ts` (~line 100) asserts `grabbable === false` (viewer-only via autoungrabify). This assertion **flips to `true`** and MUST be updated. The plan must include editing that spec — it is a real behavior change, not a regression. The tap→sidebar assertion in the same test still passes (tap is emitted directly).
- **`layoutstop` fires for the partial-cache `cose` too** — that is desired (it re-caches the newcomer). But it will ALSO fire for the transient ego concentric layout in POL-03 — see the POL-03 landmine; the save must be gated so ego focus never persists.
- Update the GraphView file header comment (`GraphView.tsx:11–15`) which currently documents `autoungrabify` + "A node-set change invalidates the cache (→ fresh cose)" — both statements are now false.
- Dragging must never hit a repository write — the `dragfree` handler only calls `savePositions` (writes the `graphPositions` meta row, a regenerable convenience), never `db.people`/`relationshipLinks`. Viewer-only contract intact.

---

## POL-03 — Dynamic concentric ego focus (follows taps, restores base on exit)

### Key architectural insight (already wired)

Ego enter/exit is **already driven by the `egoId` prop** in `App.tsx:331–333`: `egoId` is derived from `profile` state, and `onSelectNode` → `setProfile(...)` changes it; `ProfileSidebar onClose` → `setProfile(null)` → `egoId=null`. So "tap follows focus" and "closing the sidebar exits focus" fall out of the existing data flow. **BUT** D-12/IC-4 require an **"Exit focus" button that drops the ego overlay while leaving the profile open** — that cannot be driven by `egoId` alone (clearing the profile would close the sidebar). 

**Recommendation:** introduce a **local `focusedId` state in GraphView**, seeded from the `egoId` prop and from node taps, and cleared independently by the Exit-focus button. `egoId → null` also clears it. The `.ego` amber class + concentric overlay key off `focusedId`, not the raw prop.

### Implementation approach

**1. Hop-distance via BFS** (pure-ish, unit-testable if extracted):
```ts
// eles.bfs VERIFIED index.d.ts:3773; visit callback signature (v,e,u,i,depth) VERIFIED index.d.ts:3278-3285
const hop: Record<string, number> = {};
cy.elements().bfs({
  roots: cy.getElementById(focusedId),
  visit: (v, _e, _u, _i, depth) => { hop[v.id()] = depth; },
  directed: false,
});
const maxHop = Math.max(0, ...Object.values(hop));
// disconnected nodes are never visited → park them in the outermost ring:
cy.nodes().forEach((n) => { if (hop[n.id()] === undefined) hop[n.id()] = maxHop + 1; });
```
Extract the `elements → hop map` computation as a pure function over a small adjacency structure so it unit-tests without a live core (see Validation Architecture).

**2. Run concentric as a transient overlay** [VERIFIED: ConcentricLayoutOptions index.d.ts:6337–6360 — `concentric(node)`, `levelWidth(node)`, `minNodeSpacing`, `startAngle`, `equidistant`, `animate` via AnimatedLayoutOptions]:
```ts
cy.layout({
  name: 'concentric',
  concentric: (n) => -hop[n.id()],      // ego (hop 0) → highest value → center; farther → outer
  levelWidth: () => 1,                  // each integer hop is its own ring
  minNodeSpacing: 40,                   // discretion; default acceptable
  animate: prefersReducedMotion ? false : 'end',  // honor prefers-reduced-motion (snap when reduced)
  animationDuration: 300,               // echoes the existing ego center/zoom animate (GraphView.tsx:183)
  fit: false,                           // preserve the user's pan/zoom (Phase-4 WR-01 discipline)
}).run();
```
- `concentric` returns a numeric value; higher = nearer center. `-hop` puts the ego (hop 0 → value 0, the max) at the center. `levelWidth: () => 1` makes each hop level a distinct ring (concentric groups nodes whose values fall within `levelWidth` of each other).
- `prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches` (IC-4 / Accessibility).

**3. CRITICAL — fence the transient layout off from the auto-save.** The once-attached `cy.on('layoutstop', () => savePositions(cy)...)` (`GraphView.tsx:202–212`) fires for **every** layout, including this concentric overlay — it would overwrite the persisted base positions with the ego arrangement, destroying D-12/D-13. **Guard it:**
```ts
const suspendSaveRef = useRef(false);
// in the layoutstop handler:  if (suspendSaveRef.current) return;
// around the concentric run:   suspendSaveRef.current = true; ...run(); on its layoutstop → suspendSaveRef.current = false;
```
(Or run concentric via `cy.elements().makeLayout(opts)` and listen to that layout instance's own `layoutstop` instead of the global `cy.on('layoutstop')` — `makeLayout`/`createLayout` VERIFIED index.d.ts:2212–2213. The ref-flag is simpler and localized.)

**4. Snapshot base + restore on exit** (D-13 "discards nothing"):
- **On enter focus** (before running concentric), snapshot current positions into a ref: `basePosRef.current = Object.fromEntries(cy.nodes().map(n => [n.id(), {...n.position()}]))`. This captures the resting base (manual or cose) even if it hasn't been re-cached.
- **On exit focus** (Exit-focus button OR `focusedId → null`): restore with **no layout, no save** — `cy.nodes().positions((n) => basePosRef.current[n.id()] ?? n.position())` [`positions()` VERIFIED index.d.ts:2070]. This is instant and never triggers `layoutstop`/save. Then `cy.nodes().removeClass('ego')`.
- Fallback if no snapshot (e.g., focus entered on first open): restore from `loadPositions()` via `layout:'preset'` with `suspendSaveRef` set.

**5. Re-ego on a new tap while focused** — the tap handler already calls `onSelectNode` → App sets `profile` → `egoId` changes. Mirror `egoId` into `focusedId`, and run an effect keyed on `focusedId` that: re-snapshots base only if entering from unfocused (don't overwrite the snapshot on a focus→focus change), moves the `.ego` class, recomputes `hop`, and re-runs concentric. The existing two ego effects (`GraphView.tsx:169–184`) are the extension points — the class-toggle effect stays; the center/zoom effect is superseded by the concentric run (which repositions rather than just pans).

**6. Exit-focus + Reset-view controls** — a `<button data-testid="graph-exit-focus">` in the toolbar, **conditionally rendered only when `focusedId != null`** (UI-SPEC: hidden not disabled). onClick → restore base (step 4) + clear `focusedId`. Distinct from Reset-layout (POL-02 step 5): Exit-focus discards nothing; Reset-layout clears the `graphPositions` row.

### Landmines (POL-03)
- **The `layoutstop` auto-save clobber is the #1 risk** — without the `suspendSaveRef` guard, entering ego focus silently overwrites the saved base and D-13 is violated (Exit-focus would "restore" to the ego arrangement). Verify explicitly.
- **`fit: false` on every ego/reset layout** — the existing code deliberately never touches the viewport on data ticks (WR-01, `GraphView.tsx:166–184`). A concentric run with default `fit:true` would yank the user's pan/zoom on every tap. Reuse the Phase-4 viewport-preserving posture.
- **Disconnected nodes** — `bfs` never visits nodes unreachable from the ego; they'd land at `concentric(undefined)` = NaN and disappear. Park them at `maxHop+1` (step 1). A link-less ego (single node) yields a valid single-center layout (UI-SPEC copywriting confirms no empty-state needed).
- **Don't double-drive the viewport** — the old `cy.animate({center, zoom})` effect (`GraphView.tsx:179–184`) should be removed or folded into the concentric run; running both fights for the viewport.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ring layout by hop-distance | A manual polar-coordinate placement loop | Cytoscape `concentric` + `concentric`/`levelWidth` callbacks | Built-in, handles spacing/overlap/sweep; D-11 |
| Hop-distance / shortest path | A hand-written BFS over your own adjacency map | `cy.elements().bfs({ roots, visit })` (depth arg) | Verified API; operates on the live graph incl. edge direction toggle |
| Keeping some nodes fixed during a layout | Custom "only move these" layout logic | `node.lock()` before `cose`, `unlock()` after | Cytoscape skips locked nodes in every layout (`canSet`) |
| Tap-vs-drag disambiguation | A pointer-move-threshold state machine | Cytoscape's native `tap` (suppressed on drag) + `dragfree` | Zero code; the whole point of relaxing `autoungrabify` |
| Text outline for legibility | Rendering the label twice (stroke copy under fill copy) | Konva `Text` `stroke`+`strokeWidth`+`fillAfterStrokeEnabled` | Single node; `fillAfterStrokeEnabled` paints fill over the stroke correctly |
| Color→outline contrast | Eyeballed per-color outline table | `relativeLuminance()` (WCAG) → slate/paper | Deterministic, pure, unit-testable; scales to any user hex |
| Per-map settings persistence | A new Dexie table / a `MapDoc` field | Existing `meta` key/value row (`mapAppearance`) | Established pattern; NO migration ([[schema-gate-dexie-false-positive]]) |

**Key insight:** every "hard" part of this phase is a first-class primitive in the libraries already installed — the work is wiring and three pure helpers, not algorithms.

## Common Pitfalls

### Pitfall 1: Transient ego layout overwrites the persisted base
**What goes wrong:** entering focus silently clobbers `graphPositions`; Exit-focus/D-13 restore to the wrong layout.
**Why:** `cy.on('layoutstop', savePositions)` is global and fires for the concentric overlay.
**How to avoid:** `suspendSaveRef` guard (or a `makeLayout` instance with its own stop listener). Verify by: focus → exit → positions equal pre-focus snapshot.
**Warning sign:** after tapping a node and exiting focus, nodes don't return to where they were.

### Pitfall 2: Layout steals the viewport
**What goes wrong:** every tap re-fits/zooms the graph, discarding the user's pan.
**Why:** layouts default `fit: true`.
**How to avoid:** `fit: false` on ego concentric and reset cose; keep the WR-01 "never touch viewport on data ticks" discipline.

### Pitfall 3: Stale e2e assertion after enabling drag
**What goes wrong:** `npm run test:e2e` fails on the `grabbable === false` assertion.
**Why:** that assertion encodes the old `autoungrabify` viewer-only mechanism.
**How to avoid:** update `e2e/graph.spec.ts` in the same plan; re-assert `grabbable() === true` AND that a `dragfree` persists a position AND that data rows are unchanged (viewer-only proof).

### Pitfall 4: Stroke eats the glyph
**What goes wrong:** a 2px halo makes 12px label text look bold/muddy.
**Why:** Konva strokes after fill by default.
**How to avoid:** `fillAfterStrokeEnabled: true` (verified present in konva 10.3).

### Pitfall 5: Connector alpha round-trips wrong
**What goes wrong:** the picker shows a translucent/incorrect swatch after reload.
**Why:** storing an `rgba()` string or baked alpha instead of the solid `#rrggbb`.
**How to avoid:** store solid hex; apply the 55% (or full) alpha at render via `hexToRgba`.

## Code Examples

### Verified concentric ego overlay
```ts
// Source: node_modules/cytoscape/index.d.ts:6337-6360 (ConcentricLayoutOptions), :3278/:3773 (bfs)
const hop: Record<string, number> = {};
cy.elements().bfs({ roots: cy.getElementById(focusedId),
  visit: (v, _e, _u, _i, depth) => { hop[v.id()] = depth; }, directed: false });
const maxHop = Math.max(0, ...Object.values(hop));
cy.nodes().forEach((n) => { if (hop[n.id()] === undefined) hop[n.id()] = maxHop + 1; });
suspendSaveRef.current = true;
cy.layout({ name: 'concentric', fit: false,
  concentric: (n) => -hop[n.id()], levelWidth: () => 1, minNodeSpacing: 40,
  animate: reduced ? false : 'end', animationDuration: 300 }).run();
// clear suspendSaveRef in this layout's stop (or via makeLayout instance)
```

### Verified lock + partial cose (place newcomer only)
```ts
// Source: node_modules/cytoscape/index.d.ts:2088/2093 (lock/unlock); cytoscape docs (canSet skips locked)
cy.batch(() => cy.collection(cachedNodeIds.map((id) => cy.getElementById(id))).lock());
suspendSaveRef.current = false; // this cose SHOULD persist (it places the newcomer)
cy.layout({ name: 'cose', animate: false, fit: false }).run();
cy.nodes().unlock();
```

## Runtime State Inventory

This phase adds appearance/layout prefs but performs **no rename/refactor/migration**. Still, the sticky/persistence semantics touch stored runtime state, so:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Dexie `meta` rows: **new** `mapAppearance` (Record<mapId,colors>); **existing** `graphPositions` gains new write triggers (`dragfree`) and a new clear path (Reset layout) | Code edit only; no data migration. Absent `mapAppearance` → D-06 defaults. Existing `graphPositions` rows remain valid (partial-cache reads them). |
| Live service config | None — fully client-side, no external service | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None — no dependency or `package.json` change | None. `git diff package.json` must be empty (verify). |

**Backward-compat note:** a DB that already has a `graphPositions` row from Phase 4 works unchanged — `partitionCached` treats a full existing cache as `allCached` (preset) exactly like `hasCachedPositions` does today. No `db.version(6)` is added or needed.

## State of the Art

| Old Approach (Phase 4) | New Approach (Phase 7) | When Changed | Impact |
|------------------------|------------------------|--------------|--------|
| `autoungrabify` — nodes not draggable | Nodes grabbable; drag persists on `dragfree` | POL-02 | Viewer-only preserved (drag is layout-only); one e2e assertion flips |
| Node-set change → full `cose` (D-13 invalidation) | Keep saved positions, place only newcomer (D-08) | POL-02 | Hand-arranged layouts survive edits |
| Ego = amber highlight + center/zoom pan (D-12) | Ego = whole-graph concentric re-layout, transient (D-10/D-11) | POL-03 | Ego reorganizes the graph; base never overwritten |
| Marker label hardcoded `colors.paper`, no outline | Per-map color + luminance halo | POL-01 | Legible over any background image |

**Deprecated/outdated:** the `cy.animate({center, zoom})` ego-pan effect (`GraphView.tsx:179–184`) is superseded by the concentric run — remove or fold in to avoid viewport contention.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `relativeLuminance > 0.5` threshold (UI-SPEC) reliably picks a legible halo for all user colors | POL-01 | A mid-luminance color could get a same-luminance halo on a matching background. **Mitigation provided:** use the WCAG contrast-ratio variant (strictly safer, same cost). |
| A2 | A user-chosen connector color renders best at full alpha (casing guarantees legibility) vs the 55% default alpha | POL-01 | Purely aesthetic; planner/UAT can pick. Store solid hex either way. |
| A3 | `minNodeSpacing: 40` + `levelWidth: () => 1` gives a readable ego layout on typical graphs | POL-03 | Rings may crowd on dense graphs; tunable param, non-blocking (D-11 discretion). |

**All library API claims above are VERIFIED against installed type defs — not assumed.**

## Open Questions (RESOLVED)

1. **Exit-focus vs profile lifecycle** — should the Exit-focus button leave the ProfileSidebar open (drop only the layout overlay) or also close the profile?
   - What we know: closing the sidebar exits focus (IC-4). D-12 lists Exit-focus and sidebar-close as both valid exits.
   - What's unclear: whether Exit-focus should keep the profile open.
   - Recommendation: keep the profile open (introduce local `focusedId` decoupled from `egoId` — see POL-03 step 0). This makes Exit-focus meaningfully distinct from just closing the sidebar.
   - **RESOLVED:** Plan **07-04** (ego focus) implements a local `focusedId` state in GraphView, seeded from the `egoId` prop and node taps but cleared independently by the Exit-focus button — so Exit-focus drops the concentric overlay while leaving the ProfileSidebar open (profile stays; only the transient layout is exited). `egoId → null` still clears `focusedId`. This closes the question per the recommendation (D-12).

2. **Connector default alpha** (A2) — resolve in planning or defer to UAT.
   - **RESOLVED:** Plans **07-01 / 07-02** store the solid `#rrggbb` straight from the picker (never bake alpha — Pitfall 5) and render a **user-chosen connector hex at full alpha** (the D-04 casing guarantees legibility), while a `null`/absent stored value falls back to the existing 55%-alpha `CONNECTOR_HAIRLINE` default via `hexToRgba` (D-06 — existing DBs render identically until customised). `getMapAppearance` returns `connectorColor: null` for the default so the render layer selects the hairline; a set hex renders opaque.

## Environment Availability

Skipped — no external tools/services/runtimes. Pure client-side change against already-installed libraries. `npm install` must NOT appear in any plan (verify `git diff package.json` is empty).

## Validation Architecture

Framework detected: **Vitest 4.1.9** (unit, jsdom + `fake-indexeddb` via `tests/setup.ts`) + **Playwright 1.61.1** (e2e, drives Konva/Cytoscape via exposed cores). Konva and Cytoscape both render to opaque `<canvas>` — pixels are not assertable and are invisible to AT — so the strategy is **push logic into pure functions (Vitest), drive interactions through the exposed cores (Playwright), and gate the one irreducibly-visual claim (legibility over a light image) as manual UAT.**

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 + Playwright 1.61.1 |
| Config file | `vitest.config.ts` (include `tests/**` + `src/**/*.test.ts`), `playwright.config.ts` |
| Quick run command | `npx vitest run tests/features/positionCache.test.ts tests/features/color.test.ts tests/features/mapAppearance.test.ts` |
| Full unit suite | `npm test` (`vitest run`) |
| E2E command | `npm run test:e2e` (requires e2e build mode — [[testbridge-requires-e2e-build-mode]]; `window.__rb` + `window.__cyGraph` are e2e-only) |

### What is unit-testable (pure functions — the primary validation seam)
| Unit | New/where | Test file | Asserts |
|------|-----------|-----------|---------|
| `relativeLuminance(hex)` | `common/color.ts` | `tests/features/color.test.ts` | Known values: `#FFFFFF`→~1.0, `#000000`→0, `#F4F1EA` (paper) high, `#1B2230` (slate) low |
| `outlineColorFor(hex)` | `common/color.ts` | same | light fill → slate; dark fill → paper; boundary colors pick higher-contrast neutral |
| `partitionCached(positions, nodeIds)` | `positionCache.ts` | extend `tests/features/positionCache.test.ts` | `allCached`/`noneCached`/partial `{cached,missing}` correct; stale extra entries ignored; newcomer isolated in `missing` |
| `getMapAppearance(record, mapId)` | `mapAppearance.ts` | `tests/features/mapAppearance.test.ts` | absent map → D-06 defaults; present map → stored colors; merge/clear semantics |
| ego hop-distance map (extract `computeHopLevels(adjacency, egoId)`) | new pure fn | `tests/features/egoLayout.test.ts` | ego→0; neighbor→1; 2-hop→2; disconnected→maxHop+1; single node→{ego:0} |
| `concentric` value derivation (`-hop`) + `levelWidth` mapping | same pure fn | same | monotonic: nearer hop → higher concentric value → inner ring |

These six pure functions cover the entire "brain" of all three deliverables. Following the existing `positionCache.test.ts` precedent (a `fakeCy` stub), any function that must read a core can be tested with a minimal fake — but prefer extracting the logic to a core-free function first (as `graphElements.ts` already does).

### What needs component/interaction testing (Playwright via exposed cores)
| Behavior | How | Asserts |
|----------|-----|---------|
| Tap still opens ProfileSidebar after drag enabled | `__cyGraph.getElementById(id).emit('tap')` (existing pattern, `graph.spec.ts`) | sidebar visible + correct name (regression guard for D-07) |
| Node is now grabbable | `__cyGraph.getElementById(id).grabbable()` | `=== true` (UPDATE the existing `=== false` assertion) |
| Drag persists + never mutates data | `node.position({x,y})` then `emit('dragfree')`; read back `db.meta.get('graphPositions')`; assert `db.relationshipLinks`/`db.people` unchanged | position saved; entity rows byte-identical (viewer-only proof) |
| Sticky partial cache | seed cached positions, add a person via `__rb`, reopen graph, assert existing nodes kept their positions and the newcomer got placed | D-08 place-newcomer-only |
| Reset layout clears cache | click `graph-reset-layout`, assert `graphPositions` row absent | D-09/IC-3 |
| Ego focus is transient | snapshot positions, `emit('tap')` on node B, click `graph-exit-focus`, assert positions equal the snapshot AND `graphPositions` unchanged | D-12/D-13 (the Pitfall-1 guard) |
| Color live-update | write `mapAppearance` via `__rb.db.meta.put`, assert marker/connector re-render (proxy: read the Konva node's `fill()` through a test-bridge, or assert no error + snapshot-free) | POL-01 IC-1; canvas fill is not directly assertable — see manual UAT |

Add e2e `data-testid`s: `graph-reset-layout`, `graph-exit-focus`, and LayersPanel `map-label-color`/`map-connector-color` inputs, mirroring the existing `graph-edge-labels-toggle`/`show-labels-toggle` convention.

### What is manual/visual UAT (the irreducible canvas-legibility claim — the original Phase-04 gap)
| Check | Why manual | Evidence |
|-------|-----------|----------|
| Marker label legible over a **light** background image (the Phase-04 UAT tests 6&7 white-on-white gap) | Halo contrast on real pixels is not assertable in headless canvas | Screenshot: light label + dark halo reads on a light map |
| Marker label legible over a **dark** background image | same | Screenshot: dark label + light halo reads on a dark map |
| Connector casing reads over both | same | Screenshot pair |
| Reduced-motion snap (no animation) on ego/reset with `prefers-reduced-motion` | Motion is perceptual | Manual toggle + observe snap |

The halo *derivation* is unit-tested (`outlineColorFor`); only the *rendered pixel contrast* is manual. This split closes the Phase-04 UAT gap by making the mechanism testable and scoping manual review to a small, specific screenshot checklist.

### Sampling Rate
- **Per task commit:** the relevant pure-function test file(s) — `npx vitest run tests/features/{color,positionCache,mapAppearance,egoLayout}.test.ts` (< 5s).
- **Per wave merge:** `npm test` (full unit suite). If it false-fails with fork-worker timeouts under load, re-run `npx vitest run --no-file-parallelism` to confirm environmental ([[vitest-forks-timeout-under-load]]).
- **Phase gate:** `npm test` green + `npm run test:e2e` (updated `graph.spec.ts` + new drag/ego/reset specs) green + the manual legibility screenshot checklist signed off before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/features/color.test.ts` — covers `relativeLuminance` + `outlineColorFor` (POL-01)
- [ ] `tests/features/mapAppearance.test.ts` — covers `getMapAppearance`/merge/clear (POL-01)
- [ ] `tests/features/egoLayout.test.ts` — covers hop-levels + concentric derivation (POL-03)
- [ ] Extend `tests/features/positionCache.test.ts` — add `partitionCached` + `clearPositions` cases (POL-02)
- [ ] Update `e2e/graph.spec.ts` — flip `grabbable` assertion; add drag-persist/viewer-only, reset-layout, ego-transient specs
- [ ] No framework install needed (Vitest + Playwright already present)

## Security Domain

`security_enforcement: true`, ASVS L1. This phase adds a native color picker, canvas styling, and layout persistence — no auth, network, crypto, or new data intake.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — (single-curator, local) |
| V5 Input Validation & Output Encoding | **yes** | Color values render into Konva `stroke`/`fill` (canvas paint) and the native picker constrains input to `#rrggbb`. **All labels remain Konva `Text` — never `dangerouslySetInnerHTML`** (T-04-01 / UI-SPEC). No user string is customized this phase (only colors). |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed hex from a tampered `meta` row driving canvas paint | Tampering | `#rrggbb` is inert as a Konva color; a bad value paints nothing/black, no code execution. Optionally coerce/validate in `getMapAppearance` (fall back to default on non-`#rrggbb`). |
| XSS via label rendering | Tampering/Elevation | Unchanged — labels are canvas `Text` (`AvatarMarker.tsx`, `ConnectorLabel`), never HTML; no injection surface added. |
| Layout cache tampering | Tampering | `graphPositions`/`mapAppearance` are regenerable local convenience; worst case a bad number → a mislaid node, corrected by Reset layout. No integrity requirement. |

No new attack surface. The only new input (a color hex from a native picker) is structurally constrained and rendered into a non-executable canvas context.

## Sources

### Primary (HIGH confidence)
- `node_modules/konva/lib/Shape.d.ts` (installed 10.3.0) — `fillAfterStrokeEnabled`, `lineJoin`, `shadow*`, `strokeScaleEnabled` — verified present.
- `node_modules/cytoscape/index.d.ts` (installed 3.34.0) — `ConcentricLayoutOptions` (concentric/levelWidth/minNodeSpacing), `bfs`/`SearchVisitFunction` (depth arg), `node.lock/unlock/grabbable/positions`, `eles.layout/makeLayout` — verified present.
- Repo source: `GraphView.tsx`, `positionCache.ts`, `graphElements.ts`, `AvatarMarker.tsx`, `ConnectorLayer.tsx`, `LayersPanel.tsx`, `MapView.tsx`, `App.tsx`, `db/schema.ts`, `common/color.ts`, `app/tokens.ts` — grounded the surgical anchors.
- `tests/features/positionCache.test.ts`, `e2e/graph.spec.ts` — established test patterns + the assertion that flips.

### Secondary (MEDIUM confidence)
- Cytoscape.js official docs via Context7 (`/cytoscape/cytoscape.js`) — concentric layout semantics; running a layout on a subset; locked nodes skipped via `canSet`/`beforePositionSet`.
- WCAG 2.x relative-luminance definition — the `relativeLuminance` formula.

### Tertiary (LOW confidence)
- None. All load-bearing claims are verified against installed code or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all APIs verified in installed type defs.
- Architecture (3 mechanisms): HIGH — grounded in the actual component code + verified APIs; extension points identified by line.
- Pitfalls: HIGH — the `layoutstop`-clobber and the stale e2e assertion are concrete, found in the real code.
- Validation: HIGH — pure-function seam + existing test precedents identified.

**Research date:** 2026-08-18
**Valid until:** ~2026-09-17 (stable — pinned local versions; no fast-moving external surface).

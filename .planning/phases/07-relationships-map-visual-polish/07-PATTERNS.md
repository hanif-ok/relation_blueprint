# Phase 7: Relationships & Map Visual Polish - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 12 (7 modified, 1 new source, 4 new/extended tests)
**Analogs found:** 12 / 12

> **Phase character:** surgical, viewer-only polish. Most files are EXTENDED, and their own
> current code is the source-of-truth analog. Only `mapAppearance.ts` and the new test files are
> greenfield — their analogs are `positionCache.ts` / `useScopeSelection.ts` (Dexie single-row
> `meta` pattern) and `positionCache.test.ts` (the `fakeCy` + `fake-indexeddb` pattern).
>
> **NOT SQL:** `src/db/schema.ts` is Dexie. The `mapAppearance` key rides the existing `meta`
> table — NO migration, NO `db.version()` bump ([[schema-gate-dexie-false-positive]]). Do not plan
> a schema-push task for this phase.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/person-map/mapAppearance.ts` **(NEW)** | store/persistence helper | CRUD (Dexie meta k/v) | `src/features/graph/positionCache.ts` + `src/features/search/useScopeSelection.ts` | exact (role + flow) |
| `src/features/graph/positionCache.ts` | store/persistence helper | CRUD (Dexie meta k/v) | itself (extend) | self |
| `src/features/graph/GraphView.tsx` | component (graph host) | event-driven (Cytoscape) | itself (extend) | self |
| `src/features/person-map/AvatarMarker.tsx` | component (Konva marker) | transform/render | itself (extend, ~l.257–269) | self |
| `src/features/person-map/editor/ConnectorLayer.tsx` | component (Konva layer) | transform/render | itself (extend, ~l.94–109) | self |
| `src/features/person-map/editor/LayersPanel.tsx` | component (DOM panel) | request-response (props+writers) | itself (extend, after ~l.255–276) | self |
| `src/features/common/color.ts` | utility (pure) | transform | itself (extend — add `relativeLuminance`/`outlineColorFor`) | self |
| `src/app/tokens.ts` | config (palette) | — | itself (reuse `colors`, no edit expected) | self |
| `src/db/schema.ts` (`db.meta`) | model (Dexie) | — | existing `meta` table (new key only, NO migration) | self |
| `tests/features/color.test.ts` **(NEW)** | test (unit) | — | `tests/features/positionCache.test.ts` | role-match |
| `tests/features/mapAppearance.test.ts` **(NEW)** | test (unit) | — | `tests/features/positionCache.test.ts` (`fakeCy`/`meta.clear`) | exact |
| `tests/features/egoLayout.test.ts` **(NEW)** | test (unit, pure fn) | — | `tests/features/positionCache.test.ts` | role-match |
| `tests/features/positionCache.test.ts` (extend) | test (unit) | — | itself | self |
| `e2e/graph.spec.ts` (update) | test (e2e) | — | itself (flip `grabbable` assertion) | self |

**NOTE — `src/features/graph/graphStyle.ts` is UNCHANGED this phase** (graph stays token-driven,
D-01). Touched-adjacent-but-not-modified — the planner must NOT edit it.

## Pattern Assignments

### `src/features/person-map/mapAppearance.ts` (NEW — store/persistence, Dexie meta CRUD)

**Analogs:** `src/features/graph/positionCache.ts` (single-row `meta` projection) + `src/features/search/useScopeSelection.ts` (live-read + read-merge-write + PURE resolver split).

**Pattern to replicate — single meta key + save/load (`positionCache.ts:16-32`):**
```ts
const GRAPH_POSITIONS_KEY = 'graphPositions';

export async function savePositions(cy: cytoscape.Core): Promise<void> {
  const map: GraphPositions = {};
  cy.nodes().forEach((n) => { map[n.id()] = { ...n.position() }; });
  await db.meta.put({ key: GRAPH_POSITIONS_KEY, value: map });
}

export async function loadPositions(): Promise<GraphPositions | undefined> {
  const row = await db.meta.get(GRAPH_POSITIONS_KEY);
  return row?.value as GraphPositions | undefined;
}
```
→ For `mapAppearance`: key `'mapAppearance'`, value `Record<mapId, {labelColor: string; connectorColor: string}>`. `loadAppearance()` mirrors `loadPositions()`.

**Pattern to replicate — PURE resolver with defaults (`useScopeSelection.ts:34-64`):**
```ts
export function resolveActiveFields(builtinKeys, customDefs, stored): string[] {
  const candidates = [...];
  return candidates.filter((key) => stored?.[key] !== false);
}
export function applyScopeChange(stored, fieldKey, checked): ScopeSelection {
  const next = { ...(stored ?? {}) };
  if (checked) delete next[fieldKey]; else next[fieldKey] = false;
  return next;   // never mutates input
}
```
→ `getMapAppearance(record, mapId)` is the pure resolver: absent map → D-06 defaults
(`{ labelColor: colors.paper, connectorColor: <sentinel/absent → CONNECTOR_HAIRLINE> }`), present → stored. `setMapColor(mapId, field, hex)` is the read-merge-put; `clearMapColor(mapId, field)` deletes the field (→ falls back to default). Store solid `#rrggbb` — apply alpha at render, never bake it in.

**Pattern to replicate — read-modify-write in a rw transaction (`useScopeSelection.ts:80-88`):**
```ts
await db.transaction('rw', db.meta, async () => {
  const current = (await db.meta.get(SCOPE_META_KEY))?.value as ScopeSelection | undefined;
  await db.meta.put({ key: SCOPE_META_KEY, value: applyScopeChange(current, fieldKey, checked) });
});
```
→ Use this exact transaction wrapper for `setMapColor`/`clearMapColor` so the continuously-firing native picker `onChange` composes over the latest map.

**Pattern to replicate — live read hook (`useScopeSelection.ts:74-78`):**
```ts
const stored = useLiveQuery(
  async () => ((await db.meta.get(SCOPE_META_KEY))?.value as ScopeSelection | undefined) ?? {}, []);
```
→ MapView uses `useLiveQuery(() => loadAppearance(), [])` so dragging the picker live-updates the canvas (IC-1).

---

### `src/features/graph/positionCache.ts` (EXTEND — store/persistence)

**Analog:** itself. Add a `partitionCached` PURE function (mirrors `hasCachedPositions:38-44`) and a `clearPositions()` (mirrors `savePositions` but `db.meta.delete`).

**Existing gate to extend (`positionCache.ts:38-44`):**
```ts
export function hasCachedPositions(positions, nodeIds): boolean {
  if (!positions) return false;
  return nodeIds.every((id) => Object.prototype.hasOwnProperty.call(positions, id));
}
```
→ `partitionCached(positions, nodeIds)` returns `{ cached, missing, allCached, noneCached }` using the same `hasOwnProperty` check. D-08: partial cache places only `missing` nodes. `clearPositions()` = `await db.meta.delete('graphPositions')` for D-09 Reset.

**Header comment change:** the file header (`positionCache.ts:7-10`) documents the OLD full-invalidation rule ("Adding a person/group … → the gate returns false → fresh `cose`"). Update it — D-08 supersedes this (keep saved positions, place only the newcomer).

---

### `src/features/graph/GraphView.tsx` (EXTEND — component, event-driven)

**Analog:** itself. Extend the once-attach `registerCy` (`GraphView.tsx:188-213`), the toolbar (`:243-254`), and the `<CytoscapeComponent>` props (`:255-264`).

**Drag enable (`GraphView.tsx:262`):** remove the `autoungrabify` prop; keep `boxSelectionEnabled={false}`. Tap-vs-drag is native.

**Sticky persist — add beside existing `layoutstop` (`GraphView.tsx:202-212`):**
```ts
cy.on('layoutstop', () => {
  void savePositions(cy).then(() =>
    loadPositions().then((positions) => setPosCache({ probed: true, positions })));
});
```
→ Add a sibling `cy.on('dragfree', 'node', …)` calling the same `savePositions→loadPositions→setPosCache` chain. Use `dragfree` (fires only on real drag) NOT `free`.

**Tap handler stays correct (`GraphView.tsx:192-195`):** the existing `cy.on('tap','node', …onSelectRef.current(...))` continues to open ProfileSidebar (D-12 bridge). Do not conditionalize it.

**CRITICAL — fence transient ego layout from the auto-save.** The global `cy.on('layoutstop', savePositions)` fires for EVERY layout incl. the concentric ego overlay → would clobber the base positions (D-13 violation). Guard with a `suspendSaveRef` (`if (suspendSaveRef.current) return;` at top of the handler), or run concentric via `cy.elements().makeLayout(opts)` with its own stop listener.

**Toolbar controls — copy the existing button (`GraphView.tsx:244-252`):**
```tsx
<button type="button" className={styles.toggle} aria-pressed={showEdgeLabels}
  data-testid="graph-edge-labels-toggle" onClick={() => setShowEdgeLabels((v) => !v)}>
  Relationship labels {showEdgeLabels ? 'on' : 'off'}
</button>
```
→ Add `data-testid="graph-reset-layout"` (always present) and `data-testid="graph-exit-focus"` (conditionally rendered only while `focusedId != null`). Reuse `styles.toggle` — no new button variant, no amber.

**Ego focus:** introduce local `focusedId` state seeded from the `egoId` prop and node taps, cleared independently by Exit-focus. The two existing ego effects (`GraphView.tsx:169-184`) are the extension points — class-toggle stays; the `cy.animate({center,zoom})` pan effect is SUPERSEDED by the concentric run (remove/fold to avoid viewport contention). All ego/reset layouts use `fit: false` (WR-01 viewport discipline).

**Header comment change (`GraphView.tsx:11-15`):** documents `autoungrabify` + "node-set change invalidates cache → fresh cose" — both now false; update.

---

### `src/features/person-map/AvatarMarker.tsx` (EXTEND — Konva marker, ~l.257–269)

**Analog:** itself. Current label hardcodes `fill={colors.paper}`.

**Current code (`AvatarMarker.tsx:257-269`):**
```tsx
{showLabels && (
  <Text x={-60} y={M.stemHeight + 4} width={120} text={person.name}
    fontFamily="Inter, system-ui, sans-serif" fontSize={12}
    fill={colors.paper} align="center" listening={false} />
)}
```
**Pattern to apply (Konva Text halo, D-04 — VERIFIED konva 10.3):** thread a `labelColor` prop (default `colors.paper`); add `stroke={outlineColorFor(labelColor)}`, `strokeWidth={2}`, `fillAfterStrokeEnabled`, `lineJoin="round"`, `shadowColor="#000000"`, `shadowOpacity={0.55}`, `shadowBlur={3}`, `shadowOffsetY={1}`. `fillAfterStrokeEnabled` is the crux (fill paints over the stroke's inner half so the glyph keeps color+weight). Note: an existing shadow'd `<Text>` pattern (avatar/stem) already sits above at `AvatarMarker.tsx:250-252` (`shadowOffsetY`, `listening={false}`) — mirror those prop names.

---

### `src/features/person-map/editor/ConnectorLayer.tsx` (EXTEND — Konva layer, ~l.94–109)

**Analog:** itself + `src/features/common/color.ts` (`hexToRgba`).

**Current code (`ConnectorLayer.tsx:94-109`):**
```tsx
const color = selected ? colors.amber : CONNECTOR_HAIRLINE;
<Arrow name={`connector-${id}`} points={[a.x, a.y, b.x, b.y]}
  stroke={color} fill={color} strokeWidth={selected ? 2.5 : 1.75}
  pointerLength={directed ? 10 : 0} pointerWidth={directed ? 8 : 0}
  perfectDrawEnabled={false} listening={false} />
```
**Pattern to apply (cased line, D-04):** `const line = selected ? colors.amber : connectorColor;` (threaded prop, default → `CONNECTOR_HAIRLINE`). Draw a FIRST underlay casing `Arrow` (same points/arrowhead geometry, `strokeWidth` +2, `stroke`/`fill` = `hexToRgba(outlineColorFor(line), 0.6)`), then the existing colored `Arrow` on top. Preserve `perfectDrawEnabled={false}` + `listening={false}` on both. Amber-on-select stays on the TOP line only (A8 discipline intact); casing remains under selected too.

---

### `src/features/person-map/editor/LayersPanel.tsx` (EXTEND — DOM panel, after ~l.255–276)

**Analog:** itself (its existing D-20 toggle rows) — presentational; keep the write path in MapView/`mapAppearance.ts`.

**Pattern to apply (IC-1):** add an "Appearance" block after the two existing toggles. Two labelled rows, each a native `<input type="color">` + 13px/600 `<label>` + a "Reset" affordance, writing `setMapColor(map.id, 'labelColor'|'connectorColor', e.target.value)` and `clearMapColor(...)`. `map` (hence `map.id`) is already in LayersPanel scope. Pass `appearance` + the two writers as props down from MapView. Add `data-testid` `map-label-color` / `map-connector-color` (mirror existing `show-labels-toggle` convention).

---

### `src/features/common/color.ts` (EXTEND — pure utility)

**Analog:** itself. Existing `hexToRgba` (`color.ts:7-13`) is the exact parse pattern to reuse:
```ts
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```
**Pattern to add:** `relativeLuminance(hex)` (WCAG sRGB→linear, same `replace('#','')` + `parseInt(slice,16)` parsing) and `outlineColorFor(hex)` (`relativeLuminance(hex) > 0.5 ? colors.slate : colors.paper`, or the safer contrast-ratio variant). Both PURE, unit-tested.

---

## Shared Patterns

### Dexie single-row `meta` key/value persistence (THE settings pattern)
**Sources:** `src/features/graph/positionCache.ts:16-32`, `src/features/search/useScopeSelection.ts:20-91`, `App.tsx` privacy notice.
**Apply to:** `mapAppearance.ts` (new colors row) and the extended `positionCache.ts` (`clearPositions`).
**Rule:** one `db.meta.put({key, value})` row per concern; PURE resolver split from async I/O; read-merge-write inside `db.transaction('rw', db.meta, …)`; `useLiveQuery` for live re-render. NO new table, NO `db.version()` bump ([[schema-gate-dexie-false-positive]]).

### Viewer-only contract (no data mutation from view interactions)
**Source:** PROJECT.md + Phase 4 D-13; `positionCache.ts` header ("regenerable local convenience, NOT authored data").
**Apply to:** GraphView drag/ego. `dragfree`/`layoutstop`/ego handlers write ONLY the `graphPositions`/`mapAppearance` meta rows — never `db.people`/`db.relationshipLinks`.

### Konva canvas-text XSS boundary
**Source:** `AvatarMarker.tsx:255-256` comment ("User text flows straight into the Konva Text `text` prop — never as raw HTML").
**Apply to:** all label/connector rendering — labels stay Konva `Text`; only colors are customized this phase. Never `dangerouslySetInnerHTML`.

### Amber reserved for selection + ego only (A8)
**Source:** `ConnectorLayer.tsx:95` (`selected ? colors.amber : …`), `graphStyle.ts` `.ego`/`:selected`.
**Apply to:** ConnectorLayer casing, GraphView toolbar buttons. User colors apply to the RESTING state only; selected/ego stay amber; toolbar buttons use neutral `styles.toggle`.

### Unit-test pattern — `fakeCy` stub + `fake-indexeddb` + `meta.clear()`
**Source:** `tests/features/positionCache.test.ts:14-29`.
```ts
function fakeCy(nodes) { return { nodes() { return { forEach(fn) {
  nodes.forEach((n) => fn({ id: () => n.id, position: () => ({ x: n.x, y: n.y }) })); } }; } } as unknown as cytoscape.Core; }
beforeEach(async () => { await db.meta.clear(); });
```
**Apply to:** `color.test.ts` (pure — no fake needed), `mapAppearance.test.ts` (`meta.clear` + async load/merge/clear), `egoLayout.test.ts` (pure `computeHopLevels(adjacency, egoId)` — extract logic to a core-free fn, no live core), extended `positionCache.test.ts` (`partitionCached` + `clearPositions`).

## No Analog Found

None. Every file either extends existing code (self-analog) or maps cleanly to the Dexie-meta / pure-helper / test precedents already in the codebase.

## Metadata

**Analog search scope:** `src/features/graph/`, `src/features/person-map/`, `src/features/search/`, `src/features/common/`, `src/db/`, `tests/features/`, `e2e/`.
**Files scanned/read:** `positionCache.ts`, `color.ts`, `useScopeSelection.ts`, `AvatarMarker.tsx` (l.250-272), `ConnectorLayer.tsx` (l.85-119), `GraphView.tsx` (l.185-264), `positionCache.test.ts`.
**Pattern extraction date:** 2026-08-18
</content>
</invoke>

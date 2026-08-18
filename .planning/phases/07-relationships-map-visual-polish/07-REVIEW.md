---
phase: 07-relationships-map-visual-polish
reviewed: 2026-08-18T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - e2e/graph.spec.ts
  - src/features/common/color.ts
  - src/features/graph/GraphView.tsx
  - src/features/graph/egoLayout.ts
  - src/features/graph/positionCache.ts
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/MapView.tsx
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/person-map/editor/LayersPanel.module.css
  - src/features/person-map/editor/LayersPanel.tsx
  - src/features/person-map/mapAppearance.ts
  - tests/features/color.test.ts
  - tests/features/egoLayout.test.ts
  - tests/features/mapAppearance.test.ts
  - tests/features/positionCache.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-18
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the POL-01/02/03 visual-polish surface: the pure legibility helpers (`color.ts`),
the per-map appearance persistence (`mapAppearance.ts`), the concentric ego overlay
(`egoLayout.ts`), the position cache (`positionCache.ts`), the graph host (`GraphView.tsx`),
the map connector/marker/panel components, and their tests.

Security posture is sound: all user-authored text (person names, layer names, relationship
labels) flows into Konva `Text`/React children, never `dangerouslySetInnerHTML`; and
`getMapAppearance`/`coerceHex` form a real trust boundary that strips any non-`#rrggbb` value
before it reaches the canvas (verified by `mapAppearance.test.ts`). No secrets, injection, or
unsafe deserialization found. The pure helpers are well-tested and correct (WCAG luminance,
BFS hop levels, three-way partition gate).

The defects found are correctness/consistency issues in the interaction wiring, not security or
crash bugs — hence no BLOCKERs. The most important is a save-fence gap: the newcomer-placement
effect can persist transient ego-focus positions over the saved base layout.

## Warnings

### WR-01: Partial-placement effect ignores `suspendSaveRef`, letting a transient ego layout clobber the saved base

**File:** `src/features/graph/GraphView.tsx:323-337`
**Issue:** The whole ego-focus design depends on `suspendSaveRef` fencing every layout-driven
save while a focus session is active (documented at lines 233-242, and enforced in the
`layoutstop` handler at line 370). The partial-cache placement effect, however, calls
`savePositions(cy)` **directly** (line 334) and never checks `suspendSaveRef`. If the live
queries change (people/groups/links) while a focus session is active — e.g. a background
Drive **pull** adds an entity, which is exactly the reactive path this component is built on —
`partition` changes, this effect runs, locks the currently-focused (concentric) node positions,
runs `cose`, and persists the resulting concentric coordinates to the `graphPositions` meta row.
That overwrites the persisted base the focus overlay was explicitly designed never to touch
(Pitfall 1). In-memory `basePosRef` still restores correctly on Exit focus, but the durable meta
row is now the transient concentric layout, so the next reopen shows the wrong layout. The e2e
"ego focus is transient" test only covers the no-concurrent-mutation path, so this slips through.
**Fix:** Honor the fence in the placement effect, mirroring the `layoutstop` guard:
```ts
useEffect(() => {
  const cy = cyRef.current;
  if (!cy) return;
  if (suspendSaveRef.current) return; // do not place/persist during an ego-focus session
  if (partition.noneCached || partition.missing.length === 0) return;
  // ...unchanged...
}, [partition]);
```
(Re-run placement after Exit focus by including the focus state in the dep set, or by resetting
`placedMissingRef` on exit, so a newcomer added during focus is still placed afterward.)

### WR-02: Custom connector colour renders fully opaque, contradicting the translucent-hairline default and the documented "alpha at render time" contract

**File:** `src/features/person-map/editor/ConnectorLayer.tsx:107-108`
**Issue:** `mapAppearance.ts` (lines 12-13, 70) states the solid `#rrggbb` is stored raw and
"alpha is applied at render time (Plan 02), NEVER baked here." But at render, a custom
connector colour is used as the stroke directly and opaque:
`const lineStroke = selected ? colors.amber : connectorColor ?? CONNECTOR_HAIRLINE;`.
The default path (`CONNECTOR_HAIRLINE`) is `hexToRgba(colors.hairline, 0.55)` — a 55%
hairline — while a user-chosen colour paints at 100% opacity. The promised render-time alpha is
never applied to the custom top line, so customising the connector colour also silently changes
its opacity/weight relative to the default aesthetic. The casing beneath it *is* alpha-wrapped
(`hexToRgba(outlineColorFor(lineHex), 0.6)`), making the inconsistency more visible.
**Fix:** Apply the same resting alpha the default uses when a custom colour is set:
```ts
const lineStroke = selected
  ? colors.amber
  : connectorColor
    ? hexToRgba(connectorColor, 0.55)
    : CONNECTOR_HAIRLINE;
```

### WR-03: `selectedRelationshipId` is never passed to `ConnectorLayer`, so the amber selected-connector path is unreachable on the map

**File:** `src/features/person-map/MapView.tsx:856-865` (and `ConnectorLayer.tsx:73-74`,
`connectors.ts:110-111`)
**Issue:** `ConnectorLayer` accepts `selectedRelationshipId` (defaulting to `null`) and threads
it into `buildConnectors`, which sets `selected` and drives the amber highlight + 2.5px width.
MapView renders `<ConnectorLayer …>` without ever passing `selectedRelationshipId`, so
`selected` is always `false` and no connector can ever render as selected. Either the feature is
incompletely wired (dead capability shipped) or the prop and its `buildConnectors`/render branch
are dead code that should be removed until relationship-selection exists on the map.
**Fix:** If map-side relationship selection is in scope, lift a `selectedRelationshipId` state in
MapView and pass it down; if not, drop the prop and the `selected`-amber branch so the surface
carries no unreachable code.

## Info

### IN-01: Redundant double persistence on newcomer placement

**File:** `src/features/graph/GraphView.tsx:332-337` with `367-380`
**Issue:** The placement effect runs `cy.layout({ name: 'cose', … }).run()` and then calls
`savePositions(cy) → loadPositions() → setPosCache(...)` itself, but the `cose` run also emits
`layoutstop`, whose once-registered handler runs the identical `savePositions → loadPositions →
setPosCache` chain. Two async chains write the same meta row and both call `setPosCache` with
identical data. It is idempotent today, but it is wasted IndexedDB writes and an avoidable race
on the shared `posCache` state.
**Fix:** Rely on the `layoutstop` handler for persistence (drop the explicit save in the
placement effect), or gate the placement effect's save so only one path persists.

### IN-02: Legibility/colour helpers do no input validation

**File:** `src/features/common/color.ts:9-14, 28-34`
**Issue:** `hexToRgba` and `relativeLuminance` assume a well-formed `#rrggbb`; a malformed input
would yield `rgba(NaN, NaN, NaN, a)` / `NaN` luminance rather than a safe fallback. Callers
currently only pass palette tokens or `coerceHex`-validated values, so this is safe today, but
the helpers are exported and reused (graph stylesheet, connectors, marker labels), so the
invariant is implicit and easy to break later.
**Fix:** Either document the `#rrggbb`-only precondition on the exported signatures, or guard
internally (e.g. return a default when the parsed channels are `NaN`).

---

_Reviewed: 2026-08-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

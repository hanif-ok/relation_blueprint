---
phase: 04-relationships-graph
reviewed: 2026-07-03T12:15:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - e2e/browse-and-create.spec.ts
  - e2e/connectors.spec.ts
  - e2e/graph.spec.ts
  - e2e/relationships.spec.ts
  - src/app/App.tsx
  - src/db/repository.ts
  - src/db/schema.ts
  - src/domain/schemas.ts
  - src/domain/types.ts
  - src/features/graph/GraphView.module.css
  - src/features/graph/GraphView.tsx
  - src/features/graph/graphElements.ts
  - src/features/graph/graphStyle.ts
  - src/features/graph/positionCache.ts
  - src/features/nav/NewEntityMenu.tsx
  - src/features/nav/ViewSwitcher.tsx
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/MapView.tsx
  - src/features/person-map/connectors.ts
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/person-map/editor/LayersPanel.tsx
  - src/features/profile/AddRelationshipDialog.module.css
  - src/features/profile/AddRelationshipDialog.tsx
  - src/features/profile/ProfileSidebar.module.css
  - src/features/profile/ProfileSidebar.tsx
  - src/features/profile/relationships.ts
  - src/types/react-cytoscapejs.d.ts
  - tests/backup/roundtrip.relationships.test.ts
  - tests/db/repository.relationships.test.ts
  - tests/features/connectors.test.ts
  - tests/features/graphElements.test.ts
  - tests/features/positionCache.test.ts
  - tests/features/relationships.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-03T12:15:00Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

This is a re-review of the current tree. The prior review's BLOCKER (wrong-marker "Remove from
map") and WR-01…WR-06 findings have all been remediated and verified in the current code: the
clicked marker id is now threaded through `onSelect`/`profile.markerId` (with an active-map-scoped
fallback), `deleteEntity` emits delete `ChangeEvent`s for every cascaded marker and relationship-link
and folds cascaded-link media into the GC candidate set, `layoutstop` re-saves positions via
`cy.on` (not `cy.one`), `toGraphElements` drops edges whose endpoint nodes are missing,
`buildConnectors` picks the primary placement deterministically (`updatedAt` then `id`), and
`AddRelationshipDialog.save()` is wrapped in `try/catch/finally` with an inline error.

The Phase-4 slice is otherwise solid: the closed `people|groups` endpoint enum is enforced at both
the repository write path and the backup-import gate, every user string renders as a React child or
Konva canvas text (no `dangerouslySetInnerHTML`, `eval`, or injected HTML), and the pure projection
helpers are DOM-free and well tested. No BLOCKER-level correctness, security, or data-loss defect
was found in the current tree. The remaining findings are UX-robustness and quality/consistency
issues.

## Warnings

### WR-01: Graph ego effect resets pan/zoom on every unrelated data change

**File:** `src/features/graph/GraphView.tsx:166-176`
**Issue:** The ego-emphasis effect is keyed on `[egoId, elements]` and unconditionally calls
`cy.animate({ center: { eles: node }, zoom: 1.5 }, ...)` whenever an `egoId` is present. `elements`
(the `useMemo` at lines 89-98) is rebuilt whenever `people`/`groups`/`links` change — each is a
fresh array reference from `useLiveQuery` on *every* DB mutation. While a person/group profile is
open, the graph's `egoId` is set from `App.tsx:331`, so any edit anywhere in the database (renaming
an unrelated person, adding a relationship, etc.) re-runs this effect and yanks the viewport back to
the ego node at a fixed zoom of 1.5, discarding the user's manual pan/zoom. The intent (per the
comment, D-12) is to center *when the graph is opened from that entity*, not on every data tick.
**Fix:** Split the reactive class-toggle from the one-time center/zoom:
```tsx
// Toggle the ego class whenever elements rebuild.
useEffect(() => {
  const cy = cyRef.current;
  if (!cy) return;
  cy.nodes().removeClass('ego');
  if (egoId) cy.getElementById(egoId).addClass('ego');
}, [egoId, elements]);

// Center/zoom ONLY when the ego target itself changes.
useEffect(() => {
  const cy = cyRef.current;
  if (!cy || !egoId) return;
  const node = cy.getElementById(egoId);
  if (node.nonempty()) cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
}, [egoId]);
```

### WR-02: Connector hairline color hardcoded as an rgba literal instead of derived from the token

**File:** `src/features/person-map/editor/ConnectorLayer.tsx:26`
**Issue:** `const CONNECTOR_HAIRLINE = 'rgba(216,210,196,0.55)';` hardcodes the palette value, tying
it to `colors.hairline` only by comment. The sibling graph stylesheet (`graphStyle.ts:19-28`)
computes the identical color from the token via `hexToRgba(colors.hairline, 0.55)`, and its header
mandates that colors read from tokens "never an inline literal, so the graph can never drift from
the canvas/DOM palette." The connector layer violates that convention: if `colors.hairline` is
retuned, the on-canvas connectors silently drift out of sync with the graph edges and the rest of
the palette. The connectors and the graph edges are meant to represent the same relationship data in
the same hairline color.
**Fix:** Derive from the token instead of the literal (extract `hexToRgba` to a shared util or import
it):
```tsx
import { colors } from '@/app/tokens';
import { hexToRgba } from '@/features/graph/graphStyle'; // or a shared color util
const CONNECTOR_HAIRLINE = hexToRgba(colors.hairline, 0.55);
```

### WR-03: Connector label pill is not centered on the segment midpoint despite the comment

**File:** `src/features/person-map/editor/ConnectorLayer.tsx:77-85`
**Issue:** The `Label` is placed at `x={(a.x + b.x) / 2} y={(a.y + b.y) / 2}` and the `Tag` carries
`offsetX={0}` with the comment "Center the pill on the midpoint (Label anchors at its top-left by
default)." `offsetX={0}` applies no offset (and there is no `offsetY`), so the pill's top-left corner
sits on the midpoint — the label renders down-and-right of the connector rather than centered on it.
The comment asserts behavior the code does not implement, so connector labels are visually
misaligned. Cosmetic, but the misleading comment will mislead the next maintainer.
**Fix:** Offset the `Label` by half the rendered pill size (measure the text+padding box and set
`offsetX`/`offsetY` to half of each), or, if the current placement is intended, correct the comment
to match.

## Info

### IN-01: `initialsOf` duplicated across two components

**File:** `src/features/profile/ProfileSidebar.tsx:129-134` and `src/features/person-map/AvatarMarker.tsx:36-41`
**Issue:** The "up to two initials from a name" helper is implemented independently in both files
with identical logic. Divergence is a future risk (one gets a fix or locale tweak the other misses).
**Fix:** Extract a single `initialsOf` into a shared util (e.g. `@/features/common/initials.ts`) and
import it in both places.

### IN-02: In-session graph position cache is never refreshed, so the preset fast-path is disabled until reopen

**File:** `src/features/graph/GraphView.tsx:69-77, 87, 194-196` and `src/features/graph/positionCache.ts:20-26`
**Issue:** `posCache` is loaded exactly once on mount. After a node is added, `hasCachedPositions`
returns false, `cose` re-runs, and the `layoutstop` handler (correctly, per the WR-03 fix) writes
fresh positions to Dexie — but the in-memory `posCache.positions` React state is never updated. For
the remainder of the session `usePreset` stays false, so the D-13 `preset` fast-path stays disabled
until the app is reopened (a fresh `loadPositions` then picks up the saved cache). Behavior is
correct on reopen, and this is performance-only (out of scope as a v1 defect), noted for awareness.
**Fix:** After `savePositions(cy)` in the `layoutstop` handler, also refresh state — e.g.
`void loadPositions().then((positions) => setPosCache({ probed: true, positions }))` — so a
subsequent same-node-set render can re-enter the preset path without a reload.

---

_Reviewed: 2026-07-03T12:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

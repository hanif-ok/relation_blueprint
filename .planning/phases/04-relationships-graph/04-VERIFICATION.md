---
phase: 04-relationships-graph
verified: 2026-07-03T16:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: No — initial verification
---

# Phase 4: Relationships & Graph Verification Report

**Phase Goal:** A user can author relationships in an entity's details and immediately see them projected two ways — as data-driven connectors between markers on a map and as a viewer-only relationship graph.
**Verified:** 2026-07-03T16:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can define relationships in an entity's details: person↔person, person↔group, group↔group | ✓ VERIFIED | `AddRelationshipDialog.tsx` picker pool is built exclusively from `db.people`/`db.groups` (l.79-89, never `db.maps`); `createRelationshipLink` → `RelationshipLinkSchema` enforces `z.enum(['people','groups'])` on both endpoints (`src/domain/schemas.ts` l.140-155). `tests/db/repository.relationships.test.ts` covers person↔person/person↔group/group↔group create + Location-endpoint rejection — 38/38 targeted unit tests independently re-run GREEN. |
| 2 | A relationship-link can carry its own data (label, date, notes) | ✓ VERIFIED | `RelationshipLink`/`RelationshipLinkSchema` carry `label`/`date`/`notes` (pre-existing Phase-2 shell, still present); `AddRelationshipDialog` writes label/date/notes on create; `tests/backup/roundtrip.relationships.test.ts` proves label/date/notes + endpoints survive an export→import round-trip. E2E `e2e/relationships.spec.ts` independently re-run: authoring a link with label "collaborator" shows the label on both endpoints' Relationships rows. |
| 3 | Authored relationships appear automatically as data-driven connectors between markers on the map (not hand-drawn), updating when markers move | ✓ VERIFIED | `src/features/person-map/connectors.ts` `buildConnectors` derives geometry purely from `db.relationshipLinks` + marker positions (D-07 person↔person-only render rule, B6 primary-only, D-10 never persisted). `MapView.tsx` inserts a `<Layer listening={false}>` between L0 (background) and L1 (content, verified by reading JSX order l.809-844) feeding `ConnectorLayer` from a live `db.relationshipLinks.toArray()` query. `AvatarMarker.onDragMove` (rAF-throttled) pushes live position to a transient MapView state the connector overlays; `onDragEnd` persists + clears. Independently re-ran `e2e/connectors.spec.ts`: connector renders at seeded positions, tracks the marker mid-drag to a new position, and re-persists/recomputes after reload — PASSED. |
| 4 | User can open a viewer-only relationship graph visualizing how people and groups connect | ✓ VERIFIED | `ViewSwitcher.tsx` adds a `'graph'` ViewKey + Share2 nav entry (l.32/56); `App.tsx` routes `activeView==='graph'` to `GraphView` (l.303-307). `GraphView.tsx` hosts react-cytoscapejs with `autoungrabify` + `boxSelectionEnabled={false}` (viewer-only, l.240-241), `cy.on('tap','node', ...)` opens the entity's `ProfileSidebar` via the existing AT bridge, `cy.one('layoutstop', ...)` caches positions via `positionCache.ts` over `db.meta`. `toGraphElements` (pure, DOM-free) maps people/groups→nodes, links→edges, drops endpoint-less shells. Independently re-ran `e2e/graph.spec.ts`: tapping Alice's node opens her ProfileSidebar, the node is confirmed non-grabbable, and no add/edit relationship control exists on the graph surface — PASSED. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/types.ts` | `RelationshipEndpointType` + optional endpoint fields | ✓ VERIFIED | l.232, l.245-268 — confirmed by direct read |
| `src/domain/schemas.ts` | `RelationshipLinkSchema` endpoint enum | ✓ VERIFIED | l.140 `RelationshipEndpointTypeSchema`, l.153/155 fields on schema |
| `src/db/schema.ts` | Dexie `version(5)` index-only upgrade | ✓ VERIFIED | l.129-131, no `.upgrade()` callback (index-only, correct for Dexie) |
| `src/db/repository.ts` | `listRelationshipsFor`, cascade, endpoint fields | ✓ VERIFIED | l.198 cascade in `deleteEntity`, l.506-508 `listRelationshipsFor` (indexed `.or()` union), l.474-498 `createRelationshipLink` |
| `src/features/profile/relationships.ts` | Pure row/glyph/endpoint helpers | ✓ VERIFIED | 87 lines, `buildRelationshipRows`/`resolveOtherEndpoint`/`directionGlyphFor`, no DOM/Dexie import |
| `src/features/profile/AddRelationshipDialog.tsx` | Entity picker + direction + label/date/notes → `createRelationshipLink` | ✓ VERIFIED | 279 lines; picker pool people/groups only; Mutual-default direction; calls `createRelationshipLink` |
| `src/features/profile/ProfileSidebar.tsx` | Relationships section, reactive, orphan guard | ✓ VERIFIED | 647 lines; `isRelationshipHost` gate (l.251), `useLiveQuery(listRelationshipsFor)` (l.254), "(deleted person/group)" muted row (l.465-471) |
| `src/features/nav/NewEntityMenu.tsx` | relationship-links item removed | ✓ VERIFIED | ITEMS array (l.20-23) contains only People/Location/Group |
| `src/features/person-map/connectors.ts` | Pure connector geometry | ✓ VERIFIED | 107 lines; D-07 render rule, B6 primary-only, drag override, no DOM |
| `src/features/person-map/editor/ConnectorLayer.tsx` | Konva Arrow render | ✓ VERIFIED | 101 lines |
| `src/features/person-map/MapView.tsx` | Connectors layer between L0/L1, `listening={false}` | ✓ VERIFIED | l.836 `<Layer listening={false}>` positioned after L0 (l.813-828), before L1 content |
| `src/features/person-map/AvatarMarker.tsx` | `onDragMove` prop | ✓ VERIFIED | Wired in MapView l.894, rAF-throttled per SUMMARY + read of MapView transient state |
| `src/features/person-map/editor/LayersPanel.tsx` | "Relationship labels" toggle, default OFF | ✓ VERIFIED | l.49/62/271/275; MapView `showConnectorLabels` initial state `useState(false)` (l.351) |
| `src/features/graph/graphElements.ts` | Pure `toGraphElements` | ✓ VERIFIED | 54 lines; drops links missing fromId/toId, normalizes `directed` |
| `src/features/graph/graphStyle.ts` | Token-driven stylesheet | ✓ VERIFIED | present, referenced by GraphView |
| `src/features/graph/positionCache.ts` | `savePositions`/`loadPositions`/`hasCachedPositions` | ✓ VERIFIED | 44 lines, over `db.meta` |
| `src/features/graph/GraphView.tsx` | react-cytoscapejs host, viewer-only | ✓ VERIFIED | 245 lines; `autoungrabify`, `boxSelectionEnabled={false}`, tap→sidebar, object-URL revoke (l.130/137) |
| `src/features/nav/ViewSwitcher.tsx` | `'graph'` ViewKey + Share2 entry | ✓ VERIFIED | l.32, l.56, `NO_PILL` includes 'graph' |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `AddRelationshipDialog.tsx` | `repository.ts createRelationshipLink` | direct call on save | ✓ WIRED | l.99 `createRelationshipLink({...})` |
| `ProfileSidebar.tsx` | `repository.ts listRelationshipsFor` | `useLiveQuery` | ✓ WIRED | l.254, gated on `isRelationshipHost` |
| `ConnectorLayer.tsx` | `coords.ts imageToStage` | shared composition | ✓ WIRED | `connectors.ts` l.17/84 |
| `MapView.tsx` | `db.schema.ts relationshipLinks` | `useLiveQuery(() => db.relationshipLinks.toArray())` | ✓ WIRED | l.207 |
| `AvatarMarker.tsx` | `MapView.tsx` transient drag state | `onDragMove` | ✓ WIRED | l.894 wiring + connectors.spec.ts drag-follow proof |
| `GraphView.tsx` | `graphElements.ts toGraphElements` | elements built from live query | ✓ WIRED | confirmed by read + graphElements.test.ts |
| `GraphView.tsx` | `ProfileSidebar.tsx` (AT bridge) | `cy.on('tap','node')` → `onSelectNode` | ✓ WIRED | l.184-189, graph.spec.ts tap→sidebar proof |
| `positionCache.ts` | `db.meta` | `graphPositions` key | ✓ WIRED | confirmed by read + positionCache.test.ts |

### Behavioral Spot-Checks / Independent Re-Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted unit suite (repository, backup, relationships, connectors, graphElements, positionCache) | `npx vitest run tests/db/repository.relationships.test.ts tests/backup/roundtrip.relationships.test.ts tests/features/relationships.test.ts tests/features/connectors.test.ts tests/features/graphElements.test.ts tests/features/positionCache.test.ts` | 6 files / 38 tests passed | ✓ PASS |
| Full unit suite | `npx vitest run` | 53 files / 320 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | clean, no output | ✓ PASS |
| Production/E2E build | `npm run build:e2e` | built successfully | ✓ PASS |
| E2E: authoring appears on both endpoints (REL-01/02) | `npx playwright test e2e/relationships.spec.ts` | 1 passed | ✓ PASS |
| E2E: connector renders, follows drag, persists (REL-03) | `npx playwright test e2e/connectors.spec.ts` | 1 passed | ✓ PASS |
| E2E: node-tap opens sidebar, viewer-only (REL-04) | `npx playwright test e2e/graph.spec.ts` | 1 passed | ✓ PASS |

All three phase E2E specs, the targeted unit subset, the full unit suite, and typecheck were **re-executed independently in this verification pass** (not taken from SUMMARY claims) — all green, matching the executors' reported results.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REL-01 | 04-01, 04-02 | Define person↔person/person↔group/group↔group relationships | ✓ SATISFIED | Data foundation (04-01) + authoring UI (04-02), both verified above |
| REL-02 | 04-01, 04-02 | Relationship-link carries label/date/notes | ✓ SATISFIED | Round-trip test + AddRelationshipDialog inputs, verified above |
| REL-03 | 04-03 | Connectors between markers on a map | ✓ SATISFIED | connectors.ts + ConnectorLayer + MapView wiring, E2E drag-follow verified |
| REL-04 | 04-04 | Viewer-only relationship graph | ✓ SATISFIED | GraphView + ViewSwitcher + AT bridge, E2E node-tap verified |

No orphaned requirements — REQUIREMENTS.md lists exactly REL-01..04 for Phase 4, and every ID appears in a plan's `requirements:` frontmatter (04-01/04-02: REL-01, REL-02; 04-03: REL-03; 04-04: REL-04).

**Note:** REQUIREMENTS.md still shows these four rows as unchecked `[ ]` / "Pending" in its status table — this is stale bookkeeping in that document, not a code gap. All four are satisfied in the codebase per the evidence above.

### Anti-Patterns Found

None. Scanned all 18 phase-modified source files under `src/` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|coming soon` — zero matches.

### Deferred Items (documented, out of scope, not phase regressions)

| # | Item | Disposition |
|---|------|-------------|
| 1 | `e2e/browse-and-create.spec.ts` "sort toggle reorders the list" — auto-opened ProfileSidebar overlaps the sort toolbar | Confirmed pre-existing at the pre-Task-3 base commit (before any 04-02 change); logged in `deferred-items.md`. Not a Phase-4 regression. |
| 2 | Markers on a layerless map do not render (`e2e/marker.spec.ts` red at base commit `0d159202`) | Confirmed pre-existing by reverting to base and reproducing; unrelated to connectors (which ignore layers entirely). Already fixed for the UI placement path by commit `55f3541`; the direct-`upsertMarker`-seeding edge case remains a documented follow-up in `deferred-items.md`. |
| 3 | Locations→open-map navigation defect that previously gated REL-03 UAT sign-off | Resolved earlier in commit `76c55d8`, human-verified UAT per project history and 04-03-PLAN.md's "RESOLVED" annotation. Not an open gap. |

### Human Verification Required

None. All four success criteria are backed by both static code evidence (artifacts/wiring read directly) and independently re-executed automated tests (unit + E2E) covering the exact behaviors asserted (reciprocal appearance, drag-follow + persistence, node-tap→sidebar + viewer-only lock). No visual-only or subjective-judgment items block sign-off; the phase plans note a non-blocking manual/UAT follow-up for `cose` layout readability on a 50+ node graph, which is cosmetic and does not gate the phase goal.

### Gaps Summary

No gaps. All four ROADMAP success criteria are verified present, substantive, wired, and behaviorally proven via independently re-run tests (not merely SUMMARY claims). Requirement IDs REL-01 through REL-04 are all satisfied and traced to code. The two "OUT-OF-SCOPE pre-existing defect" items and the already-resolved navigation blocker are correctly excluded from gap status per the task's guidance and confirmed by direct evidence in `deferred-items.md` and the plan annotations.

---

*Verified: 2026-07-03T16:00:00Z*
*Verifier: Claude (gsd-verifier)*

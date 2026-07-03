---
phase: 04-relationships-graph
plan: 04
subsystem: graph-view
tags: [cytoscape, react-cytoscapejs, graph, viewer-only, dexie-meta, at-bridge, object-url]

# Dependency graph
requires:
  - phase: 04-relationships-graph
    plan: 01
    provides: "RelationshipLink people|groups endpoints (fromType/fromId/toType/toId/directed), cascade-on-delete, listRelationshipsFor"
provides:
  - "toGraphElements(people, groups, links, positions?) — pure people/groups→nodes, links→edges projection that drops endpoint-less shells"
  - "graphStyle — token-only Cytoscape stylesheet (amber = ego/selection only; edge hairline derived from colors.hairline)"
  - "positionCache (savePositions/loadPositions/hasCachedPositions) over db.meta 'graphPositions'"
  - "GraphView — viewer-only react-cytoscapejs host: cose→preset cache, node-tap→ProfileSidebar (AT bridge), ego center+highlight, avatar object-URL revoke, edge-label toggle, empty state"
  - "ViewSwitcher 'graph' ViewKey + Share2 entry (no count pill)"
  - "Ambient react-cytoscapejs type declaration (package ships no types)"
affects: []

# Tech tracking
tech-stack:
  added:
    - "cytoscape@3.34.0 (MIT) — graph engine"
    - "react-cytoscapejs@2.0.0 (MIT) — declarative React wrapper (resolves under React 19.2 with no --force)"
  patterns:
    - "Pure DOM-free element projection (toGraphElements) unit-tested without a canvas (mirrors coords.ts)"
    - "Dexie meta k/v as a regenerable position cache; whole-node-set coverage gate (hasCachedPositions) for preset-vs-cose"
    - "Attach cytoscape event handlers ONCE per core instance (guard ref) + latest-callback ref, since the react-cytoscapejs cy callback fires every update"
    - "Ambient .d.ts for an untyped npm package to keep strict tsc clean"
    - "e2e-gated window global (window.__cyGraph via the `global` prop) to drive canvas node taps from Playwright"

key-files:
  created:
    - src/features/graph/graphElements.ts
    - src/features/graph/graphStyle.ts
    - src/features/graph/positionCache.ts
    - src/features/graph/GraphView.tsx
    - src/features/graph/GraphView.module.css
    - src/types/react-cytoscapejs.d.ts
    - tests/features/graphElements.test.ts
    - tests/features/positionCache.test.ts
    - e2e/graph.spec.ts
  modified:
    - package.json
    - package-lock.json
    - src/features/nav/ViewSwitcher.tsx
    - src/app/App.tsx

key-decisions:
  - "Empty state ('No connections yet.') shows when there are zero drawable edges (UI-SPEC R6: the graph exists to explain connections); isolated nodes render only once at least one relationship exists"
  - "Edge hairline color is derived from colors.hairline at 55% alpha (hexToRgba) rather than the inline rgba(216,210,196,.55) literal in RESEARCH — strict A5 'no inline color literals'"
  - "GraphView takes an egoId prop; App passes the currently-open profile's id so opening the graph with a person/group profile open centers + amber-highlights that node (D-12) without adding a new 'open in graph' button"
  - "cy event handlers attached once per instance via a guard ref + latest-callback ref, because react-cytoscapejs invokes the cy callback on every update"

requirements-completed: [REL-04]

# Metrics
duration: 14min
completed: 2026-07-03
status: complete
---

# Phase 4 Plan 04: Relationship Graph View Summary

**Delivered the REL-04 viewer-only Cytoscape relationship graph: a new left-nav "Graph" entry opens a full-bleed slate canvas where people are round avatar nodes and groups paper-shade square nodes, relationship-links are edges (arrowhead when directed), layout is force-directed `cose` cached to the Dexie meta table and reopened via `preset`, and tapping a node opens its ProfileSidebar through the existing selection→AT bridge — all with no data-mutating interaction.**

## Performance
- **Duration:** ~14 min
- **Started:** 2026-07-03T15:13Z (RED commit)
- **Completed:** 2026-07-03T15:28Z
- **Tasks:** 3
- **Files:** 13 (9 created, 4 modified)

## Accomplishments
- **Two new MIT deps, installed clean:** `cytoscape@3.34.0` + `react-cytoscapejs@2.0.0` resolved under React 19.2 with **no `--force`** (confirming RESEARCH A6). Both carry the RESEARCH § Package Legitimacy Audit verdict OK — no blocking-human checkpoint required (T-04-SC).
- **Pure, DOM-free projection (`toGraphElements`)** maps people/groups→nodes and links→edges, normalizes optional `directed` at read, and **drops endpoint-less / half-endpoint shells** so a legacy or deleted-endpoint link can never become a dangling edge (Pitfall 4 / T-04-10).
- **Token-only stylesheet (`graphStyle`)** — every color reads from `@/app/tokens`; amber is reserved to `.ego`/`:selected`; node/edge labels render as Cytoscape canvas text, never injected HTML (T-04-01).
- **Position cache (`positionCache`)** persists the `cose` layout as one `graphPositions` meta row on `layoutstop` and reopens with `preset` when the cache covers every current node; a node-set change invalidates → fresh `cose` (D-13).
- **`GraphView`** hosts react-cytoscapejs viewer-only (`autoungrabify` + `boxSelectionEnabled={false}`): node-tap → `ProfileSidebar` via the existing AT bridge, ego center + amber-highlight when opened from a profile (D-12), person-avatar object-URLs resolved by photo-hash and **revoked on unmount/hash change** (Pitfall 2 / T-04-04), an ON-by-default edge-label toggle (UI-SPEC B4), and the "No connections yet." empty state.
- **`ViewSwitcher`** gained a `'graph'` ViewKey + `Share2` entry (no count pill), and **`App`** routes `activeView==='graph'` to `GraphView`, opening the tapped entity's profile and treating any open profile as the ego node.

## Task Commits
1. **Task 1 — deps + failing tests (RED):** `63d1922` (test) — install both packages; failing unit (mapping/cache) + failing e2e (node-tap→sidebar, viewer-only).
2. **Task 2 — pure modules (GREEN):** `094e1ff` (feat) — `graphElements` + `graphStyle` + `positionCache`; both unit files green, tsc clean.
3. **Task 3 — GraphView + nav + wiring:** `1cc0751` (feat) — `GraphView`, `ViewSwitcher` entry, `App` route, ambient types; e2e green, tsc clean.

_No REFACTOR commit needed — GREEN implementations were minimal and clean._

## Deviations from Plan

### Auto-added / auto-fixed

**1. [Rule 3 - Blocking] Ambient type declaration for `react-cytoscapejs`**
- **Found during:** Task 3 (importing the wrapper).
- **Issue:** `react-cytoscapejs@2.0.0` ships JS only (no `.d.ts`); under strict `tsc --noEmit` the untyped default import fails the build.
- **Fix:** Added `src/types/react-cytoscapejs.d.ts` declaring the thin prop surface GraphView uses (including the runtime-supported `global` prop). `cytoscape` itself ships types, so only the wrapper needed one.
- **Files:** `src/types/react-cytoscapejs.d.ts` (not in the plan's files list).
- **Commit:** `1cc0751`

**2. [Rule 2 - Missing critical wiring] Routed the Graph view in `App.tsx`**
- **Found during:** Task 3.
- **Issue:** The plan lists `GraphView.tsx` + `ViewSwitcher.tsx` but not `App.tsx`; without an App route the "Graph" nav entry renders nothing and the E2E (tap node → sidebar) cannot pass. The graph is unreachable and non-functional.
- **Fix:** Added an `activeView==='graph'` branch rendering `<GraphView>` (node-tap opens the profile in list context; an open person/group profile becomes the ego node), narrowed `EntityView` to exclude `'graph'`, and made the FieldManager treat `'graph'` like `'map'` (no custom fields on the graph surface).
- **Files:** `src/app/App.tsx` (not in the plan's files list).
- **Commit:** `1cc0751`

**3. [Rule 1 - Correctness/polish] Edge color derived from a token, not an inline literal**
- **Issue:** RESEARCH's stylesheet uses an inline `rgba(216,210,196,0.55)` for the edge hairline, which is `colors.hairline` (#D8D2C4) at 55% alpha — an inline color literal that A5 forbids.
- **Fix:** Added a small `hexToRgba` helper in `graphStyle.ts` and derived the edge line from `colors.hairline`, so the graph edge color stays tied to the palette.
- **Commit:** `094e1ff`

## Deferred Issues (out of scope — pre-existing)
- `eslint .` reports 2 `react-hooks/set-state-in-effect` errors in `src/app/App.tsx` lines 98 & 116 (the Phase-3 map-seeding effects). These are **pre-existing at the plan's base commit** (eslint-plugin-react-hooks 7.1.1 was already installed; the offending lines are untouched by this plan) and there is no lint pre-commit gate. Per the SCOPE BOUNDARY they were NOT fixed here. My new files lint clean.

## Known Stubs
None — GraphView renders live data from `useLiveQuery`; no placeholder/empty-hardcoded data paths.

## User Setup Required
None — both new libraries are free/OSS (MIT) and require no configuration, keys, or accounts.

## Verification
- `npx vitest run tests/features/graphElements.test.ts tests/features/positionCache.test.ts` — 12/12 green.
- `npx playwright test e2e/graph.spec.ts` — 1/1 green (node-tap→ProfileSidebar; node not grabbable = viewer-only; no add/edit control).
- `npx tsc --noEmit` — clean.
- `node -e "require('cytoscape');require('react-cytoscapejs')"` — resolves.
- Full unit suite `npx vitest run` — **302/302 across 51 files** green (290 baseline + 12 new; no regression).
- `npm run build:e2e` — clean production/e2e build.

## Manual/UAT follow-up (VALIDATION.md manual-only)
- Visual quality of `cose` on a dense (50+ interconnected) graph — nodes readable / non-overlapping. If poor, an `fcose`/`cose-bilkent` extension is a scoped v2 follow-up (RESEARCH A3). Not blocking.

## Self-Check: PASSED

All 9 created + 4 modified files exist on disk; all three task commits (`63d1922` test, `094e1ff` feat, `1cc0751` feat) present in git history; working tree clean; no file deletions across the plan.

---
*Phase: 04-relationships-graph*
*Completed: 2026-07-03*

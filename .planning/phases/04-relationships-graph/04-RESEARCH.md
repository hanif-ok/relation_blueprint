# Phase 4: Relationships & Graph - Research

**Researched:** 2026-07-03
**Domain:** Relationship data modeling (Dexie), data-driven Konva connectors, viewer-only Cytoscape.js graph
**Confidence:** HIGH (stack pre-locked + codebase-grounded; only layout/position-cache mechanics were open, now resolved)

## Summary

This is a **light research pass** — the stack is already locked by CLAUDE.md and the two new libraries (`cytoscape` 3.34.0 + `react-cytoscapejs` 2.0.0) are the only net-new dependencies, both verified legitimate. The genuinely non-obvious work is four integration questions, all of which resolve cleanly against the **existing** codebase patterns rather than new infrastructure:

1. **Data model** — the `RelationshipLink` shell (already a first-class, already sync-wired entity) gains **optional** endpoint fields (`fromType`/`fromId`/`toType`/`toId`/`directed`) added to the type↔zod↔Dexie triple. The reverse-lookup ("links touching entity X") is a **Dexie `.or()` query over two new indexes** (`fromId`, `toId`) — no derived field, no new shard, no new sync branch. Because the fields are optional and the record already flows end-to-end through serializer/manifest/backup/sync (verified by grep), **all sync/export plumbing is free**.

2. **Map connectors** — a **fourth physical Konva `Layer` with `listening={false}` inserted between L0 (background) and L1 (content)**, drawing `Arrow`/`Line` shapes in **image-space composed through `imageToStage(backgroundTransform)`** exactly like markers. Connectors follow markers live during drag via a **transient dragging-position state** (throttled with `requestAnimationFrame`), persisting to Dexie only on `dragEnd` — no per-frame writes, no relayout.

3. **Cytoscape graph** — **built-in `cose`** layout (no extension needed → honors free/OSS + minimal-deps), with **position pre-caching in the Dexie `meta` table**: run `cose` once, read positions on `layoutstop`, persist, and reopen with `layout: { name: 'preset' }` for instant render. `react-cytoscapejs` feeds `elements` from a `useLiveQuery`; the `cy` callback wires node-tap → `ProfileSidebar` (reusing the existing canvas→AT bridge).

4. **Offline/sync/PWA** — **nothing new required.** `relationship-links` is already in `ENTITY_TYPES`, `getDirtyTypes`, the serializer, the manifest, `BackupSchema`, and the six-branch reconcile. New optional fields ride all of it. Both Drive and Mega host the identical `relationship-links-000.json` shard.

**Primary recommendation:** Add optional endpoint fields to the existing `RelationshipLink` triple with a Dexie `version(5)` index-only upgrade (`fromId`, `toId`); build connectors as a non-listening image-space Konva layer derived from the same `markers`/`links` live queries; render the graph with built-in `cose` + a `meta`-table position cache and `preset` on reopen. Treat the "can't open a map from the Locations list" report as a **pre-req defect** (`/gsd-debug`) — REL-03 is untestable until it's fixed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | Define relationships in an entity's details: person↔person, person↔group, group↔group | Endpoint fields on `RelationshipLink` (§Data Model); authoring section in `ProfileSidebar` reusing the "Appears on" pattern (§Architecture Pattern 1); entity picker reusing `PersonPicker` shape |
| REL-02 | A relationship-link can carry its own data (label, date, notes) | Already present on `RelationshipLink` (`label`/`date`/`notes`/`custom`/`gallery`) and rendered by `ProfileSidebar.tsx` l.371–387 — no schema work for the data itself |
| REL-03 | Relationships rendered as data-driven connectors between markers on a map (not hand-drawn) | Image-space Konva connectors layer (§Architecture Pattern 2); live-follow-on-drag via transient position state; **blocked by** the Locations→open-map defect (§Open Questions) |
| REL-04 | Viewer-only relationship graph visualizing how people and groups connect | `react-cytoscapejs` + built-in `cose` + position cache (§Architecture Pattern 3); node-tap→sidebar bridge |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Direction is a **per-link choice** — each relationship is `directed` (arrowhead A→B) or symmetric (plain line), chosen at creation. Data model: ordered pair `fromType`/`fromId`, `toType`/`toId` (each type ∈ {`people`,`groups`}) + a `directed: boolean` flag. Arrowheads render only when `directed` — on both map connectors and graph edges.
- **D-02:** A single `label` carries the phrasing (e.g. "mentor of"). Reciprocal per-direction labels are **deferred**.
- **D-03:** Relationships authored from a **"Relationships" section on Person and Group profiles** (new section in `ProfileSidebar`, sibling to "Appears on"), with "+ Add relationship": pick the other entity, set direction, fill label/date/notes. **Locations do NOT get this section.**
- **D-04:** Authoring writes **one canonical `RelationshipLink`** that auto-appears on both endpoints' profiles — each profile reactively queries links where it is an endpoint (single source of truth; no duplicate per-side record).
- **D-05:** **Remove the standalone "+ New → Relationship-link" item** from `NewEntityMenu`. The relationship-links **browse list stays** as a view/manage/edit surface.
- **D-06:** Opening a relationship reuses the existing **full `ProfileSidebar` entity profile** (two endpoints + label/date/notes + gallery + custom fields). No separate slim editor.
- **D-07:** A connector draws between two markers **only when both endpoints are people who each have a marker on that map** (person↔person). **Person↔group and group↔group are graph-only** — groups have no marker, so they do not render on the canvas.
- **D-08:** Connectors render on a **dedicated, non-interactive connectors layer beneath marker content**, in **image-space composed through `MapDoc.backgroundTransform`** so they follow markers live and stay anchored on background re-fit. Arrowhead when `directed`.
- **D-09:** **Connector labels OFF by default**, with a show/hide toggle (mirrors Phase-3 D-20 name-label pattern).
- **D-10:** Connectors are **viewer-only projections** — edit the relationship in its profile, never by dragging on the canvas. (Distinct from portal markers.)
- **D-11:** A new **"Graph" view in the left-nav `ViewSwitcher`**. Nodes = people (avatar) + groups (glyph); edges = relationship-links (labeled; arrowhead when directed). Relationship-links are **edges**, not nodes.
- **D-12:** **Clicking a node opens its `ProfileSidebar`.** Opening the graph from an entity's profile **centers/highlights that node** (ego emphasis) — focus/highlight, not a separate view mode.
- **D-13:** **Force-directed layout (Cytoscape `cose`)** by default; **persist/pre-cache node positions** for larger graphs. Graph is **viewer-only** (locked by PROJECT.md).

### Claude's Discretion
- **Reciprocal labels:** single `label` for v1 (D-02).
- **Multiple placements:** how many connectors to draw when one person has several markers on the same map — keep it simple and legible. (Research recommendation: **one connector to the person's primary/first placement**, B6.)
- **Endpoint data-model + reverse index:** the concrete Dexie shape + the "links where entity X is an endpoint" index — **planner discretion** (recommendation below).
- **Layout selection + position-caching mechanism:** final Cytoscape layout choice and cache mechanism — light research (recommendation below).
- **Visual styling:** connector/graph styling follows `01-UI-SPEC.md` tokens (amber reserved for selection).

### Deferred Ideas (OUT OF SCOPE)
- Reciprocal per-direction relationship labels → v1 uses a single `label`.
- Group relationships rendered on the map → v1 is graph-only for group-involving links (D-07).
- Graph filtering/grouping by relationship type or group → v2 (GRPH-01).
- Search across relationships/groups/locations → v2 (SRCH-03); Phase 5 is people-scoped.
- Multi-select / bulk relationship editing → not v1.
- Social-network analytics (centrality, clustering) → v2 (ANLY-01).
- Editing relationships **inside** the graph view → out of scope per PROJECT.md.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Serverless / client-side PWA only** — all persistence in the user's own Drive/Mega; **no backend may be introduced.** The graph and connectors are pure client-side rendering.
- **Free + OSS only** — `cytoscape` (MIT) + `react-cytoscapejs` (MIT) both qualify. **Do NOT pull `cytoscape-cose-bilkent` or other layout extensions** unless a real need emerges — built-in `cose` is bundled and sufficient (keeps the dep surface minimal).
- **IndexedDB (Dexie) is runtime source of truth**; cloud is durable backup. Relationship writes go through the repository (validate→stamp `updatedAt`+`dirty`→emit), never straight to Dexie.
- **Last-write-wins by `updatedAt`** (single curator) — relationship-links use the same dirty-flag sync as every other entity.
- **No `dangerouslySetInnerHTML` — ever** (threat T-03-01: XSS could exfiltrate the Drive token). Relationship labels/notes and graph node/edge labels render as React / Konva `Text` / Cytoscape text, never injected HTML.
- **Schema is Dexie, NOT Drizzle/Prisma** — `this.version(n).stores({...})` auto-upgrades in-browser; there is **no migration-push step** (see [[schema-gate-dexie-false-positive]] memory). Never plan a "push migration" task for `src/db/schema.ts`.
- **Canvas is opaque to screen readers** — node/relationship selection must announce via the sidebar (the existing `aria-live` bridge), like markers do.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Relationship record + endpoints | Database / Storage (Dexie `relationshipLinks`) | — | Endpoints are persisted entity data; the single mutation path is the repository |
| Reverse lookup ("links touching X") | Database / Storage (Dexie indexed `.or()` query) | — | Must be an indexed query to scale to thousands; belongs in the repository, not computed in React |
| Authoring flow (pick endpoint, direction, data) | Browser / Client (React `ProfileSidebar` section) | Database (repository write) | Pure UI over the repository create/update path; reuses `PersonPicker` shape |
| Map connectors geometry | Browser / Client (Konva render in `MapView`) | — | Derived projection of persisted data; no persistence of its own (viewer-only, D-10) |
| Graph rendering + layout | Browser / Client (`react-cytoscapejs`) | Database (`meta` position cache) | Viewer-only visualization; positions cached locally, regenerable |
| Sync of relationship data | Database / Storage (existing SyncEngine) | CDN/Cloud (Drive/Mega shard) | Already wired end-to-end for `relationship-links`; no new tier work |

## Standard Stack

### Core (new this phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cytoscape | 3.34.0 | Node-link relationship graph engine | Prescribed by CLAUDE.md; purpose-built viewer graph with **built-in `cose`**, `preset`, pan/zoom; MIT; 9.9M weekly downloads `[VERIFIED: npm registry]` |
| react-cytoscapejs | 2.0.0 | Declarative React wrapper for Cytoscape | Prescribed by CLAUDE.md; Plotly-maintained; passes `elements`/`stylesheet`/`layout` props + a `cy` instance callback; MIT `[VERIFIED: npm registry]` |

### Supporting (already installed — reused, no install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| konva / react-konva | 10.3.0 / 19.2.5 | Map connectors layer (`Arrow`/`Line`) | The data-driven connectors on the map (§Pattern 2) |
| dexie / dexie-react-hooks | 4.4.4 / 4.4.0 | Persist endpoints + reverse-lookup index; `useLiveQuery` feeds both surfaces | Data model + reactive rebuild of connectors and graph elements |
| zod | 4.4.3 | Validate endpoint fields (closed enum `people`\|`groups`) | Repository write path + `BackupSchema` untrusted-at-rest gate |
| nanoid | 5.1.15 | Stable relationship ids | Already used by `createRelationshipLink` |
| lucide-react | 1.21.0 | Direction glyphs (`ArrowRight`/`ArrowLeftRight`), `Share2`/`Workflow` nav glyph | Relationship rows + Graph nav item |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in `cose` | `cytoscape-cose-bilkent` / `fcose` extension | Higher-quality layout but **adds a dependency** — violates minimal-deps; only adopt if `cose` quality is inadequate on real data (defer to v2) |
| Dexie `.or()` two-index query | Stored `endpointKeys: string[]` multiEntry index | multiEntry is a single indexed query but requires a **derived stored field** kept consistent on every write and serialized to cloud; `.or()` over `fromId`/`toId` needs no extra field and no derived-state bug surface — **recommended** |
| Konva `Arrow` shape | Hand-drawn line + manual triangle polygon | `Arrow` gives arrowheads for free via `pointerLength`/`pointerWidth`; never hand-roll arrowhead geometry |

**Installation:**
```bash
npm install cytoscape@3.34.0 react-cytoscapejs@2.0.0
# Types: cytoscape ships its own; react-cytoscapejs is JS with bundled prop types.
# If TS complains about missing wrapper types, add: npm install -D @types/cytoscape (optional; core types usually suffice)
```

**Version verification (run 2026-07-03):**
- `cytoscape` — latest `3.34.0`, published 2026-06-02, 9,932,032 weekly downloads, repo `github.com/cytoscape/cytoscape.js`, no `postinstall` `[VERIFIED: npm registry]`. Matches CLAUDE.md's pinned `3.34.x`.
- `react-cytoscapejs` — latest `2.0.0`, peer deps `react >=15.0.0` + `cytoscape ^3.2.19`, ~79,912 weekly downloads, repo `github.com/plotly/react-cytoscapejs`, no `postinstall` `[VERIFIED: npm registry]`. **Peer range has no upper React bound → React 19.2 is permitted; confirm at install (no `--force` needed expected).**

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| cytoscape | npm | ~9 yrs (pub 2026-06-02 latest) | 9.9M/wk | github.com/cytoscape/cytoscape.js | **OK** | Approved |
| react-cytoscapejs | npm | pub 2022-09-02 (v2.0.0 line) | 80k/wk | github.com/plotly/react-cytoscapejs | **OK** | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
Both packages confirmed via Context7 (official docs) AND `gsd-tools query package-legitimacy check` returned `OK` (no postinstall, high downloads, real source repos) → tagged `[VERIFIED: npm registry]`.

## Architecture Patterns

### System Architecture Diagram

```
                       AUTHORING (REL-01/02)
  ProfileSidebar (Person/Group)                    Relationship-links browse list
   "Relationships" section  ──"+ Add relationship"──►  (view / edit surface, D-05)
        │  pick endpoint (PersonPicker-shape) → direction → label/date/notes
        ▼
   repository.createRelationship / updateRelationshipLink   ◄── validate (zod) + stamp updatedAt/dirty + emit
        │
        ▼
   Dexie  relationshipLinks  { id, name, label, date, notes,
                               fromType, fromId, toType, toId, directed, ... }
        │  indexes: id, fromId, toId  (version(5), index-only upgrade)
        │
        ├───── useLiveQuery (reverse lookup: where fromId=X .or toId=X) ──────┐
        │                                                                     │
        ▼ PROJECTION 1 (REL-03, map)                       ▼ PROJECTION 2 (REL-04, graph)
   MapView Konva Stage                               Graph view (react-cytoscapejs)
   ┌───────────────────────────┐                     ┌─────────────────────────────┐
   │ L0 background (bg xform)   │                     │ elements = people+groups     │
   │ L1.5 CONNECTORS (NEW,      │ ◄─ person↔person    │   (nodes) + links (edges)    │
   │      listening=false,      │    both placed      │ layout: preset(cache) → cose │
   │      image-space Arrows)   │    on active map    │ cy.on('tap','node') ─────────┼─► ProfileSidebar
   │ L1 content (markers)       │                     │ ego: cy.center + amber class │   (+ aria-live bridge)
   │ L2 transformer overlay     │                     │ positions ⇄ Dexie meta cache │
   └───────────────────────────┘                     └─────────────────────────────┘
        │ marker onDragMove (rAF-throttled, transient) → connectors follow live
        │ marker onDragEnd → upsertMarker (persist) → useLiveQuery → connectors recompute

  SYNC (unchanged): relationshipLinks dirty rows ──► serializer ──► relationship-links-000.json
                    ──► manifest pointer swap (atomic) ──► Drive / Mega  (identical shard)
```

### Recommended Project Structure
```
src/
├── domain/
│   ├── types.ts                    # + endpoint fields on RelationshipLink; RelationshipEndpointType
│   └── schemas.ts                  # + RelationshipLinkSchema endpoint fields (optional; directed default false)
├── db/
│   ├── schema.ts                   # + version(5).stores({ relationshipLinks: 'id,name,updatedAt,dirty,fromId,toId' })
│   └── repository.ts               # + createRelationship, listRelationshipsFor, cascade-drop in deleteEntity
├── features/
│   ├── profile/
│   │   ├── ProfileSidebar.tsx      # + "Relationships" section (Person+Group), like groupPlacementsByMap
│   │   ├── relationships.ts        # pure helpers: build rows, resolve other-endpoint, direction glyph
│   │   └── AddRelationshipDialog.tsx  # entity picker + direction + label/date/notes (Radix Dialog)
│   ├── person-map/
│   │   ├── MapView.tsx             # + connectors layer (L1.5); + transient dragging-position state
│   │   ├── AvatarMarker.tsx        # + onDragMove prop (rAF-throttled) to drive live connectors
│   │   └── editor/
│   │       ├── ConnectorLayer.tsx  # derives Arrow/Line geometry from links + marker positions
│   │       └── LayersPanel.tsx     # + "Relationship labels" toggle (mirrors D-20 Names toggle)
│   ├── graph/
│   │   ├── GraphView.tsx           # react-cytoscapejs host; elements from useLiveQuery; cy callback
│   │   ├── graphElements.ts        # pure: (people,groups,links) → cytoscape elements[]
│   │   ├── graphStyle.ts           # cytoscape stylesheet reading tokens.ts hexes
│   │   └── positionCache.ts        # meta-table read/write of { entityId: {x,y} }; invalidation
│   └── nav/
│       ├── ViewSwitcher.tsx        # + 'graph' ViewKey entry (Share2)
│       └── NewEntityMenu.tsx       # REMOVE the relationship-links ITEM (D-05)
```

### Pattern 1: Relationship data model + reverse-lookup index (REL-01/02, D-01/D-04)
**What:** Add **optional** endpoint fields to the existing `RelationshipLink`. Index `fromId` and `toId`; query "links touching X" with Dexie `.or()`.
**When to use:** All relationship authoring, both projections, and cascade delete.
**Why optional:** The `RelationshipLink` shell already exists as a first-class record; old shell records and pre-Phase-4 cloud backups have no endpoints. Making the fields optional (and `directed` default `false`) means the `version(5)` upgrade needs **no data migration** and `BackupSchema` still validates old bundles — the exact `optional-with-default` precedent used for Phase-3 marker `kind` and MapDoc sub-objects (Pitfall 7 lineage).

```typescript
// src/domain/types.ts — endpoints are people|groups only (Locations are NOT valid endpoints, D-07)
export type RelationshipEndpointType = 'people' | 'groups';

export interface RelationshipLink {
  id: string;
  name: string;
  photo?: MediaRef;
  gallery: MediaRef[];
  notes?: string;
  label?: string;        // REL-02 (already present)
  date?: string;         // REL-02 (already present)
  custom: CustomValues;
  // --- NEW (Phase 4, D-01) — optional so old records/backups validate ---
  fromType?: RelationshipEndpointType;
  fromId?: string;
  toType?: RelationshipEndpointType;
  toId?: string;
  directed?: boolean;    // arrowhead only when true
  updatedAt: number;
  dirty: boolean;
}
```
```typescript
// src/domain/schemas.ts — mirror into RelationshipLinkSchema (keep the `satisfies` lock at file bottom)
const RelationshipEndpointTypeSchema = z.enum(['people', 'groups']);
export const RelationshipLinkSchema = z.object({
  // ...existing fields...
  fromType: RelationshipEndpointTypeSchema.optional(),
  fromId: z.string().optional(),
  toType: RelationshipEndpointTypeSchema.optional(),
  toId: z.string().optional(),
  directed: z.boolean().optional(),   // treat absent as false at read sites
  // ...updatedAt, dirty...
});
```
```typescript
// src/db/schema.ts — index-only version(5) upgrade (NO data migration; Dexie skips undefined keys)
this.version(5).stores({
  relationshipLinks: 'id, name, updatedAt, dirty, fromId, toId',
});
```
```typescript
// src/db/repository.ts — reverse lookup is ONE indexed .or() query (scales to thousands)
export async function listRelationshipsFor(entityId: string): Promise<RelationshipLink[]> {
  return db.relationshipLinks.where('fromId').equals(entityId)
    .or('toId').equals(entityId).toArray();
}
```
**Note on the `.or()` query:** endpoint ids are globally-unique nanoids, so `fromId`/`toId` alone identify the entity — the query needs no `fromType`/`toType` disambiguation. `fromType`/`toType` are used only for **rendering** (person vs group) and **validation** (reject a Location endpoint).

### Pattern 2: Data-driven map connectors (REL-03, D-07/D-08/D-10)
**What:** A **fourth physical Konva `Layer`** with `listening={false}`, inserted **between L0 (background) and L1 (content)** so connectors paint beneath markers and never intercept drags. Geometry is derived from links + marker positions, drawn in **image-space composed through `imageToStage(transform)`**.
**When to use:** Only person↔person links where **both** people have a marker on the **active** map (D-07). Group-involving links never render here.
**Live-follow-on-drag (the subtle part):** markers only persist on `dragEnd`, so between frames Dexie hasn't updated. To make connectors track a marker mid-drag **without per-frame writes or relayout**, add an `onDragMove` to `AvatarMarker` that pushes the marker's live stage position into a **transient MapView state** (`{ markerId, x, y }`), throttled with `requestAnimationFrame`; the connector layer overlays that live position for the one dragging marker. On `dragEnd` the existing `upsertMarker` persists and the transient state clears → `useLiveQuery` recomputes from the source of truth.

```tsx
// ConnectorLayer.tsx — pure geometry from links + a stage-position resolver
// markerPos(personId): primary/first person-marker on active map → its imageToStage position,
// OVERLAID by the transient dragging position when that marker is being dragged (B6: primary only).
{connectors.map(({ id, a, b, directed, selected, label }) => (
  <Group key={id} listening={false}>
    <Arrow
      points={[a.x, a.y, b.x, b.y]}
      stroke={selected ? colors.amber : 'rgba(216,210,196,0.55)'}   // tokens.ts hairline @55%
      fill={selected ? colors.amber : 'rgba(216,210,196,0.55)'}
      strokeWidth={selected ? 2.5 : 1.75}
      pointerLength={directed ? 10 : 0}    // arrowhead ONLY when directed (D-01)
      pointerWidth={directed ? 8 : 0}
      perfectDrawEnabled={false}
    />
    {/* label pill at midpoint rendered ONLY when the LayersPanel toggle is on (D-09) */}
  </Group>
))}
```
- **Layer placement:** the connectors `<Layer listening={false}>` must be the **second `<Layer>` child of the `<Stage>`**, after the L0 background layer and before the L1 content layer in JSX order (Konva paints in child order). This is a physical-layer insertion, not a logical (`MapDoc.layers`) layer.
- **Selection highlight:** the "selected relationship's connector" turns amber. Selection state lives in React (e.g. `selectedRelationshipId`), set when the relationship is opened from a profile/graph — never by clicking the connector (the layer is non-interactive, D-10).
- **Performance:** `listening={false}` + `perfectDrawEnabled={false}`; connector count ≤ link count (modest in v1). If load grows, cull connectors whose both endpoints are off-screen using the same `useViewportCulling` the markers use (01-RESEARCH Pattern 5).

### Pattern 3: Cytoscape graph — built-in `cose` + preset position cache (REL-04, D-11/D-12/D-13)
**What:** `react-cytoscapejs` renders nodes (people avatars + group glyphs) and edges (links). Default layout **built-in `cose`**; cache computed positions in the Dexie `meta` table and reopen with `preset` for instant render.
**When to use:** The Graph view (viewer-only). No node dragging that mutates data (`autoungrabify: true`).

```tsx
// GraphView.tsx
import CytoscapeComponent from 'react-cytoscapejs';
// elements built by a PURE fn from live queries (people, groups, links) — testable without a DOM:
//   nodes: { data: { id, label: name, kind: 'people'|'groups' }, position?: cached }
//   edges: { data: { id, source: fromId, target: toId, label, directed } }
<CytoscapeComponent
  elements={CytoscapeComponent.normalizeElements(elements)}
  stylesheet={graphStyle}                 // reads tokens.ts hexes (A5) — never inline literals
  layout={hasCachedPositions ? { name: 'preset' } : { name: 'cose', animate: false }}
  cy={(cy) => {
    cyRef.current = cy;
    cy.on('tap', 'node', (e) => onSelectNode(e.target.data('kind'), e.target.id()));
    cy.one('layoutstop', () => savePositions(cy));   // cache after first cose run
  }}
  autoungrabify                            // viewer-only: nodes can't be dragged to mutate
  boxSelectionEnabled={false}
  style={{ width: '100%', height: '100%', background: colors.slate }}
/>
```
- **Layout choice — recommendation `cose`:** `[CITED: cytoscape.js/documentation/md/layouts/cose.md]` describes `cose` (physics spring-embedder) as "very fast" with "high-quality visual results" for general non-compound graphs — exactly the relationship-map shape. `concentric`/`breadthfirst` suit weighted-centrality or tree/DAG data (not our arbitrary social graph), and `preset` requires pre-known positions (that's our **cache**, not the first layout). So: **`cose` on first build, `preset` from cache on reopen.**
- **Position cache mechanism (D-13):** On `layoutstop`, read `cy.nodes().map(n => [n.id(), n.position()])` and persist as a single `meta` row (e.g. key `graphPositions`, value `Record<entityId, {x,y}>`). On mount, if **every current node id** has a cached position, initialize elements with those `position`s and use `layout: { name: 'preset' }` → no physics, instant. **Invalidate** by comparing the cached id-set to the current node id-set: any mismatch (added/removed person/group, or a new edge that changes topology enough that stale positions look wrong) → fall back to a fresh `cose` run and re-cache. Positions are **regenerable local convenience** — storing them in `meta` is fine even if a new device lacks them (cose recomputes).
- **Node avatars:** person nodes use `background-image` = an object-URL from `getMedia(person.photo.hash)`; **resolve URLs in an effect and revoke on unmount** (mirror `useMapImage`/`resolveMediaUrl` discipline — leaking object URLs is the classic pitfall). Group nodes = `shape: 'round-rectangle'` paper-shade fill + label (the `UsersRound` glyph is optional polish via a data-URI SVG background — round-vs-square already distinguishes type per B8).
- **Ego highlight (D-12):** when opened from a profile, add an `.ego` class to that node (amber ring style) and `cy.animate({ center: { eles: node }, zoom })`.
- **AT bridge (R7):** node tap opens `ProfileSidebar`, which already moves focus in + announces "Selected {Name}" via `aria-live`. The DOM browse lists remain the keyboard-reachable census. Full in-canvas keyboard traversal stays **deferred** (B10), consistent with markers.

### Pattern 4: Sync/PWA — already wired (REL, offline)
**What:** No new sync code. `relationship-links` is confirmed present in every branch of the sync machinery.
**Evidence (grep of `src/sync/syncEngine.ts`):** `ENTITY_TYPES` includes `'relationship-links'` (l.89); `getDirtyTypes` checks `db.relationshipLinks.filter(dirty)` (l.369); `commit`/`reconcile`/`pull` all have `relationshipLinks` branches (l.286, 425–428, 484–488); `serializer.ts` writes `relationship-links-000.json` (l.36/59/82) and `clean()`s dirty on the way out; `ManifestSchema` requires the `relationship-links` pointer (schemas.ts l.206); `BackupSchema` includes `RelationshipLinkSchema` array (l.227). **New optional fields are plain JSON on the record → they serialize, round-trip, and sync with zero plumbing.** Both Drive and Mega host the identical shard.

### Anti-Patterns to Avoid
- **Don't store connector geometry.** Connectors are a pure projection (D-10). Never persist connector coordinates; always derive from links + marker positions.
- **Don't write to Dexie on every drag frame.** Persist on `dragEnd` only; use transient React state for live-follow (avoids sync churn + relayout thrash).
- **Don't add a second per-side relationship record.** One canonical link, queried from both ends (D-04). Two records = two write paths + drift.
- **Don't re-run `cose` on every data change.** Rebuild `elements` (react-cytoscapejs diffs by id) but only re-run layout when the **node set** changes; otherwise keep `preset` from cache.
- **Don't pull a layout extension** (`cose-bilkent`/`fcose`) — built-in `cose` honors minimal-deps; an extension is a v2 call if quality demands it.
- **Don't index blobs or add a derived `endpointKeys` field** unless `.or()` proves insufficient — extra stored state is a consistency-bug surface.
- **Don't let a Location become an endpoint.** Validate `fromType`/`toType ∈ {people, groups}` at the write path (zod enum already enforces it) and in the picker (never list Locations).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Force-directed graph layout | A physics/spring simulation | Cytoscape built-in `cose` | Years of tuned layout; "very fast, high-quality" per official docs |
| Arrowheads on directed edges | Manual triangle polygon math | Konva `Arrow` (`pointerLength`/`pointerWidth`); Cytoscape `target-arrow-shape` | Free, correct, orientation-aware |
| "Links touching entity X" | Full-table scan + filter in React | Dexie `where('fromId').equals(x).or('toId').equals(x)` over indexes | Indexed union, scales to thousands; O(scan) filter degrades |
| Endpoint validation | Ad-hoc `if` checks | zod `z.enum(['people','groups'])` in `RelationshipLinkSchema` | Closed-set gate at the untrusted-at-rest boundary (T-02-01) |
| Image-space ↔ stage-space for connectors | New coordinate math | Existing `imageToStage`/`stageToImage` (coords.ts) | The connectors MUST share the marker composition to stay anchored (D-08) |
| Relationship record editor | A new slim editor | Existing `ProfileSidebar` (D-06) | Relationship-links are already first-class; the profile renders label/date/notes/gallery/custom today |
| Sync of new fields | New shard / sync branch | Existing `relationship-links` shard + reconcile | Adding fields to an existing wired record rides all of it |

**Key insight:** Almost every "new" capability in this phase is a **projection of, or an addition to, machinery that already exists** — the relationship record, its sync, the profile panel, the image-space coordinate system, and the reactive `useLiveQuery` pattern. The only genuinely new code is the connector layer, the graph view, and the endpoint fields + one index.

## Common Pitfalls

### Pitfall 1: Connector detaches from marker during drag
**What goes wrong:** Connectors computed only from persisted marker coords lag behind a marker being dragged (which hasn't persisted until `dragEnd`).
**Why it happens:** `useLiveQuery` reflects Dexie, and Dexie updates on `dragEnd`, not per frame.
**How to avoid:** Add `onDragMove` on `AvatarMarker` → push live stage position to transient MapView state (rAF-throttled) → connector layer overlays it for the one dragging marker. Persist on `dragEnd` (existing path).
**Warning signs:** Line "snaps" to the marker only after the drag is released.

### Pitfall 2: Leaked object URLs for graph node avatars
**What goes wrong:** Creating `URL.createObjectURL` per node without revoking, on every element rebuild, leaks memory as the graph re-renders.
**Why it happens:** Cytoscape `background-image` needs a URL, and rebuilds are frequent under `useLiveQuery`.
**How to avoid:** Resolve avatar URLs in an effect keyed by photo hash; revoke on unmount / when the hash changes (mirror `useMapImage`/`resolveMediaUrl`). Consider a small hash→URL cache.
**Warning signs:** Growing memory in the Graph view over time; dev-tools object-URL count climbing.

### Pitfall 3: Orphaned edges/connectors after an endpoint is deleted
**What goes wrong:** Deleting a Person/Group leaves relationship-links pointing at a now-missing id → a crash or a dangling edge.
**Why it happens:** `deleteEntity` currently cascades **markers** (for people/maps) but knows nothing about relationship endpoints.
**How to avoid:** Extend `deleteEntity` for `people`/`groups` to also delete `relationshipLinks` where `fromId`/`toId === id`, inside the existing single `rw` transaction (add `db.relationshipLinks` to the transaction's table list — it's already there for media GC). In the profile "Relationships" section and graph, orphan-guard defensively: render a muted "(deleted person/group)" row (mirror the "(deleted map)" pattern, T-03-10) in case a stale link survives (e.g. from an imported backup).
**Warning signs:** `ProfileSidebar` white-screens on a relationship whose other endpoint is gone; a floating edge to nowhere in the graph.

### Pitfall 4: `directed` treated as required at read sites
**What goes wrong:** Reading `link.directed` as a boolean when it's `undefined` on old records renders inconsistent arrowheads.
**Why it happens:** The field is optional (for backward-compat).
**How to avoid:** Normalize at read: `const directed = link.directed === true`. Same for endpoint presence — a link missing `fromId`/`toId` (a legacy endpoint-less shell) must be **filtered out** of both projections (it can't be drawn).
**Warning signs:** A pre-Phase-4 shell record appears as a broken edge/connector.

### Pitfall 5: Cytoscape re-runs `cose` on every keystroke/data tick
**What goes wrong:** Passing a fresh `layout={{name:'cose'}}` on every render re-simulates the whole graph, causing flicker and CPU spikes.
**Why it happens:** react-cytoscapejs applies the `layout` prop when it changes; naive code recreates it each render.
**How to avoid:** Compute `layout` from a stable "should relayout" decision (node-set changed?). Default to `preset` from cache; only pass `cose` when there's no valid cache. Drive incremental element updates through the `elements` prop, not layout re-runs.
**Warning signs:** Graph "explodes" and re-settles whenever any unrelated entity changes.

### Pitfall 6: Planning a Dexie migration-push task
**What goes wrong:** A planner adds a "run/push migration" task for the `version(5)` schema change.
**Why it happens:** GSD's schema-gate misreads `src/db/schema.ts` as Drizzle (see [[schema-gate-dexie-false-positive]]).
**How to avoid:** It's **Dexie** — `version(5).stores(...)` auto-upgrades in the browser. There is no push step. Index-only change needs no `.upgrade()` callback (no data migration).
**Warning signs:** A task referencing `drizzle`/`prisma migrate`/"push schema" for this repo.

## Runtime State Inventory

Not applicable — this is a **feature phase**, not a rename/refactor/migration. The only schema evolution is an **additive, index-only Dexie `version(5)` upgrade** (optional fields already backward-compatible; Dexie skips `undefined` index keys). No stored data carries an old string to migrate, no external service config, no OS-registered state, no secret/env renames, no build-artifact staleness. **Verified by:** reading `src/db/schema.ts` (all prior upgrades are additive with default-backfill; endpoints add no required field) and confirming `relationship-links` already round-trips through serializer/manifest/backup.

## Code Examples

### Building Cytoscape elements from live queries (pure, testable)
```typescript
// src/features/graph/graphElements.ts  — Source pattern: react-cytoscapejs README (elements/normalizeElements)
export function toGraphElements(
  people: Person[], groups: Group[], links: RelationshipLink[],
  positions?: Record<string, { x: number; y: number }>,
): cytoscape.ElementDefinition[] {
  const nodes = [
    ...people.map((p) => ({ data: { id: p.id, label: p.name, kind: 'people' as const },
                            position: positions?.[p.id] })),
    ...groups.map((g) => ({ data: { id: g.id, label: g.name, kind: 'groups' as const },
                            position: positions?.[g.id] })),
  ];
  const edges = links
    .filter((l) => l.fromId && l.toId)              // drop legacy endpoint-less shells (Pitfall 4)
    .map((l) => ({ data: { id: l.id, source: l.fromId!, target: l.toId!,
                           label: l.label ?? '', directed: l.directed === true } }));
  return [...nodes, ...edges];
}
```

### Cytoscape stylesheet reading shared tokens (A5 — no inline hexes)
```typescript
// src/features/graph/graphStyle.ts  — Source pattern: cytoscape.js notation.md + react-cytoscapejs README
import { colors } from '@/app/tokens';
export const graphStyle: cytoscape.StylesheetJson = [
  { selector: 'node', style: { 'label': 'data(label)', 'color': colors.paper,
      'font-size': 13, 'text-valign': 'bottom', 'width': 48, 'height': 48,
      'border-width': 2, 'border-color': colors.paper } },
  { selector: 'node[kind="groups"]', style: { 'shape': 'round-rectangle',
      'background-color': colors.paperShade } },
  { selector: 'edge', style: { 'label': 'data(label)', 'width': 1.75,
      'line-color': 'rgba(216,210,196,0.55)', 'font-size': 13, 'color': colors.inkMuted } },
  { selector: 'edge[?directed]', style: { 'target-arrow-shape': 'triangle',
      'target-arrow-color': 'rgba(216,210,196,0.55)', 'curve-style': 'bezier' } },
  { selector: 'node.ego', style: { 'border-color': colors.amber, 'border-width': 3 } },
  { selector: ':selected', style: { 'border-color': colors.amber, 'line-color': colors.amber } },
];
```

### Persisting graph positions to the meta table (cache)
```typescript
// src/features/graph/positionCache.ts
export async function savePositions(cy: cytoscape.Core): Promise<void> {
  const map: Record<string, { x: number; y: number }> = {};
  cy.nodes().forEach((n) => { map[n.id()] = { ...n.position() }; });
  await db.meta.put({ key: 'graphPositions', value: map });
}
export async function loadPositions(): Promise<Record<string, { x: number; y: number }> | undefined> {
  return (await db.meta.get('graphPositions'))?.value as Record<string, { x: number; y: number }> | undefined;
}
// hasCachedPositions = every current node id is present in loadPositions() → use layout 'preset'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class-component Cytoscape wrappers | `react-cytoscapejs` `CytoscapeComponent` + `cy` callback for imperative access | current (v2.0.0) | Use the `cy` prop to attach events + read the core; keep React declarative for `elements`/`stylesheet` |
| Layout extensions by default | Built-in `cose` is fast + high-quality for non-compound graphs | ongoing | No extension dependency needed for a social relationship graph |

**Deprecated/outdated:**
- Storing a per-side (two-record) relationship — superseded by the single canonical link queried from both ends (D-04).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dexie `.or()` over `fromId`/`toId` is the right reverse index (vs a stored multiEntry `endpointKeys`) | Pattern 1 | Low — if profiling shows `.or()` is slow at extreme scale, add `*endpointKeys`; both are additive |
| A2 | Graph positions can live in the `meta` table as regenerable local state (sync optional) | Pattern 3 | Low — positions are cosmetic; worst case cose recomputes on a fresh device |
| A3 | Built-in `cose` layout quality is adequate for v1 relationship graphs | Pattern 3 | Medium — if dense graphs look poor, a `fcose`/`cose-bilkent` extension is a scoped follow-up (adds a dep) |
| A4 | `autoungrabify:true` (locked nodes) is acceptable viewer-only UX | Pattern 3 | Low — if users want to rearrange, allow grab without persisting; revisit with UX |
| A5 | Transient rAF-throttled drag position is sufficient for "live-follow" connectors | Pattern 2 | Low — alternative is imperative Konva node refs; transient state is simpler and testable |
| A6 | `react-cytoscapejs` 2.0.0 mounts cleanly under React 19.2 (peer `react >=15`, no upper bound) | Standard Stack | Medium — verify at install; if peer errors, `npm install` may warn but should resolve (no hard upper bound) |
| A7 | Connector count stays modest enough that culling is optional in v1 | Pattern 2 | Low — culling hook already exists (Pattern 5) if needed |

**Empty?** No — the above need planner/UAT confirmation, especially A3 (layout quality) and A6 (React 19 peer at install).

## Open Questions

*Status: the layout/glyph/sync questions (#2 group-node visual, #3 position sync) are **RESOLVED** — both adopted in plan `04-04`. Question #1 (Locations→open-map defect) remains a **tracked external dependency** to be fixed via a separate `/gsd-debug` pass before REL-03 UAT sign-off (out of scope for Phase 4 execution).*

1. **TRACKED EXTERNAL DEPENDENCY (FLAGGED BLOCKER) — "can't navigate to a location from the list."**
   - What we know: The user reports opening a map from the Locations browse list (Phase-2/3 D-05) is broken. REL-03 connectors render on exactly that surface — you open a map to see connectors.
   - What's unclear: Whether it's a `showOnMap`/`activeMapId` wiring regression, a BrowseList handler gap, or map-seed logic. `App.tsx showOnMap` resolves a person's marker's `mapId`; the Locations list likely needs an analogous "open this map" path.
   - Disposition: **Out of scope for Phase 4 (a pre-existing Locations-navigation defect, not relationship work).** Run a separate **`/gsd-debug`** pass to fix it. The connectors feature is fully built + testable via the `__rb` bridge and the map-switcher path (`e2e/map-switch.spec.ts`), so Phase-4 execution is unblocked; only REL-03's **user-facing** UAT sign-off is gated on this fix. Tracked as a hard prerequisite in plan `04-03` (`## Prerequisite / Blocking Dependency`).

2. **RESOLVED — Group node visual (glyph vs shape-only).**
   - Decision (adopted in `04-04`): use **round (person) vs round-rectangle + paper-shade fill + label (group)** to distinguish type pre-attentively (honors UI-SPEC B8's intent). The `UsersRound`-glyph-as-SVG-background is optional polish, deferred — Cytoscape can't render a Lucide React component directly, and round-vs-square already carries the type signal.

3. **RESOLVED — Should graph positions sync across devices?**
   - Decision (adopted in `04-04`): **No for v1** — positions live in the Dexie `meta` table (`graphPositions`) as regenerable **local-only** state; a fresh device just runs `cose` once. No cross-device position sync. Revisit only if layout stability across devices becomes a requirement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm registry (install cytoscape, react-cytoscapejs) | REL-04 graph | ✓ | — | none needed (packages verified OK) |
| Node/npm build toolchain | Build/typecheck | ✓ | project builds today (Vite 7, TS 5.9) | — |

**Missing dependencies with no fallback:** none — purely an `npm install` of two verified packages.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit/integration) + Playwright 1.61.1 (E2E) |
| Config file | `vitest.config.ts` (present); `vite.config.ts` for build; fake-indexeddb 6.2.5 for Dexie tests |
| Quick run command | `npx vitest run <file> -t <name>` |
| Full suite command | `npm test` (`vitest run`) |

> Note ([[vitest-forks-timeout-under-load]]): post-merge `vitest run` can false-fail with fork-worker startup timeouts under load; re-run with `--no-file-parallelism` to confirm environmental vs code defect.
> Note ([[testbridge-requires-e2e-build-mode]]): `window.__rb` UAT DB-seeding is absent under `npm run dev`; use `npx vite --mode e2e` (or `build:e2e && preview`) for E2E that seeds the real repository.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-01 | Create a person↔person / person↔group / group↔group link with valid endpoints; Location endpoint rejected | unit | `npx vitest run src/db/repository.relationships.test.ts` | ❌ Wave 0 |
| REL-01 | `listRelationshipsFor(x)` returns links where x is `from` OR `to` (indexed `.or()`) | unit | `npx vitest run src/db/repository.relationships.test.ts -t "reverse lookup"` | ❌ Wave 0 |
| REL-02 | label/date/notes persist + round-trip through backup (`BackupSchema`) with endpoints | unit | `npx vitest run src/sync/relationshipRoundTrip.test.ts` | ❌ Wave 0 |
| REL-03 | Connector geometry: person↔person both placed → an Arrow; group-involving → none; drop when a marker is absent | unit | `npx vitest run src/features/person-map/connectors.test.ts` | ❌ Wave 0 |
| REL-03 | Connector follows a marker on drag (transient position) then persists on dragEnd | e2e | `npx playwright test tests/e2e/connectors.spec.ts` | ❌ Wave 0 |
| REL-04 | `toGraphElements` maps people/groups→nodes, links→edges, drops endpoint-less shells | unit | `npx vitest run src/features/graph/graphElements.test.ts` | ❌ Wave 0 |
| REL-04 | Position cache: cose→save→reopen uses `preset`; node-set change invalidates | unit | `npx vitest run src/features/graph/positionCache.test.ts` | ❌ Wave 0 |
| REL-04 | Node tap opens ProfileSidebar + announces selection (AT bridge); viewer-only (no edit) | e2e | `npx playwright test tests/e2e/graph.spec.ts` | ❌ Wave 0 |
| REL-01 | Deleting a Person/Group cascades its relationship-links (no orphan) | unit | `npx vitest run src/db/repository.relationships.test.ts -t "cascade"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>` (< 30s)
- **Per wave merge:** `npm test` (full Vitest); add `--no-file-parallelism` if fork timeouts appear
- **Phase gate:** Full Vitest suite green + the two Playwright specs before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/db/repository.relationships.test.ts` — create/validate/reverse-lookup/cascade (REL-01)
- [ ] `src/sync/relationshipRoundTrip.test.ts` — endpoints survive export/restore (REL-02)
- [ ] `src/features/person-map/connectors.test.ts` — pure connector geometry (REL-03)
- [ ] `src/features/graph/graphElements.test.ts` + `positionCache.test.ts` — pure graph mapping + cache (REL-04)
- [ ] `tests/e2e/connectors.spec.ts` + `tests/e2e/graph.spec.ts` — drag-follow + node-tap→sidebar (needs `--mode e2e` test bridge)
- Framework install: none — Vitest + Playwright already configured.

## Security Domain

### Applicable ASVS Categories (Level 1)
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth; Drive token handling unchanged |
| V3 Session Management | no | Unchanged |
| V4 Access Control | no | Single-curator, client-side; no server authz |
| V5 Input Validation | **yes** | zod `RelationshipLinkSchema` with `z.enum(['people','groups'])` on `fromType`/`toType`; validated at the write path AND at the untrusted-at-rest boundary (`BackupSchema` on import) |
| V6 Cryptography | no | Provider-level only in v1; no app crypto here |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via relationship `label`/`notes` or node/edge labels (could exfiltrate the Drive token, T-03-01) | Tampering / Info-disclosure | Render as React children / Konva `Text` / Cytoscape text — **never `dangerouslySetInnerHTML`**; Cytoscape draws labels to canvas (no DOM injection) |
| Malicious/corrupt backup with a relationship endpoint pointing at a non-existent or wrong-type (e.g. a Location/map) id | Tampering | `z.enum(['people','groups'])` rejects invalid `fromType`/`toType`; orphan-guard renders "(deleted person/group)" rather than crashing (T-03-10); import validates before the write transaction |
| Endpoint pointing at a deleted entity → dangling edge/connector | Denial of Service (crash) | Cascade-delete links on entity delete (Pitfall 3) + defensive orphan guard at both projections |
| Object-URL leak from graph avatars degrading the session | DoS (resource) | Revoke object URLs on unmount / hash change (Pitfall 2) |

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` — the material control here is **V5 input validation of endpoint types** and the **no-innerHTML** rule for all user-authored strings on both new surfaces.

## Sources

### Primary (HIGH confidence)
- Context7 `/cytoscape/cytoscape.js` — layout notation (`preset`/`grid`), `cose` layout doc ("very fast", "high-quality"), performance-tuning (`hideEdgesOnViewport`, `curve-style: haystack`, `pixelRatio`), elements JSON with `position` — fetched 2026-07-03.
- Context7 `/plotly/react-cytoscapejs` — `elements`/`stylesheet`/`layout` props, `cy` instance callback, `normalizeElements`, external-layout registration — fetched 2026-07-03.
- Codebase (direct read): `src/domain/types.ts`, `src/domain/schemas.ts`, `src/db/schema.ts`, `src/db/repository.ts`, `src/features/person-map/MapView.tsx`, `AvatarMarker.tsx`, `coords.ts`, `PersonPicker.tsx`, `src/features/profile/ProfileSidebar.tsx`, `src/features/nav/ViewSwitcher.tsx`, `NewEntityMenu.tsx`, `src/features/person-map/editor/LayersPanel.tsx`, `src/sync/serializer.ts`, `src/sync/syncEngine.ts`, `src/app/tokens.ts`, `src/app/App.tsx`, `package.json`, `.planning/config.json`.

### Secondary (MEDIUM confidence)
- npm registry (`npm view`) — `cytoscape@3.34.0`, `react-cytoscapejs@2.0.0` versions + peer deps, verified 2026-07-03.
- `gsd-tools query package-legitimacy check` — both packages `OK` (downloads, source repo, no postinstall).

### Tertiary (LOW confidence)
- none — all claims are tool-verified or codebase-grounded.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions + legitimacy tool-verified; both pre-prescribed by CLAUDE.md.
- Data model + reverse index: HIGH — grounded in the actual `RelationshipLink` triple, repository patterns, and Dexie `.or()` semantics.
- Connectors: HIGH — reuses the exact image-space/`imageToStage` model already proven in Phase 3; only the live-drag mechanism is a design recommendation (MEDIUM on A5).
- Graph + position cache: MEDIUM-HIGH — Cytoscape docs verified; `cose` quality on real data (A3) and React-19 peer (A6) are the residual unknowns.
- Sync/PWA: HIGH — grep-verified that `relationship-links` is wired through every sync branch.

**Research date:** 2026-07-03
**Valid until:** 2026-08-02 (stack is stable; re-verify `react-cytoscapejs` React-19 peer at install)

# Phase 4: Relationships & Graph - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 14 new/modified surfaces
**Analogs found:** 11 with in-repo analog / 14 total (3 net-new surfaces reuse structure but have no exact analog)

> RESEARCH.md already names the concrete analog files; this PATTERNS.md cross-checks them against the live code, pins **real line numbers**, and corrects two path assumptions the planner must not inherit:
> - **Test files do NOT live beside source.** Unit tests live in a top-level `tests/` tree mirroring `src/` (`tests/db/`, `tests/features/`, `tests/sync/`, `tests/domain/`). E2E specs live in `e2e/` (NOT `tests/e2e/`). RESEARCH.md's `src/db/repository.relationships.test.ts` / `tests/e2e/*.spec.ts` paths are wrong — see § Pattern Assignments (tests).
> - The `RelationshipLink` type/schema/repository triple already exists and is the exact analog for the change (self-analog): extend in place, mirror the Phase-3 `Marker.kind` optional-with-default precedent.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/types.ts` (extend `RelationshipLink`) | model | transform | `Marker` Phase-3 optional widening (same file, l.265-293) | exact (self) |
| `src/domain/schemas.ts` (extend `RelationshipLinkSchema`) | model/validation | transform | `MarkerSchema` optional-with-default (same file, l.148-170) | exact (self) |
| `src/db/schema.ts` (`version(5)` index-only) | migration | transform | `version(2)`/`version(4)` blocks (same file, l.72-121) | exact |
| `src/db/repository.ts` (`listRelationshipsFor`, endpoints on create/update, cascade) | service | CRUD + reverse-lookup | `createRelationshipLink`/`updateRelationshipLink` (l.459-499); `deleteEntity` cascade (l.181-215) | exact (self) |
| `src/sync/serializer.ts` (confirm round-trip) | service | file-I/O | `relationship-links` branch already present (l.36/59/82) | exact (no change expected) |
| `src/features/profile/ProfileSidebar.tsx` (+ Relationships section) | component | request-response | `groupPlacementsByMap` + "Appears on" block (same file, l.55-64, 196-215, 326-369) | exact |
| `src/features/profile/relationships.ts` (new pure helpers) | utility | transform | `groupPlacementsByMap` (ProfileSidebar l.55-64) | role-match |
| `src/features/profile/AddRelationshipDialog.tsx` (new) | component | request-response | `PersonPicker` (Radix Dialog picker) + `NewEntityMenu` item shape | role-match |
| `src/features/person-map/editor/ConnectorLayer.tsx` (new) | component | event-driven (viewer projection) | `MapView` L1 content layer + `imageToStage` compose (MapView l.594-616, 803-865); `AvatarMarker` Arrow-less geometry | role-match |
| `src/features/person-map/MapView.tsx` (+ connectors L1.5 + drag state) | component | event-driven | Its own 3-physical-layer Stage (l.782-901) | exact (self) |
| `src/features/person-map/AvatarMarker.tsx` (+ onDragMove) | component | event-driven | Its own `handleDragEnd` (l.87-104) | exact (self) |
| `src/features/person-map/editor/LayersPanel.tsx` (+ label toggle) | component | request-response | Its own `showLabels`/`onShowLabelsChange` names toggle (l.45-57, 253-255) | exact (self) |
| `src/features/graph/GraphView.tsx` (new) | component | event-driven | `MapView` host shell + `ViewSwitcher` view; no Cytoscape analog in repo | partial (new lib) |
| `src/features/graph/graphElements.ts` + `graphStyle.ts` + `positionCache.ts` (new) | utility | transform / CRUD | `coords.ts` pure module (whole file); `db.meta` k/v (schema.ts l.33-37) | role-match |
| `src/features/nav/ViewSwitcher.tsx` (+ 'graph' entry) | component | request-response | Its own `VIEW_ITEMS` + `ViewKey` (l.28-52) | exact (self) |
| `src/features/nav/NewEntityMenu.tsx` (REMOVE relationship-links item) | component | request-response | Its own `ITEMS` array (l.17-22) | exact (self) |

## Pattern Assignments

### `src/domain/types.ts` — extend `RelationshipLink` (model, transform)

**Analog:** the Phase-3 `Marker` widening in the same file (l.265-293) — new fields added **optional** so old records/backups validate with **no migration**. `EntityType` (l.299) already includes `'relationship-links'` and `'groups'`.

Current `RelationshipLink` (l.232-245) — add endpoint fields after `date`, mirroring `Marker`'s optional `kind`/`personId`/`targetMapId` precedent:
```typescript
// NEW: endpoints are people|groups only (Locations are NOT valid endpoints, D-07)
export type RelationshipEndpointType = 'people' | 'groups';

export interface RelationshipLink {
  // ...existing id/name/photo/gallery/notes/label/date/custom...
  fromType?: RelationshipEndpointType;   // optional so pre-Phase-4 shells validate
  fromId?: string;
  toType?: RelationshipEndpointType;
  toId?: string;
  directed?: boolean;                    // absent === false at read sites (Pitfall 4)
  updatedAt: number;
  dirty: boolean;
}
```
**Backup bundle** (l.338-354) needs no shape change — `'relationship-links': RelationshipLink[]` already carries whatever fields the interface gains.

---

### `src/domain/schemas.ts` — extend `RelationshipLinkSchema` (validation, transform)

**Analog:** `MarkerSchema` (l.148-170), which uses `z.enum(...).default('person')` and `.optional()` for the Phase-3 additive fields, plus the compile-time `satisfies` lock at file bottom (l.245, 261, 276).

Extend `RelationshipLinkSchema` (l.135-146) — the `_relationshipLinkCheck satisfies` lock (l.261) enforces mirror-correctness at compile time, so both edits ship together:
```typescript
const RelationshipEndpointTypeSchema = z.enum(['people', 'groups']);  // closed set → V5 input validation
export const RelationshipLinkSchema = z.object({
  // ...existing fields...
  fromType: RelationshipEndpointTypeSchema.optional(),
  fromId: z.string().optional(),
  toType: RelationshipEndpointTypeSchema.optional(),
  toId: z.string().optional(),
  directed: z.boolean().optional(),
  updatedAt: z.number(),
  dirty: z.boolean(),
});
```
`z.enum(['people','groups'])` is the security control (V5, T-02-01) that rejects a Location endpoint at both the write path and the untrusted-at-rest `BackupSchema` gate (l.219-233, which composes `RelationshipLinkSchema`).

---

### `src/db/schema.ts` — `version(5)` index-only upgrade (migration, transform)

**Analog:** `version(2)` (l.72-76, adds `relationshipLinks` with index string `'id, name, updatedAt, dirty'`) and `version(4)` (l.99-121). ⚠ This is **Dexie, not Drizzle** — `version(n).stores()` auto-upgrades in-browser, **no push step, no `.upgrade()` callback for an index-only change** (Pitfall 6, [[schema-gate-dexie-false-positive]]).

Append after l.121, before the constructor closes:
```typescript
// Phase 4 (REL-01): add fromId/toId indexes so listRelationshipsFor(x) is an indexed .or() union.
// Index-only — Dexie skips undefined keys, so pre-Phase-4 endpoint-less shells need NO data migration.
this.version(5).stores({
  relationshipLinks: 'id, name, updatedAt, dirty, fromId, toId',
});
```
No `.upgrade()` callback (contrast version(3)/(4) which backfill defaults — endpoints add no required field so none is needed).

---

### `src/db/repository.ts` — endpoints on create/update, `listRelationshipsFor`, cascade (service, CRUD + reverse-lookup)

**Analog A — create/update:** `createRelationshipLink` (l.459-477) and `updateRelationshipLink` (l.483-499). Extend `CreateRelationshipLinkInput` (l.449-457) and the `RelationshipLinkSchema.parse({...})` body with the five endpoint fields, passing them through exactly like `label`/`date`. Every write already follows the 3-invariant path (validate → stamp `updatedAt`+`dirty` → `emit`, l.1-8). `UpdateRelationshipLinkPatch` (l.479-481) is `Partial<Omit<...>>` so it **automatically covers the new fields** — mirrors the `UpdateMapPatch` note at l.265-271.

**Analog B — reverse lookup (net-new fn):** no `.or()` query exists yet, but the indexed-query idiom is established, e.g. `db.markers.where('personId').equals(id)` (l.190) and `db.fieldDefs.where('entityType').equals(...)` (l.523). Add:
```typescript
export async function listRelationshipsFor(entityId: string): Promise<RelationshipLink[]> {
  return db.relationshipLinks.where('fromId').equals(entityId)
    .or('toId').equals(entityId).toArray();
}
```
(Globally-unique nanoid ids ⇒ `fromId`/`toId` alone identify the entity; `fromType`/`toType` are render/validation only.)

**Analog C — cascade on delete:** `deleteEntity` (l.181-215) runs ONE `rw` transaction over `[db.people, db.maps, db.markers, db.groups, db.relationshipLinks, db.media]` — `db.relationshipLinks` is **already in the transaction table list** (l.184). It cascades markers by `personId`/`mapId` (l.190-191); add an analogous relationship-link cascade for `people`/`groups`:
```typescript
if (entityType === 'people' || entityType === 'groups') {
  await db.relationshipLinks.where('fromId').equals(id)
    .or('toId').equals(id).delete();
}
```
Emit is post-commit (l.214), consistent with the existing pattern.

---

### `src/sync/serializer.ts` — confirm round-trip (service, file-I/O) — NO CHANGE EXPECTED

**Analog / evidence:** the `relationship-links` branch is already wired in `SHARD_NAMES` (l.36), `serializeShards` (l.59, `.map(clean)`), and `deserializeShards` (l.82). New optional fields are plain JSON on the record → they serialize and round-trip with zero plumbing. The planner should add a **round-trip test** (below) rather than editing this file.

---

### `src/features/profile/ProfileSidebar.tsx` — + "Relationships" section (component, request-response)

**Analog:** the "Appears on" block is the exact structural template — a pure grouping helper + a reactive `useLiveQuery` read + a rendered list of jump buttons.

**Pure helper pattern** (l.55-64) — extract the new relationship-row builder the same way (put it in `relationships.ts`, below):
```typescript
export function groupPlacementsByMap(markers: Marker[]): PlacementGroup[] { /* pure, unit-testable */ }
```

**Reactive read pattern** (l.201-215) — mirror for links touching this entity:
```typescript
const placements = useLiveQuery(
  () => id && requestedType === 'people'
    ? db.markers.where('personId').equals(id).filter((m) => m.kind === 'person').toArray()
    : Promise.resolve<Marker[]>([]),
  [id, requestedType], [] as Marker[],
);
```
→ new: `useLiveQuery(() => id ? listRelationshipsFor(id) : Promise.resolve([]), [id], [])`, gated to `requestedType === 'people' || 'groups'` (Locations get NO section, D-03).

**Render + deleted-endpoint guard** (l.326-369) — the "Appears on" list renders jump buttons and a muted `(deleted map)` row (l.343-352) when a referenced entity is gone. Reuse verbatim for `(deleted person/group)` orphan-guard (Pitfall 3, T-03-10). `onOpenEntity` (props l.96-97) already exists for entity→entity navigation from a row. All user text renders as React children (l.16 XSS rule) — never `dangerouslySetInnerHTML`.

**Existing REL-02 fields already render:** label (l.372-379), date (l.380-387), notes (l.390-397) — no work for the relationship record's own data.

---

### `src/features/profile/relationships.ts` (new) — pure helpers (utility, transform)

**Analog:** `groupPlacementsByMap` (ProfileSidebar l.55-64) — a small exported pure fn, unit-tested without rendering (see `tests/features/appearsOn.test.ts`). Put "resolve the other endpoint given this entity id", "direction glyph selector", and "build relationship rows" here. Normalize `directed = link.directed === true` and **filter out links missing `fromId`/`toId`** (legacy shells, Pitfall 4).

---

### `src/features/profile/AddRelationshipDialog.tsx` (new) — entity picker + direction + data (component, request-response)

**Analog:** `PersonPicker` (a Radix Dialog entity picker opened from MapView, l.42, 933-942) for the pick-an-entity shape; `NewEntityMenu` (l.17-49) for the item-list idiom. Writes through `createRelationshipLink`/`updateRelationshipLink` (never straight to Dexie). Endpoint picker must **never list Locations** (D-03/D-07). Direction glyphs: `ArrowRight`/`ArrowLeftRight` from `lucide-react` (already imported in ViewSwitcher l.19).

---

### `src/features/person-map/editor/ConnectorLayer.tsx` (new) — data-driven connectors (component, event-driven projection)

**Analog:** MapView's content-layer compose+cull pass (l.594-616) and its JSX marker map (l.839-865), plus `AvatarMarker`'s image-space discipline. Geometry is derived, never stored (D-10).

**Compose pattern to reuse** (`imageToStage` from `coords.ts`, MapView l.605):
```typescript
pos: imageToStage({ x: item.object.x, y: item.object.y }, transform)
```
The connector endpoints resolve each person's marker on the active map → `imageToStage(markerImageXY, transform)`, then draw a Konva `Arrow` (arrowhead only when `directed`, per RESEARCH Pattern 2). Only **person↔person links where both people have a marker on the active map** produce a connector (D-07); group-involving links never render here.

**Selection color** reads shared tokens (`colors.amber` for selected, hairline paper otherwise) exactly like `AvatarMarker` ring (AvatarMarker l.80-81, `colors.amber`/`colors.paper` from `@/app/tokens`). Never inline hexes.

---

### `src/features/person-map/MapView.tsx` — + connectors layer L1.5 + transient drag state (component, event-driven)

**Analog (self):** the 3-physical-layer Stage (l.782-901): `<Layer listening={editingBackground}>` (L0 bg, l.786), `<Layer>` (L1 content, l.809), `<Layer>` (L2 transformer, l.898). Insert the new connectors layer as the **second `<Layer>` child** (between L0 and L1), `listening={false}`:
```tsx
<Layer listening={false}>{/* ConnectorLayer — paints beneath markers, never intercepts drags */}</Layer>
```
Feed it from the same live queries already present: `markers` (l.195-200), `people` (l.201), `map.backgroundTransform`→`transform` (l.209). Add a new `useLiveQuery(() => db.relationshipLinks.toArray())` for links. Transient drag-follow state (`{markerId,x,y}`, rAF-throttled) lives here, cleared on `dragEnd` (Pitfall 1).

---

### `src/features/person-map/AvatarMarker.tsx` — + `onDragMove` prop (component, event-driven)

**Analog (self):** `handleDragEnd` (l.87-104) already converts the dropped stage point back to image space via `stageToImage(transform)` and persists through `upsertMarker`. Add a sibling `onDragMove` prop that pushes the live **stage** position up to MapView's transient state (no Dexie write per frame — persistence stays on `dragEnd`). Wire it on the `<Group ... onDragEnd={handleDragEnd}>` (l.147).

---

### `src/features/person-map/editor/LayersPanel.tsx` — + "Relationship labels" toggle (component, request-response)

**Analog (self):** the D-20 name-label toggle — props `showLabels`/`onShowLabelsChange` (l.45-57) and the checkbox (l.253-255). Add a parallel `showConnectorLabels` toggle (connector labels default OFF, D-09) with the identical controlled-checkbox shape. MapView owns the boolean state exactly like `showLabels` (MapView l.341).

---

### `src/features/graph/` (new: GraphView.tsx, graphElements.ts, graphStyle.ts, positionCache.ts) — Cytoscape viewer (component + utilities)

**No in-repo Cytoscape analog** (net-new lib `cytoscape` + `react-cytoscapejs`). Reuse these structural analogs:
- **Host-shell + AT bridge:** `MapView` container/`useLiveQuery` shell (MapView l.171-201) and `ProfileSidebar`'s `aria-live` selection announcement (ProfileSidebar l.263-266, 234-237). Node tap → open `ProfileSidebar` via the same `onSelect(type,id)` callback shape.
- **Pure element mapping:** model on `coords.ts` (a pure, fully unit-tested module). `toGraphElements(people, groups, links, positions?)` filters links missing `fromId`/`toId` (Pitfall 4). Use RESEARCH § Code Examples verbatim as the starting implementation.
- **Style tokens:** import `colors` from `@/app/tokens` (verified names: `amber` #C8742B, `paper` #F4F1EA, `paperShade` #E7E2D6, `slate` #1B2230, `ink` #26211A, `inkMuted` #6B6358 — tokens.ts l.14-26). Amber reserved for selection/ego only.
- **Position cache:** `db.meta` k/v table (schema.ts `MetaRecord` l.33-37, `meta: 'key'` index l.65). `db.meta.put({ key: 'graphPositions', value })` / `db.meta.get('graphPositions')`.
- **Object-URL discipline for node avatars:** mirror `ProfileSidebar`'s effect that resolves `getMedia(hash)` and cancels on unmount (l.218-230) and `useBlobImage`/`useMapImage`; revoke on unmount/hash change (Pitfall 2).

---

### `src/features/nav/ViewSwitcher.tsx` — + 'graph' view entry (component, request-response)

**Analog (self):** `ViewKey` union (l.28), `VIEW_ITEMS` array (l.46-52), and the `Share2`/`Workflow` glyph note. Add `'graph'` to `ViewKey` and a `{ key: 'graph', label: 'Graph', icon: Share2 }` item (import `Share2` from `lucide-react` alongside l.14-22). The roving-focus indexing (l.79-111) is driven off `VIEW_ITEMS` length, so it adapts automatically. Graph is not an entity table, so it carries **no count pill** (like `'map'`, l.119).

---

### `src/features/nav/NewEntityMenu.tsx` — REMOVE relationship-links item (component, request-response)

**Analog (self):** the `ITEMS` array (l.17-22). Delete the `{ type: 'relationship-links', label: '+ Relationship-link' }` entry (l.21) per D-05. Keep People/Location/Group. `EntityFormType` may still allow `'relationship-links'` for the browse-list edit surface, which stays.

## Shared Patterns

### Write path (validate → stamp → emit)
**Source:** `src/db/repository.ts` l.1-8 (contract) and every create/update fn (e.g. l.459-477).
**Apply to:** all relationship writes — `RelationshipLinkSchema.parse({...})`, stamp `updatedAt: Date.now()` + `dirty: true`, then `emit({ entityType: 'relationship-links', entityId, op })`. Never write straight to Dexie.

### Reactive read (`useLiveQuery`, Dexie = source of truth)
**Source:** MapView l.190-201; ProfileSidebar l.178-215; ViewSwitcher l.66-69.
**Apply to:** ProfileSidebar Relationships section, ConnectorLayer link feed, GraphView elements. Both projections rebuild from `listRelationshipsFor`/`db.relationshipLinks` live — never a persisted derived copy.

### Image-space ↔ stage-space composition
**Source:** `src/features/person-map/coords.ts` (`imageToStage`/`stageToImage`, whole file); consumed in MapView l.605 and AvatarMarker l.88.
**Apply to:** ConnectorLayer geometry — connectors MUST compose through the same `backgroundTransform` to stay anchored on background re-fit and follow marker drags (D-08).

### Deleted-endpoint / orphan guard (muted row, no crash)
**Source:** ProfileSidebar "(deleted map)" row (l.343-352); MapView portal deleted-target message (l.944-958, `PORTAL_TARGET_DELETED_MESSAGE`).
**Apply to:** ProfileSidebar Relationships section ("(deleted person/group)"), GraphView, ConnectorLayer — defensively skip/mute links whose other endpoint is gone (Pitfall 3, T-03-10).

### Shared design tokens, amber-for-selection only
**Source:** `src/app/tokens.ts` l.7-26; AvatarMarker l.80-81.
**Apply to:** ConnectorLayer stroke, GraphView stylesheet, ego highlight. Import `colors` from `@/app/tokens`; amber (`#C8742B`) is reserved for selection/creation.

### XSS boundary (never `dangerouslySetInnerHTML`)
**Source:** ProfileSidebar header comment l.16; AvatarMarker label l.219-233; MapView zone labels.
**Apply to:** all relationship `label`/`notes` and graph/connector labels — render as React children / Konva `Text` / Cytoscape canvas text (threat T-03-01 — token exfiltration).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/features/graph/GraphView.tsx` | component | event-driven | First Cytoscape/`react-cytoscapejs` surface in the repo; structural analogs (MapView shell, AT bridge, token styling) apply but the library integration is net-new. Use RESEARCH § Pattern 3 + Code Examples as the reference implementation. |
| `src/features/graph/positionCache.ts` | utility | CRUD | No prior `db.meta` cache read/write helper exists (meta table is used for manifest/sync metadata only); model on `coords.ts` purity + `db.meta` k/v shape (schema.ts l.33-37). |
| `src/db/repository.ts` `listRelationshipsFor` (`.or()`) | service | reverse-lookup | No existing `.or()` union query; the `.where().equals()` indexed-query idiom (l.190, 523) is the closest precedent. |

## Test Analogs (⚠ path convention correction)

Tests do **NOT** live beside source. Convention (from `git ls-files`):

| New Test (planner should create) | Directory Convention | Analog to Copy From |
|----------------------------------|----------------------|---------------------|
| relationship create/validate/reverse-lookup/cascade (REL-01) | `tests/db/` | `tests/db/delete.cascade.test.ts` (l.1-43: `beforeEach` clears all tables incl. `db.relationshipLinks`; imports from `@/db/repository`; `fake-indexeddb`) |
| endpoints survive export/restore (REL-02) | `tests/sync/` | `tests/sync/serializer.entities.test.ts`, `tests/backup/roundtrip.entities.test.ts` |
| pure connector geometry (REL-03) | `tests/features/` | `tests/features/coords.test.ts` (l.12-30: pure `imageToStage`/`stageToImage` assertions, no DOM) |
| `toGraphElements` + `positionCache` (REL-04) | `tests/features/` | `tests/features/appearsOn.test.ts` (pure helper), `tests/features/coords.test.ts` |
| drag-follow connectors E2E (REL-03) | `e2e/` (NOT `tests/e2e/`) | `e2e/place-person.spec.ts` (l.1-40: `window.__rb` bridge seeding, Konva pointer harness, `resetDb`) |
| node-tap→sidebar E2E (REL-04) | `e2e/` | `e2e/marker.spec.ts`, `e2e/profile.spec.ts` |

E2E needs the `--mode e2e` build for the `window.__rb` bridge ([[testbridge-requires-e2e-build-mode]]). Run unit tests with `npx vitest run <file>`; if fork timeouts appear post-merge, re-run `--no-file-parallelism` ([[vitest-forks-timeout-under-load]]).

## Metadata

**Analog search scope:** `src/domain/`, `src/db/`, `src/sync/`, `src/features/{profile,person-map,person-map/editor,nav,graph}`, `src/app/`, `tests/`, `e2e/`.
**Files read (analogs):** types.ts, schemas.ts, db/schema.ts, db/repository.ts, sync/serializer.ts, ProfileSidebar.tsx, coords.ts, MapView.tsx, AvatarMarker.tsx, ViewSwitcher.tsx, NewEntityMenu.tsx, tokens.ts (grep), LayersPanel.tsx (grep), tests/db/delete.cascade.test.ts, tests/features/coords.test.ts, e2e/place-person.spec.ts.
**Pattern extraction date:** 2026-07-03

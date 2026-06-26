# Phase 3: Map Editor — Spaces & Navigation - Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 22 (new + modified)
**Analogs found:** 22 / 22 (every new file has an in-repo analog — this phase is almost pure composition of existing patterns)

## File Classification

### Data-model triple + persistence (Wave 0 — schema expansion)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/types.ts` (MODIFY) | model | transform | itself — existing `Marker`/`MapDoc` interfaces | exact (in-file extension) |
| `src/domain/schemas.ts` (MODIFY) | model | transform | itself — existing `MarkerSchema`/`MapDocSchema` + `satisfies` locks | exact (in-file extension) |
| `src/db/schema.ts` (MODIFY) | config | transform | itself — `version(3)` Dexie upgrade block | exact (add `version(4)`) |
| `src/db/repository.ts` (MODIFY) | service | CRUD | itself — `upsertMarker` / `updateMap` / `deleteMarker` | exact (extend signatures) |
| `src/sync/serializer.ts` | service | transform | itself — **NO CHANGE** (maps/markers shards carry sub-objects/fields for free) | n/a (verified rides existing shard) |
| `src/sync/syncEngine.ts` | service | pub-sub | itself — **NO CHANGE** (`maps`/`markers` already in `ENTITY_TYPES`) | n/a (verified) |

### Canvas / editor (new `src/features/person-map/editor/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/person-map/MapView.tsx` (MODIFY) | component | event-driven | itself — Stage host, `maps[0]` → active-map | exact (generalize) |
| `src/features/person-map/AvatarMarker.tsx` (MODIFY) | component | event-driven | itself — draggable Group + `upsertMarker` | exact (add transform + label) |
| `editor/PortalGlyph.tsx` | component | event-driven | `AvatarMarker.tsx` (draggable Group, click/tap, persist) | role+flow match |
| `editor/ShapeNode.tsx` | component | event-driven | `AvatarMarker.tsx` (Konva node reading a descriptor, drag-persist) | role+flow match |
| `editor/ZoneLabel.tsx` | component | render | `AvatarMarker.tsx` initials `<Text>` block (no innerHTML) | partial (Text-render only) |
| `editor/TransformerOverlay.tsx` | component | event-driven | `AvatarMarker.tsx` ref/`getStage()` usage + RESEARCH Pattern 1 | role match (new imperative pattern) |
| `editor/useToolMode.ts` | hook | event-driven | `MapView.tsx` `handleWheel` (Konva event → state) | partial (state machine is new) |
| `editor/useViewportCulling.ts` | hook | transform | `MapView.tsx` size/ResizeObserver effect + RESEARCH culling example | partial |
| `coords.ts` | utility | transform | `MapView.tsx` `handleWheel` mousePointTo math (stage↔world transform) | partial |

### Editor chrome (DOM, Radix)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `editor/ToolPalette.tsx` | component | request-response | `nav/ViewSwitcher.tsx` / `BrowseList` segmented toggle | role match |
| `editor/LayersPanel.tsx` | component | CRUD | `fields/FieldManager.tsx` (list + reorder + show/hide) | role match |
| `editor/Breadcrumb.tsx` | component | request-response | `connect/ReconnectBanner.tsx` (thin nav bar) | partial |
| `editor/MapSwitcher.tsx` | component | request-response | `nav/NewEntityMenu.tsx` (Radix DropdownMenu) | exact |
| `editor/PersonPicker.tsx` | component | request-response | `browse/BrowseList.tsx` (searchable list) + `NewEntityMenu` | role match |
| `editor/PortalTargetPicker.tsx` | component | request-response | `PersonPicker` + `App.tsx` create-map flow (`createMap`) | role match |
| `editor/StylePopover.tsx` | component | request-response | `nav/NewEntityMenu.tsx` (Radix surface) + `tokens.ts` palette | partial |
| `src/app/App.tsx` (MODIFY) | provider | event-driven | itself — view switcher + active-map state host | exact (extend) |

---

## Pattern Assignments

### `src/domain/types.ts` (MODIFY — model, transform)

**Analog:** the existing `Marker` (l.171-179) and `MapDoc` (l.111-128) interfaces.

**Marker — add per-placement transform fields + portal discriminator (D-13, D-14, RESEARCH Pattern 5a).**
Existing (l.171-179):
```typescript
export interface Marker {
  id: string;
  mapId: string;
  personId: string;
  x: number;
  y: number;
  updatedAt: number;
  dirty: boolean;
}
```
Extend per RESEARCH "Recommend (a): a discriminated `Marker`" — add optional `width/height/rotation`, make `personId` optional, add `kind: 'person' | 'portal'` + optional `targetMapId`. Keep optional-with-default so old rows validate (RESEARCH Pitfall 7). `x/y` become **image-space** coordinates (Pattern 7) — same field, reinterpreted, no rename.

**MapDoc — add sub-objects (RESEARCH Data-Model Tradeoff Option A, recommended).**
Existing spine (l.111-128) already carries `background: MediaRef`, `width`, `height`. Add: `parentId?: string` (D-09 hierarchy), a `backgroundTransform` descriptor `{ offsetX, offsetY, scale, rotation }` (D-16), and `shapes: Shape[]`, `zones: Zone[]` (or one styled-shape array), `layers: Layer[]` (D-04). New `Shape`/`Zone`/`Layer` interfaces follow the existing interface style (id via nanoid, plain fields). **No new `EntityType` member** — they ride the `maps` shard.

**Anti-pattern to avoid:** do NOT widen `EntityType` (l.185) for shapes/zones/layers — RESEARCH "Anti-Patterns" + the `field-defs` precedent (the union is also `FieldDef.entityType` and a `Record<EntityType,...>` key; widening has high blast radius).

---

### `src/domain/schemas.ts` (MODIFY — model, transform)

**Analog:** `MarkerSchema` (l.101-109), `MapDocSchema` (l.63-75), and the `satisfies` lock block (l.189-212).

**Critical pattern — mirror every type change with a zod field AND preserve the `satisfies` lock.** Every new field added to `types.ts` must appear here, and the `const _markerCheck = {} as MarkerInput satisfies Marker` / `_mapDocCheck` lines (l.192-191) must still compile.

**New fields must be OPTIONAL-with-default** so a pre-Phase-3 cloud shard / backup still validates (RESEARCH Pitfall 7; mirrors the `'field-defs': ShardPointerSchema.optional()` precedent at l.151). Example shape for the marker additions:
```typescript
// in MarkerSchema (extend l.101-109):
  kind: z.enum(['person', 'portal']).default('person'),
  personId: z.string().optional(),
  targetMapId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
```
Add `ShapeSchema` / `ZoneSchema` / `LayerSchema` next to the entity schemas; reference them as `z.array(...).default([])` inside `MapDocSchema`. Add the matching `satisfies` checks at the bottom.

**`BackupSchema` (l.158-172) needs no structural change** — `maps`/`markers` arrays already flow through it; the new optional fields ride along. Confirm an old backup still parses (Pitfall 7).

---

### `src/db/schema.ts` (MODIFY — config, transform)

**Analog:** the `version(3)` upgrade block (l.82-88) — a `stores({})` no-schema-change upgrade with a `.upgrade(async (tx) => ...)` backfill.

**Add a `version(4)` upgrade** that backfills defaults so existing IndexedDB data gains the new shape (RESEARCH Runtime State Inventory):
```typescript
// Source pattern: schema.ts l.82-88 (version(3) custom backfill)
this.version(4).stores({}).upgrade(async (tx) => {
  // markers: default kind/transform; x/y already valid as image-space at identity transform
  await tx.table('markers').toCollection().modify((m: { kind?: string }) => {
    if (m.kind === undefined) m.kind = 'person';
  });
  // maps: identity background transform + empty shapes/zones/layers + default layer
  await tx.table('maps').toCollection().modify((map: { backgroundTransform?: unknown; layers?: unknown[] }) => {
    if (map.backgroundTransform === undefined)
      map.backgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
    if (map.layers === undefined) map.layers = [/* default "Markers" layer */];
    // shapes/zones default [] ...
  });
});
```
**No index changes needed** — `markers` is already indexed by `mapId` + `personId` (l.61), which satisfies multi-placement (MAP-05) and "Appears on" (D-12). **NOT a Drizzle/Prisma migration — no push step** (l.10-11 comment; MEMORY `schema-gate-dexie-false-positive`). The identity-transform reinterpretation means **no per-marker coordinate rewrite** (RESEARCH A1 — prove with a round-trip test).

---

### `src/db/repository.ts` (MODIFY — service, CRUD)

**Analog:** `upsertMarker` (l.287-302), `updateMap` (l.263-276), `deleteMarker` (l.147-150), `createMap` (l.239-256).

**The single-mutation-path contract (l.1-7):** every write = (1) validate via zod, (2) stamp `updatedAt: Date.now()` + `dirty: true`, (3) `emit(...)`. New writes MUST follow it; never write straight to Dexie (RESEARCH Pitfall/Anti-pattern + Pitfall 1 keeps react-konva render() in sync).

**Extend `UpsertMarkerInput` + `upsertMarker` (l.279-302)** to accept `kind`/`width`/`height`/`rotation`/`targetMapId`:
```typescript
// Existing shape to extend (l.287-302):
export async function upsertMarker(input: UpsertMarkerInput): Promise<Marker> {
  const id = input.id ?? nanoid();
  const existed = input.id ? (await db.markers.get(input.id)) !== undefined : false;
  const marker: Marker = MarkerSchema.parse({ id, /* ...new fields... */, updatedAt: Date.now(), dirty: true });
  await db.markers.put(marker);
  emit({ entityType: 'markers', entityId: id, op: existed ? 'update' : 'create' });
  return marker;
}
```

**Shapes/zones/layers/parentId/backgroundTransform write through `updateMap` (l.263-276)** — they are MapDoc sub-objects, so `updateMap(mapId, { shapes, layers, backgroundTransform, parentId })` already validates + stamps + emits with **zero new repository function** (RESEARCH Don't-Hand-Roll). `UpdateMapPatch` (l.259) is `Partial<Omit<MapDoc,...>>` so the new fields are patchable for free once added to the type.

**Portal delete = `deleteMarker` (l.147-150)** (marker-only, no cascade) — a portal is a Marker. "Place existing person" (D-11) = `upsertMarker({ mapId, personId, x, y })` with no `id` → new row (RESEARCH Pattern 4, l.330).

---

### `src/features/person-map/MapView.tsx` (MODIFY — component, event-driven)

**Analog:** itself (the whole file is the skeleton this phase grows).

**Generalize `maps[0]` → active-map (D-05).** Replace the live query at l.58:
```typescript
// CURRENT (l.58): single map
const map = useLiveQuery(() => db.maps.toArray().then((m) => m[0] ?? null), [], null);
// PHASE 3: an active-map id (lifted to App.tsx state, see App.tsx assignment) drives the query:
const map = useLiveQuery(() => activeMapId ? db.maps.get(activeMapId) : Promise.resolve(null), [activeMapId]);
```

**Three physical Konva layers (RESEARCH Pattern 3 / diagram).** Today there are two `<Layer>`s (l.141 bg `listening={false}`, l.142 markers). Phase 3 = L0 background (+ image transform), L1 content (shapes/zones/portals/markers tagged `layerId`, culled), L2 transformer overlay. **Do NOT add one `<Layer>` per user layer** (RESEARCH Pitfall 2) — user layers are logical, rendered into L1.

**Reuse the wheel-zoom transform math (l.105-124) for pinch-zoom** (RESEARCH Pattern 6) — the `mousePointTo` / reposition pattern is identical; factor it into `coords.ts`.

**Background image transform** attaches to the `<KonvaImage>` at l.141 reading `map.backgroundTransform`; markers compose through `coords.ts imageToStage` (Pattern 7).

**Empty-state upload affordance (l.160-195) stays** — it is the create-first-map path; `handleFile` → `createMap` (l.80-102) is reused as-is.

---

### `src/features/person-map/AvatarMarker.tsx` (MODIFY — component, event-driven) — TEMPLATE for PortalGlyph + ShapeNode

**Analog:** itself.

**Drag-persist pattern (l.42-50)** is the exact template for every placed object's write-back:
```typescript
function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
  void upsertMarker({ id: marker.id, mapId: marker.mapId, personId: marker.personId,
    x: e.target.x(), y: e.target.y() });
}
```
Phase 3: convert `e.target.x()/y()` from stage → image space via `coords.ts stageToImage` before persisting (Pattern 7), and add `width/height/rotation` on `onTransformEnd` (RESEARCH Pattern 1).

**Click/tap pairing (l.58-59)** `onClick`/`onTap` is the template; PortalGlyph adds `onDblClick`/`onDblTap` → navigate (D-07).

**Name-label child (D-20, default hidden):** add a `<Text>` child gated by a `showLabels` prop, rendered the same XSS-safe way as the initials `<Text>` (l.97-109) — **never `dangerouslySetInnerHTML`** (RESEARCH Anti-pattern, CONTEXT l.114).

**Selection ring already reads `colors.amber` (l.38, l.13)** — the Transformer overlay must use the same `colors.amber` for handles (amber-for-selection rule, tokens.ts l.19).

**Transformer attach note (RESEARCH Pattern 1 note / A3):** the marker is a composite `Group` with stem-tip origin and avatar offset up (l.52-126); verify the Transformer resizes acceptably or attach to an inner sizing node.

---

### `editor/PortalGlyph.tsx` (NEW — component, event-driven)

**Analog:** `AvatarMarker.tsx` (whole file).
Copy the draggable-`Group` + `handleDragEnd` + `onClick`/`onTap` structure. Differences: render a door/diamond glyph (NOT a circle) in portal-blue `#3E6B8C` (RESEARCH Pattern 5; add the token to `tokens.ts` colors l.12-29), and add `onDblClick`/`onDblTap` → set target map active (D-07). It is a `Marker` with `kind: 'portal'` + `targetMapId`, so it persists through `upsertMarker` exactly like AvatarMarker.

---

### `editor/ShapeNode.tsx` / `editor/ZoneLabel.tsx` (NEW — component)

**Analog:** `AvatarMarker.tsx` (Konva-node-from-descriptor + drag-persist) and its `<Text>` block (l.97-109) for the zone label.
Render `Konva.Rect`/`Ellipse`/`Line`/`Line closed` from a `Shape` descriptor (RESEARCH Don't-Hand-Roll). Persist position/transform through `updateMap` (shapes are MapDoc sub-objects), NOT `upsertMarker`. Zone label = a `Konva.Text` chip rendered exactly like the initials text — XSS-safe, no innerHTML. Style from the UI-SPEC preset palette via `tokens.ts` (D-03).

---

### `editor/TransformerOverlay.tsx` (NEW — component, event-driven)

**Analog:** RESEARCH Pattern 1 (verified Konva docs) + `AvatarMarker.tsx` `getStage()`/ref usage.
Single `Konva.Transformer` attached imperatively via ref + `useEffect` (no pure-declarative way). **Reset `scaleX/scaleY` to 1 on `transformend`, bake into width/height, persist via the repository** (RESEARCH Pattern 1 + Anti-pattern: never persist raw scale). Handles use `colors.amber`; `anchorSize` 24 on coarse pointers (D-19 touch). Effect must be idempotent (RESEARCH Pitfall 1 — StrictMode double-run).

---

### `editor/useToolMode.ts` / `coords.ts` / `editor/useViewportCulling.ts` (NEW — hook/utility)

**Analog:** `MapView.tsx` `handleWheel` (l.105-124) for `coords.ts` stage↔world math; `MapView.tsx` ResizeObserver effect (l.70-78) for the viewport-rect hook.
These are the two genuinely-new pieces of logic (RESEARCH "Don't Hand-Roll" key insight): the tool-mode/gesture state machine and the image-space coordinate composition. Concentrate tests here. `coords.ts` = `imageToStage`/`stageToImage` (RESEARCH Pattern 7 code). `useToolMode` toggles `Stage.draggable` by tool (RESEARCH Pattern 2/Pitfall 3). `useViewportCulling` = the `visibleStageRect`/`intersects` functions (RESEARCH Code Examples).

---

### `editor/MapSwitcher.tsx` (NEW — component, request-response)

**Analog:** `nav/NewEntityMenu.tsx` (whole file — exact match).
Copy the Radix `DropdownMenu.Root` → `Trigger asChild` → `Portal` → `Content` → `Item` structure (l.26-52), feeding it `db.maps.toArray()` (via `useLiveQuery`) instead of the static `ITEMS` list. Selecting an item sets the active-map id (lifted to App.tsx). Reuses the already-installed `@radix-ui/react-dropdown-menu`.

---

### `editor/LayersPanel.tsx` (NEW — component, CRUD)

**Analog:** `fields/FieldManager.tsx` (list + reorder + per-row toggle) and `BrowseList` reorder/segmented controls.
A logical-layer list (`{id,name,visible,locked,order}`) with show/hide/lock/reorder, persisted on `MapDoc.layers` via `updateMap`. Render order/visibility filtering follows RESEARCH Pattern 3. Reorder mirrors the `reorderFieldDefs` mental model (repository.ts l.656-672) but writes to the MapDoc sub-array.

---

### `editor/ToolPalette.tsx` / `editor/Breadcrumb.tsx` (NEW — component)

**Analog:** `nav/ViewSwitcher.tsx` + `BrowseList` segmented sort toggle (l.140-161) for the tool palette (active segment = paper-pull + ink, **never amber** except the create/place semantics — tokens.ts l.19). `connect/ReconnectBanner.tsx` for the thin breadcrumb bar. Breadcrumb walks `MapDoc.parentId` up the chain (D-10); each crumb sets that map active.

---

### `editor/PersonPicker.tsx` / `editor/PortalTargetPicker.tsx` (NEW — component, request-response)

**Analog:** `browse/BrowseList.tsx` (searchable/scrollable entity list) + `App.tsx` `createMap` create flow.
PersonPicker (D-11) lists `db.people` and on pick calls `upsertMarker({ mapId: activeMap.id, personId, x, y })` (new row). PortalTargetPicker (D-08) lists `db.maps` PLUS a "Create a new map…" item that runs the `createMap` flow inline; on cancel, remove the just-dropped portal via `deleteMarker` (RESEARCH Pattern 5: don't leave a target-less portal). Both can use Radix Dialog (installed) or optional Popover.

---

### `src/app/App.tsx` (MODIFY — provider, event-driven)

**Analog:** itself — it already hosts `activeView` state (l.33), the `map` live query (l.79), and the marker auto-place flow (l.135-157).

**Lift active-map id to App state** (next to `activeView`, l.33) and pass it to `MapView` + `MapSwitcher` + `Breadcrumb`. The existing `showOnMap` (l.167-172) and "Appears on" (D-12) hook into this: set active-map + center the marker. The Locations browse list "show on map" (l.235) is the D-05 entry point — extend it to set the active map, not just switch to the map view. The `handleSaved` auto-place block (l.139-150) already demonstrates the `upsertMarker` center-of-map placement pattern PersonPicker reuses.

---

## Shared Patterns

### Single mutation path (validate → stamp → emit)
**Source:** `src/db/repository.ts` l.1-7 (contract), `upsertMarker` l.287-302, `updateMap` l.263-276.
**Apply to:** every new write — markers (transform/portal), shapes/zones/layers/parentId/backgroundTransform (all via `updateMap`). Never write straight to Dexie (breaks dirty/sync AND desyncs react-konva render() — RESEARCH Pitfall 1).

### Type ↔ schema ↔ Dexie triple with `satisfies` lock
**Source:** `types.ts` ↔ `schemas.ts` (l.189-212 lock block) ↔ `schema.ts` (`version(n)` upgrades).
**Apply to:** every new field/type. New fields optional-with-default (RESEARCH Pitfall 7; `'field-defs'` optional precedent, schemas.ts l.151). Dexie upgrade is `version(4)` — no migration push (schema.ts l.10-11; MEMORY note).

### Sharded persistence — rides existing shards (zero sync wiring)
**Source:** `sync/serializer.ts` (`maps`/`markers` already serialized, l.55-62), `sync/syncEngine.ts` (`ENTITY_TYPES` includes `maps`+`markers`, l.84-130). VERIFIED this session.
**Apply to:** shapes/zones/layers/parentId/backgroundTransform (MapDoc sub-objects → `maps` shard) and Marker transform/portal fields (`markers` shard). **Do NOT** add a new `EntityType` shard family (RESEARCH Data-Model Tradeoff Option B rejected; field-defs blast-radius precedent).

### Canvas/DOM color parity (amber = selection only)
**Source:** `src/app/tokens.ts` (`colors` l.12-29, `marker` l.53-64); consumed by `AvatarMarker.tsx` l.13,38.
**Apply to:** Transformer handles, selection rings, tool-palette active segment, portal-blue glyph (add a token). Amber reserved for create/place/select (tokens.ts l.19); add portal-blue `#3E6B8C` to the same file so canvas never drifts.

### XSS-safe canvas text (no innerHTML)
**Source:** `AvatarMarker.tsx` initials `<Text>` l.97-109.
**Apply to:** all user text on canvas — zone labels (ZoneLabel), marker name labels (D-20). Render as Konva `Text` children only (threat T-03-01, CONTEXT l.114).

### Radix DropdownMenu / Dialog chrome (accessible, installed)
**Source:** `nav/NewEntityMenu.tsx` l.26-52 (DropdownMenu); `common/ConfirmDialog.tsx` (Dialog).
**Apply to:** MapSwitcher (DropdownMenu), PersonPicker / PortalTargetPicker / StylePopover (Dialog or optional Popover). Don't hand-roll focus-trap/Esc.

### Reactive reads via useLiveQuery
**Source:** `MapView.tsx` l.58-65, `BrowseList.tsx` l.71-82, `App.tsx` l.79.
**Apply to:** active-map query, per-map markers/shapes, "Appears on" (`db.markers.where('personId').equals(id)`), MapSwitcher map list. Auto re-render on Dexie change — no hand-rolled listeners.

---

## No Analog Found

None. Every new file has a strong in-repo analog. The two pieces with the weakest analog (genuinely new logic, only partial matches) are:

| File | Role | Data Flow | Note |
|------|------|-----------|------|
| `editor/useToolMode.ts` | hook | event-driven | The pan/draw/select/transform state machine is new; ground it in `MapView` Konva-event handling + RESEARCH Pattern 2/6. Highest test value alongside `coords.ts`. |
| `coords.ts` | utility | transform | Image-space↔stage-space composition is new; partial analog in `MapView.handleWheel` transform math + RESEARCH Pattern 7. The migration round-trip test (RESEARCH A1) is the single most important test in the phase. |

---

## Metadata

**Analog search scope:** `src/features/person-map/`, `src/features/nav/`, `src/features/browse/`, `src/features/fields/`, `src/domain/`, `src/db/`, `src/sync/`, `src/app/`
**Files scanned:** MapView.tsx, AvatarMarker.tsx, useMapImage.ts, types.ts, schemas.ts, schema.ts, repository.ts, serializer.ts, syncEngine.ts (grep), App.tsx, NewEntityMenu.tsx, BrowseList.tsx, tokens.ts
**Pattern extraction date:** 2026-06-27

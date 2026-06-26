# Phase 3: Map Editor — Spaces & Navigation - Research

**Researched:** 2026-06-27
**Domain:** Konva.js spatial map editor at scale — tool-palette drawing (shapes/zones/layers), portal/nested-map navigation, multi-placement markers, on-canvas resize/rotate (Transformer), background-image transform with stable marker anchoring, full touch+desktop parity, and viewport-culling/shape-caching performance — all on the existing react-konva 19.2 + Dexie 4 + zod 4 + sharded-manifest spine.
**Confidence:** HIGH on the installed stack/versions, the Konva Transformer + performance + touch APIs (verified against official Konva docs this session), and the data-model integration points (read directly from the codebase). MEDIUM on the exact perceived-jank threshold at thousands of markers (a measured spike, not a doc fact) and on the image-space coordinate-model migration (sound, but must be validated with a round-trip test against existing Phase-1 markers).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Drawing shapes & zones (MAP-02)**
- **D-01:** Drawing primitives are **rectangle, ellipse, line, and free polygon**. Rect/ellipse for rooms, line for walls/paths, polygon for irregular areas. (No freehand pencil.)
- **D-02:** A **"zone" is a styled, named shape — NOT a new first-class entity type.** A fillable shape carrying a text label (e.g. "Lobby"). Map-scoped drawing object, not a 5th searchable entity. Zones do **not** get their own profile/gallery/custom fields.
- **D-03:** Shape/zone styling is **minimal** — a small curated preset palette drawn from the UI-SPEC tokens, with a fill on/off toggle. No full color-picker/stroke-width/opacity/dashes engine.

**Layers (MAP-03)**
- **D-04:** A **full user-managed layers panel.** User creates layers and assigns **both shapes AND markers**, with **show / hide / lock / reorder**. Layers are per-map.

**Map navigation & switching**
- **D-05:** Active map opens from the **existing Phase-2 Locations browse list** ("show on map" / open action) **plus a quick map switcher in the editor toolbar.** `MapView` must generalize from `maps[0]` to a selected-active-map model.

**Portals (MAP-06)**
- **D-06:** A **portal marker is a distinct glyph** (door/diamond-style — clearly NOT a round person-avatar). Its target is **any Map/Location**.
- **D-07:** Portal interaction: **single-click selects**, **double-click navigates** to the target map.
- **D-08:** When placing a portal you can **create-or-pick its target map inline**.

**Spatial hierarchy / map-groups (MAP-07)**
- **D-09:** Nesting is a **per-map parent pointer** ("contained in →"). **Every level is just a Map/Location** (a Map *is* the Location entity). **No new container entity type.** Spatial map-groups stay distinct from social Groups.
- **D-10:** Hierarchy navigation: a **breadcrumb bar** walks **up**; **portals / child maps** take you **down**. (No tree sidebar in v1.)

**One person on multiple maps (MAP-05)**
- **D-11:** Placing an existing person uses a **from-the-map searchable picker**.
- **D-12:** A person's profile **lists "Appears on: …"** with jump-to-placement for each map.
- **D-13:** Marker **position, size, and rotation are per-placement** (stored on each `Marker`); the person's **identity (photo/name/data) stays canonical and shared**. Multi-placement = multiple `Marker` rows for one `personId`.

**Transform handles (Phase-1 UAT criteria 6 & 7)**
- **D-14:** A Konva **Transformer** gives **resize + rotate** handles to **all placed objects** — person-markers, portal glyphs, and shapes/zones alike. New `Marker` fields (width/height/rotation, or scale + rotation) are required.
- **D-15:** **Single-select** editing for v1. (Multi-select / marquee deferred.)
- **D-16:** **Background-image transform (criterion 7)** — resize/rotate the background as a transformable object whose transform **persists**. The **coordinate model is Claude/research discretion**: pick the model that keeps already-placed markers spatially stable when the background is re-fit. Round-trips through storage/export.

**Editor interaction & chrome**
- **D-17:** **Tool-palette editor with modes**: Select / Rect / Ellipse / Line / Polygon / Portal / Person. **Select is the default.**
- **D-18:** Creating a **new map**: from Locations **"+ New"** AND **inline** when dropping a portal.
- **D-19:** **Full touch + desktop parity.** Must support drawing, placing, and transforming with **fingers**. ⚠ Deliberate scope bump — researcher MUST address Konva pointer/touch handling from the start.
- **D-20:** Person-marker **name labels are a show/hide toggle**, **default hidden**.

### Claude's Discretion
- **D-03 styling palette:** exact preset colors / fill defaults — follow UI-SPEC tokens (`src/app/tokens.ts` / `tokens.css`). (UI-SPEC has already prescribed 5 muted tints — Stone/Sage/Clay/Dusk/Plum at 20% fill.)
- **D-16 background-transform coordinate model:** the marker-anchoring math and persistence shape — constraint = placements stay stable and the transform round-trips through storage/export. (PRESCRIBED below: image-space anchoring.)
- **Data-model shape for shapes/zones/layers:** new cloud shard (new `EntityType` members) vs. sub-objects on the `MapDoc` record — planner tradeoff; the manifest swap must stay the sole atomic commit point either way. (RECOMMENDED below: MapDoc sub-objects.)
- Portal glyph exact iconography, breadcrumb styling, layers-panel layout, tool-palette placement — follow UI-SPEC conventions.

### Deferred Ideas (OUT OF SCOPE)
- **Multi-select / marquee selection + group transform** → deferred; v1 is single-select (D-15).
- **Full per-shape styling** (color picker, stroke width, opacity slider, dashed lines) → deferred; v1 uses a minimal preset palette (D-03).
- **Zones as full entities** (own profile / gallery / custom fields) → not v1 (D-02).
- **Map-group container nodes / drag-maps-into-a-group tree** → not v1; nesting is a per-map parent pointer (D-09).
- **Collapsible tree sidebar of all maps** → not v1; navigation is breadcrumb + portals (D-10).
- **Always-on marker name labels** → v1 ships a show/hide toggle defaulting to hidden (D-20).
- **Profile-side "Add to map →" as a placement entry point** → v1 places from the map-side picker (D-11).
- Relationship authoring + data-driven connectors + graph → **Phase 4**. Fuzzy field-scoped search → **Phase 5**. Mega.nz → **Phase 6**. Geographic/satellite tiles, full diagrams.net-grade vector editing → out of scope per PROJECT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-02 | User can draw shapes, lines, and zones on a map to mark rooms/areas | Pattern 2 (tool-mode draw state machine) + Pattern 6 (Stage-draggable disambiguation) + Don't-Hand-Roll (Konva `Rect`/`Ellipse`/`Line`/`Line closed` primitives); zone = styled+labeled shape (D-02) |
| MAP-03 | User can organize map content into layers | Pattern 3 (logical layers as a render-order + visibility model, NOT one Konva `Layer` per user layer) + data-model (Layer sub-objects on MapDoc) |
| MAP-05 | A single person can be placed on multiple maps at once | Existing `markers` table already indexed by `mapId`+`personId` — multi-placement needs NO identity schema change; Pattern 4 (one canonical Person, N Marker rows); "Appears on" via `db.markers.where('personId')` |
| MAP-06 | Location-link "portal" marker with a distinctive shape that navigates | Pattern 5 (portal as a Marker variant carrying `targetMapId` + portal-blue door glyph); single-click select / double-click navigate (D-07) via `onClick`/`onDblClick`+`onTap`/`onDblTap` |
| MAP-07 | Nest maps into spatial map-groups and navigate the hierarchy | `MapDoc.parentId` pointer (D-09); breadcrumb walks the parent chain up; portals/child maps descend (D-10) |
| (P1 UAT #6) | Resize + rotate placed markers, persisting across reloads | Pattern 1 (Konva Transformer + onTransformEnd → persist width/height/rotation via `upsertMarker`) |
| (P1 UAT #7) | Resize/transform the background image, persisting | Pattern 7 (background as a transformable object; image-space marker anchoring keeps placements stable) |
</phase_requirements>

## Summary

Phase 3 turns the Phase-1/2 single-map Konva **skeleton** (`MapView.tsx`: one background layer + one markers layer, drag-pan + wheel-zoom) into a real **spatial editor**. The hard, non-retrofittable parts the research flag calls out are all addressable with first-class Konva APIs on the **already-installed** stack (konva 10.3.0, react-konva 19.2.5, React 19.2.7) — **no new runtime dependency is required** except optionally `@radix-ui/react-popover` for the style/picker popovers (its siblings `react-dialog`/`react-dropdown-menu` are already in use). The genuine engineering concentrates in four places: (1) the **tool-mode interaction state machine** that disambiguates pan vs. draw vs. select vs. transform across mouse AND touch (D-17, D-19); (2) the **Konva Transformer** wiring (ref-based, imperative — there is "no pure declarative react-way") that resets `scaleX/scaleY` back to 1 and persists computed width/height/rotation (D-14); (3) the **image-space coordinate model** that keeps placed people anchored to the background when it is re-fit (D-16); and (4) **viewport culling + shape caching** built in from the start so the editor stays smooth at hundreds-to-thousands of markers (criterion 5 / Pattern 5).

The two load-bearing architecture findings:
1. **Konva "Layers" (the `<Layer>` canvas element) are NOT the user-facing layers of D-04.** Each Konva `Layer` is a separate `<canvas>` DOM element; the docs warn against more than 3–5. The MAP-03 layers panel must be a **logical** layer model (an ordered list of layer descriptors with show/hide/lock; objects carry a `layerId`) rendered into a *small fixed* set of physical Konva layers (background / content / transformer-overlay). Conflating the two would cap the user at ~5 layers and tank performance. [CITED: konvajs.org/api/Konva.Layer.html]
2. **The data-model tradeoff resolves toward MapDoc sub-objects, not new shards.** Shapes/zones/layers/parentId are all **per-map** and small; storing them on the `MapDoc` record rides the *existing* `maps` shard through serializer + SyncEngine + export with **zero** new wiring. A new `EntityType` shard family costs a six-branch change across `EntityType`, `ManifestSchema.shards`, `serializeShards`/`deserializeShards`, and the SyncEngine's `ENTITY_TYPES` + `getDirtyTypes` + `markSynced` + `upsert` + `reconcileOnOpen` + `pulledHas` — the exact churn Phase 02.1 had to do for `field-defs`. Markers, by contrast, are already their own shard and stay there (multi-placement needs no schema change for identity).

**Primary recommendation:** Build in this order — (Wave 0) schema triple updates: `Marker.width/height/rotation`, `MapDoc.parentId` + `background` transform descriptor + `shapes`/`zones`/`layers` sub-object arrays, Dexie `version(4)` upgrade that backfills the image-space coordinate identity for existing markers, all preserving the `satisfies` locks; (1) generalize `MapView` to an active-map model + map switcher + breadcrumb; (2) the tool-palette + interaction state machine (pan/draw/select) with touch parity wired from the start; (3) the Transformer overlay (resize/rotate, persist) for markers/portals/shapes; (4) the background-image transform with image-space anchoring; (5) shapes/zones drawing + style popover + the logical layers panel; (6) portals (glyph + place + create-or-pick target + navigate) and the parent-chain hierarchy; (7) the "place existing person" picker + profile "Appears on". Bake viewport culling + caching into the render path in step 1, not as a retrofit.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tool-mode interaction state machine (pan/draw/select/transform) | Browser / Client (React state) | Browser / Client (Konva Stage events) | Pure client UI state; drives which Stage/Shape handlers are live |
| Shape/zone/portal rendering | Browser / Client (Konva canvas) | — | Canvas drawing of `Rect`/`Ellipse`/`Line`/`Group` reading from the repository |
| Resize/rotate (Transformer) | Browser / Client (Konva Transformer, imperative ref) | Domain/State (repository persist) | Imperative Konva node + write-back of width/height/rotation to Dexie |
| Background-image transform + marker anchoring | Browser / Client (coordinate composition) | Domain/State (MapDoc + Marker persist) | Image-space → stage-space composition at render; transform persisted on MapDoc |
| Layers model (show/hide/lock/reorder) | Browser / Client (logical layer list) | Domain/State (per-map layer sub-objects) | Logical visibility/z-order over a small fixed set of physical Konva layers |
| Map switching / hierarchy navigation | Browser / Client (active-map state) | Domain/State (MapDoc.parentId) | Selecting active map + walking the parent chain; reads from Dexie |
| Multi-placement (one person, N markers) | Domain/State (markers table) | Browser / Client (picker UI) | Existing `markers` table keyed by mapId+personId; identity stays on Person |
| Viewport culling / shape caching | Browser / Client (Konva render path) | — | Pure canvas perf; intersect node bounds with the visible Stage rect |
| Persist shapes/zones/layers/transforms | Domain/State (repository → Dexie) | Browser / Storage (sharded manifest) | Single mutation path; rides the existing `maps`/`markers` shards |

**Why this matters:** Every capability remains a *browser/client* responsibility — there is no API or backend tier, consistent with Phase 1. The plan must never introduce a server step. The one cross-tier subtlety is that **persistence (Dexie + sharded manifest) and rendering (Konva) must stay decoupled through the existing repository mutation path** (`upsertMarker`, `updateMap`, and new equivalents) — every drag/transform/draw writes through `repository.ts` (validate → stamp `updatedAt`+`dirty` → emit), never directly to Dexie or to a parallel store. This is also what keeps react-konva's render() values in sync with imperatively-mutated nodes (see Pitfall 1).

## Standard Stack

> The project `./.claude/CLAUDE.md` and Phase-1 RESEARCH already lock the stack; **everything needed for Phase 3 is already installed** (verified against `package.json` this session). No version bumps required. Konva's first-class `Transformer`, `Layer`, `clipFunc`, and unified pointer/touch events cover the entire phase.

### Core (already installed — no change)
| Library | Installed Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| konva | 10.3.0 | Canvas engine: `Transformer` (resize/rotate, D-14), `Rect`/`Ellipse`/`Line` primitives (D-01), `Group`+`clipFunc` (avatar/portal), `node.cache()` (perf) | MIT; the prescribed engine [VERIFIED: package.json + npm registry] |
| react-konva | 19.2.5 | Declarative Konva in React 19 | Peers `react ^19.2.0` + `konva ^8\|9\|10` — **satisfied by react 19.2.7 + konva 10.3.0** [VERIFIED: npm view react-konva@19.2.5 peerDependencies] |
| react | 19.2.7 | UI framework | Locked [VERIFIED: package.json] |
| dexie | 4.4.4 | IndexedDB source of truth; new fields are a `version(4)` upgrade (NOT a migration-push step) | Locked [VERIFIED: package.json] |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` reactive reads (already used in `MapView`) | Re-render on local DB change [VERIFIED: package.json] |
| zod | 4.4.3 | Runtime validation; new schemas mirror new types preserving `satisfies` locks | Untrusted-at-rest validation [VERIFIED: package.json] |
| nanoid | 5.1.15 | Stable IDs for shapes/zones/layers/portals | Collision-resistant [VERIFIED: package.json] |
| lucide-react | 1.21.0 | All tool/panel/breadcrumb glyphs (UI-SPEC names them) | Already installed [VERIFIED: package.json] |
| @radix-ui/react-dialog | 1.1.17 | Create-map + delete confirmations + portal target picker (Dialog) | Already installed [VERIFIED: package.json] |
| @radix-ui/react-dropdown-menu | 2.1.18 | Map switcher; tool overflow | Already installed [VERIFIED: package.json] |

### Supporting (one optional addition)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-popover | 1.1.17 | Style popover (S17), person picker (S16), portal target picker if popover-style (S15) | **Optional** — UI-SPEC permits Radix Popover for the style/picker popovers. Could also be built with the already-installed `react-dialog`. Add only if a non-modal anchored popover is wanted. [VERIFIED: npm registry — same 1.1.17 line as installed siblings] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @radix-ui/react-popover | @radix-ui/react-dialog (already installed) | Dialog is modal + centered; Popover anchors to the trigger and is non-modal. For the style/picker affordances anchored to a toolbar/selection, Popover is the better fit but Dialog works with zero new deps. Planner's call. |
| Logical layers over 3 physical Konva `<Layer>`s | One Konva `<Layer>` per user layer | One-canvas-per-layer hits the documented 3–5 layer ceiling and multiplies canvas memory; **rejected** — use a logical layer model (Pattern 3). [CITED: konvajs.org/api/Konva.Layer.html] |
| Konva `Transformer` | Hand-rolled resize/rotate handles | Transformer handles anchor math, rotation snapping, bound-box constraints, and touch hit areas for free; hand-rolling is the classic don't-hand-roll trap. **Rejected.** |
| Image-space marker coordinates | Stage-space (current Phase-1 model) | Stage-space markers visibly move when the background is re-fit/rotated, breaking criterion 7's "lobby person stays in the lobby". **Rejected** in favor of image-space (Pattern 7). |

**Installation (only if adding Popover):**
```bash
npm install @radix-ui/react-popover@1.1.17
```

**Version verification (this session):** `npm view react-konva@19.2.5 peerDependencies` → `konva ^8.0.1 || ^7.2.5 || ^9.0.0 || ^10.0.0`, `react ^19.2.0`, `react-dom ^19.2.0` — all satisfied by installed konva 10.3.0 + react 19.2.7. `npm view konva version` → 10.3.0 (matches installed). `@radix-ui/react-popover` latest 1.1.17 matches the installed Radix sibling line.

## Package Legitimacy Audit

> Only one *new* package is even a candidate (`@radix-ui/react-popover`), and it is optional. All other Phase-3 packages are already installed and were audited in Phase 1 (all `OK`). Ran `gsd-tools query package-legitimacy check --ecosystem npm @radix-ui/react-popover` + `npm view` this session.

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| @radix-ui/react-popover | npm | 2026-06-15 | 50.9M/wk | github.com/radix-ui/primitives | OK* | Approved (optional) |
| konva | npm | (Phase-1 audited) | 2.06M/wk | github.com/konvajs/konva | OK | Already installed |
| react-konva | npm | (Phase-1 audited) | 1.63M/wk | github.com/konvajs/react-konva | OK | Already installed |
| @radix-ui/react-dialog | npm | (installed) | — | github.com/radix-ui/primitives | OK | Already installed |
| @radix-ui/react-dropdown-menu | npm | (installed) | — | github.com/radix-ui/primitives | OK | Already installed |

**\* "too-new" SUS flag overridden:** the legitimacy seam rated `@radix-ui/react-popover` `SUS` solely on a recent-publish ("too-new") heuristic. It has **50.9M weekly downloads**, the canonical `github.com/radix-ui/primitives` monorepo, **no postinstall script**, is not deprecated, and is the **same 1.1.17 release line** as `@radix-ui/react-dialog`/`react-dropdown-menu` already in the project. This is a routine monorepo version bump of a household package, not a slopsquat signal — identical false positive to Phase 1's react/dexie "too-new" flags. No human-verify checkpoint needed.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS] requiring a human-verify checkpoint:** none

## Architecture Patterns

### System Architecture Diagram (Phase-3 editor data flow)

```
                         USER (mouse OR finger)
                                  │
                                  ▼
            ┌─────────────────────────────────────────────┐
            │   TOOL MODE STATE  (React state, D-17)       │
            │   Select(default) │ Rect │ Ellipse │ Line │  │
            │   Polygon │ Portal │ Person                  │
            └───────────────┬─────────────────────────────┘
                            │ decides which handlers are live + Stage.draggable
                            ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                 KONVA STAGE  (3 PHYSICAL LAYERS)                   │
   │  ┌────────────────────────────────────────────────────────────┐  │
   │  │ L0 background  (listening=false) — KonvaImage + IMAGE        │  │
   │  │                TRANSFORM (offset/scale/rotation from MapDoc) │  │
   │  ├────────────────────────────────────────────────────────────┤  │
   │  │ L1 content (interactive) — shapes · zones · portals ·        │  │
   │  │    avatar markers, each tagged layerId, CULLED to viewport,  │  │
   │  │    cached (node.cache()); hidden/locked logical layers skip  │  │
   │  ├────────────────────────────────────────────────────────────┤  │
   │  │ L2 transformer overlay — single Konva.Transformer on the     │  │
   │  │    one selected node (amber handles)                          │  │
   │  └────────────────────────────────────────────────────────────┘  │
   └───────────┬───────────────────────────────────┬──────────────────┘
               │ onDragEnd / onTransformEnd /       │ reads (useLiveQuery)
               │ draw-commit  → write-back          │
               ▼                                    ▼
   ┌───────────────────────────┐         ┌────────────────────────────┐
   │ repository.ts             │◄────────│ Dexie (source of truth)    │
   │ upsertMarker / updateMap  │  reads  │  markers (x/y IMAGE-space,  │
   │ (+ new: shapes/zones/     │         │   +w/h/rotation)           │
   │  layers/portal/parentId   │         │  maps (parentId, bg xform, │
   │  via updateMap sub-objs)  │         │   shapes[], zones[],       │
   │ validate→stamp→emit       │         │   layers[])                │
   └───────────┬───────────────┘         └────────────────────────────┘
               │ dirty set → debounced
               ▼
   ┌───────────────────────────┐   serializer    ┌─────────────────────┐
   │ SyncEngine (UNCHANGED)    │────────────────►│ sharded manifest     │
   │ maps + markers shards     │  atomic swap    │ (sole commit point)  │
   │ already carry the new     │                 │ → user's Drive       │
   │ sub-objects for free      │                 └─────────────────────┘
   └───────────────────────────┘
```

### Recommended Project Structure (additions to existing `src/features/person-map/`)
```
src/features/person-map/
├── MapView.tsx              # (EXISTING) generalize maps[0] → active map; host 3 layers + culling
├── AvatarMarker.tsx         # (EXISTING) add width/height/rotation + name-label child + Transformer attach
├── useMapImage.ts           # (EXISTING) reuse for portal-target thumbs
├── editor/
│   ├── ToolPalette.tsx      # S10 tool-mode buttons (D-17)
│   ├── useToolMode.ts       # the interaction state machine (pan/draw/select/transform)
│   ├── useViewportCulling.ts# intersect node bounds with visible Stage rect (Pattern 5)
│   ├── TransformerOverlay.tsx# single Konva.Transformer on the selected node (Pattern 1)
│   ├── ShapeNode.tsx        # renders a Rect/Ellipse/Line/Polygon from a shape descriptor
│   ├── ZoneLabel.tsx        # Konva Text chip for a zone label (D-02, no innerHTML)
│   ├── PortalGlyph.tsx      # door-arch portal Group (Pattern 5)
│   ├── LayersPanel.tsx      # S11 logical layers (show/hide/lock/reorder, D-04)
│   ├── Breadcrumb.tsx       # S12 parent-chain up-nav (D-10)
│   ├── MapSwitcher.tsx      # S13 Radix DropdownMenu (D-05)
│   ├── StylePopover.tsx     # S17 preset palette + fill toggle + label (D-03)
│   ├── PersonPicker.tsx     # S16 place-existing-person (D-11)
│   └── PortalTargetPicker.tsx# S15 create-or-pick target (D-08)
└── coords.ts                # image-space ↔ stage-space composition (Pattern 7)
```

### Pattern 1: Konva Transformer for resize + rotate, persisted (D-14, criterion 6)

**What:** A single `Konva.Transformer` attached imperatively (via refs) to the one selected node. On `transformend`, read `scaleX/scaleY`, **reset scale to 1**, and persist computed `width/height` + `rotation` through the repository. There is **no pure-declarative react-konva way** — a ref + `useEffect` is the official pattern. [CITED: konvajs.org/docs/react/Transformer.html]

**When to use:** All selectable objects (markers, portals, shapes/zones) and the background image.

**Why reset scale to 1:** Transformer changes `scaleX/scaleY`, not width/height. Persisting raw scale would compound across edits and distort stroke widths. Reset-to-1 + bake-into-width/height keeps the model clean and strokes uniform.

```typescript
// Source: konvajs.org/docs/react/Transformer.html (verified 2026-06-27)
const shapeRef = useRef<Konva.Node>(null);
const trRef = useRef<Konva.Transformer>(null);

useEffect(() => {
  if (isSelected && trRef.current && shapeRef.current) {
    trRef.current.nodes([shapeRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }
}, [isSelected]);

// On the selectable node:
onTransformEnd={() => {
  const node = shapeRef.current!;
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);
  // Persist through the repository (NEVER straight to Dexie). For a marker:
  void upsertMarker({
    id: marker.id, mapId: marker.mapId, personId: marker.personId,
    x: node.x(), y: node.y(),
    width: Math.max(MIN, node.width() * scaleX),
    height: Math.max(MIN, node.height() * scaleY),
    rotation: node.rotation(),
  });
}}

// The Transformer itself (own overlay layer, amber handles, touch sizing):
<Transformer
  ref={trRef}
  rotateEnabled
  flipEnabled={false}
  anchorSize={isCoarsePointer ? 24 : 12}   // D-19 finger-grabbable (UI-SPEC U7)
  anchorStroke={colors.amber}
  borderStroke={colors.amber}
  boundBoxFunc={(oldBox, newBox) =>
    newBox.width < MIN || newBox.height < MIN ? oldBox : newBox}
/>
```

**Note for AvatarMarker:** the existing marker is a `Group` whose origin is the pin-stem tip with the avatar offset *up*. Attaching a Transformer to that Group resizes the whole composite (avatar + stem + ring) — verify the visual is acceptable, or attach the Transformer to an inner sizing node. Rotating a round avatar is visually moot but criterion 6 says "resize and rotate", so keep the rotate handle for uniformity (D-14).

### Pattern 2: Tool-mode draw state machine (MAP-02, D-17)

**What:** A small state machine, driven by the active tool, that decides how Stage pointer events are interpreted. Each shape primitive is drawn by capturing `pointerdown` (start point, in **image space** — see Pattern 7), `pointermove` (live preview), `pointerup` (commit through the repository). Polygon is multi-click: each click adds a vertex; double-click/Enter closes the path (Konva `Line` with `closed`).

**When to use:** Rect/Ellipse/Line/Polygon drawing.

```
Tool = Select (default):
  pointerdown on empty canvas → deselect (+ Stage.draggable = true → pan)
  pointerdown on object       → select it (+ Stage.draggable = false; object handles drag)
Tool = Rect/Ellipse/Line:
  Stage.draggable = false (single-finger draws, NOT pans — D-19)
  pointerdown → record start (image-space); create preview node
  pointermove → update preview width/height
  pointerup   → if size > threshold, commit shape via repository; tool STAYS armed
Tool = Polygon:
  click → push vertex; live edge to cursor; dblclick/Enter → close + commit; Esc → cancel
Tool = Portal / Person:
  one-shot: click → place at point; return to Select
```

**Critical:** the active tool toggles `Stage.draggable`. In draw modes, single-finger drag must DRAW, not pan; a two-finger drag still pans (Pattern 6). This is the heart of D-19 and must be designed in, not bolted on. [CITED: konvajs.org/docs/sandbox/Limited_Drag_And_Resize.html]

### Pattern 3: Logical layers over a fixed set of physical Konva layers (MAP-03, D-04)

**What:** The MAP-03 "layers" are a **logical** model — an ordered list of `{id, name, visible, locked, order}` descriptors stored per-map; every shape/zone/marker carries a `layerId`. They render into a **small fixed** set of physical Konva `<Layer>`s (background / content / transformer-overlay). Z-order within the content layer follows the logical layer order (sort nodes by their layer's `order`, then render). Show/hide = filter out that layer's nodes; lock = render at 60% opacity + `listening={false}` on those nodes.

**Why not one Konva Layer per user layer:** A Konva `Layer` is a separate `<canvas>` element. The official guidance is to keep total layers to **3–5**; more multiplies GPU/canvas memory and compositing cost. User layers can be unbounded, so they MUST be logical. [CITED: konvajs.org/api/Konva.Layer.html + konvajs.org/docs/performance/All_Performance_Tips.html]

```
content <Layer>:
  visibleLayers = layers.filter(l => l.visible).sort(by order)
  for each logical layer (bottom→top):
    for each object with object.layerId === layer.id (AND in viewport — Pattern 5):
      render node, listening = !layer.locked, opacity = layer.locked ? 0.6 : 1
```

### Pattern 4: One canonical Person, N Marker rows (MAP-05, D-13)

**What:** Multi-placement is already structurally supported — the `markers` table is indexed by `mapId` AND `personId`. Placing a person on another map = a **new `Marker` row** for the same `personId`. Identity (photo/name/custom) lives on the single `Person` record; only `x/y/width/height/rotation` are per-placement. Editing the Person re-renders every placement automatically because each `AvatarMarker` reads `person` from the live `people` query (already the case in `MapView`).

**"Appears on" (D-12):** `db.markers.where('personId').equals(person.id).toArray()` → group by `mapId` → list each map with a jump-to-placement button that sets that map active and centers the marker. **No schema change** beyond adding the per-placement transform fields.

```typescript
// Place existing person on the active map = new Marker row (no identity duplication):
await upsertMarker({ mapId: activeMap.id, personId: picked.id, x, y }); // id auto-generated
```

### Pattern 5: Portal as a Marker variant + door glyph (MAP-06, D-06/D-07/D-08)

**What:** A portal is a placement object carrying a `targetMapId` and rendered as the **portal-blue door-arch glyph** (UI-SPEC: distinct, NOT round, hue `#3E6B8C`). Interaction: **single-click/tap → select** (movable/transformable), **double-click/tap → navigate** to the target map (set it active). Konva exposes both: `onClick`/`onDblClick` (mouse) and `onTap`/`onDblTap` (touch) — wire all four (the existing AvatarMarker already pairs `onClick`+`onTap`).

**Data shape:** A portal is conceptually a marker without a `personId` but with a `targetMapId`. Two clean options for the planner:
- **(a) Extend `Marker`** with optional `targetMapId?` (+ make `personId` optional) and a `kind: 'person' | 'portal'` discriminator. Rides the existing `markers` shard for free. **Recommended** — smallest change, portals are placements like person-markers.
- **(b) A sibling `portals` array on `MapDoc`** (sub-object). Avoids touching the Marker schema but splits "placed objects" across two stores.

Recommend (a): a discriminated `Marker`. Keep portals distinct from Phase-4 relationship connectors (map→map link vs. entity→entity) — do not conflate; reserve a connectors layer slot.

**Create-or-pick target inline (D-08):** dropping a portal opens the target picker (S15) listing existing maps + a "Create a new map…" option (reuses the create-map flow). Cancel removes the just-dropped portal (don't leave a target-less portal).

### Pattern 6: Touch + desktop parity — gesture disambiguation (D-19, ⚠ FLAGGED)

> **This is the deliberate scope bump the CONTEXT.md demands be addressed from the start.** It materially shapes the editor architecture.

**What:** Konva fires only low-level touch events (`touchstart/move/end`); pinch-zoom and two-finger pan must be implemented from those. Set `Konva.hitOnDragEnabled = true` so touch events keep firing during a drag. [CITED: konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html]

**The gesture state machine (per the UI-SPEC Touch & Desktop Parity Contract):**
| Pointers | Select mode | Draw mode |
|----------|-------------|-----------|
| 1 finger on empty canvas | pan | **draw the shape** (pan suppressed) |
| 1 finger on object | move object | (draw still) |
| 2 fingers | pinch-zoom + pan | pinch-zoom + pan (always) |
| tap | select | (n/a) |
| double-tap on portal | navigate | (n/a) |

**Pinch-zoom math (keep the pinch center stationary, avoid the "jump"):**
```typescript
// Source: konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html (verified 2026-06-27)
const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
const center = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
// onTouchMove with two active touches:
//   if (stage.isDragging()) stage.stopDrag();          // prevent the jump
//   newScale = oldScale * (curDist / lastDist);
//   reposition stage so the pinch center stays fixed (same math as wheel-zoom in MapView).
```
**Known jump cause:** a `draggable` Stage fighting the pinch — call `stage.stopDrag()` when the second finger lands. [CITED: github.com/konvajs/konva/issues/1096]

**Hit targets (D-19 / UI-SPEC):** all interactive canvas objects ≥ 48px hit on `pointer: coarse`; Transformer anchors 24px visual / 44px hit; thin `Line` shapes need a generous `hitStrokeWidth` so fingers can grab them. No hover-only affordances (the "double-click to travel" hint must also be reachable without hover — long-press tooltip or visible label).

### Pattern 7: Background-image transform with image-space marker anchoring (D-16, criterion 7 — coordinate model PRESCRIBED)

**What:** The background image becomes a transformable object (its own Transformer when an "Edit background" affordance is active, to avoid accidental grabs). Its transform (`offsetX/Y`, `scaleX/Y`, `rotation`) persists on the `MapDoc` (a `background` transform descriptor) and round-trips through storage/export.

**The coordinate model (the subtle part the researcher was told to resolve): markers store coordinates in IMAGE space, not stage space.** Each marker's `x/y` is relative to the background image's **intrinsic (untransformed) pixel space**. At render time, markers are positioned by composing the image's current transform onto each marker's image-space coordinate. **Result:** re-fitting/resizing/rotating the background keeps every placed person in the same physical spot — the lobby person stays in the lobby.

```typescript
// coords.ts — compose image transform onto an image-space point to get a stage-space point.
// imgT = { offsetX, offsetY, scale, rotation } from MapDoc.background transform.
function imageToStage(p: {x:number;y:number}, imgT): {x:number;y:number} {
  const cos = Math.cos(imgT.rotation), sin = Math.sin(imgT.rotation);
  return {
    x: imgT.offsetX + (p.x * cos - p.y * sin) * imgT.scale,
    y: imgT.offsetY + (p.x * sin + p.y * cos) * imgT.scale,
  };
}
// On marker drag-end, convert the stage-space drop point back to image space before persisting:
function stageToImage(p, imgT) { /* inverse transform */ }
```

**Migration (⚠ load-bearing — Runtime State Inventory):** existing Phase-1/2 markers store coordinates in **stage space**. On the Dexie `version(4)` upgrade, existing markers must be reinterpreted as image-space at the **identity transform** (scale 1, rotation 0, offset 0) so they DON'T visibly move on upgrade. Concretely: a map that has never had its background transformed has an identity `background` transform, and `imageToStage` at identity is the identity function — so old `x/y` values are already correct as image-space coordinates. The upgrade therefore only needs to ensure every `MapDoc` has an explicit identity `background` transform descriptor; no per-marker coordinate rewrite is required. **This must be proven with a test:** load a Phase-1 marker, upgrade, assert its on-screen position is unchanged at identity transform; then transform the background and assert the marker tracks the image.

### Anti-Patterns to Avoid
- **One Konva `<Layer>` per user layer.** Caps you at ~5 layers and multiplies canvas memory. Use logical layers over a fixed 3-layer physical set (Pattern 3). [CITED]
- **Persisting raw `scaleX/scaleY` from the Transformer.** Compounds across edits and distorts strokes. Reset scale to 1, bake into width/height (Pattern 1). [CITED]
- **Stage-space marker coordinates.** Markers visibly jump when the background is re-fit, breaking criterion 7. Use image-space anchoring (Pattern 7).
- **Writing transforms/draws straight to Dexie.** Bypasses `repository.ts` validate→stamp→emit, breaks the dirty/sync path AND desyncs react-konva render() from the node (Pitfall 1). Always go through the repository.
- **Caching every node / caching simple unfilled shapes.** `node.cache()` for 10k shapes costs ~600ms and every cache makes a canvas buffer; caching a simple `Rect` is slower than drawing it. Cache only complex/clipped nodes (clipped avatars, filled zones). [CITED: konvajs.org/docs/performance/Shape_Caching.html]
- **Leaving the markers/shapes layer `listening` when nothing needs events** (e.g. during pure pan). Per Konva, `listening(false)` on a many-node layer removes per-shape hit-test cost. [CITED: konvajs.org/docs/performance/All_Performance_Tips.html]
- **Drawing thousands of `Text` name-labels by default.** D-20 default-hidden labels is a perf decision, not just cosmetic — keep it.
- **A new shard `EntityType` for per-map shapes/zones/layers.** Pays the full six-branch SyncEngine churn for data that rides the `maps` shard for free. Use MapDoc sub-objects (see Data-Model Tradeoff).
- **`dangerouslySetInnerHTML` for any user text.** Zone labels + marker name labels render as Konva `Text` only — XSS could exfiltrate the Drive token (T-03-01).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resize/rotate handles | Custom anchor handles + rotation math | Konva `Transformer` | Anchors, rotation snap, bound-box, touch hit areas, flip — all built in [CITED: konvajs Transformer docs] |
| Shape primitives | Custom path math for rect/ellipse/line | Konva `Rect`/`Ellipse`/`Line` (`closed` for polygon) | Native, hit-tested, transformable, cacheable |
| Circular avatar crop | Manual pixel masking | Konva `Group` + `clipFunc` (already used) | Existing `AvatarMarker` pattern |
| Pinch-zoom / two-finger pan | Reinventing gesture detection | Konva touch events + the documented distance/center math | Edge cases (jump on draggable stage) are solved [CITED: Multi-touch_Scale_Stage] |
| Accessible Dialog/Dropdown/Popover | Custom focus-trap/Esc/roving | Radix primitives (already installed) | Focus trap, Esc, roving focus, return-to-trigger |
| Reactive canvas re-render on data change | Manual change listeners | `useLiveQuery` (already used) | Auto re-render on Dexie change |
| Persist + sync new fields | A parallel store for shapes/layers | MapDoc sub-objects + existing repository + SyncEngine | Rides the `maps` shard; zero new sync wiring |
| Runtime validation of new shapes | Ad-hoc `if` checks | zod schemas mirroring the types | Untrusted-at-rest gate; preserves `satisfies` locks |

**Key insight:** Almost the entire phase is composition of first-class Konva + Radix + Dexie features already in the project. The ONLY genuinely custom logic is (1) the tool-mode/gesture interaction state machine and (2) the image-space coordinate composition. Concentrate engineering and tests there; lean on libraries for everything else.

## Data-Model Tradeoff: shapes/zones/layers/parentId — new shard vs. MapDoc sub-objects

> The CONTEXT.md explicitly delegates this to the researcher/planner. Here is the tradeoff with a recommendation.

**Option A — MapDoc sub-objects (RECOMMENDED).** Add to `MapDoc`: `parentId?: string`, a `background` transform descriptor, and `shapes: Shape[]`, `zones: Zone[]` (or zones-as-styled-shapes in one array), `layers: Layer[]`. These are all per-map and small.
- **Cost:** add fields to the type ↔ schema ↔ Dexie triple (preserve `satisfies`); a Dexie `version(4)` upgrade to backfill defaults (`parentId` absent, identity background transform, default "Markers" layer, empty arrays). **Zero** SyncEngine changes — they ride the existing `maps` shard through `serializeShards`/`deserializeShards`/`commit`/`reconcileOnOpen`/export automatically. `updateMap` already exists as the mutation path.
- **Risk:** a map with very many shapes makes the `maps` shard larger, but maps are few and shapes are small JSON; well within the per-shard budget for v1 scale.

**Option B — new `EntityType` shard family** (e.g. `shapes`, `layers`).
- **Cost:** the full **six-branch churn** Phase 02.1 had to do for `field-defs`: widen `EntityType`, `ManifestSchema.shards`, `SHARD_NAMES`, `serializeShards`/`deserializeShards`, SyncEngine `ENTITY_TYPES` + `getDirtyTypes` + `markSynced` + `upsert` + `reconcileOnOpen` + `pulledHas` + `BackupSchema`. Per the codebase, `EntityType` is ALSO `FieldDef.entityType` and a `Record<EntityType,...>` key across the field-manager/profile UI — widening it there has the same hazard that forced `field-defs` to be a sync-local `SyncShardType` token rather than a true `EntityType`. High blast radius.
- **When it would win:** only if shapes needed to be searchable first-class entities (they explicitly do NOT — D-02) or shared across maps (they are per-map).

**Recommendation:** **Option A (MapDoc sub-objects)** for shapes/zones/layers/parentId/background-transform. **Markers stay their own existing shard** (they already are; just add the transform fields). This keeps the manifest swap the sole atomic commit point (unchanged) and avoids the field-defs-style churn. Markers being separate is correct — they are cross-referenced by `personId` and queried by `mapId` independently.

## Runtime State Inventory

> Phase 3 is a **schema-expansion + migration** phase (new Marker fields, new MapDoc sub-objects, a coordinate-model reinterpretation). A grep finds files; it does not find this state. Each category answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) **Existing `markers` rows in users' IndexedDB AND in their Drive cloud shards** store `x/y` in **stage space** with no width/height/rotation. The image-space coordinate model (Pattern 7) reinterprets these. (2) Existing `maps` rows have no `parentId`/`background` transform/`shapes`/`zones`/`layers`. | **Code edit + data migration.** Dexie `version(4)` upgrade: backfill `Marker.width/height/rotation` defaults; add identity `background` transform + `parentId: undefined` + default "Markers" layer + empty `shapes`/`zones`/`layers` to every `MapDoc`. The identity-transform reinterpretation means **no per-marker coordinate rewrite** is needed (identity transform = old coords already valid as image-space). Must be proven by a round-trip test (Pattern 7). |
| **Live service config** | Cloud `maps-000.json` / `markers-000.json` shards in the user's Drive predate the new fields. On next reconcile/push they are re-serialized with the new fields. | **None beyond the migration** — the serializer writes the upgraded records on the next atomic commit; older shards remain readable (extra fields absent → zod defaults). Ensure new zod schemas make the new fields OPTIONAL-with-default or that `deserializeShards`→`upsert` tolerates their absence (mirror the `field-defs` optional-pointer precedent). |
| **OS-registered state** | None — pure client PWA; no OS registrations. | None. |
| **Secrets/env vars** | None new — no new external service, no new env var. (Drive `VITE_GOOGLE_CLIENT_ID` unchanged.) | None. |
| **Build artifacts** | None — no new package install required (Popover optional). No codegen, no egg-info, no compiled binary. | None (run `npm install` only if adding `@radix-ui/react-popover`). |

**The canonical question — after every repo file is updated, what runtime state still has the old shape?** Answer: every existing user's **markers (stage-space coords, no transform fields)** and **maps (no parent/bg-transform/shapes/zones/layers)** in BOTH IndexedDB and their Drive shards. The Dexie `version(4)` upgrade handles IndexedDB; the next sync push re-serializes the cloud shards. The zod schemas + `BackupSchema` must accept old-shaped records (new fields optional/defaulted) so a restore of a pre-Phase-3 backup still validates — exactly the optional-field pattern already used for `field-defs`.

## Common Pitfalls

### Pitfall 1: react-konva resets imperatively-mutated nodes to render() values (React 19 / strict mode)
**What goes wrong:** When you drag or Transform a node (imperative mutation of x/y/scale/rotation), react-konva's next render can snap the node back to the props in `render()` if those props weren't updated — and **react-konva strict mode forces ALL props back** regardless of change. A Transformer that changes scale, with stale `width`/`rotation` props, will visibly revert.
**Why it happens:** react-konva reconciles node props from render(); manual mutations diverge from props. (Default mode updates only changed props; `_useStrictMode`/`useStrictMode(true)` updates all.) [CITED: github.com/konvajs/react-konva README + issue #761]
**How to avoid:** Always **persist the new x/y/width/height/rotation through the repository on `onDragEnd`/`onTransformEnd`** so the next `useLiveQuery` render() supplies matching props (the existing `AvatarMarker` already does this for x/y — extend it to the transform fields). Do NOT enable react-konva strict mode for the editor. Note this is separate from React's `<StrictMode>` double-invoke; the known ref/useEffect double-run (issue #761) means the Transformer attach effect must be idempotent.
**Warning signs:** marker snaps back after resize; rotation resets on the next data change.

### Pitfall 2: Conflating Konva `<Layer>` with user layers → 5-layer ceiling + memory blowup (criterion 5)
**What goes wrong:** Rendering one Konva `<Layer>` per user-created layer; performance collapses and you hit the documented 3–5 layer guidance.
**How to avoid:** Logical layer model over 3 physical layers (Pattern 3).
**Warning signs:** sluggish pan/zoom once a few layers exist; high canvas memory.

### Pitfall 3: Single-finger draw also pans the Stage (D-19)
**What goes wrong:** Stage stays `draggable` in a draw mode, so dragging to draw a rectangle pans the canvas instead.
**How to avoid:** Toggle `Stage.draggable` by tool mode (Pattern 2): false in draw modes (single-finger draws), true in Select on empty canvas. Two-finger drag always pans.
**Warning signs:** can't draw a shape; canvas slides while drawing.

### Pitfall 4: Pinch-zoom "jumps" because the Stage is draggable (D-19)
**What goes wrong:** The draggable Stage fights the two-finger pinch and the view jumps.
**How to avoid:** `stage.stopDrag()` when the second touch lands; recompute scale around the pinch center. [CITED: konva issue #1096]
**Warning signs:** view leaps on the first pinch.

### Pitfall 5: Markers move when the background is re-fit (criterion 7)
**What goes wrong:** Stage-space marker coords stay fixed on screen while the image moves under them — the lobby person ends up in a wall.
**How to avoid:** Image-space anchoring (Pattern 7); persist the image transform on MapDoc; compose at render.
**Warning signs:** every placement drifts after a background resize/rotate; export/restore doesn't preserve relative positions.

### Pitfall 6: Over-caching tanks performance instead of helping (criterion 5)
**What goes wrong:** `node.cache()` on everything (incl. simple unfilled shapes) makes a canvas buffer per node and is slower than direct draw; 10k caches ≈ 600ms.
**How to avoid:** Cache only complex/clipped/filtered nodes (clipped avatars, filled zones). Combine with viewport culling (don't even mount off-screen nodes) and `listening(false)` on non-interactive content. [CITED: konvajs.org/docs/performance/Shape_Caching.html]
**Warning signs:** memory spikes; first-paint stalls at scale.

### Pitfall 7: New fields break restore of a pre-Phase-3 backup
**What goes wrong:** `BackupSchema`/shard schemas require the new fields; importing an older backup or reconciling an older cloud shard throws.
**How to avoid:** Make new fields OPTIONAL-with-default in the zod schemas (mirror the `field-defs` optional-pointer precedent); the Dexie upgrade backfills on local load.
**Warning signs:** import of an old backup fails validation; second-device reconnect to a pre-Phase-3 cloud DB crashes.

## Code Examples

### Viewport culling — only mount nodes intersecting the visible Stage rect (Pattern 5)
```typescript
// Source: derived from konvajs.org performance tips (culling = don't add off-screen nodes)
function visibleStageRect(stage: Konva.Stage) {
  const scale = stage.scaleX();
  return {
    x: -stage.x() / scale,
    y: -stage.y() / scale,
    width: stage.width() / scale,
    height: stage.height() / scale,
  };
}
function intersects(box, view, margin = 200) {
  return !(box.x > view.x + view.width + margin ||
           box.x + box.width < view.x - margin ||
           box.y > view.y + view.height + margin ||
           box.y + box.height < view.y - margin);
}
// In render: filter objects by intersects(objBox, visibleStageRect(stage)) before mapping to nodes.
// Recompute the view rect on pan/zoom end (debounced) — not every frame.
```

### Cache a complex clipped avatar once it's mounted (Pattern 5 / Pitfall 6)
```typescript
// Cache only the clipped-avatar Group (complex), never the simple ring/stem.
useEffect(() => { groupRef.current?.cache(); }, [avatarImage]); // re-cache when the photo changes
```

### Tool-mode toggles Stage.draggable (Pattern 2 / Pitfall 3)
```typescript
const isDrawMode = tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'polygon';
<Stage draggable={tool === 'select' && !objectIsBeingDragged} /* ...two-finger pan handled in onTouchMove */ />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stage-space marker coords (Phase 1) | Image-space anchoring composed at render | This phase (D-16) | Placements survive background re-fit; needs a one-time migration |
| Imperative `new Konva.Transformer()` + manual `.add()` | react-konva `<Transformer ref>` + `useEffect` attach (still imperative, but React-managed lifecycle) | react-konva current | Official pattern; no pure-declarative way [CITED] |
| One canvas/layer per logical grouping | Logical layers over a small fixed physical-layer set | Konva perf guidance | Unbounded user layers without the 3–5 ceiling |
| Per-frame redraw of all nodes | Viewport culling + selective `node.cache()` + `listening(false)` | Konva perf guidance | Smooth at hundreds–thousands of nodes |

**Deprecated/outdated (do not use):** one-Konva-Layer-per-user-layer; persisting raw Transformer scale; writing canvas state outside the repository path; react-konva strict mode for a drag/transform-heavy editor.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existing Phase-1/2 markers at the identity background transform render unchanged when reinterpreted as image-space (so no per-marker coordinate rewrite is needed) | Pattern 7 / Runtime State Inventory | If wrong, every existing marker shifts on upgrade. **Mitigation:** a migration round-trip test (load old marker → upgrade → assert position unchanged) is the highest-value test in the phase. |
| A2 | The perceived-jank threshold ("hundreds smooth, degrade toward thousands") is met by culling + selective caching + listening(false) on the target hardware | Pattern 5 / criterion 5 | If thousands still jank, may need to additionally batch-draw or virtualize harder. **Mitigation:** a measured spike with N=1000 synthetic markers before sign-off (see Validation). |
| A3 | Attaching a Transformer to the existing `AvatarMarker` composite Group (stem-tip origin, avatar offset up) resizes acceptably | Pattern 1 | If the composite resizes oddly (stem scales with avatar), attach to an inner node instead. **Mitigation:** visual check during build; low cost to switch the attach target. |
| A4 | Storing shapes/zones/layers as MapDoc sub-objects stays within the per-shard size budget at v1 scale | Data-Model Tradeoff | A pathological map with thousands of shapes could bloat the `maps` shard. **Mitigation:** v1 scale is "dozens of maps"; revisit sharding only if a single map's shape count explodes. |
| A5 | A discriminated `Marker` (`kind: 'person'\|'portal'`, optional `personId`/`targetMapId`) is cleaner than a sibling portals array | Pattern 5 | If the optionality complicates existing marker code paths, fall back to a `portals` MapDoc sub-object. **Mitigation:** planner picks; both are viable and called out. |
| A6 | `@radix-ui/react-popover` 1.1.17 is legitimate despite the "too-new" SUS flag | Package Legitimacy Audit | Negligible — 50.9M downloads, canonical repo, no postinstall, same line as installed siblings. |

**The migration round-trip (A1) is the single item most worth a focused test before building the rest of the coordinate model on top of it.**

## Open Questions (RESOLVED)

> All three questions are answered by the Assumptions Log above (A2/A3/A5); the planner adopted
> each recommendation. They remain documented for traceability with their resolutions inline.

1. **Does the existing `AvatarMarker` composite Group resize cleanly under a Transformer, or should the Transformer attach to an inner sizing node?**
   - What we know: Transformer attaches to any node; the marker is a Group with a stem-tip origin and the avatar offset up.
   - What's unclear: whether resizing the whole Group (stem + avatar + ring together) looks right.
   - Recommendation: build it on the Group first; if the stem scales undesirably, attach to an inner avatar node. Low-cost switch (A3).
   - **RESOLVED (A3):** Attach the Transformer to the `AvatarMarker` Group first; fall back to an inner sizing node only if the stem scales badly (a visual check during build, low-cost switch). Adopted in plan 03-04 (TransformerOverlay + AvatarMarker, RESEARCH A3).

2. **Portal data shape: discriminated `Marker` vs. `MapDoc.portals[]`?**
   - What we know: both ride existing shards (markers shard vs. maps shard); both work.
   - Recommendation: discriminated `Marker` (Pattern 5 option a) — portals are placements like person-markers — unless optionality bites existing marker code (A5).
   - **RESOLVED (A5):** Use the discriminated `Marker` (`kind: 'person' | 'portal'`, optional `personId`/`targetMapId`) — portals are placements on the markers shard. Adopted in plans 03-01 (schema triple) and 03-06 (PortalGlyph), per RESEARCH A5.

3. **Exact jank threshold on real hardware at thousands of markers.**
   - What we know: culling + caching + listening(false) is the documented toolkit; the number is hardware-dependent.
   - Recommendation: a measured spike with ~1000 synthetic markers gates criterion 5 sign-off (A2).
   - **RESOLVED (A2):** Treated as a measured-spike gate, not a code blocker — viewport culling + selective caching + `listening(false)` are built in from the start (03-02), and a ~1000-synthetic-marker spike (fixture from 03-01) gates criterion 5 sign-off in VALIDATION (Manual-Only Verifications), per RESEARCH A2.

## Environment Availability

> No new external dependency. This is a code/schema change on the installed stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| konva | All canvas work | ✓ | 10.3.0 | none — installed |
| react-konva | Declarative canvas | ✓ | 19.2.5 | none — installed |
| dexie | Schema `version(4)` upgrade | ✓ | 4.4.4 | none — installed |
| zod | New schemas | ✓ | 4.4.3 | none — installed |
| @radix-ui/react-dialog / dropdown-menu | Dialogs / switcher | ✓ | 1.1.17 / 2.1.18 | none — installed |
| @radix-ui/react-popover | Style/picker popovers (optional) | ✗ (not installed) | — | Use the installed `react-dialog` instead |
| Node.js + npm | Build/dev/test | (dev machine) | — | none — required |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `@radix-ui/react-popover` (optional) → fall back to `@radix-ui/react-dialog` (already installed) for the popovers.

## Validation Architecture

> `nyquist_validation` is enabled (not set to false in config) — section required. Test infra (Vitest + Playwright + fake-indexeddb) already exists from Phase 1.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit/integration, fake-indexeddb) + Playwright 1.61.1 (E2E canvas flows) |
| Config file | existing `vitest.config.ts` + `playwright.config.ts` (Phase 1) |
| Quick run command | `npm test` (vitest run) or `npx vitest run <file>` |
| Full suite command | `npm test && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-02 | Draw rect/ellipse/line/polygon; commit shape; zone label persists | E2E + unit | `npx vitest run tests/features/shapes.test.ts` | ❌ Wave 0 |
| MAP-03 | Layer show/hide/lock/reorder; objects carry layerId; z-order follows panel | unit | `npx vitest run tests/features/layers.test.ts` | ❌ Wave 0 |
| MAP-05 | Place one person on 2 maps → 2 marker rows, 1 Person; edit Person propagates | integration | `npx vitest run tests/db/multiPlacement.test.ts` | ❌ Wave 0 |
| MAP-06 | Portal carries targetMapId; single-click selects, double-click navigates; create-or-pick target | E2E | `npx playwright test e2e/portal.spec.ts` | ❌ Wave 0 |
| MAP-07 | parentId chain; breadcrumb walks up; child/portal descends | integration + E2E | `npx vitest run tests/features/hierarchy.test.ts` | ❌ Wave 0 |
| P1-UAT#6 | Resize+rotate marker; width/height/rotation persist across reload AND export/restore | integration (round-trip) | `npx vitest run tests/features/markerTransform.roundtrip.test.ts` | ❌ Wave 0 |
| P1-UAT#7 | Background transform persists; **markers stay anchored** (image-space) | integration (round-trip) | `npx vitest run tests/features/bgTransform.anchor.test.ts` | ❌ Wave 0 |
| (migration) | **Phase-1 marker reinterpreted as image-space at identity transform renders unchanged** | unit (migration) | `npx vitest run tests/db/markerCoordMigration.test.ts` | ❌ Wave 0 |
| (perf) | ~1000 synthetic markers: pan/zoom stays smooth (culling + caching) | spike/perf | `npx playwright test e2e/perf.markers.spec.ts` (or a manual spike) | ❌ Wave 0 |

### The most important tests for this phase
1. **Marker coordinate migration (A1):** load a pre-Phase-3 marker (stage-space x/y), run the `version(4)` upgrade, assert on-screen position unchanged at identity transform; then transform the background and assert the marker tracks the image. Everything in Pattern 7 builds on this.
2. **Transform + background round-trip (criteria 6 & 7):** set marker width/height/rotation AND a background transform → export → clear IndexedDB → import → assert all transform fields and the image-space anchoring survive byte-for-byte. (Extends Phase-1's EXPT-02 round-trip; the cloud is the only copy.)
3. **Multi-placement propagation (MAP-05):** one Person, two markers on two maps; edit the Person's photo; assert both placements re-render the new avatar and only one Person record exists.

### Sampling Rate
- **Per task commit:** `npx vitest run <touched module>` (< 30s). Note [[vitest-forks-timeout-under-load]] — if `vitest run` false-fails with fork-worker startup timeouts under load, re-run with `--no-file-parallelism` to confirm it's environmental.
- **Per wave merge:** full `npm test`.
- **Phase gate:** `npm test && npm run test:e2e` green + the ~1000-marker perf spike judged smooth, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/db/markerCoordMigration.test.ts` — the migration safety test (covers the coordinate-model change)
- [ ] `tests/features/markerTransform.roundtrip.test.ts` + `tests/features/bgTransform.anchor.test.ts` — criteria 6 & 7
- [ ] `tests/db/multiPlacement.test.ts` — MAP-05
- [ ] A synthetic-marker fixture generator (~1000 markers) for the perf spike
- [ ] No framework install needed — Vitest/Playwright/fake-indexeddb already present.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` (Phase-1 config) — section required.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no change) | Delegated to Google GIS (Phase 1); this phase adds no auth surface. |
| V3 Session Management | no (no change) | Drive token unchanged; no new credential. |
| V4 Access Control | no (no change) | `drive.file` scope unchanged; no new external access. |
| V5 Input Validation | **yes** | zod-validate all new persisted shapes (Marker transform fields, MapDoc sub-objects: shapes/zones/layers/parentId/bg-transform) on load from cloud/export. New fields OPTIONAL-with-default so old data validates (Pitfall 7). |
| V6 Cryptography | no (v1) | App-level encryption still deferred (SEC-01, v2). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via zone label / marker name label exfiltrating the Drive token (T-03-01) | Information Disclosure | Render ALL user text as Konva `Text` / React children — **never** `dangerouslySetInnerHTML`. (CONTEXT.md + UI-SPEC mandate this explicitly.) |
| Malicious/corrupt map sub-objects (oversized polygon vertex arrays, NaN coords, dangling `targetMapId`/`parentId`) | Tampering / DoS | zod-validate on load; clamp/sanitize geometry; a portal whose target was deleted shows the "destination deleted" error (UI-SPEC copy) rather than crashing; a dangling `parentId` degrades to a top-level map. |
| Cyclic `parentId` chain (A→B→A) hanging the breadcrumb walk | DoS | Cap the parent-chain walk depth and detect cycles when building the breadcrumb. |
| Import of a pre-Phase-3 backup with old-shaped records | Tampering / availability | New zod fields optional/defaulted so `BackupSchema.parse` still succeeds (mirrors `field-defs` precedent). |

## Sources

### Primary (HIGH confidence)
- konvajs.org/docs/react/Transformer.html — ref-based Transformer attach, `onTransformEnd` scale-reset-to-1 pattern, `boundBoxFunc`, "no pure declarative way" (fetched & verified 2026-06-27)
- konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html — pinch-zoom/two-finger-pan math, `Konva.hitOnDragEnabled`, stopDrag to avoid jump (fetched & verified 2026-06-27)
- konvajs.org/docs/performance/Shape_Caching.html + /docs/performance/All_Performance_Tips.html — `node.cache()` cost (10k≈600ms), don't-cache-simple-shapes, `listening(false)` (web search, official docs)
- konvajs.org/api/Konva.Layer.html — Layer = separate `<canvas>`; keep to 3–5 layers (CITED)
- github.com/konvajs/react-konva README + issue #761 + issue #1096 — strict-mode prop-reset behavior, useEffect/ref double-run, pinch jump on draggable stage (web search)
- **Codebase (read this session):** `MapView.tsx`, `AvatarMarker.tsx`, `domain/types.ts`, `domain/schemas.ts`, `db/schema.ts`, `sync/serializer.ts`, `sync/syncEngine.ts`, `db/repository.ts`, `package.json` — the integration points, the existing mutation path, and the six-branch shard wiring cost
- npm registry (`npm view`) — react-konva@19.2.5 peers, konva 10.3.0, @radix-ui/react-popover 1.1.17 (verified 2026-06-27)
- `gsd-tools query package-legitimacy check` — @radix-ui/react-popover signals (2026-06-27)
- Phase-1 `01-RESEARCH.md` — the storage spine, atomic manifest swap, Konva minimal marker (mined heavily)

### Secondary (MEDIUM confidence)
- konvajs.org/docs/sandbox/Limited_Drag_And_Resize.html, /docs/sandbox/Gestures.html — drag-limiting + gesture events (web search)
- konvajs.org/docs/select_and_transform/* — Transform events, ignore-stroke-on-transform (web search)

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Exact perceived-jank threshold at thousands of markers — needs a measured spike (A2)
- The identity-transform no-rewrite migration claim — sound but needs the round-trip test (A1)

## Metadata

**Confidence breakdown:**
- Standard stack / versions: HIGH — everything installed; peers verified against npm this session; no new required dep.
- Konva Transformer / performance / touch APIs: HIGH — verified against official Konva docs this session.
- Data-model integration (shard tradeoff, mutation path, migration): HIGH — read directly from the codebase; the field-defs precedent is concrete.
- Image-space coordinate migration: MEDIUM — the model is sound and the identity-transform no-rewrite is logically correct, but must be proven by the round-trip test before building on it (A1).
- Jank threshold at thousands of markers: MEDIUM — the toolkit (culling + caching + listening) is documented; the number is hardware-dependent and needs a spike (A2).

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (30 days; Konva + react-konva + the installed stack are stable. Re-verify react-konva peers only if React/Konva are bumped.)

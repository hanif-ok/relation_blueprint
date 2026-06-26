# Phase 3: Map Editor — Spaces & Navigation - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase turns the Phase 1/2 single-map Konva **skeleton** into a real **spatial map editor**. It delivers, on top of the existing Stage (`MapView.tsx` — one background layer + one markers layer, drag-pan/wheel-zoom):

1. **Drawing** rooms/areas as shapes/lines/zones, organized into user-managed **layers** (MAP-02, MAP-03).
2. **Portal markers** with a distinctive shape that navigate to another map (MAP-06).
3. **Nested map-groups** (floor → building → street) with up/down navigation (MAP-07).
4. **One canonical person placed across multiple maps** — edits propagate everywhere (MAP-05).
5. **Performance** — the editor stays responsive (no jank) at many markers (success criterion 5; the RESEARCH "Pattern 5" culling/caching mandate lands here).
6. **On-canvas transform handles** — resize + rotate placed markers (criterion 6) and transform the background image (criterion 7). These are the deferred Phase-1 UAT "Bucket A" items.

**Requirements in scope:** MAP-02, MAP-03, MAP-05, MAP-06, MAP-07 (+ Phase-1 UAT criteria 6 & 7).

**Explicitly NOT this phase (clarify HOW, never add WHAT):**
- Relationship **authoring** + data-driven map connectors + the relationship graph → **Phase 4**. (Connectors will render as a layer on *this* canvas, but they are derived from Phase-4 relationship data — distinct from portal markers, which are map→map links.)
- Fuzzy field-scoped search → **Phase 5**.
- Mega.nz provider → **Phase 6**.
- Geographic/satellite tiles, full diagrams.net-grade vector editing (beziers, advanced connectors) → out of scope per PROJECT.md.

</domain>

<decisions>
## Implementation Decisions

### Drawing shapes & zones (MAP-02)
- **D-01:** Drawing primitives are **rectangle, ellipse, line, and free polygon**. Rect/ellipse for rooms, line for walls/paths, polygon for irregular areas. (No freehand pencil — messy for clean outlines.)
- **D-02:** A **"zone" is a styled, named shape — NOT a new first-class entity type.** A zone is a fillable shape carrying a text label (e.g. "Lobby"). It is a map-scoped drawing object, not a 5th searchable entity. This keeps the four-entity model (People / Locations-Maps / Groups / Relationship-links) intact. Zones do **not** get their own profile/gallery/custom fields.
- **D-03:** Shape/zone styling is **minimal** — a small curated preset palette drawn from the UI-SPEC tokens, with a fill on/off toggle. (Claude's discretion; see below. No full color-picker/stroke-width/opacity/dashes engine — matches the "no full vector editor" boundary.)

### Layers (MAP-03)
- **D-04:** A **full user-managed layers panel.** The user creates layers and assigns **both shapes AND markers** to them, with **show / hide / lock / reorder**. (Not shapes-only; not fixed preset layers.) Layers are per-map.

### Map navigation & switching (the app is single-map today)
- **D-05:** The active map is opened from the **existing Phase-2 Locations browse list** (the "show on map" / open action) **plus a quick map switcher in the editor toolbar.** (Reuses existing surfaces rather than inventing a new one. `MapView` must generalize from `maps[0]` to a selected-active-map model.)

### Portals (MAP-06)
- **D-06:** A **portal marker is a distinct glyph** (door/diamond-style — clearly NOT a round person-avatar). Its target is **any Map/Location**.
- **D-07:** Portal interaction: **single-click selects** (so it can be moved/edited/transformed like any object), **double-click navigates** to the target map. (Single-click-to-travel was rejected — it makes portals hard to select for editing.)
- **D-08:** When placing a portal you can **create-or-pick its target map inline** (not only pick an existing one), so authoring the hierarchy is fluid.

### Spatial hierarchy / map-groups (MAP-07)
- **D-09:** Nesting is a **per-map parent pointer** ("contained in →"): street-map ⊇ building-map ⊇ floor-map. **Every level is just a Map/Location** (reuses D-07 from Phase 2 — a Map *is* the Location entity). **No new container entity type.** Spatial map-groups stay distinct from social Groups (PROJECT.md decision) — this is purely a Map→parent-Map relationship.
- **D-10:** Hierarchy navigation: a **breadcrumb bar** (Street ▸ Building ▸ Floor) walks **up**; **portals / child maps** take you **down**. (No tree sidebar in v1 — see Deferred.)

### One person on multiple maps (MAP-05)
- **D-11:** Placing an existing person uses a **from-the-map searchable picker**: while viewing a map, a "place person" control opens a picker of existing people and drops a marker. (Profile-side "add to map" was not chosen as the primary entry; the map-side picker is the v1 flow.)
- **D-12:** A person's profile **lists "Appears on: …"** with jump-to-placement for each map. Extends the Phase-2 D-16 "show on map" pattern and makes criterion-4 propagation visible.
- **D-13:** Marker **position, size, and rotation are per-placement** (stored on each `Marker`); the person's **identity (photo/name/data) stays canonical and shared**. Follows marker-as-placement (Phase-2 D-11/D-12). Multi-placement = multiple `Marker` rows for one `personId` (already supported by the `markers` table, indexed by `mapId` + `personId`).

### Transform handles (Phase-1 UAT criteria 6 & 7 — folded "Bucket A")
- **D-14:** A Konva **Transformer** gives **resize + rotate** handles to **all placed objects** — person-markers, portal glyphs, and shapes/zones alike. (Rotating a round avatar is visually moot but harmless; criterion 6 says "resize and rotate.") New `Marker` fields (width/height/rotation, or a scale + rotation) are required — the marker has none today.
- **D-15:** **Single-select** editing for v1: click an object to get its handles, click empty canvas to deselect. (Multi-select / marquee deferred — see Deferred.)
- **D-16:** **Background-image transform (criterion 7)** — resize/rotate the background as a transformable object whose transform **persists**. The **coordinate model is Claude/research discretion** (the user said "you decide"): pick the model that keeps already-placed markers spatially stable when the background is re-fit (the earlier recommendation was to anchor markers to the image so a person in the lobby stays in the lobby). This is flagged for the researcher because marker coordinate-space vs. background transform is the subtle part.

### Editor interaction & chrome
- **D-17:** **Tool-palette editor with modes**: a toolbar of **Select / Rect / Ellipse / Line / Polygon / Portal / Person**. Pick a tool, then draw/click on the canvas; **Select is the default** mode for moving/transforming. (Diagrams.net-style. Polygon needs an explicit mode anyway.)
- **D-18:** Creating a **new map**: from the Locations **"+ New"** AND **inline** when dropping a portal (create-or-pick target, per D-08).
- **D-19:** **Full touch + desktop parity.** The editor must support drawing, placing, and transforming with **fingers** on tablets/phones, not just mouse/trackpad. (User explicitly chose this over a desktop-first v1.) ⚠ This is a deliberate scope/complexity bump — see Specifics; the researcher MUST address Konva pointer/touch handling from the start.
- **D-20:** Person-marker **name labels are a show/hide toggle** (a layer/setting), **default hidden** to keep the canvas clean and cheap to render at scale. (Not always-on; not avatar-only-with-no-option.)

### Claude's Discretion
- **D-03 styling palette:** exact preset colors / fill defaults — follow the UI-SPEC tokens (`src/app/tokens.ts` / `tokens.css`) and keep it minimal but tasteful.
- **D-16 background-transform coordinate model:** the marker-anchoring math and persistence shape — research/planner choose, constraint = placements stay stable and the transform round-trips through storage/export.
- **Data-model shape for shapes/zones/layers:** whether they live as their own cloud shard (new `EntityType` members) or as sub-objects on the `MapDoc` record is a planner tradeoff (see Code Context — both are viable; the manifest swap must stay the sole atomic commit point either way).
- Portal glyph exact iconography, breadcrumb styling, layers-panel layout, tool-palette placement — follow UI-SPEC conventions.

### Folded Todos
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** — `.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md`. **Bucket A** (item 1: resizable person markers — UAT Test 4; item 2: image + marker transform handles — UAT Test 13) is **folded into this phase** as success criteria 6 & 7 (decisions D-14, D-15, D-16). Bucket B (lightbox + gallery reorder) was already folded into Phase 2. After this phase ships, the whole todo can be closed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 baseline — Konva canvas + visual language (this phase extends both)
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-RESEARCH.md` — **Pattern 5 (viewport culling + Konva shape caching)** is the load-bearing reference for success criterion 5 (no jank at many markers); the Phase-3 research flag mandates building culling/caching in **from the start, not as a retrofit**. Also Konva + React 19 integration notes and the index/media anti-patterns.
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-UI-SPEC.md` — the established visual language, design tokens (`src/app/tokens.ts` / `tokens.css`), the **Round Photo-Avatar Marker** spec (what `AvatarMarker.tsx` draws to), the amber-reserved-for-selection rule, and the canvas→assistive-tech accessibility bridge. The tool palette, layers panel, breadcrumb, portal glyph, and labels toggle must stay consistent with it.

### Phase 2 entity-model decisions this phase builds on
- `.planning/phases/02-custom-fields-full-entity-model/02-CONTEXT.md` — **D-07** (a Map *is* the Location entity — the basis for D-09 hierarchy-as-parent-maps), **D-11/D-12** (entity vs. placement; "remove from map" = marker-only, "delete" = cascade — the literal foundation of MAP-05), **D-16** (row-click profile + "show on map" jump — extended here for "Appears on", D-12).

### Project-level (always in force)
- `.planning/PROJECT.md` — serverless/no-backend, free-OSS-only, single-curator constraints; the **"Social Groups separate from spatial Map-groups"** decision (bounds D-09); the **"no full diagrams.net-grade vector editor"** out-of-scope boundary (bounds D-01/D-03 tooling); uploaded-images-only (no geo tiles).
- `.planning/REQUIREMENTS.md` — MAP-02, MAP-03, MAP-05, MAP-06, MAP-07 wording + traceability.
- `.claude/CLAUDE.md` — prescriptive stack: **Konva 10.3 + react-konva (already installed)**, Konva's first-class **Layers** (matches MAP-03), `Transformer` for resize/rotate (D-14), `clipFunc` for circular avatars; Dexie 4 + zod 4 for the data model.

No external ADRs exist yet — decisions are captured in this file and the docs above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/features/person-map/MapView.tsx`** — the Konva `Stage` host. Currently loads a **single** map (`db.maps.toArray().then(m => m[0])`) into two layers: background `Image` (`listening={false}`) and markers. Drag-pan + wheel-zoom (clamped 0.2–5×) already implemented. Phase 3 generalizes this to an **active-map** model (switch maps, breadcrumb, tool palette, layers panel, shapes, portals) and adds culling/caching. The empty-state upload affordance lives here too.
- **`src/features/person-map/AvatarMarker.tsx`** — the round photo-avatar marker: a **draggable Konva `Group`** with circular-clipped avatar (or initials fallback), selection ring (amber via `colors`/`marker` tokens), and pin-stem; persists drag via `upsertMarker`. It is the **template for the portal glyph**, the **target for resize/rotate handles**, and where a **name-label child** (D-20 toggle) attaches. ⚠ It reads only `marker.x/y` today — **no size/rotation**; those fields must be added to `Marker` and consumed here.
- **`src/features/person-map/useMapImage.ts`** (`useMapImage` / `useBlobImage`) — blob→`HTMLImageElement` hook for backgrounds & avatars; reuse for portal-target thumbnails if shown.
- **`src/db/repository.ts`** — the single mutation path (validate → stamp `updatedAt`+`dirty` → emit change). Relevant fns: `upsertMarker` (l.287), `createMap` (l.239) / `updateMap` (l.263), `deleteMarker` (l.147, marker-only) vs `deleteEntity` cascade (l.174). New marker transform fields, portal markers, shapes/zones, layers, and the map parent-pointer all write through this same pattern.
- **`src/app/App.tsx`** — the shell hosting the Phase-2 left-nav view switcher; the Map view gains the tool palette, layers panel, breadcrumb, and map switcher within it.

### Established Patterns
- **Type ↔ schema ↔ Dexie triple:** `src/domain/types.ts` (interfaces) ↔ `src/domain/schemas.ts` (zod + compile-time `satisfies` locks) ↔ `src/db/schema.ts` (Dexie tables/indexes). Every new field/type — `Marker` transform fields, `MapDoc.parentId`, the portal marker, Shape/Zone, Layer — must be added in **all three**, preserving the `satisfies` locks. The schema is **Dexie** (auto-upgrade via `version(n)`), **NOT Drizzle/Prisma — there is no migration-push step** ([[schema-gate-dexie-false-positive]]); a new table/field is a `this.version(4).stores({...})` upgrade.
- **Per-type sharding + atomic manifest swap:** `EntityType = 'people' | 'maps' | 'markers' | 'groups' | 'relationship-links'` drives `Manifest.shards`. If shapes/zones/layers become **their own** persisted families, they extend `EntityType`, `ManifestSchema.shards`, the serializer (`src/sync/serializer.ts`), and the SyncEngine's symmetric six-branch wiring (see Phase 02.1 — a shard token threads through ENTITY_TYPES + commit + reconcileOnOpen + getDirtyTypes/markSynced/upsert + an optional `ManifestSchema` pointer). **Alternatively**, shapes/zones/layers and the parent-pointer can be stored **on the `MapDoc` record** (sub-objects) to avoid new shards — a planner tradeoff. **Either way the manifest swap stays the sole atomic commit point.**
- **Marker = placement:** the `markers` table is already indexed by `mapId` + `personId`, so MAP-05 multi-placement (many markers, one `personId`) needs **no schema change for identity** — only the added per-placement transform fields (D-13).
- **Konva performance (RESEARCH Pattern 5):** no culling/caching exists yet — explicitly deferred to this phase (comments in `MapView.tsx` and `AvatarMarker.tsx` say so). Build viewport culling + shape caching in from the start for criterion 5.
- **No `dangerouslySetInnerHTML` — ever.** All user text (zone labels, marker name labels) renders as React / Konva `Text` children (XSS could exfiltrate the Drive token, threat T-03-01).

### Integration Points
- **Storage spine / export:** new map fields, marker transforms, shapes/zones/layers, and the parent-pointer hierarchy must serialize into the sharded manifest and survive **export/restore** (`BackupSchema`) — the cloud is the only copy. Whatever the planner picks (new shards vs. MapDoc sub-objects), it must round-trip.
- **Locations browse (Phase 2):** the entry point for opening a map as active (D-05) and the source for the "place existing person" picker (D-11).
- **Phase 4 forward-compat:** data-driven relationship connectors (REL-03) will render on this canvas — keep the **layer model open to a connectors layer**. Portal markers (map→map links, D-06) are conceptually distinct from relationship connectors (entity→entity) — don't conflate them.

</code_context>

<specifics>
## Specific Ideas

- **Full touch parity is a deliberate, user-chosen scope bump (D-19).** The user picked finger draw/place/transform over a desktop-first v1. The researcher MUST address, from the start: Konva pointer/touch event handling, **gesture disambiguation** (pan vs. draw vs. select vs. transform), finger-sized **hit targets**, and **Transformer handle sizing** for touch. Flag this prominently in RESEARCH.md — it materially affects the editor architecture.
- **Reuse existing surfaces over inventing new ones.** Strong, consistent preference: maps open from the existing Locations list (D-05); the hierarchy is "just maps with a parent" (D-09, no new container entity); zones are "just styled + labeled shapes" (D-02, no new searchable entity). Keep the four-entity model intact.
- **Portals should make hierarchy authoring feel fluid** — they double as the primary "descend" navigation (D-10) and can create their target map inline (D-08), so building floor→building→street isn't separate bookkeeping.
- The user wants the editor to feel like a lightweight **diagrams.net** (tool palette + layers + zones), within the "not a full vector editor" boundary.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-select / marquee selection + group transform** → deferred; v1 is single-select (D-15).
- **Full per-shape styling** (color picker, stroke width, opacity slider, dashed lines) → deferred; v1 uses a minimal preset palette (D-03).
- **Zones as full entities** (their own profile / gallery / custom fields) → not v1; zones are map-scoped styled+labeled shapes (D-02).
- **Map-group container nodes / drag-maps-into-a-group tree** → not v1; nesting is a per-map parent pointer (D-09).
- **Collapsible tree sidebar of all maps** → not v1; navigation is breadcrumb + portals (D-10). Revisit if breadcrumb proves insufficient at deep hierarchies.
- **Always-on marker name labels** → v1 ships a show/hide toggle defaulting to hidden (D-20), not always-on.
- **Profile-side "Add to map →" as a placement entry point** → v1 places from the map-side picker (D-11); the profile-side entry could be added later.

### Reviewed Todos (not folded)
- None beyond the folded Bucket A — Bucket B of the same todo was already folded into Phase 2; nothing else reviewed-but-deferred this phase.

</deferred>

---

*Phase: 3-map-editor-spaces-navigation*
*Context gathered: 2026-06-27*

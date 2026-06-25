# Phase 2: Custom Fields & Full Entity Model - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **complete entity model** for Relation Blueprint:

1. **All four first-class entity types** — People, Locations/Maps, Groups, and Relationship-links — each with a thumbnail, photo gallery, and profile (DATA-01).
2. **User-definable typed custom fields** (text, number, date, phone, tags/select, link-to-entity, photo) on any entity type, rendering and validating in profiles (DATA-03).
3. **Browse lists** for all four entity types, alongside direct map navigation (BRWS-01, BRWS-02).
4. A **privacy/sensitivity notice** at setup and minimal default fields (success criterion 4).
5. Two **deferred Phase 1 UAT items**: a photo lightbox (criterion 5) and gallery sort/reorder (criterion 6).

**Requirements in scope:** DATA-01, DATA-03, BRWS-01, BRWS-02.

**Explicitly NOT this phase (clarify HOW, never add WHAT):**
- Map drawing, shapes, zones, layers, portals, nested map-groups, one-person-on-multiple-maps → **Phase 3**.
- Relationship **authoring** (setting endpoints), data-driven map connectors, and the relationship graph → **Phase 4**.
- Fuzzy field-scoped search → **Phase 5**.
- Mega.nz provider → **Phase 6**.
- Resizable markers / Konva transform handles (Bucket A of the Phase 1 UAT todo) → **Phase 3**.

</domain>

<decisions>
## Implementation Decisions

### Custom field model (the keystone — search, profiles, and relationships depend on it)
- **D-01:** Custom fields use a **per-type schema**, not per-instance. A field set is defined once for each entity type, and every entity of that type shares those fields. Empty values render blank. (Rejected per-instance ad-hoc and hybrid — they make Phase 5's field-scoped search incoherent.)
- **D-02:** Fields are created/edited/removed/reordered in a **dedicated field manager** — a settings panel per entity type. (Not inline-in-form; keeps schema-editing separate from data-entry.)
- **D-03:** Field definitions are **tied to a single entity type**. A "People" field is distinct from a "Groups" field even if identically named. No cross-type/shared definitions (no many-to-many definition↔type model).
- **D-04:** Person's six existing fields (name, photo, phone, description, tags, notes) remain **fixed built-ins**; **name and photo are mandatory**, the rest always exist, and custom fields are added alongside them. Built-ins are NOT deletable/renamable as custom fields. Apply the same "minimal built-in spine + custom alongside" shape to the other types (see D-13).
- **D-05:** Deleting a field definition is a **soft-delete**: the field disappears from forms/profiles but stored values are **retained and hidden**, so re-adding the field restores them — nothing is silently lost. On a field **type change**, keep the existing value when convertible, otherwise flag/quarantine it rather than discarding.
- **D-06:** Validation is **type-checking via zod + an optional per-field `required` toggle**. No min/max/length/regex rules engine in v1 (deferred).

### The four entity types & their phase boundaries
- **D-07:** **A Map *is* the Location entity.** Promote today's skeleton `MapDoc` (background + name + dimensions) into a full first-class entity with thumbnail, gallery, profile, and custom fields. One object — every location is a map you can open and place people on. (No separate Location-vs-Map split.)
- **D-08:** **Relationship-link is an entity shell in Phase 2.** It becomes a real entity type in the data model — it can hold its own data (label/date/notes per REL-02) + custom fields + thumbnail/gallery/profile. **Setting endpoints, map connectors, and the graph all wait for Phase 4.** (A Relationship-link created in Phase 2 is effectively a data-bearing record with no endpoints yet; Phase 4 attaches the person↔person / person↔group / group↔group wiring.)
- **D-09:** **Group is a profile shell in Phase 2** (thumbnail/gallery/profile/custom fields). Assigning **members and group relations happens through the Phase 4 relationship system** — there is no separate members-list mechanism built now (avoids a parallel membership model Phase 4 would have to reconcile).
- **D-10:** The **`link-to-entity` custom field type is a lightweight one-way pointer**: a typed reference from one entity to another (e.g. "Employer → Acme"), with **no reverse edge, no own data, and not rendered as a map connector or in the graph**. Full bidirectional, data-bearing, graph-rendered relationships remain Phase 4. This keeps DATA-03's 7th field type in Phase 2 without pulling Phase 4 forward.

### Entity vs. placement — delete semantics (user-raised, high priority)
- **D-11:** **An entity is a database record; a marker is a *placement* of that entity on a specific map.** Entities live in the DB (and in browse lists) independent of any map placement. Today this is conflated because Person only exists via the map.
- **D-12:** **Two distinct destructive actions:**
  - **"Remove from map"** (profile opened from a marker / map context) → deletes **only that marker**. The entity stays in the database and in its browse list.
  - **"Delete person/location/…"** (entity / browse-list context) → the **full cascade**: removes the entity + all its markers across every map + garbage-collects unreferenced media. This is exactly today's `deletePerson()` logic (`src/db/repository.ts:84`) — it **moves behind the list-level delete**, while the map-level action shrinks to a marker delete.
  - Same pattern applies to a Location/Map (remove-from-view vs. delete-the-location-entity).
  - This sets up Phase 3's **MAP-05** (one person on multiple maps): removing someone from one map leaves them on the others and in the DB.

### Browse lists
- **D-13:** Browse is surfaced via a **view switcher in a left nav** (Map / People / Locations / Groups / Relationship-links) that swaps the main surface. This is a new top-level layout replacing today's map-only shell. (Not a slide-over panel; not a router — the app is currently single-surface with no routing.)
- **D-14:** **All four entity types get a browse list** (not just the BRWS-01/02-required People + Locations). Groups and Relationship-links aren't placed on the map, so the list is their primary creation/discovery surface.
- **D-15:** Each row shows **thumbnail (or initials) + name + a secondary line** (e.g. tags or a key field). Reuses the avatar/initials logic from `ProfileSidebar`. (Not a multi-column table — per-type custom fields make columns variable; not name-only — too sparse.)
- **D-16:** **Row click opens the profile sidebar**; a **separate action ("show on map")** jumps to the entity's placement on its map. Both behaviors, as distinct actions. (Pure map-jump breaks for non-spatial entities like Groups/Relationship-links.)
- **D-17:** Default sort is **Name A–Z with a toggle to "recently updated"** (`updatedAt` already exists on every entity). No search this phase (Phase 5).

### Defaults, privacy & gallery
- **D-18:** Non-Person types ship a **minimal universal spine**: name (required) + photo/thumbnail + gallery + a free-text notes field. Locations additionally keep their background image + dimensions. Everything beyond the spine is added as custom fields. Keeps "default fields stay minimal" (criterion 4).
- **D-19:** The **privacy/sensitivity notice is a one-time onboarding notice** at first run (or first provider connect / first entity creation), **dismissible**, with a way to re-view it in a settings/about area. (Not an every-create interruption; not a buried static notice.)
- **D-20:** **Photo lightbox**: clicking a gallery thumbnail opens a **full-size overlay with prev/next navigation (arrow keys + on-screen controls) and Esc/backdrop dismiss** back to the profile. No zoom/pan in v1 (overlaps Phase 3 Konva work).
- **D-21:** **Gallery reorder is manual drag-to-reorder, persisted** on the entity's ordered `gallery: MediaRef[]` array. The **first gallery photo can act as the thumbnail**. No date/name sort (MediaRef carries no date/name metadata today).

### Claude's Discretion
- The exact rendering/order/grouping of custom fields within a profile (after built-ins) is open — follow the established `ProfileSidebar` row pattern.
- Per-type default icons/thumbnails for entities without a photo (initials work for People; Groups/Locations/Relationship-links may want a type glyph).
- List virtualization / pagination strategy at thousands of rows is an implementation detail for the planner (honor the "degrade gracefully to thousands" constraint via Dexie indexed queries + lazy media).
- Storage/sharding mechanics for the new entity types (new `EntityType` members, manifest shard keys, serializer, sync) — follow the existing per-type sharding pattern; see code context.

### Folded Todos
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** — `.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md`. **Bucket B** (photo expand/lightbox — UAT Test 6; gallery sort/reorder — UAT Tests 11 & 14) is **folded into this phase** as success criteria 5–6 (decisions D-20, D-21). Bucket A is NOT folded (see Deferred Ideas).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 design + research baseline (this phase extends Phase 1's UI and data model)
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-UI-SPEC.md` — the established visual language, tokens (`src/app/tokens.ts` / `src/app/tokens.css`), amber-reserved-for-creation rule (A8), the create→place→profile flow (A12), and the canvas→AT accessibility bridge. New forms, the field manager, browse lists, and the lightbox must stay consistent with it.
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-RESEARCH.md` — storage/sync/media research; the indexing and content-addressed-media anti-patterns that still bind this phase.

### Folded / reviewed todo
- `.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md` — source of the lightbox + gallery-reorder scope (Bucket B folded; Bucket A deferred to Phase 3).

### Project-level (always in force)
- `.planning/PROJECT.md` — constraints (serverless/no-backend, free-OSS-only, single-curator, provider-security-only), the four-types decision, and the data-driven-relationships / viewer-only-graph boundary.
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-03, BRWS-01, BRWS-02 wording and traceability.
- `.claude/CLAUDE.md` — prescriptive stack (React 19 + Vite + TS, Dexie, zod 4 for typed-value validation, MiniSearch reserved for Phase 5).

No external ADRs exist yet — decisions are captured in this file and the docs above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/db/repository.ts`** — the single mutation path (validate→stamp `updatedAt`+`dirty`→emit change). New entity CRUD (locations-as-entities, groups, relationship-links) and custom-field value writes must go through this same pattern. `deletePerson()` (line 84) already implements the cascade + content-addressed media refcount-GC — this becomes the **list-level delete** (D-12); add a marker-only delete for the **map-level** action.
- **`src/features/profile/ProfileSidebar.tsx`** — the dossier panel; renders built-in fields read-only with `initialsOf()` avatar fallback and the `PhotoGallery` mount. Extend it to render custom-field values (by type) and to host the lightbox; reuse its avatar/initials logic for browse rows.
- **`src/features/person-form/PersonForm.tsx`** — Radix Dialog create/edit form with the 6 hardcoded fields, tag chip editor, and amber-on-create / neutral-on-edit save discipline. The template for per-type entity forms that additionally render custom fields from the per-type schema.
- **`src/features/profile/PhotoGallery.tsx`** — lazy thumbnail tile grid; the surface for click-to-expand (D-20) and drag-reorder (D-21).
- **`src/features/person-map/useMapImage.ts` (`useBlobImage`)** and **`getMedia()`** — media object-URL loading for thumbnails/lightbox; callers revoke on unmount.
- **`src/app/App.tsx`** — the single-surface shell (top bar + `MapView` + sidebar + form). Becomes the host for the left-nav view switcher (D-13).

### Established Patterns
- **Type ↔ schema ↔ Dexie correspondence:** `src/domain/types.ts` (interfaces) ↔ `src/domain/schemas.ts` (zod, with compile-time `satisfies` locks) ↔ `src/db/schema.ts` (Dexie tables/indexes). Every new entity type and the custom-field model must be added in all three, preserving the `satisfies` locks.
- **Per-type sharding:** `EntityType = 'people' | 'maps' | 'markers'` drives the manifest. `Manifest.shards` is a `Record<EntityType, ShardPointer>` with **explicit per-type keys in `ManifestSchema`** (`src/domain/schemas.ts:60`). Adding `groups` and `relationship-links` (and treating `maps` as rich Locations) touches `EntityType`, `ManifestSchema.shards`, the serializer (`src/sync/serializer.ts`), and sync. The **manifest swap is the sole atomic commit point** — keep it that way.
- **Custom-field values on entities** must round-trip through: zod validation → Dexie → cloud serializer → export/restore (`BackupSchema`). A dynamic/typed field-value shape needs a zod representation that still satisfies the backup schema.
- All user text rendered as React children — **never `dangerouslySetInnerHTML`** (T-03-01: XSS could exfiltrate the Drive token). Applies to all new custom-field rendering.

### Integration Points
- **Storage spine:** new entity types + custom-field definitions/values must serialize into the sharded manifest and survive export/restore round-trips (the cloud is the only copy).
- **Field definitions need their own persistence** (per-type schemas) — likely a new table/shard or a `meta`-style store — that also round-trips to the cloud and export.
- **Phase 5 search** will index custom-field values per field — the per-type schema (D-01) is what makes per-attribute checkboxes coherent. Keep field identity stable (stable field IDs, not just labels) so a soft-deleted/renamed field doesn't break the index.
- **Phase 4 relationships** will attach endpoints to the Relationship-link entity shell (D-08) and turn `link-to-entity` neighbors into richer edges — keep the Relationship-link record and `link-to-entity` pointer shapes forward-compatible.

</code_context>

<specifics>
## Specific Ideas

- The user specifically flagged the **delete-from-map bug**: "deleting a profile from the map deletes them from the database, but it should only delete it from the map, but stay in the list of people, and the actual delete should be from the list." Captured as D-11/D-12 and treated as a required behavior change this phase, not a nice-to-have.
- Strong, consistent preference throughout for the **clean phase boundary**: build entity *shells* now (Relationship-link, Group) and defer *wiring* (endpoints, members, connectors, graph) to Phase 4 rather than building a throwaway interim mechanism.

</specifics>

<deferred>
## Deferred Ideas

- **Resizable markers / Konva Transformer handles for markers and the map image** (Bucket A of the Phase 1 UAT todo) → **Phase 3** (map editor). Explicitly NOT folded into Phase 2.
- **Multi-column sortable table view** for browse lists → later; v1 uses thumbnail+name+secondary rows (D-15).
- **Lightbox zoom/pan** → later / overlaps Phase 3 Konva transform work; v1 lightbox is prev/next only (D-20).
- **Full per-field validation rules** (min/max/length/regex, select-option constraints) → later; v1 is type + `required` (D-06).
- **Reusable cross-type field definitions** → not in v1; definitions are tied to one type (D-03).
- **Gallery sort-by date/name** → would require adding date/name metadata to `MediaRef`; v1 is manual drag order (D-21).

### Reviewed Todos (not folded)
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** — Bucket A (resizable person markers — UAT Test 4; image + marker transform handles — UAT Test 13) reviewed and **deferred to Phase 3**; only Bucket B was folded into this phase.

</deferred>

---

*Phase: 2-custom-fields-full-entity-model*
*Context gathered: 2026-06-25*

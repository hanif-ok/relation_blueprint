# Phase 2: Custom Fields & Full Entity Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 2-custom-fields-full-entity-model
**Areas discussed:** Custom field model, Four types & boundaries, Browse lists, Entity vs placement (delete semantics), Defaults/privacy/gallery

---

## Custom field model

| Option | Description | Selected |
|--------|-------------|----------|
| Per-type schema | Fields defined once per type, shared by all entities of that type | ✓ |
| Per-instance ad-hoc | Each entity carries its own arbitrary fields, no shared schema | |
| Hybrid | Type-level shared fields + per-entity extras | |

**User's choice:** Per-type schema
**Notes:** Chosen because Phase 5 field-scoped search needs field consistency across entities of a type.

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated field manager | Settings panel per entity type to add/edit/remove/reorder field defs | ✓ |
| Inline 'Add field' in form | Add fields in-context inside the entity editor | |
| Both | Inline quick-add + central manager | |

**User's choice:** Dedicated field manager

| Option | Description | Selected |
|--------|-------------|----------|
| Tied to one type | A 'People' field is separate from a 'Groups' field | ✓ |
| Reusable across types | Define a field once, attach to multiple types | |
| Let Claude decide | Defer to research | |

**User's choice:** Tied to one type

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed built-ins + custom alongside | Name/photo mandatory, rest always exist; custom added below | ✓ |
| Built-ins are seeded custom fields | The 6 fields are editable/removable custom-field definitions | |
| Name only fixed | Only name locked; photo/phone/etc. removable | |

**User's choice:** Fixed built-ins + custom alongside

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-delete, keep values hidden | Removing a field retains values; re-adding restores them | ✓ |
| Purge values on delete | Permanently drop values from every entity | |
| Block deletion while in use | Can't delete a field until its values are cleared | |

**User's choice:** Soft-delete, keep values hidden
**Notes:** Type changes keep convertible value, else flag/quarantine.

| Option | Description | Selected |
|--------|-------------|----------|
| Type-checking + optional 'required' | zod type validation + per-field required toggle | ✓ |
| Type-checking only | Enforce type only, nothing ever required | |
| Full per-field rules | Required + min/max/length/regex/select-options | |

**User's choice:** Type-checking + optional 'required'

---

## Four types & boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| A Map IS the Location entity | Promote MapDoc to a full entity with profile/gallery/fields | ✓ |
| Separate Location and Map objects | Location may exist without a map; Map is the canvas | |
| Let Claude decide | Defer to research | |

**User's choice:** A Map IS the Location entity

| Option | Description | Selected |
|--------|-------------|----------|
| Entity shell now, wiring in Phase 4 | Relationship-link is a data-model entity (own data + fields + profile); endpoints/connectors/graph = Phase 4 | ✓ |
| Entity + endpoints now, projections in P4 | Also pick the two entities a link connects | |
| Defer Relationship-link entirely to P4 | Phase 2 does People/Locations/Groups only | |

**User's choice:** Entity shell now, wiring in Phase 4

| Option | Description | Selected |
|--------|-------------|----------|
| Profile shell now, membership via Phase 4 | Group is an entity; members/relations via the Phase 4 relationship system | ✓ |
| Simple members list now | Group gets a basic members picker, separate from relationships | |
| Members as a link-to-entity field | Model membership via the custom link field | |

**User's choice:** Profile shell now, membership via Phase 4

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight one-way pointer | Typed reference, no reverse edge, no own data, not graph-rendered | ✓ |
| Two-way reference with back-links | Auto-creates a back-reference on the target | |
| Defer link-to-entity to Phase 4 | Ship only 6 of 7 field types this phase | |

**User's choice:** Lightweight one-way pointer

---

## Browse lists

| Option | Description | Selected |
|--------|-------------|----------|
| View switcher in a left nav | Persistent nav swaps the main surface between map and lists | ✓ |
| Slide-over browse panel | Panel slides over the map | |
| Separate routed pages | Dedicated /people, /locations routes | |

**User's choice:** View switcher in a left nav

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail + name + secondary line | Round thumb/initials + name + one secondary line | ✓ |
| Thumbnail + name only | Minimal one-line rows | |
| Multi-column table | Sortable columns for several fields | |

**User's choice:** Thumbnail + name + secondary line

| Option | Description | Selected |
|--------|-------------|----------|
| Opens the profile sidebar | Reuse the ProfileSidebar dossier; add a 'show on map' action | |
| Jumps to the entity on its map | Row click selects the marker on the map | |
| Both, as distinct actions | Row click = profile; separate action = map jump | ✓ |

**User's choice:** Both, as distinct actions
**Notes:** Pure map-jump breaks for non-spatial entities (Groups/Relationship-links).

| Option | Description | Selected |
|--------|-------------|----------|
| All four types | People, Locations, Groups, Relationship-links each get a list | ✓ |
| Just People + Locations | Build exactly BRWS-01/02 | |
| People + Locations + Groups | Three lists | |

**User's choice:** All four types
**Notes:** Groups/Relationship-links have no map presence, so the list is their creation/discovery surface.

| Option | Description | Selected |
|--------|-------------|----------|
| Name A–Z, with a sort toggle | Default alphabetical + toggle to recently-updated | ✓ |
| Recently updated first | Most-recently-edited at top, no toggle | |
| Name A–Z only | Alphabetical, no control | |

**User's choice:** Name A–Z, with a sort toggle

---

## Entity vs placement (delete semantics)

**User's choice (raised freeform, then confirmed):** Separate "remove from map" (delete the marker/placement only — entity stays in the DB and in the browse list) from "delete entity" (the full cascade + media GC, done from the list). The current `deletePerson()` cascade becomes the list-level delete; the map-level action becomes a marker-only delete. Same pattern for Locations. Sets up Phase 3 MAP-05 (one person on multiple maps).
**Notes:** User flagged that today deleting a profile from the map deletes the person from the database, which is wrong — placement and existence must be decoupled. Treated as a required behavior change this phase.

---

## Defaults, privacy & gallery

| Option | Description | Selected |
|--------|-------------|----------|
| Name + photo + gallery + notes | Minimal universal spine for non-Person types | ✓ |
| Just name + photo | Absolute minimum | |
| Per-type tailored defaults | Hand-picked defaults per type | |

**User's choice:** Name + photo + gallery + notes (Locations also keep background/dims)

| Option | Description | Selected |
|--------|-------------|----------|
| One-time onboarding notice | Shown once at setup, dismissible, re-viewable in settings | ✓ |
| On first entity creation | Appears at first person create | |
| Persistent settings/about notice | Standing notice in About/Settings | |

**User's choice:** One-time onboarding notice

| Option | Description | Selected |
|--------|-------------|----------|
| Full-size + prev/next + Esc | Overlay with gallery navigation and dismiss | ✓ |
| Full-size with zoom/pan | Adds pinch/scroll zoom + pan | |
| Minimal single-image overlay | One image, no navigation | |

**User's choice:** Full-size + prev/next + Esc

| Option | Description | Selected |
|--------|-------------|----------|
| Manual drag-to-reorder, persisted | Drag thumbnails; order saved on gallery[] | ✓ |
| Sort by date / name | Sort control instead of manual order | |
| Both manual + sort options | Manual order + sort presets | |

**User's choice:** Manual drag-to-reorder, persisted
**Notes:** First gallery photo can act as the thumbnail; MediaRef has no date/name metadata today.

---

## Claude's Discretion

- Custom-field rendering order/grouping within a profile (after built-ins).
- Per-type default icons/thumbnails for entities without a photo.
- List virtualization/pagination strategy at thousands of rows (planner's call, honoring the scale constraint).
- Storage/sharding mechanics for the new entity types (follow the existing per-type sharding pattern).

## Deferred Ideas

- Resizable markers / Konva Transformer handles (Bucket A of the Phase 1 UAT todo) → Phase 3.
- Multi-column sortable table view for browse → later.
- Lightbox zoom/pan → later.
- Full per-field validation rules (min/max/regex) → later.
- Reusable cross-type field definitions → not v1.
- Gallery sort-by date/name (needs MediaRef metadata) → later.

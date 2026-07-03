# Phase 4: Relationships & Graph - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase turns the existing **endpoint-less `RelationshipLink` shell** (created in Phase 2 as a data-bearing entity with `label`/`date`/`notes`/`custom`/`gallery` but *no connections*) into **real authored relationships**, and projects them two ways:

1. **Author relationships in entity details** — person↔person, person↔group, group↔group (REL-01).
2. **Relationships carry their own data** — label, date, notes (REL-02; the shell's fields already render).
3. **Data-driven map connectors** — relationships appear automatically as connectors between markers and update as markers move (REL-03).
4. **Viewer-only relationship graph** — visualize how people and groups connect (REL-04).

**Requirements in scope:** REL-01, REL-02, REL-03, REL-04.

**Endpoint combos (locked by roadmap):** person↔person, person↔group, group↔group. Locations/Maps are **not** relationship endpoints in v1.

**Explicitly NOT this phase (clarify HOW, never add WHAT):**
- Field-scoped search → **Phase 5** (incl. SRCH-03 search across locations/groups — v2).
- Mega.nz provider → **Phase 6**.
- Editing relationships **inside** the graph view (graph is viewer-only) → out of scope per PROJECT.md.
- Graph filtering/grouping by relationship type or group (GRPH-01) → **v2**.

**✓ FORMER BLOCKER (surfaced during discussion) — RESOLVED 2026-07-03:** The "can't navigate to a location from the list" defect — opening a map from the Phase-2/3 Locations browse list (D-05) — has been fixed via a **`/gsd-debug`** pass and human-verified via UAT (commit `76c55d8`). This is the exact surface Phase 4 connectors render on, so with it fixed REL-03 is fully usable end-to-end. Left here for provenance; no Phase-4 action required.

</domain>

<decisions>
## Implementation Decisions

### Relationship direction & shape (REL-01/REL-02)
- **D-01:** **Direction is a per-link choice.** Each relationship is either **directed** ("mentor → mentee", arrowhead from A to B) or **symmetric** ("friends", plain line), chosen by the author at creation. Data model: `RelationshipLink` gains an **ordered pair** (`fromType`/`fromId`, `toType`/`toId`, where each type ∈ {`people`,`groups`}) plus a **`directed: boolean`** flag. Arrowheads render only when `directed` is true — on both map connectors and graph edges.
- **D-02:** A relationship's existing single **`label`** carries the phrasing (e.g. "mentor of"). Reciprocal per-direction labels (a different word read from each end) are **deferred** — single label for v1 (see Deferred / Claude's Discretion).

### Authoring flow (REL-01)
- **D-03:** Relationships are authored from a **"Relationships" section on Person and Group profiles** (a new section in `ProfileSidebar`, sibling to the People "Appears on" section), with **"+ Add relationship"**: pick the other entity, set direction, and fill label/date/notes. **Locations do not get this section** (not valid endpoints).
- **D-04:** Authoring writes **one canonical `RelationshipLink`** that **auto-appears on both endpoints' profiles** — each profile reactively queries links where it is an endpoint (single source of truth; no duplicate per-side record).
- **D-05:** **Remove the standalone "+ New → Relationship-link"** item from `NewEntityMenu` — an endpoint-less relationship is meaningless and REL-01 says author *in an entity's details*. The **relationship-links browse list stays** as a view / manage / edit surface for all relationships.
- **D-06:** Opening a relationship (from a profile's Relationships section or the browse list) **reuses the existing full `ProfileSidebar` entity profile** — it shows the two endpoints + label/date/notes, plus the gallery and custom fields it already supports as a first-class entity (those stay optional and usually empty). No separate slim editor.

### Map connectors (REL-03)
- **D-07:** A connector is drawn between two markers on a map **only when both endpoints are people who each have a marker on that map** (person↔person). **Person↔group and group↔group relationships are graph-only** — groups have no marker, so they do **not** render on the canvas.
- **D-08:** Connectors render on a **dedicated, non-interactive connectors layer beneath the marker content**, in **image-space composed through `MapDoc.backgroundTransform`** (the Phase-3 anchoring model) so they **follow markers live** as markers move and stay anchored when the background is re-fit. Arrowhead when `directed` (D-01).
- **D-09:** **Connector labels are OFF by default**, with a **show/hide toggle** (mirrors the Phase-3 D-20 marker-name-label pattern — keeps the canvas clean and cheap at scale).
- **D-10:** Connectors are **viewer-only projections** — you edit the relationship in its profile, never by dragging on the canvas. (Distinct from portal markers, which are map→map links — do not conflate.)

### Graph view (REL-04)
- **D-11:** A new **"Graph" view in the left-nav `ViewSwitcher`**. **Nodes = people (avatar) + groups (glyph)**; **edges = relationship-links** (labeled; arrowhead when `directed`). Relationship-links are edges here, not nodes — even though they are entity records.
- **D-12:** **Clicking a node opens its `ProfileSidebar`** (reuses the existing panel). **Opening the graph from an entity's profile centers/highlights that node** (ego emphasis) — implemented as focus/highlight, not a separate view mode.
- **D-13:** **Force-directed layout** (Cytoscape `cose`) by default; **persist/pre-cache node positions** for larger graphs (the roadmap's light-research flag). Graph is **viewer-only** (locked by PROJECT.md).

### Claude's Discretion
- **D-02 reciprocal labels:** single `label` for v1; a per-direction reciprocal label is a later enhancement.
- **Multiple placements:** if one person has several markers on the same map, exactly how many connectors to draw for one relationship (per-placement vs. primary-only) — planner/research discretion; keep it simple and legible.
- **Endpoint data-model + reverse index:** the concrete Dexie shape for endpoints on `RelationshipLink` and the index that answers "links where entity X is an endpoint" efficiently — planner discretion (an index is recommended for the profile Relationships section and graph build).
- **Layout selection + position-caching mechanism:** final Cytoscape layout choice and how positions are cached — light research per the roadmap flag.
- **Visual styling:** connector color/weight/arrowhead size and graph node/edge styling — follow `01-UI-SPEC.md` tokens (amber reserved for selection).

### Reviewed Todos (not folded)
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** (`.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md`) — matched this phase at score 0.9 but is a **keyword false-positive**. Its Bucket A folded into Phase 3, Bucket B into Phase 2; it is map-editor/media UX, **not** relationship work. **Not folded.**

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (scope + wording)
- `.planning/ROADMAP.md` §"Phase 4: Relationships & Graph" — the four success criteria, endpoint combos, and the light-research flag (Cytoscape layout selection, pre-cache node positions).
- `.planning/REQUIREMENTS.md` — REL-01, REL-02, REL-03, REL-04 wording + traceability.

### Entity model & prior decisions this phase builds on
- `.planning/phases/02-custom-fields-full-entity-model/02-CONTEXT.md` — **D-08** (`RelationshipLink` created as a data-bearing shell with NO endpoints — Phase 4 adds them), the four-entity model, and **D-10** (`link-to-entity` is a *one-way* custom-field pointer — distinct from a relationship).
- `.planning/phases/03-map-editor-spaces-navigation/03-CONTEXT.md` — **image-space coordinate model** (connectors must draw in the same space, composed through `backgroundTransform`, to stay anchored), the note to **keep the layer model open to a connectors layer**, the **portal (map→map) vs. connector (entity→entity)** distinction, and **D-13** (marker = placement; relationships attach to the canonical Person/Group, never a marker).

### Project constraints (always in force)
- `.planning/PROJECT.md` — relationships are **data-driven**, the **graph is viewer-only** (Key Decisions + Out of Scope: "Editing relationships inside the graph view"); **Social Groups are separate from spatial Map-groups**; serverless / free-OSS / single-curator constraints.

### Visual language & performance
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-UI-SPEC.md` — established tokens (`src/app/tokens.ts` / `tokens.css`), amber-reserved-for-selection rule, and the **canvas→assistive-tech bridge** (the graph and connectors are canvas-opaque to screen readers — node/relationship selection must announce via the sidebar like markers do).
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-RESEARCH.md` — **Pattern 5** (Konva viewport culling + shape caching) is relevant if the connectors layer adds render load at many markers; Konva + React 19 integration notes.

### Prescriptive stack
- `.claude/CLAUDE.md` — **Cytoscape.js 3.34.x + react-cytoscapejs** is the prescribed graph lib (viewer-only node-link graph, `cose` layout) and is **NOT yet installed** (a new dependency for this phase — MIT, satisfies free/OSS). Konva 10.3 + react-konva (installed) for connectors; Dexie 4 + zod 4 for the model.

No external ADRs exist — decisions are captured in this file and the docs above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/domain/types.ts`** — `RelationshipLink` interface (l.232) is the shell to extend with endpoint fields (`fromType/fromId`, `toType/toId`, `directed`); `Marker` (l.265) person markers carry `personId` + image-space `x/y`; `EntityType` already includes `'relationship-links'` and `'groups'`.
- **`src/domain/schemas.ts` + `src/db/schema.ts`** — the **type ↔ zod-schema ↔ Dexie triple**: new endpoint fields must be added in **all three**, preserving the compile-time `satisfies` locks. Schema is **Dexie** (auto-upgrade via `this.version(n).stores({...})`) — **NOT Drizzle/Prisma; there is no migration-push step** ([[schema-gate-dexie-false-positive]]). New **optional** endpoint fields on an existing table need **no data migration**.
- **`src/db/repository.ts`** — the single mutation path (validate → stamp `updatedAt`+`dirty` → emit change). Needs a create/upsert-relationship writing endpoints, and a **reverse-lookup query** ("links where entity X is an endpoint") for the profile Relationships section + graph build. `deleteEntity` already cascades and GCs; deleting a Person/Group should also drop its relationship-links (or orphan-guard the connectors/graph).
- **`src/features/profile/ProfileSidebar.tsx`** — reuse for the relationship profile (D-06); add a **"Relationships" section** (build like the existing `groupPlacementsByMap` "Appears on" block) on Person & Group; `onOpenEntity` already exists for entity→entity navigation.
- **`src/features/nav/NewEntityMenu.tsx`** — remove the `{ type: 'relationship-links', label: '+ Relationship-link' }` ITEM (D-05). Keep People/Location/Group.
- **`src/features/browse/*`** — the relationship-links browse list stays as the manage/edit surface.
- **`src/features/person-map/MapView.tsx` + `AvatarMarker.tsx`** — the Konva Stage host; add the connectors layer here. Markers are already image-space with viewport culling; connectors read the same marker coords.
- **`src/features/nav/ViewSwitcher.tsx`** — add the new **"Graph"** view entry.

### Established Patterns
- **relationship-links shard already wired end-to-end:** `'relationship-links'` is in `EntityType` + `Manifest.shards` + the serializer + the SyncEngine six-branch wiring + `BackupSchema`. Adding **fields to the existing record** rides all of it — **no new shard, no new sync branch**. Endpoint fields just need to serialize + round-trip through export/restore.
- **Marker = placement; relationships attach to the canonical entity** (Phase 3 D-13). A connector resolves: relationship endpoint (a `personId`) → that person's marker(s) on the **active** map. If either endpoint has no marker on the map, no connector.
- **Konva coords are image-space, composed through `backgroundTransform`** (Phase 3) — connectors draw in image-space so they stay anchored on background re-fit and follow marker drags live.
- **No `dangerouslySetInnerHTML` — ever.** Relationship labels/notes and graph node/edge labels render as React / Konva / Cytoscape `Text`, never injected HTML (XSS could exfiltrate the Drive token — threat T-03-01).

### Integration Points
- **Storage / export:** endpoint fields on `RelationshipLink` must serialize into the sharded manifest and survive **export/restore** (`BackupSchema`) — the cloud is the only copy.
- **Locations browse → open map (D-05, Phase 3):** the surface connectors render on. **✓ Previously-reported-broken defect now RESOLVED** (UAT-verified 2026-07-03, commit `76c55d8`) — see Domain.
- **Graph is a new top-level surface** via `ViewSwitcher`, reusing `ProfileSidebar` on node click and the canvas→AT bridge for accessibility.
- **New dependency:** `cytoscape` + `react-cytoscapejs` must be installed (MIT / free-OSS, per `.claude/CLAUDE.md`) — the only net-new libs this phase.

</code_context>

<specifics>
## Specific Ideas

- **Reuse existing surfaces over inventing new ones** — a strong, consistent preference carried from Phase 3 and reaffirmed here: the Relationships section lives in the existing `ProfileSidebar` (like "Appears on"); the relationship record reuses the full entity profile; the graph is a new `ViewSwitcher` entry; node clicks reuse `ProfileSidebar`.
- **Keep the map clean at scale** — connector labels default OFF with a toggle (D-09), echoing the Phase-3 D-20 name-label decision. The signal is: default to the uncluttered view, make richness opt-in.
- **The user accepted the recommended option on every question answered** (per-link direction, profile-authoring with the bare +New removed, full-profile relationship record). Areas 3 (connectors) and 4 (graph) were finalized on the recommended options (D-07..D-10, D-11..D-13) after the user stepped away mid-discussion — **all are open to revision before planning**.

</specifics>

<deferred>
## Deferred Ideas

- **Reciprocal per-direction relationship labels** (a different word read from each end) → v1 uses a single `label` (D-02).
- **Group relationships rendered on the map** (e.g. connect a person to each member of a related group) → v1 is graph-only for group-involving links (D-07). Revisit if maps need to show group membership spatially.
- **Graph filtering / grouping by relationship type or group** → v2 (GRPH-01).
- **Search across relationships / groups / locations** → v2 (SRCH-03); Phase 5 search is people-scoped.
- **Multi-select / bulk relationship editing** → not v1.
- **Social-network analytics over the graph** (centrality, clustering) → v2 (ANLY-01).

### Reviewed Todos (not folded)
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** — reviewed (0.9 keyword match) but **not folded**: already addressed by Phases 2–3; not relationship work. (Detailed in Decisions.)

</deferred>

---

*Phase: 4-relationships-graph*
*Context gathered: 2026-07-03*

# Feature Research

**Domain:** Serverless / local-first PWA for people-tracking & relationship mapping over spatial maps (own-cloud, single-curator "Mokuro model")
**Researched:** 2026-06-24
**Confidence:** MEDIUM-HIGH (prior-art landscape verified against current tools; feature categorization is opinionated synthesis)

---

## Prior Art / Existing Tools

> **The user explicitly asked: "research whether there's already a thing like this."**

### Headline Answer

**No.** No existing tool combines all five of: **(1) serverless own-cloud storage (Google Drive / Mega), (2) spatial placement of people on hand-built maps of physical locations, (3) customizable typed-field entity profiles, (4) data-driven relationship graph, and (5) field-scoped fuzzy search.**

Every tool in the space nails 1–3 of these axes and misses the rest. The novelty of Relation Blueprint is **not any single feature** — every individual capability exists somewhere — it is the **specific intersection**, anchored on the two hardest-to-find combinations:

- **Spatial map placement of *people as entities* + a data-driven relationship graph** (whiteboards have placement but no entity model; network tools have the graph but no physical-space placement).
- **Own-cloud serverless storage of a *structured relational database with media*** (local-first whiteboards own-the-data but store freeform canvases, not typed entities; CRMs have typed entities but require a backend server).

The closest single analogs are **Obsidian (Canvas + Dataview-style metadata)** for the data-ownership + canvas + custom-fields combination, and **Maltego/Kumu** for the relationship-graph half — but none place people on *floor-plans of real places* while owning the data in the user's own cloud.

### Tool-by-Tool Assessment

| Tool | Category | How close | What it does well | Where it falls short vs this vision |
|------|----------|-----------|-------------------|-------------------------------------|
| **draw.io / diagrams.net** | Diagram/whiteboard editor | Partial (editor + storage) | Free, can save to **Google Drive / OneDrive / device** (own-storage model already!); rich shape/connector vector editor; image backgrounds; layers | Connectors are **hand-drawn**, not data-derived; no entity/profile model; no typed fields; no search-over-attributes; no relationship graph projection |
| **Excalidraw** | Whiteboard | Partial (storage UX, editor feel) | **Local-first PWA**, fully offline, IndexedDB, no account, MIT, export to Drive/Dropbox; great hand-drawn UX | Freeform scene, not a structured DB; no entities/fields; no relationship modeling; no search; no nested-map portals |
| **tldraw** | Whiteboard / canvas SDK | Partial (as a *library*, not a product) | MIT infinite-canvas **SDK** — strong candidate as the **map-editor building block**; shapes, bindings, custom shapes, persistence hooks | Not a product; no entities/profiles/graph/search of its own — you build all of that |
| **Obsidian Canvas + Dataview/Bases** | Local-first knowledge tool | **Closest "own-your-data + canvas + fields" analog** | **You own the files** (Markdown + JSON Canvas open format); infinite canvas with linked notes; custom frontmatter fields; queryable metadata; huge plugin ecosystem | Canvas is freeform (no physical-map placement of *people markers*); relationships are wikilinks not typed data-bearing links; graph view is link-derived, not relationship-typed; no field-scoped fuzzy search UX; desktop-first, not a place-people-on-a-floorplan tool |
| **Kumu.io** | Relationship/network mapping | High on the **graph half** | Beautiful relationship maps; SNA metrics (centrality, community detection); filters/clustering; **Google Sheets import**; embeddable | **Hosted SaaS** (not own-cloud, not serverless); private projects \$9/mo; abstract network layout, **no physical-space maps**; no offline-first; no media gallery per node |
| **Maltego (+ Hunchly)** | OSINT / investigation link analysis | High on **entity-graph + profiles** | Industry-leading entity link graphs; entities carry properties; Transforms enrich data; Hunchly captures web evidence; person-of-interest graphs | Enterprise-priced/paid; desktop/hosted; **no spatial floor-plan placement**; not own-cloud single-curator; heavyweight, investigation-oriented |
| **Polinode** | Network analysis | Medium | Network + survey-driven SNA; dashboards | Hosted/paid; abstract networks only; no spatial maps; no own-cloud |
| **Neo4j Bloom / graph DBs** | Graph database viz | Medium (graph only) | Powerful graph query + visualization | Requires a **database server**; developer tool; no maps, no curated profiles UX, no serverless model |
| **Social Tables / AllSeated, seating apps** | Seating-chart / event floor plans | Medium on **place-people-on-a-plan** | Drag guests onto floor plans/tables; venue diagrams | Hosted SaaS; guests are thin records (no rich typed profiles); no relationship graph; no own-cloud; no fuzzy field search |
| **Hot-desking / space-mgmt apps** (e.g. OfficeSpace, Robin) | Space management | Medium on **people↔location** | Floor plans with people assigned to desks; find-a-colleague | Enterprise SaaS w/ backend + accounts; no relationship modeling; no custom typed fields beyond HR data; not own-cloud |
| **AutoCAD / floor-plan tools** | CAD / floor planners | Low | Precise floor-plan drawing | No people/entity layer at all; no relationships; no search |
| **Airtable** | Database / custom fields | High on **typed fields + views** | Best-in-class typed custom fields (text, number, date, select, link-to-record, attachment); link-to-entity; filtering; can model people/groups/links | Hosted SaaS backend; no spatial maps; no infinite-canvas placement; relationship graph is not first-class; not own-cloud/offline-first |
| **Notion** | Docs/DB hybrid | Medium-high on **profiles + relations** | Typed properties, relation properties between databases, galleries, media | Hosted backend, no spatial maps, no map-placement, no relationship graph viz, not own-cloud |
| **Monica HQ (monicahq/monica)** | Personal/relationship CRM (OSS) | High on **people + relationships + custom fields** | **Open-source (AGPLv3, ~21K stars)**, self-hostable free; tracks people, relationships, interactions, reminders, custom fields | **Requires a PHP/Laravel server + DB** (not serverless / own-cloud); no spatial maps; no infinite canvas; relationships are lists, **no graph viz**; current-state + history (more than v1 needs) |
| **OSINT mapping tools** (Maltego, SpiderFoot, theHarvester, IBM i2) | Investigation | Medium | Entity enrichment + link graphs | Server/desktop, paid/enterprise, no own-cloud, no spatial people-on-a-place model |
| **Genealogy apps** (Gramps, Ancestry, Family Echo) | Relationship trees | Medium on **relationship viz** | Rich person profiles, relationship graphs (family trees); **Gramps is OSS & local** | Domain-locked to kinship; no arbitrary spatial maps; no field-scoped fuzzy search; trees, not free-form relationship graphs |
| **Mokuro** | Local-first reader (the *inspiration*) | Architectural analog only | **Purely client-side, files ARE the database**, no backend — the model this project borrows | Different domain (manga OCR); proves the storage model, not the features |

### What the prior art tells us

- **The storage model is proven & feasible.** draw.io already saves to Google Drive; Excalidraw is a fully-offline own-data PWA; Mokuro proves files-as-database. **JSON Canvas** (Obsidian's open format) proves a portable, user-owned structured file format works. → Validates the serverless own-cloud constraint as buildable.
- **The relationship-graph half is a solved, commoditized capability** (Kumu, Maltego, Neo4j Bloom, force-directed JS libs). → Don't over-invest in novel graph tech; use a known library.
- **Typed custom fields + link-to-entity is commoditized** (Airtable, Notion, Monica). → Match expectations; don't reinvent.
- **The genuine white space:** *placing rich people-entities onto curated maps of physical spaces, with the relationships authored as data and projected both onto the map and into a graph, all in the user's own cloud, offline.* Nobody ships this.
- **Differentiation must lean on the *combination* + the *field-scoped fuzzy search*** ("smith" matches name but not the job field) — a search UX that none of the surveyed tools offer.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these = the product feels broken or untrustworthy. Users give no credit for having them but punish their absence.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Connect to own cloud (Google Drive / Mega) & persist the whole DB there | The entire premise; no value without it | HIGH | OAuth (Drive) + Mega SDK; abstract behind a storage-provider interface so both look identical to the app |
| Offline-capable installable PWA with local cache + sync | Promised in core value; Mokuro/Excalidraw set this bar | HIGH | Service worker + IndexedDB as local source of truth; cloud is sync target; conflict-free because single curator |
| Create a map from an uploaded background image | The foundational canvas; every analog (draw.io, seating apps) supports image backgrounds | MEDIUM | Image upload, store as media blob, render as canvas layer |
| Place a person as a photo-avatar marker on a map | Core "who is where" interaction | MEDIUM | Marker = entity reference + map coords; one person can have markers on multiple maps |
| Rich entity profile panel (click person/place → full data) | Every CRM/Notion/Airtable user expects a detail view | MEDIUM | Side panel; thumbnail + gallery + fields |
| Typed custom fields (text, number, date, phone, tags/select, link-to-entity, photo) | Airtable/Notion/Monica baseline; also powers search & validation | HIGH | Field-definition schema per entity type; renderers + validators per type. **Foundational dependency.** |
| Define relationships between entities (person↔person/group, group↔group) | Expected in any relationship tool; the "how they connect" half | MEDIUM | Relationship = data-bearing link entity (label, date, notes) |
| Relationship graph view (viewer-only) | Kumu/Maltego/Monica-adjacent expectation for "relationship mapping" | MEDIUM | Force-directed layout from existing JS lib; read-only projection of data |
| Browse people as a list & locations as a list | Basic navigability; users won't only navigate spatially | LOW | List/grid views over entity collections |
| Fuzzy search over people | Expected in any directory; finding entities by name is non-negotiable | MEDIUM | Client-side fuzzy index (e.g. Fuse.js/MiniSearch); must scale to thousands |
| Photo/media handling: thumbnail + multi-photo gallery per entity | Profiles feel empty without photos; markers need avatars | MEDIUM | Image storage, thumbnailing/resizing client-side, gallery component |
| Drawn shapes/lines/zones + layers in the map editor | draw.io/seating-app baseline for marking rooms/areas | MEDIUM-HIGH | Strongly consider an existing canvas SDK (tldraw/Konva/Fabric) rather than hand-rolling |
| Export the whole database as a portable backup | Own-your-data promise; trust requires an exit | LOW-MEDIUM | Zip of JSON + media; mirrors JSON Canvas portability ethos |

### Differentiators (Competitive Advantage)

These are where the product wins. They align directly with PROJECT.md's Core Value and signature features.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Field-scoped fuzzy search** (per-attribute checkbox toggles — "smith" matches name, not the job field) | **Signature feature.** No surveyed tool offers it. Solves the real "blacksmith" precision problem | MEDIUM-HIGH | Depends on typed-field schema; toggles select which field indexes participate; rebuild/weight index per toggle state |
| **People on maps of *real physical spaces* (not abstract networks)** | The white space — combines seating-chart placement with rich entities + relationships | MEDIUM | This intersection is the novel core; nobody else does people-on-floorplans + relationships |
| **Data-driven map connectors** (relationships authored as data, auto-rendered on the map) | Single source of truth; no hand-drawn-line drift (draw.io's weakness) | MEDIUM | Connectors are projections; recompute when relationship data or marker positions change |
| **Nested spatial map-groups with "portal" location-link markers** (floor→building→street) | Spatial hierarchy navigation that whiteboards and CRMs lack | MEDIUM-HIGH | Distinct marker shape that hyperlinks to another map; maintain parent/child map graph |
| **One person present in multiple places at once** | Models reality (a person seen in many locations) — unusual in seating/desk apps | LOW-MEDIUM | Markers reference one canonical person entity; edits propagate everywhere |
| **Four first-class typed object types incl. data-bearing relationship-links & social Groups** | Richer modeling than CRM "contacts + tags"; Groups distinct from spatial map-groups | MEDIUM | Relationship-links carry their own fields/media — Maltego-like, but user-curated and own-cloud |
| **Fully serverless, own-cloud, single-curator (Mokuro model)** | Privacy + zero hosting cost + true data ownership; rare for a structured relational+media DB | HIGH | The combination of *structured DB + media + own-cloud + offline* is what no competitor ships |
| **Provider-agnostic storage (Drive *or* Mega, user picks)** | Avoids lock-in; Mega adds e2e encryption for sensitive people-data | MEDIUM | Storage-provider abstraction; only differentiator vs draw.io's Drive-only |

### Anti-Features (Commonly Requested, Often Problematic)

Deliberately NOT built — documented to prevent scope creep. Most are direct consequences of the serverless / single-curator / current-state-only model.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Backend server / hosted DB | "Easier sync, search, sharing" | Destroys the core own-your-data/no-cost premise; ongoing hosting + ops burden | Client-side storage in user's own cloud (the whole point) |
| User accounts / auth on our side | "Standard for apps" | An identity system to build, secure, and maintain; contradicts serverless | Rely on cloud-provider OAuth/connect only |
| Multi-user / real-time collaboration & conflict resolution | "Teams want to co-edit" | CRDT/OT + presence + merge conflicts = enormous complexity, needs a server | Single curator per DB; export/import to hand off |
| Time/history dimension (track movement over time) | "See how things changed" | Temporal modeling, diffing, timeline UI = a whole product; v1 scope-killer | Current-state only; revisit in v2 if validated |
| Editing relationships *inside* the graph view | "Graphs should be editable" | Two write paths to keep in sync; graph becomes a second source of truth | Graph is viewer-only; author relationships in entity details |
| Full diagrams.net-grade vector editor (beziers, advanced connectors) | "Pro drawing power" | Months of editor work for marginal value; off-mission | Image backgrounds + simple shapes/zones/layers only |
| Geographic / satellite map tiles as background | "Real maps would be cool" | Tile providers, geocoding, projection, often paid APIs; off-mission (spaces, not geography) | Uploaded images only in v1 |
| App-level encryption of the database | "Sensitive people-data" | Key management UX, recovery, search-over-encrypted-data complexity | Provider security (Mega e2e; Drive encryption) in v1 |
| CSV/spreadsheet import of people | "Bulk onboarding" | Schema mapping, validation, dedup UX is a feature unto itself | Full-DB export in v1; structured import deferred |
| Read-only shared snapshots for non-users | "Let me show others" | Needs a hosting/publishing path = creeping toward a backend | Deferred to a later version |
| Auto-enrichment / Transforms (Maltego-style external data pulls) | "Auto-fill profiles" | External APIs (paid), privacy concerns, off-mission for a private curator | Manual curation only |
| SNA metrics / centrality analytics (Kumu/Polinode-style) | "Analyze the network" | Analyst feature; adds weight before core is validated | Plain graph viz in v1; analytics is a v2+ consideration |

---

## Feature Dependencies

```
Cloud-provider storage abstraction (Drive/Mega)
    └──requires──> Offline PWA local cache + sync
                       └──requires──> Local structured DB (IndexedDB) as source of truth

Typed custom-field schema  [FOUNDATIONAL]
    ├──enables──> Entity profile panel (renderers/validators per type)
    ├──enables──> Field-scoped fuzzy search (per-attribute toggles)
    └──enables──> Link-to-entity field type
                       └──enables──> Relationships (person↔person/group, group↔group)
                                          ├──projects to──> Data-driven map connectors
                                          └──projects to──> Relationship graph view (viewer-only)

Map editor (image bg + shapes/zones + layers)
    ├──requires──> Map entity model
    ├──enables──> Person photo-avatar markers ──requires──> Person entity + media/thumbnail
    └──enables──> Portal location-link markers ──requires──> Nested map-group hierarchy

Media/photo handling (thumbnail + gallery)
    └──enhances──> Entity profiles AND person markers (avatars)

Whole-DB export ──requires──> Stable serialized DB schema

Editing relationships in graph view ──conflicts──> "Graph is viewer-only" decision
Backend server ──conflicts──> Serverless own-cloud premise
```

### Dependency Notes

- **Typed custom fields are the keystone.** The field-scoped search, the profile UI, and (via the link-to-entity type) the entire relationship system all hang off the field schema. It must land early.
- **Relationships → connectors & graph are *projections*.** Both the on-map connectors and the graph view are read-only renderings of relationship data. Build the relationship data model before either visualization.
- **Storage abstraction precedes everything persistent.** Drive and Mega must look identical to the rest of the app; design the provider interface first so the data layer is provider-agnostic from day one.
- **Map editor and entity model are somewhat independent** and can be built in parallel — they meet at "place a marker (entity ref) at coords on a map."
- **Local-first ordering:** IndexedDB is the working source of truth; cloud is a sync target. This sidesteps conflict resolution (single curator) but means the local DB layer must exist before sync.

---

## MVP Definition

### Launch With (v1)

The minimum to validate "place people on a map of real places, profile them, see how they connect, from data you own."

- [ ] Cloud-provider storage abstraction + connect to **one** provider end-to-end (then the second) — without persistence there is no product
- [ ] Offline PWA shell with IndexedDB local store + cloud sync — the Mokuro promise
- [ ] Typed custom-field schema + four entity types (Person, Location/Map, Group, Relationship-link) — foundational for everything
- [ ] Map editor: image background + drawn shapes/zones + layers — the canvas
- [ ] Person photo-avatar markers + portal location-link markers + nested map-groups — spatial core
- [ ] Entity profile panel with thumbnail + photo gallery + custom fields — the "what are they like"
- [ ] Relationships authored in entity details → rendered as data-driven map connectors — the "how they connect"
- [ ] Viewer-only relationship graph — the headline relationship visualization
- [ ] Browse people & locations as lists — basic navigation
- [ ] Field-scoped fuzzy search with per-attribute toggles — the **signature differentiator**
- [ ] Whole-database export — the own-your-data trust anchor

### Add After Validation (v1.x)

- [ ] Second storage provider hardening / migration between providers — once one provider is proven
- [ ] Bulk operations, marker styling presets, richer field types — once curation friction is felt at scale (thousands of entities)
- [ ] Search over locations/groups (not just people) — once people-search is validated
- [ ] Graph filtering/grouping (lightweight) — once users have graphs big enough to need it

### Future Consideration (v2+)

- [ ] Time/history dimension — large; defer until current-state model proves valuable
- [ ] Read-only shared snapshots — needs a publish path; defer to avoid backend creep
- [ ] Structured CSV/import — defer; export-only in v1
- [ ] SNA/analytics (centrality, clustering) — analyst feature; only if users ask
- [ ] App-level encryption — defer; provider security is the v1 boundary

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Own-cloud storage + sync (Drive/Mega abstraction) | HIGH | HIGH | P1 |
| Offline PWA local store | HIGH | HIGH | P1 |
| Typed custom-field schema | HIGH | HIGH | P1 |
| Map editor (image bg + shapes/zones + layers) | HIGH | MEDIUM-HIGH | P1 |
| Person markers + entity profiles + media | HIGH | MEDIUM | P1 |
| Relationships → data-driven connectors | HIGH | MEDIUM | P1 |
| Relationship graph (viewer-only) | HIGH | MEDIUM | P1 |
| Field-scoped fuzzy search (signature) | HIGH | MEDIUM-HIGH | P1 |
| Nested map-groups + portal markers | MEDIUM-HIGH | MEDIUM-HIGH | P1 |
| Browse lists (people/locations) | MEDIUM | LOW | P1 |
| Whole-DB export | MEDIUM | LOW-MEDIUM | P1 |
| Second-provider hardening / migration | MEDIUM | MEDIUM | P2 |
| Graph filtering | MEDIUM | MEDIUM | P2 |
| Time/history | MEDIUM | HIGH | P3 |
| Shared read-only snapshots | MEDIUM | HIGH | P3 |
| SNA analytics | LOW | MEDIUM | P3 |

**Priority key:** P1 = must have for launch · P2 = should have, add when possible · P3 = future consideration

---

## Competitor Feature Analysis

| Feature | Obsidian (Canvas+metadata) | Kumu / Maltego | Airtable / Notion / Monica | Our Approach |
|---------|----------------------------|----------------|----------------------------|--------------|
| Own-cloud serverless storage | YES (own files; desktop) | NO (hosted SaaS) | NO (hosted/server backend) | **YES — Drive/Mega, offline PWA** |
| Spatial placement on physical-space maps | NO (freeform canvas) | NO (abstract networks) | NO | **YES — image-bg maps + markers** |
| Typed custom-field profiles | Partial (frontmatter) | Partial (entity props) | YES (best-in-class) | **YES — typed schema, 4 entity types** |
| Data-driven relationship graph | Partial (link graph) | YES (force graph + SNA) | NO / list-only (Monica) | **YES — viewer-only projection** |
| Field-scoped fuzzy search | NO | NO | Filter, not fuzzy-per-field | **YES — per-attribute toggle search (signature)** |
| Nested spatial maps / portals | NO | NO | NO | **YES — floor→building→street + portal markers** |
| Person in multiple places | N/A | N/A | N/A | **YES** |
| Free / OSS | YES (free, closed core) | NO (paid) | Notion/Airtable paid; Monica OSS | **YES — free + OSS deps only** |

**Takeaway:** Each competitor owns one or two columns; **only Relation Blueprint owns the full row.** Build the commoditized columns (typed fields, graph) on proven libraries and concentrate engineering on the novel intersection (people-on-real-maps + own-cloud structured DB) and the signature field-scoped search.

---

## Sources

- Obsidian JSON Canvas — open infinite-canvas format & data ownership (jsoncanvas.org, obsidian.md/blog/json-canvas, github.com/obsidianmd/jsoncanvas) — HIGH
- Excalidraw local-first / offline PWA / IndexedDB / own-data (localfirstacademy.com, pwa.directory, github Excalidraw MIT) — MEDIUM
- tldraw infinite-canvas SDK (tldraw.dev / npm) — MEDIUM
- Kumu.io features & pricing (kumu.io, kumu.io/pricing, saasworthy) — MEDIUM
- Maltego + Hunchly link analysis & OSINT (maltego.com, maltego.com/blog welcomes-hunchly) — MEDIUM
- Monica HQ personal CRM OSS/self-hosted status (github.com/monicahq/monica, monicahq.com, ossalt.com) — MEDIUM
- draw.io / diagrams.net own-storage (Drive/OneDrive) model — domain knowledge, MEDIUM
- Airtable / Notion typed fields & link-to-record — domain knowledge, MEDIUM
- Mokuro client-side files-as-database model (project inspiration) — domain knowledge, MEDIUM
- Seating-chart / space-management category (Social Tables, hot-desking apps) — domain knowledge, MEDIUM
- Genealogy tools (Gramps OSS, Family Echo) — domain knowledge, MEDIUM

---
*Feature research for: serverless own-cloud people-tracking & relationship-mapping PWA*
*Researched: 2026-06-24*

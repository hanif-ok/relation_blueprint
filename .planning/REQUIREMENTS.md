# Requirements: Relation Blueprint

**Defined:** 2026-06-24
**Core Value:** You can place people on a map of real locations and instantly see who is where, open any person to their full profile, and trace how people and groups relate — all from data you fully own, with no server.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Storage & Sync

- [x] **STOR-01**: User can connect their own Google Drive and authorize the app to store data in a visible, named app folder (`drive.file` scope)
- [x] **STOR-02**: App persists the entire database to the connected cloud as a sharded manifest + per-type entity files + media blobs
- [x] **STOR-03**: App works fully offline against a local IndexedDB store treated as the source of truth
- [x] **STOR-04**: App syncs local changes to the connected cloud in the background (single-curator, last-write-wins)
- [x] **STOR-05**: App writes atomically with rolling versioned cloud backups so a failed write cannot corrupt the database
- [x] **STOR-06**: User can install the app as a PWA, and the app requests persistent local storage
- [ ] **STOR-07**: User can alternatively connect Mega.nz as the storage provider (session-only credentials, never persisted)

### Entities & Custom Fields

- [ ] **DATA-01**: User can create four first-class object types — People, Locations/Maps, Groups, and Relationship-links
- [x] **DATA-02**: A Person ships with out-of-the-box fields: name, photo, phone, description, tags, notes
- [ ] **DATA-03**: User can define custom typed fields (text, number, date, phone, tags/select, link-to-entity, photo) on any entity type
- [x] **DATA-04**: User can edit and delete any entity

### Profiles & Media

- [x] **PROF-01**: User can click any person or location to open a sidebar profile showing all of its data
- [x] **PROF-02**: Each entity can have a thumbnail and a multi-photo gallery
- [x] **PROF-03**: Photos are thumbnailed client-side and stored as media blobs in the user's own cloud

### Maps & Editor

- [x] **MAP-01**: User can create a map using an uploaded image as the background
- [ ] **MAP-02**: User can draw shapes, lines, and zones on a map to mark rooms/areas
- [ ] **MAP-03**: User can organize map content into layers
- [x] **MAP-04**: User can place a person on a map as a round photo-avatar marker
- [ ] **MAP-05**: A single person can be placed on multiple maps at once
- [ ] **MAP-06**: User can place a location-link marker with a distinctive unique shape that navigates ("portals") to another map
- [ ] **MAP-07**: User can nest maps into spatial map-groups (floor → building → street) and navigate the hierarchy

### Relationships & Graph

- [ ] **REL-01**: User can define relationships in an entity's details: person↔person, person↔group, and group↔group
- [ ] **REL-02**: A relationship-link can carry its own data (label, date, notes)
- [ ] **REL-03**: Relationships are rendered as data-driven connectors between markers on a map (not hand-drawn)
- [ ] **REL-04**: User can open a viewer-only relationship graph visualizing how people and groups connect

### Search

- [ ] **SRCH-01**: User can fuzzy-search people across their attributes
- [ ] **SRCH-02**: User can toggle per-attribute checkboxes to scope which fields a search matches (e.g. "smith" with the job field off matches the name, not blacksmiths)

### Browse

- [ ] **BRWS-01**: User can browse all people as a list
- [ ] **BRWS-02**: User can browse all locations as a list, alongside direct map navigation

### Export & Backup

- [ ] **EXPT-01**: User can export the whole database as a portable, self-contained backup (JSON shards + media)
- [ ] **EXPT-02**: User can import/restore a previously exported backup, fully reconstituting the database including photos

## v2 Requirements

Deferred to future release. Tracked but not in the current roadmap.

### Search & Graph Depth

- **SRCH-03**: Search across locations and groups, not just people
- **GRPH-01**: Filter/group the relationship graph by relationship type or group

### Storage & Scale

- **STOR-08**: Migrate a database between providers (Drive ↔ Mega)
- **DATA-05**: Bulk operations and marker styling presets for large databases

### Temporal & Sharing

- **HIST-01**: Time/history dimension — record how people move between locations over time
- **SHAR-01**: Generate a read-only shared snapshot of a map for non-users
- **IMPT-01**: Structured CSV/spreadsheet import of people

### Analytics & Security

- **ANLY-01**: Social-network analytics (centrality, clustering) over the relationship graph
- **SEC-01**: App-level encryption of the database with a user passphrase

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. (Anti-features from research.)

| Feature | Reason |
|---------|--------|
| Backend server / hosted database | Destroys the core own-your-data / no-cost / serverless premise (Mokuro model) |
| User accounts / authentication on our side | An identity system to build and secure; contradicts serverless — rely on cloud-provider connect only |
| Multi-user / real-time collaboration & conflict resolution | CRDT/OT + presence + merge = huge complexity and needs a server; single curator per database by design |
| Editing relationships inside the graph view | Creates a second write path / source of truth; graph is viewer-only, relationships authored in entity details |
| Full diagrams.net-grade vector editor (beziers, advanced connectors) | Months of editor work for marginal value; v1 is image backgrounds + simple shapes/zones/layers |
| Geographic / satellite map tiles as backgrounds | Tile providers/geocoding/projection, often paid; off-mission (spaces, not geography) — uploaded images only |
| Auto-enrichment / external-data Transforms (Maltego-style) | Paid external APIs + privacy concerns; off-mission for a private single curator — manual curation only |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STOR-01 | Phase 1 | Complete |
| STOR-02 | Phase 1 | Complete |
| STOR-03 | Phase 1 | Complete |
| STOR-04 | Phase 1 | Complete |
| STOR-05 | Phase 1 | Complete |
| STOR-06 | Phase 1 | Complete |
| STOR-07 | Phase 6 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 1 | Complete |
| PROF-01 | Phase 1 | Complete |
| PROF-02 | Phase 1 | Complete |
| PROF-03 | Phase 1 | Complete |
| MAP-01 | Phase 1 | Complete |
| MAP-02 | Phase 3 | Pending |
| MAP-03 | Phase 3 | Pending |
| MAP-04 | Phase 1 | Complete |
| MAP-05 | Phase 3 | Pending |
| MAP-06 | Phase 3 | Pending |
| MAP-07 | Phase 3 | Pending |
| REL-01 | Phase 4 | Pending |
| REL-02 | Phase 4 | Pending |
| REL-03 | Phase 4 | Pending |
| REL-04 | Phase 4 | Pending |
| SRCH-01 | Phase 5 | Pending |
| SRCH-02 | Phase 5 | Pending |
| BRWS-01 | Phase 2 | Pending |
| BRWS-02 | Phase 2 | Pending |
| EXPT-01 | Phase 1 | Pending |
| EXPT-02 | Phase 1 | Pending |

**Coverage:**

- v1 requirements: 31 total
- Mapped to phases: 31 ✓
- Unmapped: 0 ✓

**Phase distribution:**

- Phase 1 (Storage Spine & First Person on a Map): 15 reqs — STOR-01..06, DATA-02, DATA-04, PROF-01..03, MAP-01, MAP-04, EXPT-01, EXPT-02
- Phase 2 (Custom Fields & Full Entity Model): 4 reqs — DATA-01, DATA-03, BRWS-01, BRWS-02
- Phase 3 (Map Editor — Spaces & Navigation): 5 reqs — MAP-02, MAP-03, MAP-05, MAP-06, MAP-07
- Phase 4 (Relationships & Graph): 4 reqs — REL-01, REL-02, REL-03, REL-04
- Phase 5 (Field-Scoped Search): 2 reqs — SRCH-01, SRCH-02
- Phase 6 (Mega.nz Provider): 1 req — STOR-07

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-24 after roadmap creation (traceability mapped)*

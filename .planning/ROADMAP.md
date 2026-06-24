# Roadmap: Relation Blueprint

## Overview

Relation Blueprint is built as a sequence of widening vertical slices, not horizontal technical layers. Phase 1 proves the entire serverless spine end-to-end by delivering one usable thread — connect Google Drive (`drive.file`, visible folder), create a Person, place them on an image-background map, open their profile, and export/restore the whole database — because the storage/offline/atomic-write foundation (and its non-retrofittable architecture decisions) must be proven before breadth, and the cloud is the only copy. Each later phase widens that slice with more end-to-end capability: the full custom-field entity model and browse, the spatial map editor (zones/layers/portals/nested groups), data-driven relationships and the graph, the signature field-scoped search, and finally Mega.nz as a second-class opt-in provider once Drive has proven the storage abstraction. The journey ends with a serverless PWA where a single curator owns a rich, searchable, spatial relationship database entirely in their own cloud.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Storage Spine & First Person on a Map** - Prove the serverless spine end-to-end: Drive connect, sharded local-first storage, a Person placed on an image-background map, profile, and tested export/restore
- [ ] **Phase 2: Custom Fields & Full Entity Model** - Typed custom fields plus all four first-class entity types and browse lists
- [ ] **Phase 3: Map Editor — Spaces & Navigation** - Shapes/zones/layers, portal markers, nested map-groups, and one person on multiple maps
- [ ] **Phase 4: Relationships & Graph** - Author relationships in entity details, render data-driven map connectors, and view the relationship graph
- [ ] **Phase 5: Field-Scoped Search** - Fuzzy search over people with per-attribute checkbox scoping (the signature feature)
- [ ] **Phase 6: Mega.nz Provider** - Second-class opt-in Mega storage behind the existing provider abstraction

## Phase Details

### Phase 1: Storage Spine & First Person on a Map

**Goal**: As a single curator of a private people-and-places dataset, I want to connect my own Google Drive, create a person, place them on an image-map, open their profile, and export then restore my whole database, so that I own my entire database in my own cloud with no server and can trust the storage spine before I put real data in it.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, STOR-06, DATA-02, DATA-04, PROF-01, PROF-02, PROF-03, MAP-01, MAP-04, EXPT-01, EXPT-02
**Success Criteria** (what must be TRUE):

  1. User can connect their own Google Drive and sees a visible, named app folder appear in Drive (consent screen shows only `drive.file`, never "all your Drive files")
  2. User can create a person with the out-of-box fields (name, photo, phone, description, tags, notes), upload a background image to make a map, and place that person on it as a round photo-avatar marker
  3. User can click the person to open a sidebar profile showing all their data plus a thumbnail and photo gallery, and can edit or delete the person
  4. App keeps working when offline (IndexedDB is the source of truth) and syncs changes back to Drive when reconnected, without a failed/interrupted write corrupting the database
  5. User can install the app as a PWA, export the whole database as a self-contained backup, and restore it on a fresh session with all photos intact (round-trip verified)

**Plans**: 6/8 plans executed
Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Scaffold (React/Vite/TS) + test harness (Vitest/Playwright/fake-indexeddb) + blocking Google OAuth Client ID prerequisite
- [x] 01-02-PLAN.md — Domain model + zod schemas + StorageProvider interface (locked vs InMemoryProvider) + Dexie schema + offline repository
- [x] 01-03-PLAN.md — Walking Skeleton slice: image-map + round avatar marker + person form + profile sidebar (edit/delete)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Content-addressed media + client-side thumbnails + multi-photo gallery
- [x] 01-05-PLAN.md — Sharded serializer + atomic manifest-swap sync engine + atomicity failure-injection test (STOR-05)
- [x] 01-06-PLAN.md — Drive provider: GIS auth (in-memory token, drive.file) + REST v3 + connect/reconnect/status UI

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-07-PLAN.md — Export/restore + round-trip property test (EXPT-02)
- [x] 01-08-PLAN.md — PWA shell: install + persistent storage + controlled service-worker update

**Research flag:** NEEDS DEEPER RESEARCH — Drive OAuth token lifecycle crossing ~1hr expiry, GIS token-client behavior on a static site, atomic temp-then-swap write pattern for Drive REST v3, and sharded manifest sync reconciliation. Spike the full auth + read/write + token-expiry cycle before committing to PLAN. Lock in: `drive.file` scope only, visible named folder (never `appDataFolder`), sharded manifest + StorageProvider abstraction, `navigator.storage.persist()`, controlled service-worker update flow.
**UI hint**: yes

### Phase 2: Custom Fields & Full Entity Model

**Goal**: A user can model their world fully — defining custom typed fields on any entity and working with all four first-class object types (People, Locations/Maps, Groups, Relationship-links) — and browse people and locations as lists.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-03, BRWS-01, BRWS-02
**Success Criteria** (what must be TRUE):

  1. User can create and use all four first-class object types — People, Locations/Maps, Groups, and Relationship-links — each with a thumbnail, photo gallery, and profile
  2. User can define custom typed fields (text, number, date, phone, tags/select, link-to-entity, photo) on any entity type, and those fields render and validate correctly in profiles
  3. User can browse all people as a list and all locations as a list, alongside direct map navigation
  4. Default fields stay minimal and a privacy/sensitivity notice is shown at setup (real personal data, provider security only in v1)

**Plans**: TBD
**Research flag:** Standard patterns — skip research phase. Typed field systems are well-documented; Zod for runtime validation of typed values.
**UI hint**: yes

### Phase 3: Map Editor — Spaces & Navigation

**Goal**: A user can build real spatial maps — drawing rooms/areas with shapes/zones on layers, linking maps together with portal markers into floor→building→street hierarchies, and placing one person across multiple maps at once.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MAP-02, MAP-03, MAP-05, MAP-06, MAP-07
**Success Criteria** (what must be TRUE):

  1. User can draw shapes, lines, and zones on a map to mark rooms/areas and organize them into layers
  2. User can place a portal location-link marker with a distinctive unique shape that navigates to another map
  3. User can nest maps into spatial map-groups (floor → building → street) and navigate up and down the hierarchy
  4. A single person placed on multiple maps stays one canonical record — edits to that person propagate to every map they appear on
  5. The map editor stays responsive (no jank) when a map holds many markers

**Plans**: TBD
**Research flag:** NEEDS DEEPER RESEARCH — Konva.js viewport culling and shape caching patterns at hundreds-to-thousands of markers, portal/nested-map navigation UX, and Konva + React 19 compatibility. Research before PLAN; build caching/culling in from the start, not as a retrofit.
**UI hint**: yes

### Phase 4: Relationships & Graph

**Goal**: A user can author relationships in an entity's details and immediately see them projected two ways — as data-driven connectors between markers on a map and as a viewer-only relationship graph.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: REL-01, REL-02, REL-03, REL-04
**Success Criteria** (what must be TRUE):

  1. User can define relationships in an entity's details: person↔person, person↔group, and group↔group
  2. A relationship-link can carry its own data (label, date, notes)
  3. Relationships the user authored appear automatically as data-driven connectors between markers on the map (not hand-drawn) and update when markers move
  4. User can open a viewer-only relationship graph that visualizes how people and groups connect

**Plans**: TBD
**Research flag:** Standard patterns — Cytoscape.js is well-documented. Light research only on layout-algorithm selection for performance; pre-cache node positions for larger graphs.
**UI hint**: yes

### Phase 5: Field-Scoped Search

**Goal**: A user can fuzzy-search people across their attributes and use per-attribute checkboxes to scope which fields a query matches — so "smith" can match the name field while excluding the job field (no blacksmiths).
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SRCH-01, SRCH-02
**Success Criteria** (what must be TRUE):

  1. User can fuzzy-search people across their attributes and get tolerant, relevant matches
  2. User can toggle per-attribute checkboxes to scope which fields a search matches (e.g. "smith" with the job field off matches names, not blacksmiths)
  3. Search results stay fast as the database grows toward thousands of multi-field records, with the index updating incrementally on entity changes rather than rebuilding every load

**Plans**: TBD
**Research flag:** Standard patterns — skip research phase. MiniSearch per-field indexing is well-documented; optional Web Worker for large databases.
**UI hint**: yes

### Phase 6: Mega.nz Provider

**Goal**: A user can alternatively connect Mega.nz as their storage provider — plugged in behind the existing provider abstraction Drive already proved — with credentials handled session-only and never persisted.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: STOR-07
**Success Criteria** (what must be TRUE):

  1. User can choose Mega.nz instead of Google Drive and store/read the entire database there, with the rest of the app behaving identically (provider abstraction holds)
  2. User can connect and disconnect Mega via a flow that shows an explicit security warning, and the Mega password is never persisted to storage (session token in memory only)
  3. User can move between providers without reshaping their data (the sharded layout is provider-agnostic)

**Plans**: TBD
**Research flag:** NEEDS DEEPER RESEARCH — megajs browser-build real-world behavior, session-token lifecycle and whether a session id (never the password) can be safely serialized, and quota/throttle under real photo uploads. Full spike before PLAN.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Storage Spine & First Person on a Map | 6/8 | In Progress|  |
| 2. Custom Fields & Full Entity Model | 0/TBD | Not started | - |
| 3. Map Editor — Spaces & Navigation | 0/TBD | Not started | - |
| 4. Relationships & Graph | 0/TBD | Not started | - |
| 5. Field-Scoped Search | 0/TBD | Not started | - |
| 6. Mega.nz Provider | 0/TBD | Not started | - |

# Roadmap: Relation Blueprint

## Overview

Relation Blueprint is built as a sequence of widening vertical slices, not horizontal technical layers. Phase 1 proves the entire serverless spine end-to-end by delivering one usable thread — connect Google Drive (`drive.file`, visible folder), create a Person, place them on an image-background map, open their profile, and export/restore the whole database — because the storage/offline/atomic-write foundation (and its non-retrofittable architecture decisions) must be proven before breadth, and the cloud is the only copy. Each later phase widens that slice with more end-to-end capability: the full custom-field entity model and browse, the spatial map editor (zones/layers/portals/nested groups), data-driven relationships and the graph, the signature field-scoped search, and finally Mega.nz as a second-class opt-in provider once Drive has proven the storage abstraction. The journey ends with a serverless PWA where a single curator owns a rich, searchable, spatial relationship database entirely in their own cloud.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Storage Spine & First Person on a Map** - Prove the serverless spine end-to-end: Drive connect, sharded local-first storage, a Person placed on an image-background map, profile, and tested export/restore (completed 2026-06-24)
- [x] **Phase 2: Custom Fields & Full Entity Model** - Typed custom fields plus all four first-class entity types and browse lists (verification 2026-06-26: gaps found — 5/6 must-haves; D-05 type-change coercion unwired, awaiting gap closure) (completed 2026-06-26)
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

**Plans**: 10/10 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold (React/Vite/TS) + test harness (Vitest/Playwright/fake-indexeddb) + blocking Google OAuth Client ID prerequisite
- [x] 01-02-PLAN.md — Domain model + zod schemas + StorageProvider interface (locked vs InMemoryProvider) + Dexie schema + offline repository
- [x] 01-03-PLAN.md — Walking Skeleton slice: image-map + round avatar marker + person form + profile sidebar (edit/delete)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Content-addressed media + client-side thumbnails + multi-photo gallery
- [x] 01-05-PLAN.md — Sharded serializer + atomic manifest-swap sync engine + atomicity failure-injection test (STOR-05)
- [x] 01-06-PLAN.md — Drive provider: GIS auth (in-memory token, drive.file) + REST v3 + connect/reconnect/status UI

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-07-PLAN.md — Export/restore + round-trip property test (EXPT-02)
- [x] 01-08-PLAN.md — PWA shell: install + persistent storage + controlled service-worker update

**Gap closure** *(from Phase 1 UAT — both independent, parallel)*

- [x] 01-09-PLAN.md — GAP 1 (MAJOR): empty-DB first connect reaches synced — prepareOnOpen() discover-or-bootstrap before reconcile + regression test (STOR-02/04/05)
- [x] 01-10-PLAN.md — GAP 2 (MINOR): silent on-load Drive re-acquire on refresh (no popup, token-never-persisted) + test (STOR-01/06)

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
  5. User can click a photo in any profile gallery to open it full-size in an expand/lightbox view, then dismiss back to the profile (deferred from Phase 1 UAT)
  6. User can reorder or sort the photos in a profile gallery, and the chosen order persists (deferred from Phase 1 UAT)

**Plans**: 7/7 plans complete
Plans:

**Wave 1**

- [x] 02-01-PLAN.md — Entity-model spine: promote MapDoc→rich Location + add Group/Relationship-link types + per-entity custom-value map + field-definition store, threaded through serializer/sync/export-restore

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — Delete-vs-remove correctness fix: marker-only `deleteMarker` + generalized `deleteEntity` cascade with all-types media GC; dual-action ProfileSidebar (the user-flagged bug)

**Wave 3** *(blocked on Wave 2)*

- [x] 02-03-PLAN.md — Multi-surface shell: left-nav view switcher + `+ New` menu + generalized entity forms + virtualized browse lists (×4) + one-time privacy notice (DATA-01, BRWS-01, BRWS-02, criterion 4)

**Wave 4** *(blocked on Wave 3)*

- [x] 02-04-PLAN.md — Custom-field keystone: per-type field manager/editor + custom-value validation + typed inputs in forms + typed read rows in profiles (DATA-03)

**Wave 5** *(blocked on Wave 4)*

- [x] 02-05-PLAN.md — Deferred Phase-1 UAT media: photo lightbox (criterion 5) + persisted gallery drag/keyboard reorder (criterion 6)

**Gap closure** *(from 02-VERIFICATION.md — Wave 1, no executed-plan dependencies)*

- [x] 02-06-PLAN.md — BLOCKER CR-01/DATA-03/D-05: wire `coerceOnTypeChange` into the field type-change save path (`applyFieldTypeChange` repository mutation + zero-schema quarantine + wired test), plus warning fixes WR-01/WR-02/WR-04/WR-06
- [x] 02-07-PLAN.md — BLOCKER (from 02-06 code review): fix quarantine-overwrite data loss — re-key quarantine by source field-type (preserve-all) + multi-hop regression test + tags read-path guard (DATA-03/D-05)

**Research flag:** Standard patterns — skip research phase. Typed field systems are well-documented; Zod for runtime validation of typed values.
**UI hint**: yes

### Phase 02.1: Close gap: DATA-03 — sync fieldDefs through the manifest cloud path (ENTITY_TYPES + reconcile + ManifestSchema) + push/reconcile regression test (INSERTED)

**Goal:** Close the DATA-03 cloud-sync BLOCKER — custom-field DEFINITIONS (`db.fieldDefs`) are serialized but never pushed to / pulled from the cloud because the SyncEngine's hand-listed entity-type machinery omits `'field-defs'`. Thread a sync-local `field-defs` shard token through ENTITY_TYPES + commit + reconcileOnOpen + getDirtyTypes/markSynced/upsert, add an optional `field-defs` pointer to ManifestSchema, and prove it with a push→fresh-reconcile round-trip regression test.
**Requirements**: DATA-03 (also unblocks STOR-02, STOR-03)
**Depends on:** Phase 2
**Plans:** 1/1 plans complete

Plans:

**Wave 1**

- [x] 02.1-01-PLAN.md — Thread the `field-defs` shard token through SyncEngine + ManifestSchema (symmetric six-branch wiring, optional manifest pointer, sync-local `SyncShardType` — EntityType untouched, NO migration) + push→fresh-reconcile round-trip regression test + atomicity/backward-compat assertions

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
  6. User can select a placed marker and resize (and rotate) it via on-canvas transform handles, with the new size/rotation persisting across reloads (deferred from Phase 1 UAT)
  7. User can resize/transform the map background image via handles (beyond view pan/zoom), and the change persists (deferred from Phase 1 UAT)

**Plans**: 7 plans
**Wave 1**

- [ ] 03-01-PLAN.md — Data foundation: Marker transform/portal fields + MapDoc sub-objects, Dexie version(4) backfill, migration round-trip (Wave 0)
- [ ] 03-02-PLAN.md — Active-map model: coords composition, viewport culling, map switcher, breadcrumb up-navigation (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-03-PLAN.md — Drawing: tool palette, pan/draw/select state machine, shapes (rect/ellipse/line/polygon), style popover + zone labels (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-04-PLAN.md — Transform handles: Konva Transformer (resize/rotate), image-space anchoring, background transform (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 03-05-PLAN.md — Layers: per-map logical layers panel (create/rename/reorder/show/hide/lock) + name-label toggle (Wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 03-06-PLAN.md — Portals: door-arch glyph, single-click select / double-click navigate, create-or-pick target, parent→child hierarchy (Wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 03-07-PLAN.md — Multi-placement: map-side PersonPicker (D-11) + profile "Appears on" with jump-to-placement (D-12) — MAP-05 (Wave 6)

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
| 1. Storage Spine & First Person on a Map | 10/10 | Complete   | 2026-06-25 |
| 2. Custom Fields & Full Entity Model | 7/7 | Complete   | 2026-06-26 |
| 3. Map Editor — Spaces & Navigation | 0/TBD | Not started | - |
| 4. Relationships & Graph | 0/TBD | Not started | - |
| 5. Field-Scoped Search | 0/TBD | Not started | - |
| 6. Mega.nz Provider | 0/TBD | Not started | - |

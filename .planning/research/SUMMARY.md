# Project Research Summary

**Project:** Relation Blueprint
**Domain:** Serverless offline-first PWA — spatial people-tracking & relationship mapping (own-cloud, single-curator Mokuro model)
**Researched:** 2026-06-24
**Confidence:** MEDIUM-HIGH

## Executive Summary

Relation Blueprint occupies a genuine white space. Research across 15+ existing tools confirms that **no product combines all five axes**: serverless own-cloud storage, spatial placement of people on curated physical-space maps, typed-field entity profiles, data-driven relationship graph, and field-scoped fuzzy search. Every competitor nails 1-3 of these and misses the rest. The closest analogs are Obsidian (own-data + canvas + custom fields, but desktop-first and no people-on-floorplans) and Kumu/Maltego (graph + entity profiles, but hosted SaaS and no spatial maps). This is not a crowded space with a better execution needed — it is a genuine intersection that does not exist yet.

The recommended approach is a **local-first PWA on React + Vite**, with Konva.js as the canvas engine (tldraw is disqualified — paid license key required in production), Cytoscape.js for the viewer-only graph, MiniSearch for field-scoped fuzzy search, and Dexie/IndexedDB as the local source of truth. Cloud sync runs behind a `StorageProvider` abstraction (Drive and Mega behind one async file interface), using a **sharded manifest + per-type entity files + content-addressed media blobs** — this layout must be designed in from phase one because retrofitting it is expensive. Google Drive with `drive.file` scope is the primary provider; Mega is second-class/opt-in due to its no-OAuth, raw-credential model.

The dominant risks are structural, not implementation-level. Using the wrong Drive scope (`drive` instead of `drive.file`) triggers a CASA Tier 2 security audit that effectively blocks a free OSS project. Using `appDataFolder` silently destroys user data on app removal. A single monolithic JSON file for the database corrupts on partial write and cannot scale past low thousands. Mega's no-OAuth model means handling real user credentials — it must never persist the password. All of these are pre-decided architecture choices, not bugs to fix later. The roadmap must front-load the storage/offline/atomic-write spine and pull export/backup earlier than feels natural, because the user's cloud is the only copy.

---

## Key Findings

### Recommended Stack

The stack converges cleanly on MIT/Apache-licensed libraries with no viable alternatives satisfying the free/OSS + static-deploy constraint. The single hardest constraint is the canvas engine: **tldraw 5.x requires a paid license key in production** and is permanently disqualified. Konva.js (MIT, 10.3.x) is the replacement — it covers layers, draggable markers, image backgrounds, circular avatar clips, and a Transformer, and pairs with react-konva for declarative React integration.

**Core technologies:**
- **React 19.2.x + Vite 7.x** — UI framework + static build; deploys to GitHub Pages; first-class home for react-konva and react-cytoscapejs
- **Konva.js 10.3.x** (+ react-konva) — Canvas/map editor engine; MIT; layers + draggable nodes + image backgrounds; tldraw permanently disqualified
- **Cytoscape.js 3.34.x** (+ react-cytoscapejs) — Viewer-only relationship graph; purpose-built node-link layouts; MIT
- **MiniSearch 7.2.x** — Field-scoped fuzzy + prefix search; per-field index; scales to ~50k records; powers the per-attribute checkbox feature
- **Dexie.js 4.4.x** (+ dexie-react-hooks) — IndexedDB source of truth; stores blobs, compound indexes, reactive queries
- **Google Identity Services (token model) + Drive REST v3** — Static-site-safe OAuth; `drive.file` scope only; no stored refresh token
- **megajs 1.3.x** (browser build) — Unofficial but maintained Mega SDK; in-memory session only; second-class/opt-in provider
- **vite-plugin-pwa 1.3.x** (Workbox) — Service worker + manifest + offline precache
- **zod 4.x** — Runtime validation of typed field values and cloud manifest on load
- **nanoid** — Stable entity IDs
- **browser-image-compression 2.0.x** — Client-side thumbnail generation; no server

See `.planning/research/STACK.md` for full rationale, version compatibility, and alternatives considered.

### Expected Features

Prior art confirms the feature set is novel in combination but individually composed of proven, commoditized capabilities. No competitor ships the intersection. The genuinely novel features are the *combination* and the field-scoped fuzzy search — no surveyed tool offers per-attribute checkbox scoping.

**Must have (table stakes):**
- Own-cloud storage (Drive/Mega) + offline PWA with IndexedDB local store — without persistence there is no product
- Typed custom fields (text, number, date, phone, tags/select, link-to-entity, photo) — foundational for search, profiles, relationships
- Map editor: image background + drawn shapes/zones + layers
- Person photo-avatar markers + entity profile panel (thumbnail + gallery + fields)
- Relationships in entity details rendered as data-driven map connectors
- Viewer-only relationship graph (Cytoscape.js projection)
- Browse lists (people/locations)
- Fuzzy search over people
- Whole-database export — the own-your-data trust anchor

**Should have (differentiators):**
- **Field-scoped fuzzy search with per-attribute checkbox toggles** — signature feature; no competitor offers it; "smith" matches name but not job field
- Portal location-link markers + nested map-groups (floor to building to street)
- Data-driven connectors on maps (not hand-drawn; single source of truth)
- One person present on multiple maps simultaneously
- Provider-agnostic storage (Drive OR Mega; user picks)

**Defer to v1.x/v2+:**
- Mega provider hardening / provider migration — after Drive is proven
- Graph filtering/grouping, time/history dimension, read-only shared snapshots, SNA/analytics, app-level encryption, CSV import

See `.planning/research/FEATURES.md` for full prior-art comparison table and feature dependency graph.

### Architecture Approach

The correct mental model is: **IndexedDB is the database; the cloud is a remote backup/replica.** The app is fully usable offline against IndexedDB; a debounced sync engine pushes dirty shards to the chosen provider in the background. Because exactly one curator owns each database, conflict resolution collapses to last-write-wins by `updatedAt` — no CRDTs needed. The two most consequential decisions — the **sharded manifest file layout** and the **StorageProvider abstraction** — must be established in phase 1.

**Major components:**
1. **StorageProvider abstraction** (`storage/`) — Narrow async interface (`list/read/write/delete/stat`); Drive and Mega adapters behind it; testable with an in-memory fake; nothing above this layer knows which provider is active
2. **IndexedDB / Repository** (`db/`) — Dexie tables for entities, media blobs, sync metadata, syncQueue; typed CRUD; dirty-marking; change events; source of truth
3. **Sync Engine** (`sync/`) — Dirty-set serializes to dirty shards and pushes via StorageProvider; pulls on open; last-write-wins; sharded layout: `manifest.json` + `entities/people-000.json` etc. + `media/<hash>`
4. **Media Manager** (`media/`) — Content-addressed blobs (filename = hash); thumbnails generated client-side; separate from structured data; lazy-load full photos on demand
5. **Domain Model + Custom Fields** (`domain/`) — Pure types; Person/Location/Group/RelationshipLink/Placement; typed-field schema + validation; relationship projections
6. **Search Index** (`search/`) — MiniSearch over repository; field-scoped queries; incremental updates from change events; optionally in a Web Worker; never participates in sync
7. **Map Editor** (`features/map-editor/`) — Konva canvas; image background + layers + shapes + draggable avatar markers + portal markers; read-only connector projections
8. **Graph View** (`features/graph-view/`) — Cytoscape.js projection of relationship-links; viewer-only

See `.planning/research/ARCHITECTURE.md` for system diagram, data flows, full project structure, and scaling considerations.

### Critical Pitfalls

1. **Choosing the broad `drive` scope** — Triggers restricted-scope CASA Tier 2 verification (2-6 months, potentially thousands of dollars, annual). Use `drive.file` only. Lock this into the first storage PLAN's success criteria.
2. **Using `appDataFolder`** — Invisible to the user, silently deleted when the user removes the app from Drive. Use a visible named folder. The own-your-data promise requires the user can see their data.
3. **Mega has no OAuth; never persist the password** — Mega requires the user's raw email + password. Never store it. Keep only a session token in memory. Treat Mega as second-class/opt-in; Drive ships first.
4. **Single monolithic JSON file corrupted on partial write** — Use: sharded file layout, atomic write (temp to swap), rolling versioned backups, single-writer guard (Web Locks API). Design sharding in from day one.
5. **Cloud is the only copy — no versioned backup** — Ship whole-DB export early and make import/restore tested before launch. An untested export is theater.
6. **OAuth token expiry (~1 hr) on a static site** — Block/queue writes on expiry; surface a "reconnect" state; never write half a DB. Use GIS token model.
7. **PWA storage eviction (Safari 7-day rule)** — Call `navigator.storage.persist()` early; check the boolean result; handle `QuotaExceededError`.
8. **Canvas performance cliff at hundreds of markers** — Cache avatar images, enable viewport culling, limit layers, `listening(false)` on non-interactive layers. Build this in from the start.

See `.planning/research/PITFALLS.md` for the full 13-pitfall catalog with recovery strategies.

---

## Implications for Roadmap

Research points to a strict dependency ordering. The storage/offline spine must come first. Export/backup must be pulled earlier than feels natural. The Map Editor is the largest single component. The signature search feature is low-risk and can land after the entity model stabilizes.

### Phase 1: Storage & Offline Spine
**Rationale:** Everything depends on this. Pitfalls 1-7 are all storage/auth pitfalls that cannot be retrofitted cheaply. The sharded layout and StorageProvider abstraction are the two decisions most expensive to change later. This phase proves the core premise of the app.
**Delivers:** Drive OAuth (`drive.file` scope, visible named folder), sharded manifest layout, Dexie local store, atomic writes + versioned cloud copies, sync engine (push/pull, last-write-wins), offline PWA shell, `navigator.storage.persist()`, service worker + controlled update flow
**Addresses:** Own-cloud storage, offline PWA (table stakes); storage abstraction for future Mega
**Avoids:** Pitfalls 1 (scope), 2 (appDataFolder), 4 (single-file corruption), 5 (no backup safety net established), 6 (token expiry), 7 (storage eviction), 12 (SW update trap)
**Research flag:** NEEDS DEEPER RESEARCH — Drive OAuth token lifecycle crossing expiry, GIS token client behavior in a static site, atomic write patterns for Drive REST v3, sharded sync reconciliation algorithm. Spike the full auth + read/write + token-expiry cycle before committing to PLAN.

### Phase 2: Domain Model + Entity Profiles
**Rationale:** Typed custom fields are the keystone dependency — field-scoped search, profile UI, and the entire relationship system all hang off the field schema. Must land before any of those features. Low-risk; pure TypeScript domain with no novel integrations.
**Delivers:** Four entity types (Person, Location/Map, Group, RelationshipLink), typed-field schema (text, number, date, phone, tags/select, link-to-entity, photo), entity profile panel (sidebar, field renderers/validators, thumbnail + photo gallery), browse lists (people/locations), basic CRUD
**Addresses:** Typed custom fields, entity profiles, media handling, browse lists (table stakes)
**Avoids:** Pitfall 11 (privacy — minimal default fields, privacy notice at setup); Pitfall 13 (scope creep — no graph or map editor yet)
**Research flag:** Standard patterns — skip research phase. Typed field systems well-documented; Zod for validation.

### Phase 3: Export/Backup Hardening
**Rationale:** Pull this before the Map Editor. The cloud is the only copy. Export and import/restore must be tested before real data goes in. An export you cannot restore is theater (Pitfall 5).
**Delivers:** Whole-DB export as a self-contained zip (JSON shards + media blobs), import/restore that fully reconstitutes the DB including photos (round-trip tested), rolling timestamped cloud backups, "last exported N days ago" nudge
**Addresses:** Whole-database export (table stakes)
**Avoids:** Pitfall 5 (cloud-only-copy data loss); establishes backup safety net for all later phases
**Research flag:** Standard patterns — skip research phase.

### Phase 4: Map Editor
**Rationale:** Largest single component; independent enough for its own phase. Depends on Phase 1 (storage for media) and Phase 2 (entity model for markers). Konva performance patterns must be baked in from the start.
**Delivers:** Image background upload + map creation, drawn shapes/lines/zones + layers, person photo-avatar markers (entity reference + coordinates + layer), portal location-link markers that hyperlink to another map, nested map-groups (floor to building to street), data-driven connectors rendered from relationship data
**Addresses:** Maps & editor, markers, portals, nested map-groups, data-driven connectors (all table stakes)
**Avoids:** Pitfall 8 (canvas perf — build caching/culling in from the start); Pitfall 13 (no full vector editor, no geo tiles)
**Research flag:** NEEDS DEEPER RESEARCH — Konva.js viewport culling and shape caching patterns at hundreds-to-thousands of markers; portal/nested-map navigation UX; Konva + React 19 compatibility. Research before PLAN.

### Phase 5: Relationships & Graph View
**Rationale:** Relationships are projections of data that exists after Phase 2. Graph view is viewer-only Cytoscape.js — low implementation risk. Connectors on the map also land here. Depends on entity model and map editor.
**Delivers:** Relationship authoring in entity details (person-to-person, person-to-group, group-to-group), viewer-only relationship graph (Cytoscape.js, force layout), relationship connectors auto-rendered on maps
**Addresses:** Relationships + graph (table stakes)
**Avoids:** Pitfall 9 (graph layout collapse — Cytoscape.js fine to ~5k-50k nodes; pre-cache positions for large graphs); graph is viewer-only by design
**Research flag:** Standard patterns — Cytoscape.js well-documented. Light research on layout algorithm selection for performance.

### Phase 6: Field-Scoped Search
**Rationale:** The signature differentiator. Depends on the typed-field schema (Phase 2). MiniSearch with per-field indexes cleanly powers the per-attribute checkbox feature. Self-contained and low-risk once entity model exists.
**Delivers:** MiniSearch index built from repository, fuzzy + prefix search over people, per-attribute checkbox toggles restricting which field indexes participate, incremental index updates on entity change, search bar UI
**Addresses:** Fuzzy search, per-field checkbox scoping (signature differentiator + table stakes)
**Avoids:** Pitfall 10 (wrong library / rebuilt every load — MiniSearch with persisted/incremental index; optional Web Worker for large DBs)
**Research flag:** Standard patterns — skip research phase. MiniSearch per-field indexing well-documented.

### Phase 7: Mega.nz Provider
**Rationale:** Second storage provider behind the existing abstraction. Deferred because Drive proves the abstraction first. Mega's no-OAuth model requires a separate security spike and must not block the core feature set.
**Delivers:** Mega adapter behind StorageProvider interface, session-only credential model (never persist password), user-facing connect/disconnect flow with explicit security warning, provider migration path
**Addresses:** Provider-agnostic storage (differentiator)
**Avoids:** Pitfall 3 (Mega no-OAuth / raw credential handling — session token only, never store password)
**Research flag:** NEEDS DEEPER RESEARCH — megajs browser build real-world behavior, session token lifecycle, quota/throttle under real uploads. Full spike before PLAN.

### Phase 8: Polish, Scale & PWA Hardening
**Rationale:** Cross-cutting quality phase once all features exist. Address scale targets, PWA production readiness, and UX gaps discovered during use.
**Delivers:** Virtualized list views, lazy shard hydration for large DBs, search index in Web Worker if needed, graph WebGL fallback (Sigma.js) if scale demands it, marker performance validation at thousands, `navigator.storage.estimate()` quota warnings, SW update flow hardening, privacy notice at setup, easy delete/export for data subject requests
**Addresses:** Scale requirement (graceful degradation dozens to thousands+); PWA installability; privacy
**Avoids:** Pitfalls 8, 9, 10 (scale cliffs); Pitfall 7 (storage eviction); Pitfall 11 (privacy); Pitfall 12 (SW update trap)
**Research flag:** Standard patterns for most. Sigma.js only if graph scale proves to need it.

### Phase Ordering Rationale

- **Storage first (Phase 1):** Every persistent feature depends on the storage/sync spine. The pitfalls that cannot be retrofitted cheaply all live here.
- **Export pulled to Phase 3 (before Map Editor):** The cloud is the only copy; a tested restore path must exist before real data goes in.
- **Domain model before all UI features (Phase 2):** Typed custom fields are the load-bearing keystone for search, profiles, relationships, and validation.
- **Map Editor before Graph (Phase 4 before Phase 5):** Markers must exist before connectors can be drawn on them.
- **Search last of core features (Phase 6):** Derived/projection-only, low-risk, independent from map and graph work.
- **Mega deferred (Phase 7):** Drive proves the abstraction first; Mega's credential model requires a separate security spike.

### Research Flags

Phases needing deeper research during planning (`/gsd-plan-phase --research-phase N`):
- **Phase 1 (Storage/Offline Spine):** Drive OAuth token lifecycle, GIS silent re-auth, atomic write patterns for Drive REST, sharded sync reconciliation. Spike the full auth + read/write + token-expiry cycle.
- **Phase 4 (Map Editor):** Konva.js viewport culling and shape caching at scale; portal/nested-map navigation UX; Konva + React 19 compatibility.
- **Phase 7 (Mega):** megajs browser build behavior, session token lifecycle, quota/throttle. Full spike before PLAN.

Phases with standard patterns (skip or shorten research):
- **Phase 2 (Domain Model), Phase 3 (Export/Backup), Phase 5 (Relationships + Graph), Phase 6 (Search):** All well-documented patterns; no novel integrations.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry 2026-06-24; tldraw disqualification verified against license docs; GIS token model verified against Google docs |
| Features | MEDIUM-HIGH | Prior-art survey thorough across 15+ tools; genuine white space confirmed by absence of any competitor combining all five axes |
| Architecture | MEDIUM | Storage-provider mechanics cross-checked against official Google Drive docs + megajs SDK; sharded layout and sync patterns well-established in local-first literature |
| Pitfalls | MEDIUM-HIGH | Drive scope/appDataFolder/token mechanics verified against official Google docs (HIGH); Mega no-OAuth verified against SDK issue tracker (MEDIUM); perf thresholds community consensus (MEDIUM) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Drive atomic write pattern:** Temp-file-then-swap via Drive REST v3 is not in official Google guidance; needs an empirical spike. Risk: partial writes on crash/quota/network drop.
- **GIS silent re-authentication:** Whether `prompt: "none"` reliably works for silent token refresh needs long-session testing crossing the 1-hour expiry.
- **megajs session token persistence:** Whether a session ID (not password) can safely be serialized to IndexedDB needs verification against megajs internals.
- **Konva + React 19 compatibility:** react-konva peer range for React 19 should be verified against the react-konva changelog at install time.
- **iOS PWA storage.persist() grant behavior:** Whether a PWA install bypasses Safari's 7-day eviction policy needs verification on real iOS hardware.
- **Mega transfer quota in real use:** Free-tier Mega throttles transfer; real-world impact with many photos is unknown without a spike.

---

## Sources

### Primary (HIGH confidence)
- npm registry API (registry.npmjs.org) — versions and licenses verified 2026-06-24
- Google for Developers — OAuth 2.0 token model, GIS migration guide, Drive API scopes, appDataFolder docs, rate limits
- MDN Web Docs — Storage API (persist/estimate), QuotaExceededError, Web Locks API, service worker lifecycle

### Secondary (MEDIUM confidence)
- tldraw license docs (tldraw.dev/community/license) — production license key + watermark requirement
- megajs npm + docs (mega.js.org) — browser build, login/upload/download; meganz/sdk issue #2575 (no OAuth)
- Konva.js official docs (konvajs.org) — layers, caching, performance tips
- PkgPulse + npm-compare — Cytoscape vs Sigma.js perf thresholds; MiniSearch vs Fuse.js vs FlexSearch comparison
- Dexie.js maintainer guidance — blob storage, no binary indexing
- GDPR.eu / VeraSafe — photos and physical descriptions as personal data
- Unipile / deepstrike.io — Google OAuth 100-user cap, CASA Tier 2 assessment cost and timeline
- Local-first academy, LogRocket offline-first 2025 — IndexedDB patterns, PWA offline sync
- Obsidian JSON Canvas spec — own-data structured file format proof of concept
- Mokuro reader (bbonenfant, hanabira) — local-first files-as-database model

### Tertiary (LOW confidence — needs validation during implementation)
- MEGA free-tier transfer quota behavior under real photo-upload loads — empirical spike needed
- GIS `prompt: "none"` silent re-auth reliability — behavioral edge cases need long-session testing
- iOS PWA storage.persist() grant behavior re: 7-day eviction — PWA install exemption needs device testing

---
*Research completed: 2026-06-24*
*Ready for roadmap: yes*
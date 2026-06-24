# Architecture Research

**Domain:** Serverless / client-side PWA — own-cloud, offline-first people-tracking & relationship-mapping (Mokuro model)
**Researched:** 2026-06-24
**Confidence:** MEDIUM (storage-provider facts cross-checked against official Google Drive docs + megajs SDK; sync/index patterns are well-established but project-specific composition is judgment)

## Executive Summary

This is a **local-first** application, not an online one. The correct mental model is: **IndexedDB is the database; the cloud (Drive/Mega) is a remote backup/replica.** The app is fully usable offline against IndexedDB, and a sync engine pushes a serialized copy to the user's chosen provider. Because there is exactly one curator per database (no multi-user, no real-time, no history per PROJECT.md), conflict resolution collapses to **last-write-wins** and the architecture stays dramatically simpler than a typical sync system.

The hardest design choices are: (1) how to lay out the database in the cloud so it loads fast *and* scales to thousands of entities plus large photo galleries — answered with a **sharded JSON manifest + per-shard entity files + content-addressed media blobs**; (2) a **storage-provider abstraction** that makes Drive and Mega interchangeable behind one async file interface; (3) keeping media out of the structured data (store blobs unindexed in IndexedDB, upload them as separate immutable cloud files).

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         UI / VIEW LAYER (React)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │   Map    │ │  Graph   │ │  Entity  │ │  Browse  │ │  Search    │  │
│  │  Editor  │ │  View    │ │ Panels   │ │  Lists   │ │  Bar       │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
├───────┼────────────┼────────────┼────────────┼─────────────┼─────────┤
│                      DOMAIN / STATE LAYER                             │
│  ┌─────────────────────────────────────────┐  ┌──────────────────┐  │
│  │            Repository / Data Store        │  │  Search Index    │  │
│  │  (CRUD over People/Locations/Groups/Links │◄─┤  (MiniSearch,    │  │
│  │   + custom fields + placements)           │  │   rebuilt from   │  │
│  │  emits change events; marks records dirty │  │   repository)    │  │
│  └───────────────┬──────────────────────────┘  └──────────────────┘  │
│                  │                                                    │
│  ┌───────────────▼──────────┐   ┌──────────────────────────────────┐ │
│  │      Sync Engine         │   │      Media Manager               │ │
│  │  dirty-set → serialize   │   │  thumbnails + full photos,       │ │
│  │  → push shards/blobs     │   │  lazy load, blob cache,          │ │
│  │  last-write-wins         │   │  content-addressed uploads       │ │
│  └───────┬──────────────────┘   └───────────┬──────────────────────┘ │
├──────────┼──────────────────────────────────┼───────────────────────┤
│                      PERSISTENCE LAYER                                │
│  ┌────────────────────────────┐   ┌────────────────────────────────┐ │
│  │   IndexedDB (Dexie)        │   │   StorageProvider (interface)  │ │
│  │   SOURCE OF TRUTH          │   │   ┌──────────┐  ┌────────────┐ │ │
│  │   entities, media blobs,   │──►│   │  Drive   │  │   Mega     │ │ │
│  │   sync metadata            │   │   │ adapter  │  │  adapter   │ │ │
│  └────────────────────────────┘   │   └──────────┘  └────────────┘ │ │
│                                    └────────────┬───────────────────┘ │
└─────────────────────────────────────────────────┼─────────────────────┘
                                                   ▼
                                    User's Google Drive  OR  Mega.nz
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **StorageProvider (abstraction)** | One async interface for file ops; Drive & Mega behind it; nothing above this layer knows which provider is connected | TS interface + two adapter classes; OAuth (Drive) / login (Mega) |
| **IndexedDB store (Dexie)** | Local source of truth: entity records, media blobs, sync metadata, cached search index | Dexie tables: `entities`, `media`, `meta`, `syncQueue` |
| **Repository / Data Store** | Typed CRUD over the 4 object types + custom fields + placements; validates against field schema; marks records dirty on write; emits change events | Plain TS module over Dexie; one source of relationship truth |
| **Sync Engine** | Reconcile local ↔ cloud: serialize dirty shards + new blobs, push them, pull on open, last-write-wins by `updatedAt` | TS module; debounced; Background Sync optional |
| **Media Manager** | Generate/store thumbnails, lazy-load full photos, content-address blobs, dedupe, upload media as separate cloud files | Canvas/`createImageBitmap` for thumbs; blob hashing |
| **Search Index** | Build & query the field-scoped fuzzy index; rebuilt from repository, never the source of truth | MiniSearch, optionally in a Web Worker |
| **Map Editor** | Canvas: background image + drawn shapes/zones + layers + draggable markers + portal links; renders relationship connectors (read-only projection) | SVG or Konva/Fabric canvas; reads repository |
| **Graph View** | Viewer-only force/graph layout projecting relationship-links | Cytoscape.js or react-force-graph; reads repository |

## Recommended Project Structure

```
src/
├── storage/                  # Persistence layer — provider abstraction
│   ├── StorageProvider.ts    # interface: list/read/write/delete/mkdir/stat
│   ├── drive/                #   Google Drive adapter (gapi / fetch + OAuth)
│   ├── mega/                 #   Mega adapter (megajs)
│   └── providerFactory.ts    # picks adapter from user choice; persists token
├── db/                       # Local IndexedDB (Dexie) — source of truth
│   ├── schema.ts             # Dexie tables + indexes (NO blob indexing)
│   ├── repository.ts         # typed CRUD, dirty-marking, change events
│   └── migrations.ts
├── domain/                   # Pure model — no IO
│   ├── types.ts              # Person, Location, Group, RelationshipLink, Placement
│   ├── fields.ts             # custom typed-field definitions + validation
│   └── relationships.ts      # projection helpers (data → connectors/graph)
├── sync/                     # Sync engine
│   ├── syncEngine.ts         # dirty-set → serialize → push; pull on open; LWW
│   ├── serializer.ts         # entity records ↔ shard JSON files
│   └── conflict.ts           # last-write-wins resolution by updatedAt
├── media/                    # Media manager
│   ├── mediaManager.ts       # store/get blob, content-address, dedupe
│   └── thumbnails.ts         # generate + cache thumbnails
├── search/                   # Search index
│   ├── searchIndex.ts        # MiniSearch build + field-scoped query
│   └── search.worker.ts      # optional Web Worker for large datasets
├── features/                 # UI layer (React)
│   ├── map-editor/           # canvas, layers, markers, portals, connectors
│   ├── graph-view/           # viewer-only relationship graph
│   ├── entity-panel/         # profile sidebar, gallery, field editing
│   ├── browse/               # people/location lists
│   └── search/               # search bar + per-field checkbox scoping
└── app/                      # shell, routing, PWA service worker, providers
```

### Structure Rationale

- **`storage/` is the only place provider details exist.** Sync engine and media manager depend on the `StorageProvider` *interface*, never on Drive or Mega directly — this is the load-bearing seam.
- **`db/` and `domain/` are separated** so the model (`domain/`) stays pure and testable while persistence concerns (dirty flags, indexes) live in `db/`.
- **`search/` reads from the repository and is disposable** — the index is always rebuildable, so it never participates in sync.

## Architectural Patterns

### Pattern 1: Local-First with Cloud as Replica

**What:** IndexedDB is authoritative. Every read/write hits the local DB; the cloud is only touched by the sync engine. The UI never blocks on the network.
**When to use:** Always here — mandated by the offline-capable + Mokuro constraints.
**Trade-offs:** + Instant UX, full offline, simple. − Must serialize/diff state for the cloud; a wiped browser cache means re-pull from cloud (acceptable: cloud is the durable copy).

```typescript
// Writes go local-first and mark dirty; sync is async and out-of-band.
async function updatePerson(id: string, patch: Partial<Person>) {
  const next = { ...(await repo.get(id)), ...patch, updatedAt: Date.now(), dirty: true };
  await repo.put(next);          // IndexedDB — instant, offline-safe
  events.emit('entity:changed', next);
  syncEngine.schedule();         // debounced background push
}
```

### Pattern 2: Storage-Provider Adapter (the Drive/Mega seam)

**What:** A narrow async file interface that both providers implement. Everything above treats the cloud as a dumb file store with paths.
**When to use:** The entire app — this is how Drive and Mega become interchangeable.
**Trade-offs:** + One swappable seam, testable with an in-memory fake. − Lowest-common-denominator API; provider-specific niceties (Drive's appDataFolder, Mega's e2e crypto) are hidden, so keep the interface file-oriented, not feature-oriented.

```typescript
interface StorageProvider {
  init(auth: AuthState): Promise<void>;
  list(path: string): Promise<FileEntry[]>;
  read(path: string): Promise<Blob>;
  write(path: string, data: Blob, opts?: { contentType?: string }): Promise<FileRef>;
  delete(path: string): Promise<void>;
  stat(path: string): Promise<FileMeta | null>;   // size, modifiedTime, hash if available
}
// DriveProvider: drive.file scope (non-sensitive, user-visible folder, easier OAuth verification).
// MegaProvider:  megajs Storage(login) → folder/file ops; SDK handles e2e crypto.
```

### Pattern 3: Sharded Manifest + Per-Entity Blobs (the scale answer)

**What:** Do NOT store everything in one giant JSON file (slow to load/save at thousands) and do NOT use one cloud file per entity (thousands of round-trips, throttling). Use a **middle ground**: a small `manifest.json` index + a handful of **type/bucket shard files**, with media as separate content-addressed blobs.
**When to use:** As soon as the DB can exceed a few hundred entities — i.e. design it in from phase 1.
**Trade-offs:** + Loads only what is needed, syncs only dirty shards, scales to thousands. − Slightly more bookkeeping than a single blob (manifest must stay consistent with shards).

```
/RelationBlueprint/                 (folder in user's Drive or Mega root)
├── manifest.json                   # schema version, field defs, list of shards,
│                                   #   per-shard hash+updatedAt, entity→shard map,
│                                   #   map-group tree, db-wide settings
├── entities/
│   ├── people-000.json             # bucketed shards (~200–500 entities each)
│   ├── people-001.json
│   ├── locations-000.json          # locations/maps (geometry, layers, markers, portals)
│   ├── groups-000.json             # social groups
│   └── links-000.json              # relationship-links (data-bearing connectors)
├── media/
│   ├── ab/cd/abcd1234…             # content-addressed full photos (immutable)
│   └── thumbs/ab/cd/abcd1234…      # generated thumbnails
└── export/                         # optional whole-DB export bundles
```

- **manifest.json** is the only file always loaded on open — it is tiny and drives lazy-loading of shards.
- **Shards are bucketed** (e.g. by id range / insertion order), capped at a few hundred entities so each file stays small and a single edit re-uploads only its shard.
- **Placements** (person-on-multiple-maps) are stored on the **location/map** side as `markers: [{ personId, x, y, layer }]` (and/or a `placements` collection), so one person referenced by N maps is N marker entries — no duplication of the person record.
- **Media is content-addressed** (filename = hash of bytes): immutable, automatically deduped, never needs re-upload, and galleries are just lists of hashes on the entity.

## Data Flow

### Write Flow (offline-safe)

```
User edits entity / drags marker / adds photo
        ↓
Repository.put()  → IndexedDB (source of truth)  → mark record dirty (updatedAt)
        ↓                                              ↓
emit change event                              add to syncQueue
        ↓                                              ↓
UI re-renders instantly                        SyncEngine (debounced, when online):
Search index updated incrementally                 serialize dirty shard(s) + new blobs
                                                    → StorageProvider.write(...)
                                                    → mark records synced
```

### Read / Open Flow

```
App start → connect provider (cached token) → read manifest.json
        ↓
Compare manifest hashes vs local IndexedDB:
   newer in cloud  → pull changed shards → upsert into IndexedDB
   newer locally   → (will be pushed by sync)
        ↓
Hydrate repository from IndexedDB → build MiniSearch index
        ↓
Lazy-load media: render thumbnails first; fetch full photo blob on demand,
   cache blob in IndexedDB, serve via object URL
```

### Key Data Flows

1. **Relationship projection:** Links live only in the repository (`links` collection). The Map Editor projects them into connectors between markers; the Graph View projects them into nodes/edges. Both are **read-only views of the same data** — editing happens in entity panels, never in the graph (per PROJECT.md).
2. **Search:** On data change the repository notifies the Search Index, which incrementally updates MiniSearch. Per-field checkboxes pass a `fields` array into the query so "smith" can match `name` but not `job`.
3. **Media lifecycle:** Upload → hash bytes → write `media/<hash>` to cloud + cache blob locally → entity stores the hash. Thumbnails generated client-side at upload, stored under `media/thumbs/<hash>`.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Dozens of entities | Single shard per type is fine; whole DB fits in memory; index built synchronously. No special handling. |
| Hundreds–low thousands | Bucketed shards (~200–500/shard) keep each file small; sync only touches dirty shards; lazy-load media thumbnails; consider moving MiniSearch build into a Web Worker. |
| Thousands+ + large galleries | Virtualized lists (only render visible rows); lazy shard hydration (load a shard when its entities are first needed, not all upfront); IndexedDB blob cache with LRU eviction; `navigator.storage.persist()` to resist eviction; monitor `navigator.storage.estimate()`. |

### Scaling Priorities

1. **First bottleneck — full-DB JSON load/save.** A single monolithic JSON re-serialized on every edit will stall at low thousands. Fix is structural and must be designed up front: the **sharded manifest layout** above. This is why the data-layout decision is the highest-leverage architectural choice.
2. **Second bottleneck — media volume.** Many full-resolution photos blow past quotas and slow sync. Fix: thumbnails-first rendering, full photos fetched on demand, content-addressed immutable blobs (no re-upload), client-side compression (Compression Streams API / canvas re-encode).
3. **Third bottleneck — search index build time / main-thread jank.** Fix: move MiniSearch into a Web Worker; index only searchable text fields, not blobs.

## Anti-Patterns

### Anti-Pattern 1: One giant database JSON file in the cloud

**What people do:** Serialize the entire DB to `database.json` and re-upload it on every change.
**Why it's wrong:** O(n) load and save; a one-field edit re-uploads megabytes; corruption risk on partial write; doesn't scale past low thousands.
**Do this instead:** Sharded manifest + per-bucket shard files; push only dirty shards.

### Anti-Pattern 2: Storing photos as base64 inside entity records / indexing blobs

**What people do:** Embed images as base64 in the entity JSON, or index blob columns in IndexedDB.
**Why it's wrong:** Bloats the structured data and the IndexedDB index for zero query benefit (you never `WHERE` on image bytes); kills load/sync performance. (Confirmed by Dexie's maintainer guidance.)
**Do this instead:** Store blobs as separate, unindexed records / separate cloud files; reference them by hash. Index only a hash or id.

### Anti-Pattern 3: Treating the cloud as the live database (read-through every operation)

**What people do:** Read/write Drive or Mega on each user action.
**Why it's wrong:** Defeats offline-first, adds latency, hits rate limits, and breaks when disconnected.
**Do this instead:** Local-first — IndexedDB is the source of truth; the cloud is a background replica synced out-of-band.

### Anti-Pattern 4: Leaking provider specifics above the storage layer

**What people do:** Call Drive `files.create` or megajs methods directly from sync/media/UI code.
**Why it's wrong:** Makes the two providers non-interchangeable and the code untestable; violates the user-selectable-provider constraint.
**Do this instead:** Everything above `storage/` depends only on the `StorageProvider` interface; use an in-memory fake provider in tests.

### Anti-Pattern 5: Duplicating a person record per map placement

**What people do:** Copy the person object onto each map they appear on.
**Why it's wrong:** Person appears on multiple maps; copies drift out of sync and bloat storage.
**Do this instead:** One canonical person record; maps hold lightweight **marker/placement references** (`personId` + coordinates + layer).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google Drive | OAuth (token client) + Drive API v3 via fetch/gapi; `drive.file` scope | `drive.file` is non-sensitive → easier OAuth verification, user-visible folder. `appDataFolder` only if hidden storage is preferred. Token refresh handled in the adapter. |
| Mega.nz | `megajs` SDK browser build (UMD/ESM), `Storage(login)` + file/folder ops | Unofficial but maintained (v1.3.10). E2E-encrypted client-side. Only part of the file API implemented — keep the abstraction file-oriented to stay within it. |
| Browser storage | IndexedDB via Dexie; `navigator.storage.persist()`/`estimate()` | Local source of truth; request persistence to avoid eviction of the cache. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ Repository | Direct calls + change events | UI never touches IndexedDB/cloud directly |
| Repository ↔ Sync Engine | Dirty flags + sync queue | Repo marks dirty; engine decides when/what to push |
| Sync/Media ↔ StorageProvider | Interface only | The Drive/Mega swap point |
| Repository ↔ Search Index | Change events | Index is a derived, rebuildable projection |
| Repository ↔ Map/Graph views | Read-only projection | Relationships authored in entity data only |

## Suggested Build Order (dependency-driven)

This ordering lets each layer be built and tested on top of a working one beneath it. It directly informs roadmap phase structure.

1. **Domain model + custom typed fields** (`domain/`). Pure types, no IO. Everything depends on this. Defines Person/Location/Group/RelationshipLink/Placement and the typed-field system.
2. **Local store / Repository on IndexedDB (Dexie).** Source of truth + dirty-marking + change events. Build CRUD and prove offline persistence before any cloud work. Enables an app that already works offline.
3. **StorageProvider abstraction + one adapter (start with Mega *or* Drive) + an in-memory fake.** Lock the interface against the fake first, then implement one real provider. Add the second provider behind the same interface afterward.
4. **Sync engine (last-write-wins) + sharded serializer + manifest.** Depends on 2 and 3. Establish the cloud file layout here; this is the make-or-break scaling piece.
5. **Media manager (thumbnails, content-addressed blobs, lazy load).** Depends on 2 (blob cache) and 3 (blob upload). Can proceed in parallel with later UI work.
6. **Entity panels + browse lists.** First real UI; depends on 1–2 (and 5 for galleries). Makes the data editable/viewable.
7. **Search index (MiniSearch) + field-scoped search bar.** Depends on 1–2; derived projection, low risk. Delivers the signature feature.
8. **Map editor** (canvas, layers, markers, portals, map-group nesting). Depends on 1–2, 5, 6. Largest single component.
9. **Relationship connectors + viewer-only graph view.** Depends on 1–2 and the links data; projection only. Build after links exist and maps render.
10. **PWA shell hardening + whole-DB export.** Service worker, installability, export bundle. Cross-cuts; finalize once data and sync are stable.

**Critical-path note for the roadmap:** items 1→4 form the spine and should likely be early, dependency-ordered phases. The **sharded cloud layout (item 4) and the provider abstraction (item 3) are the two decisions most expensive to change later** and warrant deeper phase-level research/spikes. The Map Editor (item 8) is the largest build and a candidate for its own multi-plan phase.

## Sources

- [megajs — npm](https://www.npmjs.com/package/megajs) and [MEGAJS API Reference](https://mega.js.org/docs/1.0/api) — MEDIUM
- [Choose Google Drive API scopes — Google for Developers](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [Store application-specific data (appDataFolder)](https://developers.google.com/workspace/drive/api/guides/appdata) — MEDIUM
- [Dexie.js — Keep storing large images, just don't index the binary data (maintainer)](https://medium.com/dexie-js/keep-storing-large-images-just-dont-index-the-binary-data-itself-10b9d9c5c5d7) and [Dexie vs localForage vs idb 2026](https://www.pkgpulse.com/guides/dexie-vs-localforage-vs-idb-indexeddb-browser-storage-2026) — MEDIUM
- [Fuse.js vs FlexSearch vs Orama: client-side search 2026](https://www.pkgpulse.com/blog/fusejs-vs-flexsearch-vs-orama-client-side-search-2026) and [Client-side full-text search libraries comparison](https://npm-compare.com/elasticlunr,flexsearch,fuse.js,minisearch) — MEDIUM
- [Offline-first frontend apps in 2025: IndexedDB and SQLite — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) and [Offline-First PWA Patterns — Service Workers, IndexedDB, Sync](https://rohitraj.tech/en/notes/pwa-offline-sync) — MEDIUM

---
*Architecture research for: serverless own-cloud offline-first relationship-mapping PWA*
*Researched: 2026-06-24*

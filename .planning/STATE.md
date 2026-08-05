---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: field-scoped-search
status: executing
stopped_at: Phase 5 UI-SPEC approved
last_updated: "2026-08-05T10:00:27.775Z"
last_activity: 2026-08-05
last_activity_desc: Phase 05 execution started
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 32
  completed_plans: 31
  percent: 63
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-07)

**Core value:** You can place people on a map of real locations and instantly see who is where, open any person to their full profile, and trace how people and groups relate — all from data you fully own, with no server.
**Current focus:** Phase 05 — field-scoped-search

## Current Position

Phase: 05 (field-scoped-search) — EXECUTING
Plan: 1 of 3
Status: Executing Phase 05
Last activity: 2026-08-05 — Phase 05 execution started

Progress: [████████████████████] 25/25 plans (100%)

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02.1 | 1 | - | - |
| 03 | 7 | - | - |
| 04 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P02 | 6 | 2 tasks | 10 files |
| Phase 01 P08 | 14 | 2 tasks | 14 files |
| Phase 01 P03 | 15 | 2 tasks | 22 files |
| Phase 01 P05 | 8 | 2 tasks | 8 files |
| Phase 01 P04 | 12 | 2 tasks | 10 files |
| Phase 01 P06 | 18 | 2 tasks | 19 files |
| Phase 01 P07 | 8 | 2 tasks | 11 files |
| Phase 01 P09 | 3 | 2 tasks | 4 files |
| Phase 01 P10 | 5 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 04]: Relationship-links are ONE canonical record with optional `people`|`groups` endpoints (`z.enum` gate at BOTH the repository write and the backup-import boundary); authored/visible from BOTH endpoints via the `listRelationshipsFor` reverse index — attached to the canonical Person/Group, never a placement
- [Phase 04]: Map connectors and the Cytoscape graph are PURE projections of link data — `buildConnectors`/`toGraphElements` drop endpoint-less / unplaced / deleted-endpoint links so no dangling edge or crash occurs; the graph is viewer-only (`autoungrabify`, no data-mutating drag)
- [Phase 04]: All user text (labels/notes/entity names) renders as JSX children / Konva `Text` / Cytoscape canvas text — never `dangerouslySetInnerHTML` (XSS boundary). Phase-4 7-threat STRIDE register formally ACCEPTED under the single-curator / provider-level-security v1 boundary (04-SECURITY.md, threats_open: 0)
- [Phase 03]: Marker/shape coords stored in IMAGE-space, composed at render through `imageToStage(backgroundTransform)` — a background re-fit keeps every placement anchored to its physical spot (UAT-confirmed); Phase 4 connectors must draw in the same image-space so relationship lines stay anchored too
- [Phase 03]: Multi-placement = a new Marker row per placement over one canonical Person (D-13); `db.markers.where('personId')` is the reverse index ("Appears on:") — Phase 4 relationships attach to the canonical Person/Group, never to a placement
- [Phase 03]: Portal marker is a distinct door-arch glyph (`colors.portal`), single-click select / double-click navigate (D-06/D-07); precedent for a per-marker-kind glyph vocabulary
- [Phase 03]: Logical layers (`layers.ts`) are decoupled from the 3 fixed physical Konva layers (L0 bg / L1 content / L2 transformer); viewport culling (`useViewportCulling`) debounced on pan/zoom END keeps high marker counts smooth
- [Roadmap]: Vertical-MVP structure — Phase 1 is a thin end-to-end slice (Drive connect → Person → map → profile → export/restore) proving the spine, not a storage layer in isolation
- [Roadmap]: Drive `drive.file` scope on a visible named folder only (never broad `drive`, never `appDataFolder`); sharded manifest + StorageProvider abstraction designed in from Phase 1
- [Roadmap]: Export/restore pulled into Phase 1 (the cloud is the only copy; tested restore must exist before real data)
- [Roadmap]: Mega.nz deferred to Phase 6 (second-class/opt-in; Drive proves the abstraction first)
- [Roadmap]: Typed custom fields (Phase 2) are the keystone that search, profiles, and relationships depend on
- [Phase ?]: Media stored as ArrayBuffer+mime (not Blob) in Dexie for structured-clone portability across browser and fake-indexeddb; repository converts at the boundary
- [Phase ?]: StorageProvider interface locked against an InMemoryProvider conformance fake before any real backend exists (Plan 05/06 target a stable seam)
- [Phase ?]: [Phase 01 P08]: PWA SW uses registerType:'prompt' — a new worker waits and activates only on user Reload when no write is in flight (never blind skipWaiting)
- [Phase ?]: [Phase 01 P08]: src/sync/writeStatus.ts is the in-flight-write seam — Plan 05 sync engine MUST call beginWrite()/endWrite() so the SW update guard sees active Drive writes
- [Phase ?]: [Phase 01 P03]: Konva marker reads shared tokens.ts constants (canvas) while DOM reads tokens.css vars — one source of truth prevents marker/chrome color drift (UI-SPEC A5)
- [Phase ?]: [Phase 01 P03]: Content-addressed media via crypto.subtle SHA-256 (db/media.ts) builds the MediaRef before putMedia — idempotent, deduped uploads for map backgrounds and avatars
- [Phase ?]: [Phase 01 P03]: On person CREATE the new person is auto-placed as a marker at map center (resolves UI-SPEC A12 place-vs-create ordering); window.__rb test bridge seeds the real repository for E2E
- [Phase ?]: [Phase 01 P05]: Atomic write = the manifest overwrite is the SOLE commit point; shards/media are immutable writeFile, discardable on failure
- [Phase ?]: [Phase 01 P05]: Serializer normalizes dirty=false for the canonical cloud copy; a pulled shard arrives already-clean
- [Phase ?]: [Phase 01 P05]: SyncEngine consumes a RepositoryPort so the atomicity test runs over a plain snapshot; reconcile/production use createDexieRepoPort
- [Phase ?]: [Phase 01 P04]: Media hash is SHA-256 of the PROCESSED (resized) bytes — storeMedia caps/thumbnails then hashes; Plan 05 uses this as the media/<hash> Drive filename
- [Phase ?]: [Phase 01 P04]: storeMedia(kind) routes avatar->96px square webp thumb, gallery->1600px-cap webp, raw->as-is; resolveMediaUrl owns object-URL creation, callers revoke on unmount
- [Phase ?]: P06: DriveProvider implements StorageProvider and passes the same conformance contract as InMemoryProvider; sync engine runs against real Drive unchanged
- [Phase ?]: P06: GIS token is in-memory only (no refresh token, drive.file scope only); 401/expiry surfaces a non-destructive Reconnect banner, consent re-requested only on user click
- [Phase ?]: P06: SyncEngine.getNewMedia wired to a synced-hash meta watermark for incremental media push that stays content-addressed/idempotent (media/<hash>)
- [Phase ?]: P06: LIVE Drive connect deferred pending human OAuth Client ID (SETUP.md); all Drive code unit/E2E-testable without it via mocked GIS + __rb.connect bridge
- [Phase 01]: [Phase 01 P07]: Export bundles a minimal v0 local manifest (empty-string shard pointers) so the backup is schema-complete and importable on a never-synced device; entities travel inline
- [Phase 01]: [Phase 01 P07]: importDb validate-before-write — BackupSchema.parse runs before the single rw transaction, so a corrupt/foreign file leaves the DB untouched (T-07-01/02)
- [Phase 01]: [Phase 01 P07]: backup media stores only hash->base64; restore recovers each blob's mime from entity MediaRefs, bytes restored byte-for-byte (round-trip property test)
- [Phase ?]: [Phase 01 P09]: prepareOnOpen() = discover-existing-manifest-or-bootstrap, called before reconcileOnOpen() in onConnected — fixes empty-DB first-connect error and enables silent re-adoption of an existing cloud DB (no second commit point)
- [Phase ?]: [Phase 01 P10]: Silent on-load Drive re-acquire — App mount effect calls restore() once; restore() self-gates on isConfigured() and fails QUIETLY (no markError/markNeedsReconnect), preserving the token-never-persisted invariant (only mechanism is the in-memory GIS prompt:'' re-grant)

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- (ui) Map-editor & profile-media UX enhancements deferred from Phase 1 UAT — resizable markers, image/marker transform handles, photo lightbox, gallery sort/reorder. See `.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md`
- (tooling) Enable COOP header in production for Drive OAuth — GitHub Pages can't send `Cross-Origin-Opener-Policy: same-origin-allow-popups` that GIS OAuth needs; move to Cloudflare Pages/Netlify `_headers` or adopt FedCM before shipping Drive sync. See `.planning/todos/pending/2026-07-03-enable-coop-header-in-production-for-drive-oauth.md`
- (ui) Map & graph appearance settings — customizable marker name-label + connector line colors (white-on-white legibility). Phase 04 UAT. See `.planning/todos/pending/2026-07-07-map-graph-appearance-settings-customizable-label-and-connect.md`
- (ui) Graph node repositioning — drag nodes to rearrange layout, viewer-only (no data mutation), optional persist to position cache. Phase 04 UAT. See `.planning/todos/pending/2026-07-07-graph-node-repositioning-drag-to-rearrange-layout.md`
- (ui) Dynamic ego focus — re-layout graph around the focused person and follow taps (clicking another node re-egos onto them). Phase 04 UAT. See `.planning/todos/pending/2026-07-07-dynamic-ego-focus-graph-re-center-and-follow-tapped-node.md`

### Blockers/Concerns

[Issues that affect future work]

- ⚠️ [Phase 3] Polygon draw tool is armed in ToolPalette (shortcut P) but its multi-click wiring in MapView was never delivered; the pure `addPolygonVertex`/`closePolygon` helpers exist and are unit-tested. Non-blocking — Rect/Ellipse/Line satisfy MAP-02. Either wire the multi-click path or formally drop the tool. See 03-VERIFICATION.md (non-blocking warning).
- Phase 6 (Mega megajs) still carries a research flag — spike the browser SDK before planning. (Phase 1 Drive-auth and Phase 3 Konva-at-scale research flags are now resolved.)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260703-f9m | Add a favicon (stop /favicon.ico 404 + browser-tab icon) | 2026-07-03 | c0bf714 | [260703-f9m-add-a-favicon-public-favicon-svg-link-re](./quick/260703-f9m-add-a-favicon-public-favicon-svg-link-re/) |
| 260703-et9 | Add Open-map action to Locations browse list | 2026-07-03 | ce9c4c8 | [260703-et9-add-open-map-action-to-locations-browse-](./quick/260703-et9-add-open-map-action-to-locations-browse-/) |

### Roadmap Evolution

- Phase 2 edited: added success criteria 5-6: profile photo lightbox/expand + gallery sort/reorder (deferred from Phase 1 UAT)
- Phase 3 edited: added success criteria 6-7: resizable/rotatable markers + map image transform handles via Konva Transformer (deferred from Phase 1 UAT)
- Phase 02.1 inserted after Phase 2: Close gap: DATA-03 — sync fieldDefs through the manifest cloud path (ENTITY_TYPES + reconcile + ManifestSchema) + push/reconcile regression test (URGENT)
- Phase 7 added: Relationships & Map Visual Polish — folds in the 3 Phase-04 UAT enhancement todos (appearance settings, graph node repositioning, dynamic ego focus); polish extending Phase 3/4, sequenced after Phase 6, non-urgent

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-04T08:47:26.651Z
Stopped at: Phase 5 UI-SPEC approved
Resume file: .planning/phases/05-field-scoped-search/05-UI-SPEC.md

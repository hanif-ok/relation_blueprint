# Walking Skeleton — Relation Blueprint

**Phase:** 1
**Generated:** 2026-06-24

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A single curator can connect their own Google Drive (`drive.file`, visible named folder), upload an image to create a map, create a Person, place that Person on the map as a round photo-avatar marker, open their profile, and export then restore the entire database — proving the serverless storage / offline / atomic-write spine works end-to-end before any breadth is added.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React 19.2 + Vite 7 + TypeScript (strict) static SPA | Locked by CLAUDE.md; react-konva/dexie-react-hooks are React-first; Vite static build deploys to GitHub Pages. Vite pinned to 7 (not 8) to guarantee vite-plugin-pwa 1.3 peer support (RESEARCH Assumption A3). |
| Runtime source of truth | IndexedDB via Dexie 4.4 | Local-first: every read/write hits Dexie; the cloud is a durable replica. Holds photo blobs unindexed; reactive reads via `useLiveQuery`. |
| Storage abstraction | `StorageProvider` interface (`ensureFolder/list/readFile/writeFile/overwriteFile/delete/stat`) | App code targets the interface only. Drive is the first impl (Phase 1); Mega is Phase 6 behind the same factory. Locked against an `InMemoryProvider` fake in tests before any real backend. |
| On-disk layout | JSON manifest + per-type shard files + content-addressed media folder | Provider-agnostic; the manifest is the single commit point; media deduped by SHA-256 hash. |
| Atomic write | Manifest-pointer swap (write new immutable shard/media files -> overwrite the small manifest as the sole commit -> GC orphans), with rolling manifest backups | Drive `files.update` is NOT atomic; this makes an interrupted write non-corrupting (STOR-05). Proven by a failure-injection property test. |
| Cloud / auth | Google Identity Services token model + Drive REST v3 via raw `fetch` | Only viable no-backend OAuth from a static site. Access token in memory only (~1h), `drive.file` scope only, no refresh token; re-acquire on a user gesture; 401/expiry -> non-destructive Reconnect prompt. |
| Sync model | Single curator, last-write-wins by `updatedAt`; dirty-flag; debounced background push when online + token valid | No CRDT/OT needed (multi-user is out of scope). Writes never block on the network. |
| Offline / install | vite-plugin-pwa (Workbox) `registerType: 'prompt'`; `navigator.storage.persist()` after a user action | App opens offline against a precached shell; SW updates never silently drop queued writes. |
| Canvas | Konva 10.3 + react-konva 19.2 (`Stage`/`Layer`/`Group` + `clipFunc` round avatar) | Phase 1 is one map + one draggable round marker. No culling/caching (Phase 3). |
| UI system | Hand-rolled CSS-custom-property tokens (no shadcn); Radix primitives for Dialog/DropdownMenu/focus-trap; Lucide icons; self-hosted Fraunces/Inter/JetBrains Mono | UI-SPEC "lit field map" identity: dark Konva canvas + warm-paper chrome + one reserved amber accent for placement/selection. `tokens.ts` shares hex with the canvas so DOM and Konva never drift. |
| Deployment target | GitHub Actions -> GitHub Pages (static), `base: '/relation_blueprint/'` | Zero-cost static host matching the serverless constraint. base/start_url/scope all the repo subpath. |
| Directory layout | Feature-folders under `src/features/*`; cross-cutting under `src/{domain,storage,db,sync,media,app}` | Mirrors RESEARCH ## Recommended Project Structure. |

## Stack Touched in Phase 1

- [x] Project scaffold (framework, build, lint, Vitest + Playwright test runners) — Plan 01
- [x] Routing / app shell — single-surface app shell (top bar + map + sidebar); no router needed yet — Plan 01/03
- [x] Database — real Dexie reads AND writes (person/map/marker/media CRUD) — Plan 02/03
- [x] UI — interactive element wired to data (round avatar marker drag persists; profile edit/delete) — Plan 03
- [x] Cloud backend — real Drive read/write behind the StorageProvider interface — Plan 06
- [x] Atomic sync — manifest-swap commit proven incorruptible by failure injection — Plan 05
- [x] Export/restore — round-trip proven (deep-equal entities + byte-equal photos) — Plan 07
- [x] Deployment — GitHub Pages static build via GitHub Actions; documented local run (`npm run dev`) — Plan 01/08
- [x] PWA — installable, offline shell, persistent-storage request, controlled update — Plan 08

## Out of Scope (Deferred to Later Slices)

> Explicit — prevents future phases from re-litigating Phase 1's minimalism.

- Custom typed fields; Locations/Groups/Relationship-links as first-class entities; browse lists (Phase 2).
- Map editor: shapes/zones/layers, portal markers, nested map-groups, one-person-on-multiple-maps; Konva viewport culling/shape caching (Phase 3).
- Relationships authoring, data-driven map connectors, the Cytoscape relationship graph (Phase 4).
- Field-scoped fuzzy search with per-attribute checkboxes / MiniSearch (Phase 5).
- Mega.nz provider (Phase 6 — plugs into the same `StorageProvider` factory).
- App-level encryption (v2 / SEC-01); migrate-between-providers (v2 / STOR-08); zip export via fflate (scale fast-follow).
- Multi-bucket sharding at scale (manifest shape supports it; only one bucket per type exercised now).
- Full canvas keyboard navigation / tabbing between markers (deferred; Phase-1 AT bridge = sidebar focus + aria-live).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Define custom typed fields and all four first-class entity types (People/Locations/Groups/Relationship-links); browse people and locations as lists.
- Phase 3: Map editor — shapes/zones/layers, portal markers, nested map-groups, one person across multiple maps; Konva culling/caching at scale.
- Phase 4: Author relationships in entity details; render data-driven map connectors; viewer-only relationship graph (Cytoscape).
- Phase 5: Field-scoped fuzzy search over people with per-attribute checkbox scoping (MiniSearch).
- Phase 6: Mega.nz as a second-class opt-in storage provider behind the existing `StorageProvider` abstraction.

## Non-Retrofittable Invariants (do not violate in later phases)

1. **App code targets the `StorageProvider` interface only** — never call Drive/Mega directly from features.
2. **The manifest is the single commit point** — shard/media files are immutable-new; only the manifest is overwritten, and only as the final commit.
3. **The OAuth access token lives in memory only** — never persisted; `drive.file` scope only; re-acquire on gesture.
4. **IndexedDB is the runtime source of truth** — writes are dirty-marked + timestamped; the UI never blocks on the network.
5. **Media are content-addressed blobs** — referenced by SHA-256 hash, never base64-embedded in entity JSON, never indexed in Dexie.
6. **No backend, ever** — no server, proxy, or serverless function may be introduced.

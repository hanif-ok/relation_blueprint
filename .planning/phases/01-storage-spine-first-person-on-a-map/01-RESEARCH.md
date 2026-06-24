# Phase 1: Storage Spine & First Person on a Map - Research

**Researched:** 2026-06-24
**Domain:** Serverless local-first PWA spine — Google Drive (GIS token model + Drive REST v3) + Dexie/IndexedDB + atomic sharded sync + Konva map + export/restore
**Confidence:** HIGH on stack/versions and Drive/GIS API shapes (verified against npm + official Google docs this session); MEDIUM on the atomic-write and silent-re-auth strategies (these are the genuine spike items — patterns are sound but require empirical validation against live Drive).

## Summary

Phase 1 is the **walking skeleton** that proves the non-retrofittable spine: connect Google Drive with `drive.file` to a visible named folder, write one real Person + one map + one marker to a sharded layout in the user's Drive, work offline against Dexie as the source of truth, sync back atomically without a corruptible in-place overwrite, and export→restore the whole DB (photos included) losslessly. Custom fields, the full entity model, the map editor, relationships, and search are LATER phases — research here is deliberately minimal-correct-thread, not feature-complete.

The project-level research (`STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md`) already locks the stack and the macro architecture. This document does **not** re-derive those; it goes deeper on the four flagged spike items and translates them into concrete, implementable patterns: (1) the GIS token lifecycle on a static site, (2) the atomic temp-then-swap write over Drive REST v3, (3) the sharded manifest sync reconciliation, (4) the controlled PWA service-worker update flow. It also pins the minimum Konva marker, the export/restore format, and client-side thumbnailing.

**Two findings are load-bearing and shape the whole phase:**
1. **Drive `files.update` overwrites in place — it is NOT atomic.** Atomicity must come from a *manifest-pointer swap*: write each new shard/blob as a **new immutable file**, then update `manifest.json` to point at the new file IDs, then garbage-collect orphans. The manifest write is the single commit point. [VERIFIED: developers.google.com/workspace/drive/api/guides/manage-uploads]
2. **The GIS token model gives ~1h access tokens and offers no reliable *silent* refresh from a static site** — `requestAccessToken()` is designed to run from a user gesture. The correct design is **local-first with a write queue**: never block the UI on a token; flush the queue to Drive only when a valid token exists; on 401, surface a non-destructive "Reconnect to Drive" prompt and re-request on the user's click. [VERIFIED: developers.google.com/identity/oauth2/web/guides/use-token-model]

**Primary recommendation:** Build the spine in dependency order — domain types → Dexie repository (offline-first, dirty-flag) → `StorageProvider` interface + in-memory fake → Drive adapter (GIS + REST) → sharded serializer + atomic manifest-swap sync → media/thumbnails → minimal Konva person-on-map UI + profile sidebar → export/restore → PWA shell with prompted SW update. Prove atomicity and export-round-trip with automated failure-injection tests against the in-memory fake before touching real Drive.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth / Drive token acquisition | Browser / Client | — | No backend exists; GIS token client runs entirely in the page |
| Drive file read/write (REST v3) | Browser / Client (fetch) | — | CORS-enabled REST called directly from the SPA; no server proxy |
| Source-of-truth persistence | Browser / Storage (IndexedDB via Dexie) | — | Local-first: every read/write hits IndexedDB; cloud is replica |
| Atomic write / manifest swap | Domain/State (Sync Engine) | Browser/Storage (Drive adapter) | Commit logic lives in sync engine; the adapter only does dumb file ops |
| Offline app shell + install | CDN / Static (precache) | Browser (service worker) | vite-plugin-pwa precaches the static bundle; GitHub Pages hosts |
| Person/map rendering | Browser / Client (Konva canvas) | — | Pure client-side canvas; reads from repository |
| Profile sidebar | Browser / Client (React) | — | Reads repository via `useLiveQuery` |
| Thumbnail generation | Browser / Client (Canvas/WebCodecs) | — | Client-side image resize; no server, no paid service |
| Export / restore | Browser / Client | Browser/Storage + Drive adapter | Bundles local + cloud state into a portable file; pure client |

**Why this matters:** Every capability in Phase 1 is a *browser/client* responsibility — there is intentionally no API or backend tier. The only "external service" is the user's own Drive, reached over CORS REST. The plan must never introduce a server-side step (token exchange, proxy, signing) — doing so would violate the core constraint and the `drive.file`-only verification posture.

## Standard Stack

> The project `STACK.md` and `./.claude/CLAUDE.md` already lock these. Versions below are **re-verified against the npm registry on 2026-06-24** for this phase. Only Phase-1-relevant packages are listed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.7 | UI framework | Locked by CLAUDE.md; react-konva/dexie-react-hooks are React-first [VERIFIED: npm registry] |
| react-dom | 19.2.7 | DOM renderer | Pairs with react 19.2 [VERIFIED: npm registry] |
| vite | 8.1.0 (latest) | Build/dev server | Static build → GitHub Pages; first-class vite-plugin-pwa. **Note:** CLAUDE.md says "Vite 7.x"; npm latest is now **8.1.0**. vite-plugin-pwa 1.3 supports Vite 5/6/7 — confirm Vite 8 peer support at install or pin Vite 7. [VERIFIED: npm registry] |
| typescript | 5.x | Language | Locked; all libs ship types [CITED: CLAUDE.md] |
| dexie | 4.4.4 | IndexedDB wrapper / source of truth | Blob storage, compound indexes, transactions [VERIFIED: npm registry] |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` reactive reads | Re-render lists/map when local cache changes [VERIFIED: npm registry] |
| konva | 10.3.0 | Canvas engine (minimal use this phase) | MIT; image bg + draggable circle marker + `clipFunc` round avatar [VERIFIED: npm registry] |
| react-konva | 19.2.5 | Declarative Konva in React | Peers `react ^19.2.0` and `konva ^10.0.0` — **confirmed compatible with React 19.2 + konva 10.3** [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Google Identity Services | CDN script (`accounts.google.com/gsi/client`) | OAuth token model | Drive connect; no npm package — `<script>` tag [VERIFIED: developers.google.com/identity/oauth2/web/guides/use-token-model] |
| Google Drive REST v3 | n/a (raw `fetch`) | File read/write | CORS-enabled; no SDK needed for Phase 1 [VERIFIED: developers.google.com/workspace/drive/api] |
| vite-plugin-pwa | 1.3.0 | SW + manifest + precache | PWA install + offline shell; `registerType: 'prompt'` [VERIFIED: npm registry] |
| workbox-window | 7.4.1 | SW lifecycle in page | Controlled "update available" prompt [VERIFIED: npm registry] |
| zod | 4.4.3 | Runtime validation | Validate manifest + Person shape on load from cloud/export [VERIFIED: npm registry] |
| nanoid | 5.1.15 | Stable entity IDs | Person/map/marker IDs in the JSON model [VERIFIED: npm registry] |
| browser-image-compression | 2.0.2 | Client-side thumbnail/resize | Optional — Canvas API can do it directly [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw Drive REST `fetch` | `gapi.client` | gapi adds a discovery/loading dependency and weight; raw `fetch` is simpler and fully CORS-supported for the few endpoints needed. Use raw fetch in Phase 1. |
| browser-image-compression | Plain Canvas API (`createImageBitmap` + `OffscreenCanvas` + `canvas.toBlob`) | Canvas API has zero dependency and full control; browser-image-compression is convenience + EXIF handling. Either is fine — prefer Canvas API to avoid a dep unless EXIF orientation bites. |
| Custom export zip | Single JSON+base64 file | See Export section — JSON+base64 is simplest for the skeleton; zip (via `fflate`) is better at scale but adds a dep. Start with JSON+base64; flag zip as a fast-follow. |

**Installation (Phase 1 subset):**
```bash
npm install react react-dom dexie dexie-react-hooks konva react-konva zod nanoid browser-image-compression
npm install -D vite vite-plugin-pwa workbox-window @vite-pwa/assets-generator
```
GIS in `index.html`:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

## Package Legitimacy Audit

> Run via `gsd-tools query package-legitimacy check --ecosystem npm ...` on 2026-06-24, cross-checked with `npm view`.

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| react | npm | 2026-06-01 | 152M/wk | github.com/facebook/react | OK* | Approved |
| react-dom | npm | 2026-06-01 | 143M/wk | github.com/facebook/react | OK* | Approved |
| konva | npm | 2026-04-30 | 2.06M/wk | github.com/konvajs/konva | OK | Approved |
| react-konva | npm | 2026-06-09 | 1.63M/wk | github.com/konvajs/react-konva | OK* | Approved |
| dexie | npm | 2026-06-16 | 1.72M/wk | github.com/dexie/Dexie.js | OK* | Approved |
| dexie-react-hooks | npm | 2026-03-18 | 434K/wk | github.com/dexie/Dexie.js | OK | Approved |
| minisearch | npm | 2025-09-16 | 1.90M/wk | github.com/lucaong/minisearch | OK | Approved (Phase 5, not P1) |
| vite-plugin-pwa | npm | 2026-05-05 | 3.51M/wk | github.com/vite-pwa/vite-plugin-pwa | OK | Approved |
| workbox-window | npm | 2026-05-04 | 8.36M/wk | github.com/googlechrome/workbox | OK | Approved |
| nanoid | npm | 2026-06-20 | 221M/wk | github.com/ai/nanoid | OK* | Approved |
| zod | npm | 2026-05-04 | 209M/wk | github.com/colinhacks/zod | OK | Approved |
| browser-image-compression | npm | 2023-03-06 | 1.22M/wk | github.com/Donaldcwl/browser-image-compression | OK | Approved |

**\* "too-new" SUS flag overridden:** The legitimacy seam flagged react, react-dom, react-konva, dexie, and nanoid as `SUS` solely on a recent-publish ("too-new") heuristic. These are the **latest patch releases of household-name packages** with 1.6M–221M weekly downloads and canonical GitHub repos — the heuristic is a false positive on routine version bumps, not a slopsquat signal. No `postinstall` scripts present on any package. All approved.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS] requiring a human-verify checkpoint:** none (all "too-new" flags are routine patch bumps of verified-repo, high-trust packages; planner does not need a checkpoint for these)

## Architecture Patterns

> Macro architecture (local-first, StorageProvider abstraction, sharded manifest, content-addressed media) is fully established in `.planning/research/ARCHITECTURE.md`. The patterns below add the **Phase-1 implementation specifics** flagged for deeper research. Do not duplicate the architecture doc — read it alongside this.

### System Architecture Diagram (Phase 1 spine)

```
                    USER GESTURE (click "Connect Drive")
                              │
                              ▼
              ┌───────────────────────────────┐
              │  GIS Token Client (in page)   │  google.accounts.oauth2.initTokenClient
              │  scope = drive.file           │  → callback{ access_token, expires_in }
              └───────────────┬───────────────┘  token held IN MEMORY ONLY (never persisted)
                              │ access_token (~1h)
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                     UI (React + Konva)                        │
   │   [Connect] [Add Person] [Upload Map Img] [Drag Marker]       │
   │   [Profile Sidebar] [Export] [Import] [Install PWA]           │
   └───────────────┬───────────────────────────┬──────────────────┘
                   │ all reads/writes           │ render
                   ▼                            ▼
   ┌───────────────────────────┐    reads   ┌─────────────────────┐
   │ Repository (typed CRUD)   │◄───────────│ useLiveQuery (Dexie)│
   │ put() → dirty=true,       │            └─────────────────────┘
   │ updatedAt=now, emit event │
   └───────────────┬───────────┘
                   │ writes (SOURCE OF TRUTH, offline-safe)
                   ▼
   ┌───────────────────────────┐
   │ IndexedDB (Dexie)         │  tables: people, maps, markers, media(blobs), meta, syncQueue
   └───────────────┬───────────┘
                   │ dirty set, debounced, ONLY when online + token valid
                   ▼
   ┌───────────────────────────┐    interface    ┌─────────────────────────┐
   │ Sync Engine               │────────────────►│ StorageProvider (iface) │
   │ 1. write new shard files  │  write/read/    │  ┌───────────────────┐  │
   │ 2. write new media blobs  │  list/delete    │  │ DriveProvider     │  │ ← Phase 1
   │ 3. SWAP manifest pointer  │                 │  │ (GIS + REST v3)   │  │
   │ 4. GC orphaned old files  │                 │  ├───────────────────┤  │
   │ (last-write-wins by ts)   │                 │  │ InMemoryFake      │  │ ← tests
   └───────────────────────────┘                 │  └───────────────────┘  │
                                                 └────────────┬────────────┘
                                                              ▼
                                                   User's Google Drive
                                                   /Relation Blueprint/ (VISIBLE folder)
                                                     manifest.json
                                                     entities/people-000.json …
                                                     media/<hash> …
```

### Recommended Project Structure (Phase 1 subset)
```
src/
├── storage/
│   ├── StorageProvider.ts      # interface: ensureFolder/list/read/write/delete/stat
│   ├── drive/
│   │   ├── auth.ts             # GIS token client wrapper (in-memory token, expiry, re-request)
│   │   ├── driveRest.ts        # raw fetch wrappers for Drive REST v3 endpoints
│   │   └── DriveProvider.ts    # implements StorageProvider over driveRest + auth
│   ├── memory/InMemoryProvider.ts  # in-memory fake for tests (lock the interface here first)
│   └── providerFactory.ts
├── db/
│   ├── schema.ts               # Dexie tables (NO blob indexing)
│   └── repository.ts           # typed CRUD, dirty-marking, change events
├── domain/
│   └── types.ts                # Person, MapDoc, Marker, MediaRef, Manifest (+ zod schemas)
├── sync/
│   ├── manifest.ts             # manifest read/parse/validate (zod)
│   ├── serializer.ts           # entities ↔ shard JSON
│   └── syncEngine.ts           # atomic swap, dirty push, pull-on-open, LWW
├── media/
│   ├── mediaManager.ts         # content-address (hash) blob store + upload
│   └── thumbnails.ts           # client-side resize
├── features/
│   ├── connect/                # Drive connect button + status + reconnect prompt
│   ├── person-map/             # Konva stage: image bg + 1 round avatar marker
│   ├── profile/                # sidebar profile (view/edit/delete)
│   └── backup/                 # export + import UI
└── app/
    ├── pwa.ts                  # registerSW (prompt mode) + update flow
    └── App.tsx
```

### Pattern 1: GIS Token Model on a Static Site (the auth spine)

**What:** Acquire short-lived Drive access tokens from the page using GIS; keep the token in memory; treat expiry as a normal, non-destructive event.

**When to use:** All Drive access in Phase 1.

**Exact API (verified this session):**
```typescript
// Source: developers.google.com/identity/oauth2/web/guides/use-token-model
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: GOOGLE_CLIENT_ID,                 // from Google Cloud console
  scope: 'https://www.googleapis.com/auth/drive.file',  // drive.file ONLY
  callback: (resp) => {
    // resp.access_token, resp.expires_in (seconds, ~3599), resp.scope, resp.token_type
    setToken({ value: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 });
  },
  error_callback: (err) => { /* user closed popup / no grant → show Connect state */ },
});

// MUST be called from a user gesture (button click):
tokenClient.requestAccessToken();            // first connect → shows consent
// After token exists, requesting again with prompt:'' MAY return silently if the grant
// is still active, but this is NOT a guaranteed background refresh — design for the
// gesture path. See Pitfall: Silent re-auth.
tokenClient.requestAccessToken({ prompt: '' });

// Revoke on disconnect:
google.accounts.oauth2.revoke(token.value, () => { /* cleared */ });
```

**Token lifecycle rules (non-negotiable):**
- Token lives **in memory only** (a module variable / React state). **Never** write it to IndexedDB/localStorage.
- There is **no refresh token** client-side and **no PKCE** for pure SPAs — re-acquisition is the model, not a fallback. [CITED: PITFALLS.md Pitfall 6]
- Before each Drive call, check `Date.now() < expiresAt - skew(60s)`. If stale, do **not** auto-pop a consent dialog mid-write; mark the sync paused and surface "Reconnect to Drive."
- On any `401 invalid_token` from Drive, drop the token and enter the same paused/reconnect state. [VERIFIED: developers.google.com/identity/oauth2/web/guides/use-token-model — "after the existing token expires and Google API calls return a 401, call requestAccessToken() from a user-driven event"]

### Pattern 2: Atomic Write via Manifest-Pointer Swap (the corruption-proof spine)

**What:** Drive has **no POSIX rename-swap** and `files.update` **overwrites content in place** (a crash mid-`update` can truncate). So atomicity comes from making the manifest the single commit point and writing everything else as new immutable files first.

**The algorithm (the spike's core deliverable):**
```
GIVEN dirty shards S = {people-000.json, ...} and new media blobs B
1. For each dirty shard s in S:
     create a NEW Drive file (uploadType=multipart) → newFileId_s   # immutable, not overwriting old
2. For each new blob b in B:
     create a NEW Drive file media/<hash(b)>            # content-addressed = idempotent
3. Build manifest' = clone(manifest) with:
     - shardPointers[type] = newFileId_s  (swap pointers to the new shard files)
     - version++ , updatedAt = now , per-shard hash+updatedAt
4. COMMIT: write manifest' — choose ONE:
     (a) files.update on the canonical manifest fileId (single small file; window of risk is
         one tiny write), OR
     (b) write manifest-<version>.json as a new file + update a 1-line pointer file last.
   Recommendation: (a) for the skeleton — the manifest is small (<10KB), the in-place
   overwrite window is milliseconds, and a corrupt manifest is recoverable from the rolling
   backup (step 6). Revisit (b) if real-world corruption is ever observed.
5. On manifest success → mark local records synced (dirty=false).
6. ROLLING BACKUP: before overwriting manifest, copy current manifest to
   backups/manifest-<prevVersion>.json; keep last N (e.g. 5). Old orphaned shard files
   are GC'd only AFTER a successful manifest swap (never before).
```
**Why this is atomic enough:** if any step 1–3 fails (crash, 401, quota, network drop), the manifest still points at the **old** shard files → the DB on disk is the last good state, untouched. The only true commit is the manifest write; everything before it is additive and discardable. [VERIFIED: developers.google.com/workspace/drive/api/guides/manage-uploads — files.update is an overwrite; multipart create makes new files]

**Drive REST v3 calls (verified this session):**
```
# Create a new shard or media file (metadata + content in one request):
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
  Authorization: Bearer <access_token>
  Content-Type: multipart/related; boundary=foo
  --foo
  Content-Type: application/json; charset=UTF-8
  { "name": "people-000.json", "parents": ["<appFolderId>"] }
  --foo
  Content-Type: application/json
  <shard bytes>
  --foo--

# Overwrite the manifest IN PLACE (the single commit):
PATCH https://www.googleapis.com/upload/drive/v3/files/<manifestFileId>?uploadType=media
  Authorization: Bearer <access_token>
  Content-Type: application/json
  <manifest bytes>

# Create the visible app folder (once):
POST https://www.googleapis.com/drive/v3/files
  { "name": "Relation Blueprint", "mimeType": "application/vnd.google-apps.folder" }

# Find existing folder/manifest on reconnect:
GET https://www.googleapis.com/drive/v3/files?q=name='Relation Blueprint' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)
```
[VERIFIED: developers.google.com/workspace/drive/api/guides/manage-uploads ; developers.google.com/drive/api/reference/rest/v3/files]

### Pattern 3: Sharded Manifest Sync Reconciliation (open + push)

**What:** `manifest.json` is the only file always loaded on open. It carries `version`, per-shard `{fileId, hash, updatedAt}`, and an `entity→shard` map. Reconciliation compares the cloud manifest to local Dexie `meta`.

```
OPEN:
  read manifest.json (validate with zod)
  for each shard in manifest:
    if manifest.shard.updatedAt > local.meta.shard.updatedAt:  pull shard → upsert into Dexie
    else: leave local (it will be pushed)
  hydrate repository from Dexie

PUSH (debounced, online + token valid):
  collect dirty entities → group by shard → re-serialize affected shards
  run Pattern 2 (write new shards/blobs → swap manifest)
  LWW: single curator, so compare by updatedAt; newest wins (no merge UI needed)
```
For the **skeleton**, one shard per type (`people-000`, `maps-000`, `markers-000`) is sufficient — bucketing logic (200–500/shard) is designed into the manifest shape now but only exercised at scale in later phases. [CITED: ARCHITECTURE.md Pattern 3]

### Pattern 4: Controlled Service-Worker Update (no silent drop of queued writes)

**What:** Use vite-plugin-pwa with `registerType: 'prompt'` so a new SW **waits** and the app shows an "Update available — reload" affordance; never `skipWaiting()` blindly under a running page with a write in flight.

```typescript
// Source: vite-pwa-org.netlify.app/guide/prompt-for-update
// vite.config.ts
VitePWA({
  registerType: 'prompt',
  base: '/relation_blueprint/',         // GitHub Pages project-site base
  manifest: { /* name, icons, start_url: '/relation_blueprint/', scope: '/relation_blueprint/' */ },
  workbox: { /* precache app shell; runtime cache for media GETs */ },
})

// app/pwa.ts
import { registerSW } from 'virtual:pwa-register';
const updateSW = registerSW({
  onNeedRefresh() { showUpdatePrompt(() => { if (!writeInFlight) updateSW(true); }); },
  onOfflineReady() { /* toast: ready offline */ },
});
```
**GitHub Pages base-path rule:** `base`, `start_url`, and `scope` must all be the repo subpath (`/relation_blueprint/`) or the SW won't control the right scope and the precache 404s. [VERIFIED: vite-pwa-org.netlify.app/guide/prompt-for-update ; github.com/vite-pwa/vite-plugin-pwa]

### Pattern 5: Minimal Person-on-Map with Konva (skeleton only)

**What:** Image background + exactly one draggable round photo-avatar marker + click → open sidebar. This is the thinnest correct thread, NOT the Phase-3 editor.

```typescript
// Source: konvajs.org (Image, Group draggable, clipFunc circular crop)
<Stage width={w} height={h}>
  <Layer>
    <KonvaImage image={bgImage} />                    {/* uploaded map background */}
  </Layer>
  <Layer>
    <Group x={marker.x} y={marker.y} draggable
           onDragEnd={(e) => repo.updateMarker(marker.id, { x: e.target.x(), y: e.target.y() })}
           onClick={() => openProfile(marker.personId)}
           clipFunc={(ctx) => { ctx.arc(R, R, R, 0, Math.PI*2); }}>  {/* round crop */}
      <KonvaImage image={avatarThumb} width={2*R} height={2*R} />
    </Group>
  </Layer>
</Stage>
```
No culling/caching needed at one marker — those are Phase-3 concerns (`ROADMAP.md` Phase 3 flag). Just verify react-konva 19.2.5 + React 19.2 + konva 10.3 render together (versions confirmed compatible above).

### Anti-Patterns to Avoid
- **`files.update` as the "save" primitive for the whole DB.** It overwrites in place → a crash truncates. Use the manifest-swap (Pattern 2). [VERIFIED]
- **Persisting the Drive access token or any refresh token to storage.** In-memory only; re-acquire on gesture. [CITED: PITFALLS.md Pitfall 6]
- **`appDataFolder` for the database.** Invisible + deleted on app removal → violates own-your-data + silent data loss. Visible named folder via `drive.file`. [CITED: PITFALLS.md Pitfall 2]
- **Broad `drive` scope "to be safe."** Triggers CASA Tier 2 verification → permanent blocker for a free OSS project. `drive.file` only. [CITED: PITFALLS.md Pitfall 1]
- **base64-embedding photos in entity JSON / indexing blobs in Dexie.** Bloats data + index for zero query benefit. Store blobs unindexed; reference by hash. [CITED: ARCHITECTURE.md Anti-Pattern 2]
- **Blind `skipWaiting()`.** Can swap assets under a running edit. Prompt + only activate when no write in flight. [CITED: PITFALLS.md Pitfall 12]
- **Reading/writing Drive on every user action.** Defeats offline-first; hits rate limits. Local-first, debounced background sync. [CITED: ARCHITECTURE.md Anti-Pattern 3]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth on a static site | Custom OAuth popup / PKCE dance | Google Identity Services token client | GIS handles consent/popup/token; custom flows are insecure and against Google guidance [CITED] |
| IndexedDB access | Raw IndexedDB API | Dexie 4.4 | Transactions, blob storage, indexes, migrations — raw IDB is error-prone [CITED: STACK.md] |
| Reactive UI on local data | Manual change listeners | dexie-react-hooks `useLiveQuery` | Auto re-render on DB change; no event plumbing |
| Service worker + precache | Hand-written SW | vite-plugin-pwa (Workbox) | Precache manifest, runtime caching, update lifecycle [CITED] |
| Runtime data validation | Ad-hoc `if` checks | zod 4 | Validate manifest + Person shape from untrusted cloud/export; one source of schema truth |
| Stable IDs | `Math.random` / timestamps | nanoid | Collision-resistant URL-safe IDs |
| Image thumbnailing | Manual pixel loops | Canvas API / browser-image-compression | Built-in decode/resize/encode; correct color + perf |
| Content addressing | Custom dedupe table | hash bytes → filename | Immutable, auto-deduped media; never re-upload [CITED: ARCHITECTURE.md] |

**Key insight:** In a serverless app the browser must do everything a backend normally would — but almost all of it (auth, storage, caching, validation, image processing) is a solved library problem. The ONLY genuinely custom code in Phase 1 is the **atomic manifest-swap sync engine** and the **StorageProvider interface** — concentrate engineering there and lean on libraries for the rest.

## Runtime State Inventory

> Greenfield phase (first phase, empty repo). Most categories are N/A, but the **external runtime state in the user's Google account** is real and must be planned for.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — empty repo, no prior database. IndexedDB schema created fresh. | None |
| Live service config | **Google Cloud OAuth client + consent screen** — lives in the user's/developer's Google Cloud console, NOT in git. The OAuth Client ID is build-time config (env var); the consent screen + `drive.file` scope + authorized JS origins must be configured manually. | Plan must surface a **prerequisite task**: developer creates an OAuth 2.0 Client ID (type: Web application), adds GitHub Pages origin + localhost to "Authorized JavaScript origins", configures consent screen with `drive.file` scope, publishes (or adds test users). See Environment Availability. |
| OS-registered state | None | None |
| Secrets/env vars | `VITE_GOOGLE_CLIENT_ID` — the OAuth Client ID. **Not a secret** (public clients embed it in the bundle; that is correct and expected for GIS), but it is environment config that must exist at build time. No client secret is used (token model needs none). | Plan adds `.env` with `VITE_GOOGLE_CLIENT_ID`; document for the user. |
| Build artifacts | None yet (no `node_modules`, no `dist`). GitHub Pages deploy target `/relation_blueprint/` base path. | Plan sets Vite `base` + GitHub Actions → Pages. |

**Nothing found in category:** Stored data, OS-registered state, prior build artifacts — confirmed empty by `git status` (only `.claude/` tooling present, no `src/`).

## Common Pitfalls

> Full 13-pitfall catalog is in `.planning/research/PITFALLS.md`. The seven below are the ones that **bite in Phase 1 specifically**; each maps to a success criterion.

### Pitfall 1: Broad `drive` scope → CASA verification wall (SC#1)
**What goes wrong:** Requesting `https://www.googleapis.com/auth/drive` (restricted) forces an annual CASA Tier 2 audit → permanent blocker for a free OSS project.
**How to avoid:** `drive.file` ONLY. The whole DB lives in app-created files, so the app never needs to see files it didn't create.
**Warning signs:** Consent screen says "See and manage all of your Google Drive files"; OAuth config shows scope "Restricted."

### Pitfall 2: `appDataFolder` → invisible + silent total data loss (SC#1)
**What goes wrong:** Hidden folder, deleted when user removes the app → breaks own-your-data, total loss path.
**How to avoid:** Create a **visible named folder** ("Relation Blueprint") via `drive.file`. Verify by opening drive.google.com and seeing the folder.
**Warning signs:** "Where is my data?"; data gone after disconnect.

### Pitfall 3: Treating `files.update` as atomic → corruptible DB (SC#4)
**What goes wrong:** `files.update` overwrites content in place; a crash/401/quota mid-write truncates the live file.
**How to avoid:** Manifest-pointer swap (Pattern 2) — write new immutable shards/blobs first, commit by swapping the small manifest, keep a rolling backup.
**Warning signs:** "DB won't load"; JSON parse error on startup after an interrupted save.

### Pitfall 4: Assuming the access token never expires / silent refresh works (SC#4)
**What goes wrong:** Token dies at ~1h mid-edit; writes start 401-ing; if you write-on-every-action you can half-write the DB.
**How to avoid:** Local-first write queue; never block UI on token; on expiry/401 pause sync and show "Reconnect to Drive"; re-request on user click. Do NOT design around guaranteed silent refresh — it isn't reliable from a static site.
**Warning signs:** Writes failing after the tab's been open an hour; user logged out mid-edit.

### Pitfall 5: PWA storage eviction wipes the offline cache (SC#4, SC#5)
**What goes wrong:** Best-effort storage is evictable; Safari/iOS evicts after 7 days inactivity → unsynced work lost.
**How to avoid:** Call `navigator.storage.persist()` **after a meaningful user action** and **check the boolean result**; surface it; handle `QuotaExceededError`. The cloud sync + export are the backstops if eviction happens anyway.
**Warning signs:** `persist()` never called / result ignored; iOS users losing data after a week.

### Pitfall 6: Export that can't be restored ("export theater") (SC#5)
**What goes wrong:** Export produces a file no importer reads, or photos don't survive the round-trip.
**How to avoid:** Build export AND import together; make the **round-trip a tested automated assertion** (export → wipe IndexedDB → import → deep-equal entities + byte-equal photos). The cloud is the only copy, so this is the safety net for everything.
**Warning signs:** No tested restore path; gallery images missing after restore.

### Pitfall 7: Service-worker update breaks an in-flight write (SC#4, SC#5)
**What goes wrong:** Blind `skipWaiting()` swaps assets under a running page, possibly mid-sync.
**How to avoid:** `registerType: 'prompt'`; activate the new SW only on user action and only when no write is in flight; correct GitHub Pages `base`/`scope`.
**Warning signs:** Mixed-version asset errors right after a deploy; stale app forever.

## Code Examples

### Drive: ensure visible app folder, then write a shard (create) + commit manifest (in-place)
```typescript
// Source: developers.google.com/workspace/drive/api/guides/manage-uploads (verified 2026-06-24)
async function ensureAppFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    "name='Relation Blueprint' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const found = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  if (found.files?.length) return found.files[0].id;
  const created = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Relation Blueprint',
                           mimeType: 'application/vnd.google-apps.folder' }),
  }).then(r => r.json());
  return created.id;
}

async function createFile(token: string, name: string, parent: string,
                          body: Blob, contentType: string): Promise<string> {
  const boundary = 'rb_' + crypto.randomUUID();
  const meta = JSON.stringify({ name, parents: [parent] });
  const pre  = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
             + `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const multipart = new Blob([pre, body, post], { type: `multipart/related; boundary=${boundary}` });
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: multipart });
  if (res.status === 401) throw new TokenExpiredError();
  return (await res.json()).id;
}

async function commitManifest(token: string, manifestId: string, manifest: object): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${manifestId}?uploadType=media`,
    { method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest) });
  if (res.status === 401) throw new TokenExpiredError();   // local stays last-good; do not GC
}
```

### Persist request + quota check
```typescript
// Source: MDN Storage API
async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  const granted = await navigator.storage.persist();  // call after a user action
  if (!granted) console.warn('Storage is best-effort; eviction possible. Nudge user to export.');
  return granted;
}
```

### Client-side round avatar thumbnail (Canvas API, no dep)
```typescript
async function makeThumbnail(file: Blob, size = 96): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
}
```

### Export / restore round-trip (skeleton format)
```typescript
// JSON+base64 bundle — simplest correct skeleton. Flag zip (fflate) as a scale fast-follow.
type Backup = {
  schemaVersion: number;
  manifest: Manifest;
  entities: { people: Person[]; maps: MapDoc[]; markers: Marker[] };
  media: Record<string /*hash*/, string /*base64*/>;   // photos survive the round trip
};
async function exportDb(): Promise<Blob> {
  const media: Record<string,string> = {};
  for (const m of await db.media.toArray()) media[m.hash] = await blobToBase64(m.blob);
  const backup: Backup = { schemaVersion: 1, manifest: await readLocalManifest(),
    entities: { people: await db.people.toArray(), maps: await db.maps.toArray(),
                markers: await db.markers.toArray() }, media };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}
async function importDb(file: Blob): Promise<void> {
  const backup = BackupSchema.parse(JSON.parse(await file.text()));  // zod validation
  await db.transaction('rw', db.people, db.maps, db.markers, db.media, async () => {
    await Promise.all([db.people.clear(), db.maps.clear(), db.markers.clear(), db.media.clear()]);
    await db.people.bulkPut(backup.entities.people);
    await db.maps.bulkPut(backup.entities.maps);
    await db.markers.bulkPut(backup.entities.markers);
    for (const [hash, b64] of Object.entries(backup.media))
      await db.media.put({ hash, blob: await base64ToBlob(b64) });
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gapi.auth2` / Google Sign-In (legacy) | Google Identity Services (GIS) token model | Deprecated; removed | Must use GIS `initTokenClient` [VERIFIED] |
| Refresh token in browser / PKCE SPA flow | Short-lived access token, re-acquire on gesture | Current Google guidance | No persisted credentials; design for re-auth [CITED] |
| Single `database.json` blob | Sharded manifest + per-type shards + content-addressed media | Local-first best practice | Atomic swap + partial sync [CITED: ARCHITECTURE.md] |
| `files.update` as "save" | Manifest-pointer swap (new files + commit small manifest) | Corruption-safety requirement | Interrupted write can't corrupt the DB [VERIFIED] |
| localStorage cache | IndexedDB via Dexie + `navigator.storage.persist()` | Offline-first standard | Holds blobs, resists eviction [CITED] |
| Blind `skipWaiting()` | `registerType: 'prompt'` controlled update | Workbox guidance | No silent asset swap mid-write [VERIFIED] |

**Deprecated/outdated (do not use):** `gapi.auth2`, Google Sign-In legacy, `crypto-browserify` polyfills, `localStorage` for cache, `appDataFolder` for the primary DB, broad `drive`/`drive.readonly` scopes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `requestAccessToken({ prompt: '' })` can return a token *without* a popup while a grant is active, but is NOT a guaranteed background refresh | Pattern 1 | If even gesture-triggered silent re-request fails often, UX needs more frequent explicit reconnects. Mitigated by local-first queue (writes never lost). **Validate in the auth spike crossing the 1h boundary.** |
| A2 | In-place `PATCH` overwrite of the small manifest is "atomic enough" for the skeleton (millisecond window, rolling backup recovers) | Pattern 2 | If observed corruption occurs, switch to write-new-manifest-then-pointer-file (option (b)). Low risk given small file + backup. |
| A3 | Vite 8.1.0 works with vite-plugin-pwa 1.3.0 (CLAUDE.md specified Vite 7; plugin docs list 5/6/7) | Standard Stack | Plugin may need Vite 7. **Mitigation:** pin Vite 7.x if peer-dep errors at install, or verify plugin Vite-8 support. |
| A4 | JSON+base64 export is acceptable for the skeleton's data sizes | Code Examples | base64 inflates ~33% and loads whole DB in memory; fine for skeleton (one person, few photos), needs zip/streaming at scale. Flagged as fast-follow. |
| A5 | iOS PWA install exempts the app from Safari's 7-day eviction | Pitfall 5 | If not, offline data on iOS is at risk after 7 days idle. Mitigated by cloud sync + export. Verify on real iOS hardware if iOS is a target. |
| A6 | `drive.file`-created **folders** are visible in the Drive web UI | Pitfall 2 / SC#1 | Web search confirms app-created files/folders are visible in Drive UI; a contrary nuance exists about access to *contents of a user-picked* folder (not our case — we create it). Low risk; verify visually in the auth spike. |

**These six items are exactly what the ROADMAP research flag means by "spike the full auth + read/write + token-expiry cycle before committing to PLAN."** The planner should include a Wave-0 spike task (or `checkpoint:human-verify`) that exercises A1, A2, and A6 against live Drive before the rest of the spine is built on top.

## Open Questions

1. **Does gesture-triggered `requestAccessToken({prompt:''})` re-issue a token without re-showing consent once granted?**
   - What we know: GIS docs say re-request on 401 from a user event; token model has no background refresh.
   - What's unclear: how often the re-request is fully silent vs. shows account chooser.
   - Recommendation: Spike a >1h session; measure. Either way the local-first queue makes writes safe; this only affects UX friction.

2. **Vite 8 vs vite-plugin-pwa 1.3 peer support.**
   - What we know: plugin docs list Vite 5/6/7; npm latest Vite is 8.1.0.
   - Recommendation: Try Vite 8; if peer/build errors, pin Vite 7.x (still current and fully supported by the plugin).

3. **Best commit variant for the manifest (in-place PATCH vs new-file + pointer).**
   - Recommendation: Ship in-place PATCH + rolling backup for the skeleton; revisit only if corruption is observed. Keep the backup/restore path tested so either variant is recoverable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | Build/dev | (assumed dev machine) | — | none — required to build |
| Google account | SC#1 Drive connect (UAT) | user-supplied | — | none — manual/E2E test needs a real Google account |
| Google Cloud OAuth Client ID + consent screen | SC#1 (all Drive flows) | **must be created by developer** | — | none — **blocking prerequisite**, see below |
| HTTPS origin (GitHub Pages) or `http://localhost` | GIS (requires authorized origin) | localhost for dev; Pages for prod | — | none — GIS rejects unauthorized origins |
| Modern browser (IndexedDB, Storage API, OffscreenCanvas, SW) | Whole spine | evergreen browsers | — | none — Safari has known eviction quirks (Pitfall 5) |

**Missing dependencies with no fallback (BLOCKING — plan must surface as a prerequisite task before any Drive code is exercised):**
- **Google Cloud OAuth Client ID + consent screen configuration.** The developer must, in Google Cloud console: create an OAuth 2.0 Client ID (type **Web application**); add **Authorized JavaScript origins** = `http://localhost:5173` (Vite dev) + the GitHub Pages origin (`https://<user>.github.io`); configure the **OAuth consent screen** requesting only the `drive.file` scope; and either publish the app or add the test user's Google account. The resulting Client ID goes into `VITE_GOOGLE_CLIENT_ID`. Until this exists, SC#1 cannot be verified. This is a one-time human setup step the plan must call out explicitly (likely a `checkpoint:human-verify` or documented prerequisite).

**Missing dependencies with fallback:**
- Real Google account for automated testing → fallback: drive all unit/integration tests against the **InMemoryProvider** fake; gate real-Drive verification behind a manual/E2E checkpoint (see Validation Architecture).

## Validation Architecture

> `nyquist_validation: true` in config — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit/integration) + Playwright (E2E/flows) — per CLAUDE.md dev tools |
| Config file | none yet — **Wave 0** creates `vitest.config.ts` + `playwright.config.ts` |
| Quick run command | `npx vitest run` (or `npx vitest related` per-file) |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-01 | Drive connect, `drive.file`, visible named folder, consent wording | manual/E2E | `playwright test e2e/drive-connect.spec.ts` (semi-manual: real consent) | ❌ Wave 0 |
| STOR-02 | Sharded manifest + per-type shards + media written | unit (fake provider) | `vitest run tests/sync/serializer.test.ts` | ❌ Wave 0 |
| STOR-03 | App reads/writes fully offline against Dexie | integration | `vitest run tests/db/repository.offline.test.ts` | ❌ Wave 0 |
| STOR-04 | Background sync, last-write-wins single curator | unit (fake) | `vitest run tests/sync/reconcile.test.ts` | ❌ Wave 0 |
| STOR-05 | **Atomic write — interrupted write leaves last-good DB intact** | unit (failure injection) | `vitest run tests/sync/atomicity.test.ts` | ❌ Wave 0 |
| STOR-06 | PWA install + `navigator.storage.persist()` requested | E2E + unit | `playwright test e2e/pwa-install.spec.ts` | ❌ Wave 0 |
| DATA-02 | Person with name/photo/phone/description/tags/notes | unit | `vitest run tests/domain/person.test.ts` | ❌ Wave 0 |
| DATA-04 | Edit + delete a person | integration | `vitest run tests/db/repository.crud.test.ts` | ❌ Wave 0 |
| PROF-01 | Click person → sidebar shows all data | E2E | `playwright test e2e/profile.spec.ts` | ❌ Wave 0 |
| PROF-02 | Thumbnail + photo gallery | integration | `vitest run tests/media/thumbnails.test.ts` | ❌ Wave 0 |
| PROF-03 | Photos thumbnailed client-side, stored as media blobs | unit | `vitest run tests/media/mediaManager.test.ts` | ❌ Wave 0 |
| MAP-01 | Map from uploaded background image | E2E | `playwright test e2e/map-create.spec.ts` | ❌ Wave 0 |
| MAP-04 | Person placed as round photo-avatar marker; drag persists | E2E | `playwright test e2e/marker.spec.ts` | ❌ Wave 0 |
| EXPT-01 | Export whole DB (shards + media) | unit | `vitest run tests/backup/export.test.ts` | ❌ Wave 0 |
| EXPT-02 | **Restore reconstitutes DB incl. photos (round-trip)** | unit (round-trip) | `vitest run tests/backup/roundtrip.test.ts` | ❌ Wave 0 |

### The two most important tests for the spine (failure-injection / property)
1. **Atomicity (STOR-05):** Drive the sync engine against the InMemoryProvider with a fault-injecting wrapper that throws (simulating crash/401/quota) at every step boundary of Pattern 2. **Assert: after any injected failure, the manifest still points at the previous shards and the reconstructed DB deep-equals the last committed state.** No partial commit, ever. This is the single highest-value test in the phase.
2. **Export round-trip (EXPT-02):** Property-style — generate N people + maps + markers + photo blobs, `export → clear IndexedDB → import`, then assert **deep-equality of all entities AND byte-equality of every photo blob**. An export that doesn't restore is theater (Pitfall 6).

### Sampling Rate
- **Per task commit:** `npx vitest run` for the touched module(s) (quick; < 30s).
- **Per wave merge:** full `npx vitest run` (all unit/integration green).
- **Phase gate:** full `vitest run && playwright test` green, plus the manual Drive-consent + visible-folder verification (SC#1) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` + `playwright.config.ts` — no test infra exists yet
- [ ] `tests/_fakes/InMemoryProvider.ts` — the fake StorageProvider (lock the interface against it first)
- [ ] `tests/_fakes/faultInjectingProvider.ts` — wraps the fake to throw at step boundaries (for STOR-05)
- [ ] `tests/_fixtures/` — sample image blobs + a generated DB fixture for round-trip tests
- [ ] Framework install: `npm i -D vitest @vitest/ui playwright @playwright/test fake-indexeddb` (fake-indexeddb lets Dexie run under Vitest/node)

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Delegated entirely to Google via GIS token model; app holds no passwords. No app-side auth to build. |
| V3 Session Management | yes | Access token in **memory only**, ~1h lifetime, never persisted; revoke on disconnect. No long-lived session in storage. |
| V4 Access Control | yes (scope) | `drive.file` scope only — least privilege; app can touch only files it created. Never request broad `drive`. |
| V5 Input Validation | yes | **zod-validate** the manifest, Person records, and import bundle on load from cloud/export (untrusted-at-rest data). Reject malformed shapes. |
| V6 Cryptography | no (v1) | App-level encryption explicitly deferred to v2 (SEC-01). Provider-level security only (Drive at-rest). Do NOT hand-roll crypto. Document the boundary in the privacy notice (Phase 2). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Drive access token exfiltration (XSS reads in-memory token) | Information Disclosure | No `dangerouslySetInnerHTML`; sanitize any user-rendered text; token in memory only (short blast radius, ~1h, revocable); CSP on the static host |
| OAuth token persisted to storage | Information Disclosure / Elevation | Never write token to IndexedDB/localStorage; in-memory only [CITED: PITFALLS.md] |
| Over-broad scope grant | Elevation of Privilege | `drive.file` only; consent screen audited to not list "all your Drive files" (SC#1) |
| Malicious/corrupt manifest or import bundle | Tampering | zod schema validation before applying; fall back to rolling backup on parse failure |
| Sensitive personal data at rest with no app encryption | Information Disclosure | Documented v1 boundary (provider security only); minimal default fields; privacy notice at setup (Phase 2). A compromised Drive account exposes data — this is an accepted, disclosed v1 limitation [CITED: PITFALLS.md Pitfall 11] |
| Interrupted write corrupting the only copy | Denial of Service / data loss | Atomic manifest swap + rolling cloud backup + tested export/restore (STOR-05, EXPT-02) |

**Note (privacy/GDPR):** This phase stores real personal data (name, photo, phone) under provider security only. Per `PITFALLS.md` Pitfall 11, the privacy notice + minimal-defaults belong to Phase 2's setup flow; Phase 1 should not over-collect (it ships exactly the DATA-02 default fields) and must keep export/delete trivial so a curator can honor deletion requests.

## Sources

### Primary (HIGH confidence)
- developers.google.com/identity/oauth2/web/guides/use-token-model — `initTokenClient`, callback fields (`access_token`, `scope`), `requestAccessToken()` from user gesture, 401 re-request, `revoke()` (fetched & verified 2026-06-24)
- developers.google.com/workspace/drive/api/guides/manage-uploads — multipart + resumable upload endpoints/headers; `files.update` is overwrite-in-place (fetched & verified 2026-06-24)
- developers.google.com/drive/api/reference/rest/v3/files — files.create/update/list semantics
- npm registry (`npm view`) — all package versions + peer ranges verified 2026-06-24; react-konva 19.2.5 peers react ^19.2.0 + konva ^10.0.0
- `gsd-tools query package-legitimacy check` — registry existence, downloads, repos, no postinstall (2026-06-24)
- Project research: `.planning/research/{STACK,ARCHITECTURE,PITFALLS,FEATURES,SUMMARY}.md` (HIGH — prior verified research, mined heavily)

### Secondary (MEDIUM confidence)
- vite-pwa-org.netlify.app/guide/prompt-for-update + github.com/vite-pwa/vite-plugin-pwa — `registerType: 'prompt'`, `registerSW`, base-path scope (web search, cross-checked with official docs)
- discuss.google.dev / Google Drive API scopes guide — `drive.file`-created files/folders visible in Drive web UI
- MDN — Storage API (`persist`/`estimate`), OffscreenCanvas, IndexedDB (training + standard)

### Tertiary (LOW confidence — flagged in Assumptions Log for spike)
- Silent re-auth reliability of `requestAccessToken({prompt:''})` over a >1h session — needs empirical spike (A1)
- iOS PWA exemption from 7-day eviction — needs real-device verification (A5)
- Vite 8 ↔ vite-plugin-pwa 1.3 peer compatibility — verify at install (A3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions + peer ranges verified against npm registry this session; react-konva/React 19.2/konva 10.3 compatibility confirmed.
- Architecture (Drive/GIS API shapes): HIGH — endpoints, headers, and token API verified against official Google docs this session.
- Atomic-write & silent-re-auth strategies: MEDIUM — patterns are sound and grounded in verified API behavior, but the exact corruption-window and silent-refresh behavior need the empirical spike the roadmap mandates (Assumptions A1, A2).
- Pitfalls: HIGH — drawn from prior verified project research mapped to this phase's success criteria.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (30 days; GIS and Drive REST are stable, but re-verify vite-plugin-pwa/Vite peer ranges and react-konva at install time — fast-moving)
</content>
</invoke>

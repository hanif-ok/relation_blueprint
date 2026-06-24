# Stack Research

**Domain:** Serverless, offline-first PWA for people-tracking & relationship mapping (own-cloud database, Mokuro model)
**Researched:** 2026-06-24
**Confidence:** HIGH (versions verified against npm registry); MEDIUM on capability/licensing/integration claims (verified against official docs + community)

---

## TL;DR — The Prescriptive Stack

| Concern | Pick | Version | License | Why (one-liner) |
|---------|------|---------|---------|-----------------|
| Frontend framework | **React** + Vite | React 19.2.x | MIT | Largest ecosystem for the exact libs we need (react-konva, react-cytoscapejs); Vite static build deploys to GitHub Pages |
| Canvas / map editor | **Konva.js** (+ react-konva) | konva 10.3.x | MIT | Layers + draggable nodes + image backgrounds + transformer, fully MIT — no license key, no watermark |
| Graph view | **Cytoscape.js** | cytoscape 3.34.x | MIT | Purpose-built node-link graph with layouts; viewer-only fits perfectly |
| Client-side search | **MiniSearch** (primary) | minisearch 7.2.x | MIT | Per-field indexing + fuzzy + prefix, scales to thousands/tens-of-thousands; powers the "smith vs blacksmith" field-checkbox feature |
| Offline storage | **Dexie.js** | dexie 4.4.x | Apache-2.0 | Ergonomic IndexedDB wrapper, stores blobs (photos), indexes, good at scale |
| Google Drive | **Google Identity Services (GIS)** token model + Drive REST v3 (`fetch`) | GIS (CDN) | Google free API | Only viable no-backend OAuth from a static site; CORS-enabled REST |
| Mega.nz | **megajs** (browser build) | megajs 1.3.x | MIT | The de-facto maintained Mega JS SDK; works in-browser, E2E encrypted |
| PWA tooling | **vite-plugin-pwa** (Workbox) | vite-plugin-pwa 1.3.x | MIT | Zero-config service worker + manifest + offline precache for static deploy |
| Image/thumbnails | **Canvas API** (+ optional browser-image-compression) | b-i-c 2.0.x | MIT | Generate avatar thumbnails client-side; no server, no paid service |

> **Headline warning:** Do **NOT** use **tldraw** for the editor. Despite being the obvious "diagrams.io-like" candidate, tldraw 5.x **requires a paid license key in production** and shows a "made with tldraw" watermark on the free hobby tier — this violates the FREE/OSS + static-deploy hard constraint. Konva.js is the free replacement.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2.x | UI framework | The relationship-graph and canvas libs we need (`react-cytoscapejs`, `react-konva`) are React-first and best maintained there. Huge ecosystem for PWA + IndexedDB patterns. Compiles to a fully static bundle — no SSR, no backend. |
| Vite | 7.x (latest) | Build tool / dev server | De-facto 2025/2026 standard for static SPAs; trivially deploys to GitHub Pages with a `base` path. First-class `vite-plugin-pwa`. Fast HMR, native ESM. |
| TypeScript | 5.x | Language | The typed-custom-fields + relationship model is the heart of the app; strong typing prevents data-model drift across storage providers. All recommended libs ship types. |
| Konva.js | 10.3.x | Canvas / map editor engine | MIT. First-class **Layers** (matches the "layers in editor" requirement), **draggable** nodes (markers), `Image`/`FillPatternImage` for photo backgrounds and round avatar markers (`clipFunc` for circular crop), `Line`/`Rect`/`Path` for rooms/zones/portals, and a `Transformer` for resize/rotate. Pair with **react-konva** for declarative integration. |
| Cytoscape.js | 3.34.x | Relationship graph view | MIT. Purpose-built node-link graph with built-in layouts (cose, breadthfirst, concentric, dagre via ext), styling, and pan/zoom. Viewer-only graph = its sweet spot. Use **react-cytoscapejs** wrapper. |
| MiniSearch | 7.2.x | Fuzzy field-scoped search | MIT. Indexes documents by named fields; query-time you can restrict `fields` (the per-attribute checkboxes), enable `fuzzy` + `prefix`, and `boost` fields. Scales comfortably to thousands → ~50k records in-browser, far better than Fuse.js at scale. |
| Dexie.js | 4.4.x | IndexedDB wrapper (offline cache) | Apache-2.0. Clean Promise/async API, compound indexes, and stores Blobs (photos) directly. Handles the "degrade gracefully from dozens to thousands" requirement via indexed queries + pagination. Mature, widely used. |

### Storage Provider Integration (the hard part)

| Provider | Approach | Library / API | Key Constraints |
|----------|----------|---------------|-----------------|
| **Google Drive** | Browser **token model** via **Google Identity Services** (`google.accounts.oauth2.initTokenClient`), then call **Drive REST v3** directly with `fetch` (CORS-enabled). | GIS script from `https://accounts.google.com/gsi/client` + raw REST (or optional `gapi.client`) | Access token ~1h, **no refresh token** stored client-side (correct for a static site — refresh tokens can't be kept secret). Re-acquire silently or via prompt on expiry. Use **`drive.file`** scope (app-created files only, non-sensitive → lighter Google verification) or **`appDataFolder`** (hidden app data). `gapi.auth2` is **deprecated** — use GIS. |
| **Mega.nz** | **megajs** browser build; `Storage` class login with email/password (user-supplied), upload/download files in the user's account. | `megajs` 1.3.x | Unofficial but the maintained de-facto SDK. Use the **browser build** (native WebCrypto, not `crypto-browserify` which bloats the bundle). Set `userAgent: null` in browser. Mega is **end-to-end encrypted** (satisfies v1 "provider security" boundary). Free-tier **transfer-quota throttling** applies; logged-in raises limits. No OAuth — credentials entered by the user. |
| **Abstraction** | Define a `StorageProvider` interface (`list/readFile/writeFile/delete/ensureFolder`) implemented twice. App code targets the interface only. | (your code) | Both providers reduce to a flat file/folder store. Keep the DB as JSON manifest + per-entity files + a media folder so both providers can host it identically. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-konva | latest (tracks konva 10) | Declarative Konva in React | The whole map editor; lets you render `<Layer>/<Image>/<Circle>/<Line>` as JSX. |
| react-cytoscapejs | latest | Declarative Cytoscape in React | The graph view component. |
| dexie-react-hooks | latest | Live IndexedDB queries in React | `useLiveQuery` to reactively re-render lists/maps when the local cache changes. |
| vite-plugin-pwa | 1.3.x | Service worker + manifest | Offline precache of the app shell; runtime caching strategy for media. Wraps Workbox. |
| workbox-window | 7.4.x | SW lifecycle in the page | Prompt "new version available", control update flow (pulled in by vite-plugin-pwa). |
| browser-image-compression | 2.0.x | Resize/compress uploaded photos | Generate small avatar thumbnails + cap gallery image size before storing to cloud (saves quota/bandwidth). Optional — Canvas API can do it directly. |
| Fuse.js | 7.4.x | Fuzzy search (fallback) | Only if a given DB is small (≤ a few thousand) and you want maximum typo tolerance; otherwise prefer MiniSearch. |
| nanoid / uuid | latest | Stable entity IDs | Generate IDs for people/locations/groups/relationship-links in the JSON model. |
| zod | 4.x | Runtime schema validation | Validate the typed custom-field values and the on-disk DB manifest when loading from cloud. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite | Build + static export | Set `base: '/<repo>/'` for GitHub Pages project sites. |
| TypeScript + ESLint + Prettier | Quality | Standard. |
| Vitest + Playwright | Unit + E2E | Playwright can drive the OAuth/offline flows; Vitest for the data model + search index logic. |
| GitHub Actions → GitHub Pages | Free static hosting/CI | The whole app is static; Pages is the zero-cost host that matches the constraint. |

---

## Installation

```bash
# Core framework + build
npm create vite@latest relation-blueprint -- --template react-ts
npm install react react-dom

# Canvas editor + graph
npm install konva react-konva
npm install cytoscape react-cytoscapejs

# Offline storage + reactive queries
npm install dexie dexie-react-hooks

# Search
npm install minisearch          # primary
npm install fuse.js             # optional fallback for small DBs

# Storage providers
npm install megajs              # Mega.nz (Google Drive uses GIS script tag + REST, no npm pkg required)

# Images, IDs, validation
npm install browser-image-compression nanoid zod

# Dev: PWA tooling
npm install -D vite-plugin-pwa workbox-window @vite-pwa/assets-generator
```

Add the Google Identity Services script in `index.html`:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Konva.js | **Fabric.js** (MIT) | Fabric is also free/OSS and has built-in object serialization; viable if you prefer its object model. Konva wins on explicit Layer support + React binding maturity. |
| Konva.js | **tldraw** | ❌ Never under these constraints — paid license key required in production. Only if the project ever abandons the free/OSS constraint. |
| Konva.js | **Excalidraw** (MIT) | Great hand-drawn editor, but it's an opinionated app, not a flexible marker/layer placement engine; harder to bend into "photo markers on an image map." |
| React | **Svelte 5** (MIT) | Smaller bundle, excellent for a PWA; choose if the team is Svelte-native. Tradeoff: Konva/Cytoscape React wrappers are more mature than Svelte ones (you'd use the vanilla libs directly). |
| React | **SolidJS** (MIT) | Fastest reactivity, tiny. Same caveat: fewer ready-made wrappers; you'd integrate Konva/Cytoscape imperatively. |
| MiniSearch | **FlexSearch** (Apache-2.0) | If a single DB realistically exceeds ~50k searchable people and search latency matters, FlexSearch is fastest. Overkill for typical "thousands." |
| MiniSearch | **Fuse.js** (Apache-2.0) | Small DBs needing best-in-class typo tolerance and simple per-key weighting. |
| Dexie.js | **idb** (ISC) | Thin IndexedDB Promise wrapper; choose if you want minimal abstraction and to hand-roll schema. Dexie's queries/migrations save real time at scale. |
| Cytoscape.js | **vis-network**, **Sigma.js**, **d3-force** | vis-network (Apache-2.0/MIT) is simpler; Sigma.js (WebGL) scales to huge graphs; d3-force is most customizable but most work. Cytoscape is the best balance for a viewer-only relationship graph. |
| GIS token model | **OAuth Auth-Code + PKCE** | Only viable if a backend (or serverless function) is ever introduced to hold the refresh token — explicitly out of scope here. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **tldraw** (canvas) | Requires a valid **paid license key in production** (HTTPS, non-localhost) or it won't render; hobby tier forces a "made with tldraw" watermark. Violates FREE/OSS + static-deploy constraint. | **Konva.js** (MIT) |
| **gapi.auth2 / Google Sign-In (legacy)** | Deprecated by Google; removed flows. | **Google Identity Services (GIS)** token model |
| **OAuth refresh tokens stored in the browser** | Cannot be kept secret in a static site; security anti-pattern and against Google guidance. | GIS **token model** (re-acquire short-lived access tokens) |
| **`crypto-browserify` polyfill for megajs** | Massively bloats bundle and hurts perf. | megajs **browser build** (native WebCrypto) |
| **Any backend/DB (Firebase, Supabase, custom server)** | Breaks the core "no backend, own your data" premise and the static-deploy constraint. | User's own Google Drive / Mega via the provider abstraction |
| **Fuse.js as the primary index at scale** | Slow + memory-hungry beyond a few thousand records; loads full dataset into memory. | **MiniSearch** (field-scoped, scales) |
| **localStorage for the cache** | ~5MB cap, synchronous, can't hold photo blobs. | **IndexedDB via Dexie** |
| **Mega `mega` (qgustavor) older / unmaintained ports** | Stale; missing browser fixes. | **megajs** 1.3.x |

---

## Stack Patterns by Variant

**If the database stays small (dozens–low hundreds of people):**
- Fuse.js is fine and gives the best typo tolerance with minimal setup.
- Skip a persisted search index; build it in memory on load.

**If the database grows large (thousands+):**
- Use **MiniSearch** with a persisted/rebuildable index; paginate list views; lazy-load gallery images.
- Lean on **Dexie** compound indexes for list/browse queries; never load the whole DB into memory at once.
- Store media as separate files in cloud + cache thumbnails in IndexedDB; fetch full-res on demand.

**If the team prefers a smaller bundle over ecosystem breadth:**
- Swap React → **Svelte 5**; use vanilla `konva` and `cytoscape` imperatively inside components (no React wrappers). Everything else (Dexie, MiniSearch, megajs, GIS, vite-plugin-pwa) is framework-agnostic and unchanged.

---

## Offline / Sync Pattern (single-curator model)

- Treat **IndexedDB (Dexie) as the source of truth at runtime**; the cloud is durable backup/sync target.
- Mark mutated entities with a **dirty flag** + `updatedAt`; a background sync pushes dirty records to the active provider when online.
- Because there is exactly **one curator per database**, conflict resolution is **last-write-wins** by `updatedAt` — no CRDTs/OT needed (multi-user is out of scope).
- vite-plugin-pwa precaches the app shell so the app **opens and works offline**; reads hit Dexie, writes queue until reconnect.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| konva 10.3.x | react-konva (matching major) | Pin react-konva to the line that targets konva 10. |
| cytoscape 3.34.x | react-cytoscapejs | Wrapper is thin; tracks cytoscape 3.x. |
| dexie 4.4.x | dexie-react-hooks | Hooks package versioned alongside Dexie 4. |
| vite-plugin-pwa 1.3.x | Vite 5/6/7 + workbox-window 7.x | Plugin bundles Workbox; keep workbox-window aligned with the Workbox major the plugin uses. |
| React 19.2.x | react-konva, react-cytoscapejs | Both support React 19; verify peer ranges at install. |
| megajs 1.3.x | Vite browser build | Import the browser entry; provide WebCrypto (default in browsers). |

---

## Known Limitations / Risk Flags (for roadmap)

1. **Google access-token lifetime (~1h) + no client-side refresh token** → the storage layer must handle silent re-auth and token expiry gracefully. Flag the Drive-auth phase for deeper spike.
2. **Google OAuth verification & consent screen** → `drive.file`/`appDataFolder` are non-sensitive (lighter review), but the app still needs a published OAuth consent screen; plan for Google's review timeline.
3. **megajs is unofficial** → API stability and Mega's anti-abuse/quota behavior are external risks; abstract it behind the provider interface so it can be swapped. Flag the Mega phase for a spike (real upload/download in-browser, quota behavior).
4. **Mega has no OAuth** → users type credentials into the app; document the trust model (E2E encrypted, single-user, own-cloud).
5. **Large media in IndexedDB** → cap thumbnail sizes; lazy-load galleries; watch browser storage quotas (Storage API `navigator.storage.estimate()`).
6. **Konva is not a full vector editor** → matches scope (PROJECT.md explicitly excludes diagrams.io-grade beziers/advanced connectors). Data-driven connectors are drawn from relationship data, not freehand — good fit.

---

## Sources

- npm registry API (registry.npmjs.org) — **latest versions + licenses verified 2026-06-24** (HIGH): tldraw 5.1.1, konva 10.3.0, cytoscape 3.34.0, fuse.js 7.4.2, dexie 4.4.4, megajs 1.3.10, minisearch 7.2.0, flexsearch 0.8.212, vite-plugin-pwa 1.3.0, workbox-window 7.4.1, browser-image-compression 2.0.2, react 19.2.x, svelte 5.56.x, solid-js 1.9.13, idb 8.0.3.
- [tldraw License docs + blog](https://tldraw.dev/community/license) — production license key + watermark requirement (MEDIUM).
- [Google: Use the token model (GIS)](https://developers.google.com/identity/oauth2/web/guides/use-token-model) and [Migrate to GIS](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis) — browser token flow, no stored refresh token, CORS REST (MEDIUM).
- [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — `drive.file`/`appDataFolder` (MEDIUM).
- [megajs npm + docs](https://mega.js.org/docs/1.0/tutorial/install) — browser build, login/upload/download, userAgent caveat (MEDIUM).
- [npm-compare: flexsearch vs fuse.js vs minisearch](https://npm-compare.com/elasticlunr,flexsearch,fuse.js,minisearch) and [Mattermost: best JS search packages](https://mattermost.com/blog/best-search-packages-for-javascript/) — performance/field-scoping tradeoffs (MEDIUM).
- Konva official docs (konvajs.org) — Layers, draggable, FillPatternImage, Transformer (MEDIUM, from training + version-verified).

---
*Stack research for: serverless offline-first own-cloud people/relationship-mapping PWA*
*Researched: 2026-06-24*

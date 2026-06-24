# Pitfalls Research

**Domain:** Serverless / client-side own-cloud PWA (Mokuro model) for people-tracking & relationship mapping — canvas map editor + node-link graph + field-scoped fuzzy search, storing the whole DB in the user's Google Drive or Mega.nz
**Researched:** 2026-06-24
**Confidence:** MEDIUM (provider/API mechanics cross-checked against official Google & MDN docs = HIGH; perf thresholds and Mega specifics = MEDIUM)

> Reading note for the roadmap: the single most architecture-defining finding here is **Pitfall 1 (Drive scope choice)**. It cascades into verification cost, the "you can see your data" promise, and whether this project is even viable as a free OSS static site. Resolve it before anything else.

## Critical Pitfalls

### Pitfall 1: Choosing the broad Google `drive` scope and getting trapped in restricted-scope verification

**What goes wrong:**
The team picks the full `https://www.googleapis.com/auth/drive` scope so the app can "see all the user's files." This is a **restricted** scope. To ship past 100 users the app must pass Google's restricted-scope OAuth verification, which requires an annual **CASA Tier 2 security assessment** (typically 2–6 months, costs ranging from $0 self-serve to thousands via a third-party assessor) and re-verification every 12 months. For a free, OSS, no-revenue project this is effectively a permanent blocker — and a recurring obligation a hobby project cannot sustain.

**Why it happens:**
"Store the whole database in Drive" sounds like it needs full Drive access. It does not. The `drive.file` scope (per-file access to files the app created or the user explicitly opened) is **non-sensitive** and avoids verification entirely, because the app never sees files it didn't create.

**How to avoid:**
Architect so the **entire database lives in app-created files** (a single visible app folder the app creates and owns). Use only `drive.file`. Never request `drive`, `drive.readonly`, or `drive.metadata`. If you ever feel you need broader scope, that's a design smell — re-scope the feature instead.

**Warning signs:**
Any requirement that needs to read files the app didn't create; the consent screen lists "See and manage all of your Google Drive files"; the OAuth config shows the scope flagged "Restricted."

**Phase to address:**
Storage / cloud-connect foundation phase (first persistence phase). Lock the scope decision in the PLAN's success criteria.

---

### Pitfall 2: Using `appDataFolder` for the database (hidden + deleted on uninstall)

**What goes wrong:**
The hidden `appDataFolder` looks ideal — it's app-private and doesn't clutter the user's Drive. But its contents are **invisible to the user**, and Google deletes the entire appDataFolder **when the user removes the app from their Drive**, and the user can manually delete it too. For an app whose entire premise is "you own and can see your data," this both breaks the promise and creates a silent total-data-loss path.

**Why it happens:**
It's the "clean" choice and is heavily promoted for app config/backup blobs. The destruction-on-uninstall and invisibility characteristics are buried in the docs.

**How to avoid:**
Store the DB in a **visible, named folder** the app creates via `drive.file` (e.g. "Relation Blueprint"). The user can see it, back it up, and copy it. Treat the cloud copy as user-owned and user-visible by design.

**Warning signs:**
Users asking "where is my data, I can't find it in Drive"; data vanishing after a user "disconnected" the app; restore flows that only work while the OAuth grant is live.

**Phase to address:**
Storage foundation phase. Verify by confirming the DB folder is visible in the Drive web UI.

---

### Pitfall 3: MEGA has no OAuth — you must handle the user's raw password in the browser

**What goes wrong:**
Unlike Drive, MEGA offers **no OAuth / delegated-auth flow** (it's a long-standing open request, `meganz/sdk` #2575). Any third-party app must take the user's actual MEGA **email + password** and derive keys client-side. Storing/handling real account credentials in a browser app is a serious security liability and a trust problem — and it has no parity with the clean Drive consent flow.

**Why it happens:**
The team designs the cloud abstraction assuming both providers behave like Drive (token-based consent). MEGA's model is fundamentally different.

**How to avoid:**
- Treat MEGA as a **second-class / opt-in** provider, not co-equal in the MVP — or defer it.
- Never persist the MEGA password. Derive the session key, keep only the session token in memory (or, at most, MEGA's own session id), and require re-login rather than storing the password.
- Make the credential-handling boundary explicit and warn the user.
- Keep the storage layer behind a provider interface so Drive ships first and MEGA plugs in without reshaping the app.

**Warning signs:**
A "remember my MEGA password" checkbox; password sitting in IndexedDB/localStorage; the storage interface assuming an OAuth token for all providers.

**Phase to address:**
Storage-provider abstraction phase; MEGA likely a **separate, later** phase (or deferred). Flag for deeper security research.

---

### Pitfall 4: Single big JSON DB file corrupted by a partial / interrupted write

**What goes wrong:**
The "whole database is one JSON file" model means **one bad write destroys everything**. A tab close, crash, quota error, or network drop mid-write leaves a truncated file. With only the cloud copy, that's total loss. IndexedDB transactions are atomic *per transaction* but give **no cross-tab isolation** — two open tabs can corrupt shared state and are never rolled back.

**Why it happens:**
Single-file JSON is the simplest possible persistence and works flawlessly in dev with one tab and fast disk. Corruption only shows up under crashes, multi-tab use, and large files.

**How to avoid:**
- **Atomic write pattern:** write to a temp file/record, then swap; never overwrite the live DB in place.
- **Keep the previous good version** (rolling N backups) so a corrupt write is recoverable.
- **Chunk the database** (per-entity-type files, or per-record) so one corrupt write loses a record, not the whole DB. This also helps sync and load performance (see Pitfall 8).
- **Single-tab guard** via the Web Locks API or a BroadcastChannel leader-election; warn or go read-only in secondary tabs.
- Validate JSON on read; if parse fails, fall back to last-good copy.

**Warning signs:**
"My database won't load" reports; JSON parse errors on startup; data differing between two open tabs.

**Phase to address:**
Storage foundation phase (atomic writes + versioned backups); revisit during scale/perf phase (chunking).

---

### Pitfall 5: The cloud is the only copy — no server backup, no version history

**What goes wrong:**
By design there is no backend, so if the single cloud copy is corrupted, the account is lost/locked, the user revokes access, MEGA password is forgotten, or quota fills mid-write, the data is **gone**. Users assume "it's in the cloud, so it's backed up" — but it isn't, in any meaningful sense.

**Why it happens:**
The Mokuro/own-cloud model deliberately removes the server safety net; teams under-invest in the export/versioning that's supposed to replace it.

**How to avoid:**
- Ship **whole-database export** as a first-class, early feature (it's already a requirement) — and make it a portable, self-contained archive (JSON + photos).
- **Keep rolling versioned copies in the cloud folder** (timestamped), not just one live file.
- **Prompt/automate periodic export** and surface "last exported N days ago" nudges.
- Make **import/restore from export** exist and be tested before launch — an export you can't restore is theater.

**Warning signs:**
No tested restore path; export produces a file no importer reads; only one copy of the DB ever exists in the cloud.

**Phase to address:**
Export/backup phase — and pull it **earlier** than feels natural; it's the safety net for every other storage pitfall.

---

### Pitfall 6: OAuth token lifecycle in a static site (no place to keep a refresh token)

**What goes wrong:**
Google OAuth does **not support PKCE for pure-JS SPAs**, and there's no server to safely hold a long-lived refresh token. Teams try to stash a refresh token in localStorage (exfiltration risk; Google flags public clients) or assume a token lasts forever, then writes silently start failing with 401s after ~1 hour, mid-edit, risking the partial-write corruption of Pitfall 4.

**Why it happens:**
OAuth tutorials assume a confidential server client. The static-site reality (short-lived access tokens, frequent re-consent) is different and under-documented.

**How to avoid:**
- Use **Google Identity Services (GIS) token flow** with short-lived access tokens; re-request silently when possible, re-consent when not.
- Treat token expiry as a normal event: **block/queue writes when no valid token**, never write half a DB, surface a clear "reconnect" state.
- Don't persist long-lived refresh tokens in browser storage.

**Warning signs:**
Writes failing after the app's been open an hour; users logged out unexpectedly mid-edit; refresh token sitting in localStorage.

**Phase to address:**
Cloud-connect / auth phase. Verify with a long-running session test that crosses the access-token expiry boundary.

---

### Pitfall 7: PWA storage eviction silently deletes the offline cache

**What goes wrong:**
PWA storage is **best-effort by default** — the browser can evict IndexedDB/Cache under storage pressure. **Safari/iOS evicts after 7 days of inactivity.** A user who works offline, hasn't synced, and gets evicted loses unsynced work with no warning.

**Why it happens:**
`navigator.storage.persist()` isn't called, or its result isn't checked. Devs assume "I wrote it, it's there." It is — until it isn't.

**How to avoid:**
- Call `navigator.storage.persist()` early (ideally after a meaningful user action so the grant is more likely) and **check the boolean result**.
- Monitor `navigator.storage.estimate()`; warn before quota.
- Wrap all writes in try/catch for `QuotaExceededError`.
- The export/versioning of Pitfall 5 is the backstop when eviction happens anyway.
- Encourage sync-on-reconnect so the cloud (not just local cache) holds the latest.

**Warning signs:**
`persist()` never called or its return ignored; users on iOS losing data after a week; QuotaExceeded not handled.

**Phase to address:**
PWA/offline shell phase. Verify persistence is requested and the result is logged/surfaced.

---

### Pitfall 8: Performance cliff in the canvas map editor at hundreds–thousands of markers

**What goes wrong:**
Canvas libraries (Konva) are smooth with a few hundred shapes but **need explicit optimization past that**. Thousands of photo-avatar markers with per-shape event listeners, shadows, and no culling drop to single-digit FPS, especially during drag/zoom.

**Why it happens:**
It's fast in demos with 20 markers. The cost is per-shape hit-testing, redraws, and image decoding, which only bites at scale.

**How to avoid:**
- **Cache avatars as rasterized images** (Konva shape caching); don't recompose per frame.
- **Viewport culling** — only render markers in view.
- `layer.listening(false)` on non-interactive layers; keep layers to ~3–5.
- Avoid text shadows/strokes per marker; batch redraws.
- Consider a WebGL renderer (PixiJS) if marker counts routinely exceed a few thousand.

**Warning signs:**
Jank when dragging the canvas with many markers; FPS drop as a map fills up; CPU spikes on zoom.

**Phase to address:**
Map editor phase (build culling/caching in from the start, not as a retrofit); validate at the scale target (thousands).

---

### Pitfall 9: Graph view collapses on force-directed layout at scale

**What goes wrong:**
SVG/D3 and naive canvas force-directed graphs degrade at **low hundreds of nodes**. Running a live force simulation on thousands of relationship nodes freezes the UI; the bottleneck is the **layout computation**, not just rendering.

**Why it happens:**
D3 force layouts are the default tutorial choice and look great with 50 nodes. Layout is O(n²)-ish per tick and runs on the main thread.

**How to avoid:**
- Use a **WebGL graph renderer (Sigma.js)** for thousands of nodes; Cytoscape.js is fine to ~5k–50k.
- Run layout in a **web worker** and/or **precompute and cache node positions**; don't re-simulate on every open/interaction.
- Offer level-of-detail / filtering (graph is viewer-only per scope, which helps).

**Warning signs:**
UI freezes when opening the graph on a large DB; layout "settling" takes seconds; main thread blocked.

**Phase to address:**
Graph-view phase. Pick the renderer based on the scale target up front.

---

### Pitfall 10: Client-side search index that doesn't scale (wrong library / rebuilt every load)

**What goes wrong:**
Fuse.js (no inverted index, scans all objects with fuzzy matching) is great for typo tolerance but **slow on large datasets**; at thousands of multi-field records, search lags and the index eats memory. Rebuilding the index on every page load adds startup cost.

**Why it happens:**
Fuse.js is the most-recommended "fuzzy search" library and works instantly with 50 records.

**How to avoid:**
- For the field-scoped search at scale, prefer an **inverted-index library (FlexSearch or MiniSearch)** with **per-field indexes** (which also cleanly powers the per-attribute checkbox feature). MiniSearch is fine below ~50k records; FlexSearch for raw speed/memory.
- **Persist/serialize the index** (IndexedDB) and rebuild incrementally on entity changes, not from scratch each load.
- Lazy-load the index; don't block first paint.

**Warning signs:**
Search latency growing with DB size; high memory on the search page; index rebuild on every refresh.

**Phase to address:**
Search phase. Verify search latency at the thousands-of-entities target.

---

### Pitfall 11: Privacy/legal exposure of a dossier on real people (even single-user)

**What goes wrong:**
The app builds structured profiles of **real identifiable people** — photos, phone numbers, physical descriptions, relationships. Under GDPR (and similar laws) photos of identifiable people and physical descriptions are **personal data**; combined name+phone+address+photo is a clear dossier, and the curator may be a data controller with obligations. "Single-user, in your own cloud" reduces *our* exposure but does not make the **user's** activity automatically lawful, and v1 explicitly has **no app-level encryption** (provider security only) — so a shared/compromised Drive or MEGA account exposes everything.

**Why it happens:**
"It's single-user and in their own cloud" is treated as a complete answer to privacy. It addresses *our* server-side risk, not the sensitivity of the data at rest or the user's responsibilities.

**How to avoid:**
- **Don't over-collect by default**: ship minimal default fields; physical-description/sensitive fields are user-added, not pushed.
- Surface a clear, honest **privacy/sensitivity notice** at setup: data is real personal data, stored under provider security only, no app-level encryption in v1, you are responsible for it.
- Keep app-level encryption a **named deferred item** with a clear upgrade path (don't architect it out).
- Avoid any feature (facial recognition, etc.) that escalates data into GDPR "special category."
- Make export/delete trivial so a curator can honor a deletion request.

**Warning signs:**
Default schema pushing sensitive fields; no privacy notice; assumption that "own cloud = no privacy concerns"; feature requests drifting toward biometric/recognition.

**Phase to address:**
Entity-model phase (minimal defaults) + onboarding/setup phase (privacy notice). Note app-level encryption as a future milestone.

---

### Pitfall 12: Service-worker update trap breaking the running app

**What goes wrong:**
A new service worker either waits forever (users stuck on a stale precached app) or `skipWaiting()` swaps assets **under a running page**, breaking an in-progress edit — and with single-file JSON, possibly mid-write.

**Why it happens:**
SW lifecycle is unintuitive; teams either never call skipWaiting (stale forever) or call it blindly (breaks active sessions).

**How to avoid:**
- Use a **controlled update flow**: detect the waiting SW, show an "Update available — reload" prompt, and only activate on user action (or when no unsaved work).
- Version the precache; never serve half-old/half-new assets.
- Don't activate a new SW while a write is in flight.

**Warning signs:**
Users on old versions after deploys; mysterious breakage right after a deploy; mixed-version asset errors in console.

**Phase to address:**
PWA shell phase. Verify with a deploy-while-open test.

---

### Pitfall 13: Scope creep dissolving the MVP (rich feature set, no backend to lean on)

**What goes wrong:**
The feature list is large — layered map editor, nested map-groups, four entity types, typed custom fields, data-driven connectors, graph view, field-scoped fuzzy search, two cloud providers, offline sync, export. Trying to build it all at full fidelity at once, with **no backend to absorb complexity**, stalls the project before a usable slice ships. Each "small" addition (a full vector editor, geo tiles, time/history, multi-user, import) is a trap explicitly listed Out of Scope for good reason.

**Why it happens:**
The vision is coherent and every feature feels essential; "while I'm in here" additions accrete. Client-side-only means complexity that a server would hide now lives in the app.

**How to avoid:**
- **Treat the PROJECT.md Out-of-Scope list as a contract** — re-adding requires explicit justification (the doc even instructs this).
- Sequence a **thin vertical slice first**: one provider (Drive/`drive.file`), one entity type (People), place-on-map, basic profile, export — prove the storage+offline+atomic-write spine before breadth.
- Defer MEGA, graph view, and custom-field type explosion until the spine is solid.
- Guard against the named traps: full vector editor, geo tiles, time/history, multi-user sync, structured import.

**Warning signs:**
PLANs that touch storage, editor, graph, and search in one phase; "let's also add…" referencing an Out-of-Scope item; no working end-to-end slice after several phases.

**Phase to address:**
Roadmap structure itself — enforce vertical-slice sequencing and keep Out-of-Scope items out.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Whole DB as one JSON file | Trivial to implement | Corruption = total loss; slow load; no partial sync | Earliest prototype only; chunk before real data |
| `appDataFolder` for storage | "Clean," app-private | Invisible to user; deleted on uninstall; breaks own-your-data promise | Never for the primary DB |
| Broad `drive` scope "to be safe" | Fewer scope headaches now | Restricted-scope verification + annual CASA; 100-user cap | Never for this project |
| Store OAuth refresh token / MEGA password in localStorage | "Stay logged in" UX | Exfiltration risk; flagged public client; credential theft | Never; use in-memory short-lived tokens |
| Fuse.js for all search | Instant fuzzy search in dev | Slow + memory-heavy at thousands of records | Small datasets / early demo only |
| D3 force layout for graph | Beautiful with tens of nodes | Freezes at hundreds; main-thread bound | Tiny graphs / proof of concept |
| Skip `navigator.storage.persist()` | Less code | Silent eviction; data loss (esp. iOS 7-day) | Never for an offline-first app |
| `skipWaiting()` always | Users get updates fast | Breaks running sessions / in-flight writes | Only with an update-prompt + no unsaved work |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Drive OAuth | Requesting broad `drive` scope | Use `drive.file`; keep DB in app-created visible files |
| Google Drive storage | Using hidden `appDataFolder` | Visible named app folder via `drive.file` |
| Google Drive tokens | Persisting refresh token in browser | GIS short-lived access tokens; re-consent; queue writes when no token |
| Google Drive API | No backoff on 403/429 | Exponential backoff; debounce writes; never partial-write on rate-limit |
| MEGA (megajs) | Treating it like Drive's OAuth; storing password | Provider abstraction; in-memory session only; opt-in/second-class; never store password |
| IndexedDB | Assuming cross-tab isolation | Web Locks / leader election; single-writer guard |
| Service Worker | Blind skipWaiting or never updating | Versioned precache + user-prompted controlled update |
| Storage API | Not requesting/checking persistence | `persist()` early + check result; `estimate()` + QuotaExceeded handling |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Uncached canvas markers, no culling | Drag/zoom jank | Shape caching, viewport culling, listening(false) | A few hundred → low thousands of markers |
| Live force-directed graph layout | UI freeze opening graph | WebGL renderer (Sigma.js), worker layout, cached positions | Low hundreds of nodes (SVG/D3); ~5k–50k (Cytoscape) |
| Fuse.js full-scan fuzzy search | Search latency grows with DB | Inverted-index lib (FlexSearch/MiniSearch), per-field, persisted | Several thousand multi-field records |
| Rebuilding search index every load | Slow startup, high memory | Serialize index to IndexedDB, incremental updates | Grows with record count |
| Loading entire JSON DB + all photos eagerly | Slow first paint, memory bloat | Chunk DB; lazy-load photos/galleries; thumbnails separate from full images | Hundreds of entities with photos |
| Syncing all photos as one blob | Huge transfers, quota spikes | Per-photo files, sync only changed binaries, content-hash dedupe | Many large images |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Persisting MEGA email/password in browser | Full account compromise | Never store; in-memory session token only; warn user |
| Long-lived refresh token in localStorage | Token exfiltration → Drive access | Short-lived access tokens; no persisted refresh token |
| Over-broad Drive scope | Access to user's entire Drive = bigger breach blast radius | `drive.file` only |
| No privacy notice for real-people data | User unknowingly builds unprotected personal-data dossier (GDPR) | Honest setup notice; minimal default fields; easy delete/export |
| Assuming "own cloud" = secure | Shared/compromised Drive/MEGA exposes all (no app-level encryption in v1) | Document the boundary; keep app-level encryption as a planned upgrade |
| Photos escalated to biometric use | GDPR special-category data | Don't add facial recognition / matching features |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent write failures on token expiry | User loses work, doesn't know why | Clear "reconnect" state; queue/block writes; never partial-write |
| No "where's my data" visibility | User distrusts the own-your-data promise | Visible named cloud folder; show sync status + last-export time |
| Hidden eviction / no backup nudges | Sudden data loss feels like a bug | persist() prompt, "last exported N days ago" nudges |
| Map/graph jank at scale | App feels broken on a real-sized DB | Culling/WebGL/lazy-load from the start |
| Sync conflicts surfacing as overwrites | Edits silently lost across devices/tabs | Single-writer guard; warn on stale local copy; the model is single-curator, lean into it |

## "Looks Done But Isn't" Checklist

- [ ] **Drive auth:** Works in a fresh session — but verify the scope is `drive.file` and the consent screen does NOT say "all your Drive files."
- [ ] **DB persistence:** Saves fine — but verify atomic write + a recoverable previous version exists, and a mid-write tab-close doesn't corrupt the DB.
- [ ] **Offline mode:** Loads offline — but verify `navigator.storage.persist()` was requested AND granted, and QuotaExceeded is handled.
- [ ] **Export:** Produces a file — but verify **import/restore actually reconstitutes the DB including photos** (round-trip test).
- [ ] **Token handling:** Stays logged in — but verify behavior **after access-token expiry (~1 hr)**: writes blocked/queued, not silently failing.
- [ ] **MEGA:** Connects — but verify the password is **never persisted** and a session-only model works.
- [ ] **Map editor:** Smooth in demo — but verify FPS with **thousands of markers**, not 20.
- [ ] **Graph view:** Renders — but verify it opens without freezing on a **large** relationship set.
- [ ] **Search:** Returns results — but verify latency and memory at **thousands of multi-field records**, and per-field scoping actually narrows the index.
- [ ] **Service worker:** Updates — but verify a deploy-while-open doesn't break an in-progress edit.
- [ ] **Multi-tab:** Works in one tab — but verify two open tabs don't corrupt the shared DB.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Chose broad `drive` scope, hit verification wall | HIGH | Re-architect to app-created files only; switch to `drive.file`; re-test all storage paths |
| Used `appDataFolder`, users lost data on uninstall | HIGH | Migrate to visible folder; cannot recover already-deleted data — only export backups can |
| Single JSON file corrupted, no versioning | HIGH | Restore from last export if one exists; otherwise data is lost → why versioning/export must precede real use |
| Token expiry caused partial write | MEDIUM | Restore last-good version; add write-queue + atomic-write guard going forward |
| Canvas/graph perf cliff discovered late | MEDIUM | Retrofit culling/caching or swap to WebGL renderer; isolatable to the editor/graph module |
| Search too slow at scale | LOW–MEDIUM | Swap Fuse.js → FlexSearch/MiniSearch with per-field indexes; persist index |
| Storage evicted (iOS 7-day) | MEDIUM | Restore from cloud sync/export; add persist() + sync-on-reconnect |
| MEGA password stored, leaked | HIGH | Force re-auth, purge stored creds, move to session-only; reputational damage |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Broad Drive scope trap | Storage/cloud-connect foundation | Consent screen shows only `drive.file`; no restricted-scope flag |
| 2. appDataFolder data loss | Storage foundation | DB folder visible in Drive web UI |
| 3. MEGA no-OAuth / credential handling | Storage abstraction + later MEGA phase (or defer) | Password never persisted; session-only login works |
| 4. Single-JSON corruption / multi-tab | Storage foundation; revisit at scale phase | Atomic write + prior version; tab-close & two-tab tests pass |
| 5. Cloud-is-only-copy data loss | Export/backup phase (pulled early) | Export → import round-trip reconstitutes DB + photos |
| 6. OAuth token lifecycle | Cloud-connect / auth phase | Long-session test crossing token expiry; writes queued not lost |
| 7. PWA storage eviction | PWA/offline shell phase | persist() requested + granted; QuotaExceeded handled |
| 8. Canvas editor perf cliff | Map editor phase | FPS acceptable at thousands of markers |
| 9. Graph layout collapse | Graph-view phase | Opens without freeze on large DB; WebGL/worker layout |
| 10. Search index scale | Search phase | Latency/memory acceptable at thousands of records; per-field scoping works |
| 11. Real-people privacy/legal | Entity-model + onboarding phases | Minimal default fields; privacy notice shown; easy delete/export |
| 12. Service-worker update trap | PWA shell phase | Deploy-while-open doesn't break active edit |
| 13. Scope creep | Roadmap structure (cross-cutting) | Vertical-slice sequencing; Out-of-Scope items stay out |

## Sources

- Google for Developers — OAuth 2.0 for Client-side Web Apps; Sensitive & Restricted scope verification; Choose Drive API scopes; Store application-specific data (appDataFolder); Usage limits (rate limits / 429) — official docs (HIGH for scope/quota/appDataFolder mechanics)
- Unipile — "Google OAuth 100 User Limit" (2026); deepstrike.io / Orbis / Truto — CASA Tier 2 assessment cost & timeline (MEDIUM)
- meganz/sdk Issue #2575 "OAuth authorization support"; megajs (mega.js.org docs), qgustavor/mega README — MEGA no-OAuth, browser crypto/bundle limitations (MEDIUM)
- MDN — Storage quotas and eviction criteria; navigator.storage.persist/estimate (HIGH for storage-API behavior). RxDB — "Downsides of Offline-First"; "IndexedDB max storage limit" (MEDIUM). pesterhazy IndexedDB gotchas gist; dev.to "Breaking IndexedDB consistency"; "Crash-safe JSON atomic writes" (MEDIUM)
- Konva.js performance docs (All Performance Tips, Shape Caching, Layer Management) + react-konva issue #491 (MEDIUM–HIGH for Konva guidance)
- PkgPulse "Cytoscape vs vis-network vs Sigma.js 2026"; NetV.js paper; Sigma.js docs — graph perf thresholds (MEDIUM)
- npm-compare / Mattermost / FlexSearch & Fuse.js docs — search library perf & memory (MEDIUM)
- GDPR.eu, VeraSafe — photos & physical descriptions as personal data; data-controller obligations (MEDIUM for legal framing)
- Mokuro reader projects (bbonenfant, hanabira) — local-first "persist your storage" + export pattern, IndexedDB-bound data (MEDIUM)

---
*Pitfalls research for: serverless own-cloud people-mapping PWA (maps + graph + field-scoped search)*
*Researched: 2026-06-24*

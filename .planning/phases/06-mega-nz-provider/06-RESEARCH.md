# Phase 6: Mega.nz Provider - Research

**Researched:** 2026-08-06
**Domain:** Client-side storage-provider adapter (megajs browser SDK) behind a locked StorageProvider seam; session/credential lifecycle; quota surfacing
**Confidence:** HIGH (code seams + megajs API verified via Context7/official docs + registry)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-06-01 (session persistence):** The Mega **session blob is ALWAYS persisted** to IndexedDB so a page reload reconnects silently (no re-login). The **password is NEVER persisted** — it lives in memory only during the login call and is discarded immediately after megajs derives the session.
- **D-06-02 (criterion amendment — SECURITY-GATE CRITICAL):** D-06-01 deliberately amends success-criterion 2 ("session token in memory only"). The user made this call with full disclosure that a persisted Mega session is a **full-account bearer credential** (Mega login grants access to the entire account — there is NO scoped equivalent of Drive's `drive.file`). The Phase 6 security gate MUST record persisted-session as an **ACCEPTED design decision, not a defect or open threat**. Do not "fix" it back to in-memory-only.
- **D-06-03 (disconnect wipes it):** Explicit Disconnect MUST erase the persisted session from IndexedDB (server-side logout best-effort via megajs).
- **D-06-04 (disclosure):** The security warning MUST disclose that the session "stays connected on this device."
- **D-06-05 (independent databases):** Each provider holds its own independent database. No cross-provider migration/copy code is built.
- **D-06-06 (move via export/restore):** Moving data between providers uses the existing shipped export/restore (Phase 1); provider-agnostic; the sanctioned manual bridge.
- **D-06-07 (picker + remembered preference):** When disconnected, the top-bar connect affordance offers BOTH providers. Last-used provider persisted in `db.meta`, pre-selected next launch; status pill shows which backend is live. Switching = disconnect then connect the other. Extend the existing single-pill top bar — NO settings panel.
- **D-06-08 (support 2FA now):** The login form includes an optional 2FA (TOTP) field; if Mega reports the account requires a second factor, prompt for the code and pass it to megajs. **Pending spike confirmation** — see § State of the Art (RESOLVED: supported).
- **D-06-09 (blocking one-time warning):** First time a user chooses Mega, show the security warning with a required "I understand" acknowledgement BEFORE the email/password fields appear. Reuse the one-time-dismiss pattern (mirror `privacyNoticeDismissed` in `db.meta`).
- **D-06-10 (warning content):** Warning must convey: (a) password handled directly in-browser via an unofficial community SDK (megajs); (b) Mega is end-to-end encrypted; (c) the session stays connected on this device; (d) v1 is provider-security-only, no app-level encryption.
- **D-06-11 (distinct quota message, same pill):** Detect Mega free-tier quota/throttle errors and map them to a specific actionable message on the EXISTING error pill. No new UI surface. Local Dexie data stays intact; never block on a cloud quota failure.

### Claude's Discretion
- Exact copy/wording of the security warning and the quota message (content constraints fixed; phrasing open).
- Visual form of the provider chooser within the existing top-bar chrome.
- Where in `db.meta` the active-provider preference and Mega-warning-dismissed flags are keyed (follow the `privacyNoticeDismissed` convention).
- Whether Mega's reconnect chrome reuses `ReconnectBanner`/`StatusPill` as-is or needs a provider-aware variant (interface holds either way).

### Deferred Ideas (OUT OF SCOPE)
- **Cross-provider auto-copy / migration on switch** — rejected for this phase.
- **Proactive Mega quota indicator/meter** — out of scope for a second-class provider.
- **Lazy on-demand media fetch for Mega** — treat as a research finding that could expand scope, not a pre-committed decision. (This research finds: NOT required for MVP — see § Open Questions Q1.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STOR-07 | User can alternatively connect Mega.nz as the storage provider (session-only credentials; password never persisted) | `MegaProvider implements StorageProvider` (§ Architecture Patterns), megajs `Storage` login + `toJSON`/`fromJSON` session lifecycle (§ Code Examples), `providerFactory` `'mega'` case (§ Integration), quota-error mapping onto `markError` (§ Pitfall 3). D-06-01/02 refine STOR-07: **password** never persisted; **session blob** persisted by design. |
</phase_requirements>

## Summary

Mega.nz plugs in behind the already-locked 8-method `StorageProvider` interface exactly as Drive did. The core work is a `MegaProvider` (thin adapter over the `megajs` browser SDK), a `mega/auth` module mirroring `drive/auth`'s in-memory-credential posture, a Mega connect controller mirroring `useConnectDrive` (login form + blocking security warning + optional 2FA), and top-bar chrome for a two-provider picker + persisted preference. `useSyncEngine`, the atomic manifest-swap, export/restore, and the `media/<hash>` layout run over the interface unchanged — no sync-engine changes are needed.

**megajs 1.3.10 (MIT, browser ESM build)** is the correct, maintained SDK. It supports everything the spike flagged: an optional `secondFactorCode` constructor field for 2FA (**D-06-08 confirmed supported**); a `storage.toJSON()` / `Storage.fromJSON()` pair that serializes a session so you can reconnect WITHOUT the password (**D-06-01 confirmed possible**); a `storage.close()` that sends a server-side logout (`a:'sml'`) for Disconnect (**D-06-03 confirmed**); and standard Mega API error codes (`EOVERQUOTA` = -17) for quota/throttle surfacing (**D-06-11 confirmed**).

The one genuinely awkward mapping is `overwriteFile`: Mega nodes are immutable — you cannot replace a node's bytes while preserving its handle. The manifest commit relies on `overwriteFile(fileId)` keeping the SAME id. The prescribed fix is a provider-internal alias map: `overwriteFile` uploads a new node, deletes the old one (plus any same-named sibling — self-healing), and re-points the logical id at the new handle. This preserves the engine's fixed-id contract within a session; across sessions the manifest is re-adopted by name (`prepareOnOpen`). This weakens strict atomicity slightly (upload+delete is two ops vs Drive's single PATCH), mitigated by upload-first ordering and accepted under the single-curator model.

**Primary recommendation:** Add `megajs@1.3.10`; build `src/storage/mega/{auth.ts, MegaProvider.ts}` mirroring `src/storage/drive/{auth.ts, DriveProvider.ts}`; wire `'mega'` into `providerFactory`; persist `storage.toJSON()` in `db.meta`; build a Mega connect controller mirroring `useConnectDrive`; keep the eager `reconcileMedia` for MVP but map `EOVERQUOTA` onto the error pill. Validate the `MegaProvider` against the SAME conformance contract `DriveProvider` passes.

## Architectural Responsibility Map

> This is a fully client-side serverless PWA; "tiers" are the app's internal layers, all in the browser.

| Capability | Primary Layer | Secondary Layer | Rationale |
|------------|---------------|-----------------|-----------|
| Mega login / session derivation | `mega/auth` (new) | megajs SDK | Mirrors `drive/auth` — the ONLY place credentials/session live; in-memory password, module-scoped `Storage` |
| Session persistence (D-06-01) | `db.meta` (Dexie) | `mega/auth` | Reuses the existing key/value meta store; `auth` reads/writes the session blob key |
| File/folder ops on Mega | `MegaProvider` (new) | megajs `Storage`/`MutableFile` | Thin adapter — mirrors `DriveProvider`; implements the locked interface verbatim |
| Provider selection | `providerFactory` | `db.meta` (active-provider pref) | The single switch point already carries the Phase-6 `'mega'` seam |
| Connect/disconnect/2FA UI flow | Mega connect controller (new, mirrors `useConnectDrive`) | `syncStatusStore` | Reuses status store + `onConnected(folderId)` so `useSyncEngine` boots identically |
| Provider chooser + status chrome | `App.tsx` top bar | `StatusPill`/`ReconnectBanner` | Extend existing single-pill chrome (D-06-07); no settings panel |
| Sync / atomic commit / media | `SyncEngine` + `useSyncEngine` (UNCHANGED) | `MegaProvider` | Provider-agnostic already; runs over `MegaProvider` unchanged |
| Cross-provider data move | Export/restore (UNCHANGED, Phase 1) | — | Provider-agnostic bridge (D-06-06); no new code |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `megajs` | 1.3.10 | Mega.nz browser SDK — login, session, upload/download, folders | `[VERIFIED: npm registry]` The maintained de-facto Mega JS SDK (repo `qgustavor/mega`, MIT, 20.7k weekly downloads, no postinstall). Named in project CLAUDE.md as the prescribed pick. Browser ESM build uses native WebCrypto where possible + pure-JS crypto for streaming — no `crypto-browserify` needed. |

### Supporting
No new supporting libraries. Everything else (Dexie, zod, nanoid, the sync engine, export/restore, React chrome) already exists and is reused.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `megajs` | `mega` (qgustavor legacy port) | `[CITED: CLAUDE.md §What NOT to Use]` Stale, missing browser fixes — DO NOT use. `megajs` is the current package from the same author. |
| `megajs` browser build | `megajs` Node build + `crypto-browserify` polyfill | `[CITED: CLAUDE.md]` The polyfill massively bloats the bundle and hurts perf. Use the browser entry (native WebCrypto). |

**Installation:**
```bash
npm install megajs@1.3.10
```

**Version verification (performed 2026-08-06):** `npm view megajs version` → `1.3.10`; `dist-tags.latest = 1.3.10`; license MIT; published 2026-04-20 (3 months old, stable); `scripts.postinstall` = null; deps: `pumpify`, `stream-skip`. `[VERIFIED: npm registry]`

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `megajs` | npm | published 2026-04-20 (~4 mo); package 8+ yrs | 20,702/wk | github.com/qgustavor/mega | **OK** | Approved |

**Legitimacy gate output (`gsd-tools query package-legitimacy check`):** `verdict: OK`, `exists: true`, `deprecated: false`, `postinstall: null`, `repoUrl: git+https://github.com/qgustavor/mega.git`, `weeklyDownloads: 20702`. `[VERIFIED: npm registry]`

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

**Supply-chain note:** `megajs` is an **unofficial** community SDK (Mega ships no official JS SDK). Verdict is OK, but the security gate should record it as an accepted supply-chain risk (V14) under the single-curator / free-OSS boundary, mirroring how Phase 4 accepted `cytoscape`/`react-cytoscapejs` (04-SECURITY.md T-04-SC).

## Architecture Patterns

### System Architecture Diagram

```
  ┌──────────────────────── Browser (serverless PWA) ────────────────────────┐
  │                                                                            │
  │  User gesture (Connect ▾)                                                  │
  │        │                                                                   │
  │        ▼                                                                   │
  │  Provider chooser (top bar)  ──selects──►  db.meta: activeProvider='mega'  │
  │        │  "Connect Mega.nz"                                                 │
  │        ▼                                                                   │
  │  Mega security warning (blocking, one-time)  ──ack──►  db.meta: megaWarnAck │
  │        │                                                                   │
  │        ▼                                                                   │
  │  Mega connect controller (mirrors useConnectDrive)                         │
  │    email + password [+ optional 2FA code]                                  │
  │        │                                                                   │
  │        ▼                                                                   │
  │  mega/auth.login()                                                          │
  │    new Storage({email,password,secondFactorCode?}).ready                   │
  │        │  (password used here ONLY, then discarded)                        │
  │        ├──on success──►  db.meta: megaSession = storage.toJSON()  (persist)│
  │        ▼                                                                   │
  │  markConnected() → onConnected(appFolderId)                                 │
  │        │                                                                   │
  │        ▼                                                                   │
  │  useSyncEngine (UNCHANGED)                                                  │
  │    getActiveProvider('mega') → MegaProvider                                │
  │        │                                                                   │
  │        ▼                                                                   │
  │  SyncEngine  ── ensureFolder/list/readFile/writeFile/overwriteFile/delete ─┼──► megajs Storage ──► Mega.nz cloud
  │    prepareOnOpen → reconcileMedia(eager) → reconcileOnOpen → push          │        (E2E encrypted)
  │        │                                                                   │
  │        ▼                                                                   │
  │  Dexie (SOURCE OF TRUTH, offline)  ◄── manifest + shards + media/<hash>    │
  │                                                                            │
  │  Reload path: mega/auth.restore() → Storage.fromJSON(db.meta.megaSession)  │
  │               → reconnect WITHOUT password → markConnected → onConnected   │
  │                                                                            │
  │  Disconnect: storage.close() (a:'sml' server logout) → delete megaSession  │
  │  Quota error (EOVERQUOTA -17) from any op → markError("Mega transfer       │
  │               quota reached — try later") on the EXISTING pill             │
  └────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/storage/
├── StorageProvider.ts          # LOCKED interface (unchanged)
├── providerFactory.ts          # add 'mega' case + read db.meta pref (edit)
├── drive/                      # reference implementation (unchanged)
│   ├── auth.ts
│   └── DriveProvider.ts
└── mega/                       # NEW — mirror drive/
    ├── auth.ts                 # in-memory Storage + session persist/restore/close
    └── MegaProvider.ts         # implements StorageProvider over megajs

src/features/connect/
├── ConnectDrive.tsx            # reference controller (unchanged)
├── ConnectMega.tsx             # NEW — login form + warning gate + 2FA (mirrors useConnectDrive)
├── ProviderChooser.tsx         # NEW — two-provider picker in top bar (D-06-07)
├── syncStatusStore.ts          # reused as-is (markConnected/Error/…)
└── useSyncEngine.ts            # UNCHANGED

src/features/onboarding/
└── MegaSecurityWarning.tsx     # NEW — blocking one-time notice (mirror PrivacyNotice)

tests/storage/
└── megaProvider.contract.test.ts  # NEW — SAME contract as driveProvider.contract.test.ts
```

### Pattern 1: MegaProvider maps the 8-method interface onto megajs
**What:** A thin adapter, structurally identical to `DriveProvider`, translating between `FileEntry`/`Blob` and megajs `File`/`Buffer`. Ids are Mega node handles (`file.nodeId`).
**When to use:** The whole provider.
**Example:**
```typescript
// Source: mirrors src/storage/drive/DriveProvider.ts; megajs API [CITED: mega.js.org/docs/1.0/api]
import type { FileEntry, StorageProvider } from '../StorageProvider';
import { getStorage } from './auth'; // returns the ready megajs Storage (or throws "not connected")

function toEntry(f: MegaFile): FileEntry {
  return { id: f.nodeId, name: f.name ?? '', size: f.size ?? 0, modifiedAt: (f.timestamp ?? 0) * 1000 };
  // megajs timestamps are epoch SECONDS → ×1000 for FileEntry.modifiedAt (ms).
}

export class MegaProvider implements StorageProvider {
  // Alias map for the overwriteFile fixed-id emulation (see Pattern 2).
  private overwrites = new Map<string, string>();

  private resolveHandle(id: string): string {
    // follow the alias chain to the current live handle
    let h = id;
    while (this.overwrites.has(h)) h = this.overwrites.get(h)!;
    return h;
  }
  private resolveNode(id: string): MegaFile {
    const storage = getStorage();
    const handle = this.resolveHandle(id);
    const node = findByHandle(storage, handle); // walk storage.root (shallow tree) or storage.files map
    if (!node) throw new Error(`MegaProvider: no node with handle ${handle}`);
    return node;
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const storage = getStorage();
    const parent = parentId ? this.resolveNode(parentId) : storage.root;
    const existing = (parent.children ?? []).find((c) => c.directory && c.name === name);
    if (existing) return existing.nodeId;            // idempotent — same name+parent → same id
    const created = await parent.mkdir({ name });
    return created.nodeId;
  }

  async list(folderId: string): Promise<FileEntry[]> {
    return (this.resolveNode(folderId).children ?? []).map(toEntry);
  }

  async readFile(fileId: string): Promise<Blob> {
    const buf = await this.resolveNode(fileId).downloadBuffer(); // Uint8Array/Buffer
    return new Blob([buf]);
  }

  async writeFile(name: string, parentId: string, body: Blob, _contentType: string): Promise<string> {
    const parent = this.resolveNode(parentId);
    const bytes = new Uint8Array(await body.arrayBuffer());
    const file = await parent.upload({ name, size: bytes.length }, bytes).complete; // NEW node → new handle
    return file.nodeId; // distinct id every call = immutable-new-file semantic (matches Drive/InMemory)
  }

  async overwriteFile(fileId: string, body: Blob, contentType: string): Promise<void> {
    // See Pattern 2 — emulated because Mega nodes are immutable.
    const cur = this.resolveNode(fileId);
    const name = cur.name!, parent = cur.parent ?? cur.directory /* verify accessor in spike */;
    const bytes = new Uint8Array(await body.arrayBuffer());
    const next = await parent.upload({ name, size: bytes.length }, bytes).complete;
    // Delete the superseded node AND any same-named sibling (self-heals a prior crash's duplicate).
    for (const sib of (parent.children ?? []).filter((c) => c.name === name && c.nodeId !== next.nodeId)) {
      await sib.delete(true).catch(() => {});
    }
    this.overwrites.set(this.resolveHandle(fileId), next.nodeId);
  }

  async delete(fileId: string): Promise<void> { await this.resolveNode(fileId).delete(true); }
  async stat(fileId: string): Promise<FileEntry> { return toEntry(this.resolveNode(fileId)); }
}
```
`_contentType` is intentionally ignored: Mega stores only an encrypted `name` attribute, no MIME. This is safe — shard blobs are JSON (parsed regardless) and media MIME is recovered from entity `MediaRef`s (STATE decision: media stored as ArrayBuffer+mime; mime reconstructed at the boundary).

### Pattern 2: `overwriteFile` fixed-id emulation (the hard mapping)
**What:** Mega has no in-place content replacement — a node's bytes are immutable and its handle can't be reused for new content. But the manifest commit calls `overwriteFile(manifestFileId)` repeatedly and reuses the SAME `_manifestFileId` for the engine's lifetime (`src/sync/manifest.ts` `writeManifestWithBackup`).
**When to use:** ONLY the manifest commit point — no other call site uses `overwriteFile` (shards/media are always `writeFile`).
**How:** Upload a new node with the same name into the same parent, delete the old node, and record `overwrites.set(logicalId, newHandle)` so future `readFile`/`overwriteFile` on the logical id resolve the current node. Across reloads the manifest is re-adopted by name in `SyncEngine.prepareOnOpen` (`entries.find(e => e.name === 'manifest.json')`), so the alias map need only survive one session — which it does.
**Ordering:** Upload-new-FIRST, then delete-old. A crash between them leaves two `manifest.json` nodes (recoverable, newest wins) rather than zero (data loss). The self-healing sibling-delete cleans up any leftover duplicate on the next commit.

### Pattern 3: `mega/auth` mirrors `drive/auth`'s posture, diverges on persistence
**What:** A module-scoped in-memory `Storage` instance, like `drive/auth`'s in-memory token. Password is used only in the `login()` call. On success, `storage.toJSON()` (session blob) is persisted to `db.meta` (D-06-01). `restore()` rebuilds via `Storage.fromJSON()` — NO password, NO re-login. `disconnect()` calls `storage.close()` (server logout) then deletes the persisted session (D-06-03).
**Example:** see § Code Examples.

### Anti-Patterns to Avoid
- **Persisting the raw password.** Never. Only `storage.toJSON()` (session blob) is persisted (D-06-01). The password is discarded after the `Storage` constructor derives the key.
- **Changing the `StorageProvider` interface.** Forbidden (CONTEXT § out of scope). The awkward `overwriteFile` is solved inside `MegaProvider`, not by widening the interface.
- **Using `overwriteFile` for shards/media on Mega.** Same prohibition as Drive — shards/media are immutable `writeFile`; only the manifest is `overwriteFile`.
- **Blocking the app on a Mega quota/network failure.** Dexie is the source of truth; a failed cloud op surfaces on the pill and the app keeps working offline (mirror `useSyncEngine`'s guarded push).
- **Setting a `userAgent` in the browser.** `[CITED: mega.js.org/docs/1.0/tutorial/login]` Setting a User-Agent on Firefox causes CORS issues — leave it unset/null in the browser build (matches CLAUDE.md `userAgent: null`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mega login / key derivation / E2E crypto | Custom AES/RSA + SRP login | `megajs` `Storage` | Mega's auth is versioned (v1/v2 account key derivation), RSA session decryption, E2E attribute crypto — reimplementing is a security footgun |
| Session persistence format | Hand-serialize sid + keys | `storage.toJSON()` / `Storage.fromJSON()` | `[VERIFIED: qgustavor/mega source]` The SDK already serializes exactly what's needed and reconstructs without re-login |
| Server-side logout | Manual `sml` API call | `storage.close()` | `[VERIFIED: qgustavor/mega source]` `close()` sends `a:'sml'` + tears down the connection |
| Quota detection | Parse HTTP bodies yourself | Catch megajs errors, check for `EOVERQUOTA`/-17 | The SDK raises Mega API error codes; map them (Pitfall 3) |
| Provider abstraction | A new sync path for Mega | The existing `StorageProvider` + `SyncEngine` | Already provider-agnostic; Mega is just another adapter |
| Cross-provider data move | Copy/migration engine | Existing export/restore (D-06-06) | Provider-agnostic, round-trip tested in Phase 1 |

**Key insight:** Almost nothing here is new logic — it's an adapter + a UI flow. The single novel algorithm is the `overwriteFile` emulation, and even that is contained to one method.

## Common Pitfalls

### Pitfall 1: Assuming Mega `overwriteFile` preserves the node handle
**What goes wrong:** A naive `overwriteFile` = upload-new + delete-old returns/leaves a NEW handle; the engine keeps calling `overwriteFile` on the ORIGINAL `_manifestFileId`, which no longer exists → `readManifest` throws on the next push.
**Why it happens:** Mega nodes are content-immutable; Drive's `overwriteFile` is a true in-place PATCH, so the naive port breaks silently only on the SECOND commit.
**How to avoid:** The alias-map emulation (Pattern 2) — the logical id stays valid; internally it re-points to the live node. Conformance test "overwriteFile replaces content in place at a fixed id" (already in the contract) catches a broken implementation.
**Warning signs:** First push works, second push fails with "no node with handle" / manifest read error.

### Pitfall 2: Non-atomic manifest overwrite creates duplicate `manifest.json`
**What goes wrong:** Upload-new-then-delete-old is two ops; a crash between them leaves two `manifest.json` nodes; `prepareOnOpen`'s `.find()` picks an arbitrary one.
**Why it happens:** No single atomic replace on Mega.
**How to avoid:** Upload-first ordering (never delete before the new node is durable) + self-healing sibling-delete on the next `overwriteFile`. Accept the residual single-curator window (mirrors Phase-4 accept-all posture). OPTIONAL hardening (flag for planner): make `prepareOnOpen` adoption prefer the newest `manifest.json` by `modifiedAt` — engine-internal, does not touch the interface.
**Warning signs:** After a mid-commit crash, reconnect loads a stale DB version.

### Pitfall 3: Mega free-tier quota/throttle errors not surfaced (D-06-11)
**What goes wrong:** A transfer-quota hit (`EOVERQUOTA` = -17) during eager `reconcileMedia` or a large push fails silently or shows a generic error.
**Why it happens:** Mega free accounts have a rolling transfer/bandwidth quota (resets ~6h); downloading all media on connect can exhaust it. `[CITED: help.servmask.com/knowledgebase/mega-error-codes]`
**How to avoid:** Wrap Mega ops; detect the quota error (message/code `EOVERQUOTA` / -17) and route to `markError('Mega transfer quota reached — try later')`. `reconcileMedia` already swallows per-file failures and logs, so a quota hit mid-loop degrades gracefully (some images missing until next connect) rather than crashing — but the pill must still tell the user.
**Warning signs:** Images fail to appear on a fresh device; console shows -17.

### Pitfall 4: `Storage.fromJSON` doesn't auto-load the file tree
**What goes wrong:** After `restore()`, `storage.root.children` is empty, so `ensureFolder`/`list` find nothing and the provider bootstraps a duplicate DB.
**Why it happens:** `[VERIFIED: qgustavor/mega source]` `fromJSON` forces `autoload:false, autologin:false` (it reuses the sid, doesn't re-login).
**How to avoid:** After `Storage.fromJSON(saved)`, `await storage.ready` AND ensure the tree is loaded — call `await storage.reload()` if `root.children` is not populated. Confirm the exact call in the spike/live test.
**Warning signs:** Reconnect after reload creates a second app folder / re-bootstraps an empty manifest.

### Pitfall 5: Vite pulls the Node build instead of the browser build
**What goes wrong:** `import { Storage } from 'megajs'` resolves a Node entry referencing `node:crypto`/`Buffer`/streams → build error or bloated bundle.
**Why it happens:** Bundler condition resolution; the browser build lives at `dist/main.browser-es.mjs`.
**How to avoid:** Import from `'megajs'` first (package `exports`/`browser` condition should pick the browser build under Vite). If the build errors on Node builtins or the bundle balloons, pin the explicit subpath: `import { Storage } from 'megajs/dist/main.browser-es.mjs'`. Verify the resolved chunk in the spike (`vite build` + bundle inspection). `[CITED: mega.js.org — browser ESM path]`
**Warning signs:** Build fails on `Buffer is not defined` / `Cannot resolve node:crypto`, or a multi-hundred-KB crypto polyfill appears in the chunk.

## Code Examples

### `mega/auth.ts` — login, persist, restore, disconnect
```typescript
// Source: megajs API verified via Context7 /websites/mega_js_1_0 + qgustavor/mega source.
// Mirrors src/storage/drive/auth.ts posture: module-scoped in-memory Storage; password never persisted.
import { Storage } from 'megajs'; // verify resolves to browser build (Pitfall 5)
import { db } from '@/db/schema';

const MEGA_SESSION_KEY = 'megaSession'; // db.meta key (Claude's discretion — follow privacyNoticeDismissed convention)

let storage: Storage | null = null;

export function getStorage(): Storage {
  if (!storage) throw new Error('Mega not connected');
  return storage;
}
export function isConnected(): boolean { return storage !== null; }

/** Interactive login from a user gesture. Password used ONLY here, then discarded. Persists session (D-06-01). */
export async function login(email: string, password: string, secondFactorCode?: string): Promise<void> {
  // NOTE: do NOT set userAgent in the browser (Firefox CORS caveat).
  const s = await new Storage({ email, password, secondFactorCode, autoload: true, keepalive: false }).ready;
  storage = s;
  await db.meta.put({ key: MEGA_SESSION_KEY, value: s.toJSON() }); // session blob (D-06-01) — see Security Domain
}

/** Silent reconnect on reload — NO password, NO re-login (D-06-01). */
export async function restore(): Promise<boolean> {
  const row = await db.meta.get(MEGA_SESSION_KEY);
  if (!row?.value) return false;
  const s = Storage.fromJSON(row.value as object);
  await s.ready;
  if (!s.root?.children?.length) await s.reload(); // fromJSON sets autoload:false (Pitfall 4)
  storage = s;
  return true;
}

/** Explicit Disconnect: server-side logout best-effort, then WIPE the persisted session (D-06-03). */
export async function disconnect(): Promise<void> {
  try { storage?.close(); } catch { /* best-effort */ }
  storage = null;
  await db.meta.delete(MEGA_SESSION_KEY);
}
```

### 2FA login (D-06-08 — confirmed supported)
```typescript
// Source: Context7 /websites/mega_js_1_0 + [CITED: mega.js.org/docs/1.0/tutorial/login]
const storage = await new Storage({
  email, password,
  secondFactorCode: '123456', // optional; supply when the account has 2FA/TOTP enabled
}).ready;
```
Flow: always render an optional 2FA field. If login rejects for a 2FA-enabled account, prompt/keep the field and retry with the code. (The exact "2FA required" error signal is not needed structurally — a rejected login with the field visible covers it; confirm the error shape in the live spike.)

### providerFactory — wire the `'mega'` case (edit)
```typescript
// Source: src/storage/providerFactory.ts (existing Phase-6 seam, commented)
export type ProviderKind = 'drive' | 'mega';
let megaProvider: MegaProvider | null = null;

export function getActiveProvider(kind: ProviderKind = 'drive'): StorageProvider {
  switch (kind) {
    case 'mega':
      if (!megaProvider) megaProvider = new MegaProvider();
      return megaProvider;
    case 'drive':
    default:
      if (!driveProvider) driveProvider = new DriveProvider();
      return driveProvider;
  }
}
```
The active kind is read from `db.meta` (active-provider preference, D-06-07). `useSyncEngine` calls `getActiveProvider()` with no arg today; wire the persisted kind through (via the connect controller passing the resolved provider as the existing `useSyncEngine({ provider })` override, OR by having the factory read the pref — planner's call; the `provider` override already exists on `useSyncEngine`).

### Quota-error detection (D-06-11)
```typescript
// Source: Mega API error table [CITED: help.servmask.com/knowledgebase/mega-error-codes]
function isMegaQuotaError(err: unknown): boolean {
  const s = (err instanceof Error ? err.message : String(err));
  return /EOVERQUOTA/i.test(s) || /\b-17\b/.test(s); // -17 = EOVERQUOTA (transfer/bandwidth quota)
}
// In the connect controller / a MegaProvider wrapper: catch → markError('Mega transfer quota reached — try later')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mega` (legacy qgustavor port) | `megajs` 1.3.x | ongoing | Use `megajs`; the old `mega` package is stale (CLAUDE.md) |
| `gapi.auth2` / OAuth for cloud | Mega uses NO OAuth — email/password → session blob | n/a | Different auth model from Drive; no COOP/popup/FedCM concerns (the Drive COOP blocker does NOT apply to Mega) |
| `crypto-browserify` polyfill | megajs browser build (native WebCrypto + pure-JS streaming crypto) | megajs Rollup rewrite | No polyfill; smaller bundle |

**Spike unknowns — RESOLVED:**
- **2FA parameter (D-06-08):** SUPPORTED. `secondFactorCode` is a documented `Storage` constructor option. `[CITED: mega.js.org/docs/1.0/tutorial/login]` + `[VERIFIED: Context7 /websites/mega_js_1_0]`
- **Serializable session without password (D-06-01):** SUPPORTED. `storage.toJSON()` → `Storage.fromJSON()`; `fromJSON` reuses the `sid`, does NOT re-login. `[VERIFIED: qgustavor/mega source (storage.mjs)]`
- **Server-side logout for Disconnect (D-06-03):** SUPPORTED. `storage.close()` sends `a:'sml'`. `[VERIFIED: qgustavor/mega source]`
- **Quota error shape (D-06-11):** `EOVERQUOTA` = -17 (transfer/bandwidth quota; rolling ~6h reset). `[CITED: multiple — servmask, MegaApiClient exceptions]`
- **Eager reconcileMedia vs quota (Deferred Idea):** Eager download of all media on connect CAN hit -17 on a large photo DB, but degrades gracefully (per-file failures swallowed + logged). NOT a blocker for MVP → lazy-on-Mega media fetch stays DEFERRED (see Open Questions Q1).

**Deprecated/outdated:**
- Old `mega` npm package — replaced by `megajs`.

## Runtime State Inventory

> This is an ADDITIVE greenfield-adapter phase, not a rename/refactor. Full inventory omitted. New persisted state introduced (all in the existing `db.meta` key/value store, all provider-agnostic):

| New `db.meta` key (names = Claude's discretion) | Purpose | Lifecycle |
|-------------------------------------------------|---------|-----------|
| `megaSession` (session blob = `storage.toJSON()`) | Silent reconnect without password (D-06-01) | Written on login; read on restore; **deleted on Disconnect (D-06-03)** |
| `activeProvider` (`'drive'`\|`'mega'`) | Remembered provider preference (D-06-07) | Written on connect; read at launch |
| `megaWarningAck` (bool) | One-time security-warning dismissal (D-06-09) | Written on "I understand"; mirrors `privacyNoticeDismissed` |

**Note:** these keys round-trip with the DB via export/restore like `privacyNoticeDismissed`. The `megaSession` blob is credential material — it MUST be excluded from any exported backup if backups are shareable. **Verify:** does export include arbitrary `db.meta` rows? If so, `megaSession` (and any provider session) must be filtered from the export (Security Domain V6/V2). Flag for the planner to confirm against the Phase-1 export serializer.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | megajs browser build resolves cleanly under Vite 7 via `import 'megajs'` (else explicit `dist/main.browser-es.mjs`) | Pitfall 5 | Build breakage; mitigated by explicit subpath import — low risk, confirm in spike |
| A2 | `File.parent`/`.directory` accessor for a node's parent folder in `overwriteFile` | Pattern 1/2 | Wrong accessor → overwrite emulation fails; confirm exact megajs property in spike (may need to track parent via provider) |
| A3 | After `Storage.fromJSON`, `await storage.reload()` fully populates `root.children` | Pitfall 4 | Reconnect re-bootstraps a duplicate DB; confirm exact reload call in live test |
| A4 | The "2FA required" rejection is detectable enough that a visible optional field + retry suffices (no need for the exact -26/EMFAREQUIRED code) | Code Examples | 2FA users can't connect; low risk — optional field always shown |
| A5 | Mega node `name` attribute accepts a literal slash (`media/<hash>`) unsanitized | Pattern 1 | `reconcileMedia` hash recovery breaks; confirm in spike (very low — name is an opaque encrypted attribute) |
| A6 | megajs surfaces `EOVERQUOTA`/-17 in a catchable Error message/code | Pitfall 3 | Quota message won't fire; confirm error shape in live test; fallback = generic error still non-blocking |
| A7 | megajs browser build bundle impact is acceptable (~100–250 KB range) for a PWA | Environment | Larger-than-expected bundle; measure in spike, not a correctness risk |

## Open Questions

1. **Does the eager `reconcileMedia` need to become lazy-on-Mega?**
   - What we know: eager download of all missing media on connect can exhaust Mega's free transfer quota (-17); failures are swallowed + logged, so it degrades gracefully.
   - What's unclear: real-world severity on a large photo DB on a fresh device.
   - Recommendation: **Keep eager for MVP** (D-06-11 says never block on quota). Map -17 to the pill. Leave lazy-on-Mega media as a DEFERRED idea unless UAT shows broken images are common. Do NOT pull it into Phase 6 scope.

2. **Wiring the active-provider kind into `useSyncEngine`.**
   - What we know: `useSyncEngine` calls `getActiveProvider()` (no arg) and also accepts a `provider` override.
   - What's unclear: whether the planner routes the persisted kind through the factory (factory reads `db.meta`) or through the connect controller (passes the resolved `MegaProvider` as the `provider` override).
   - Recommendation: prefer the connect controller resolving `getActiveProvider(kind)` and handing `onConnected(folderId)` — keeps the factory pure and the override seam already exists. Planner's discretion.

3. **Does the Phase-1 export serializer include arbitrary `db.meta` rows?**
   - What we know: `privacyNoticeDismissed` round-trips via `db.meta`.
   - What's unclear: whether a full-meta export would leak the `megaSession` credential blob into a shareable backup.
   - Recommendation: verify the export serializer; if it includes meta, filter `megaSession` (and any session key) out. Security-relevant (see § Security Domain).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `megajs` (npm) | Mega provider | ✗ (not yet installed) | 1.3.10 (target) | none — `npm install megajs@1.3.10` is a phase task |
| A real Mega.nz account | Live UAT of connect/upload/quota | user-supplied | — | Unit/contract tests run against a mocked megajs Storage (mirror `driveProvider.contract.test.ts`); live connect deferred to UAT like Drive's live-connect deferral |
| Native WebCrypto (`crypto.subtle`) | megajs browser crypto + existing sha256 | ✓ (browser + jsdom test env) | — | — |

**Missing dependencies with no fallback:** `megajs` — install is an explicit Task.
**Missing dependencies with fallback:** live Mega account — contract/unit tests use a mocked Storage; live verification happens at UAT (same posture as Drive's deferred live-connect, STATE P06).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit/contract) + Playwright 1.61.1 (E2E) |
| Config file | `vite.config.ts` (Vitest via Vite) / `playwright` config |
| Quick run command | `npx vitest run tests/storage/megaProvider.contract.test.ts` |
| Full suite command | `npm test` (`vitest run`) — if fork timeouts appear under load, re-run `npx vitest run --no-file-parallelism` (MEMORY: vitest-forks-timeout-under-load) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-07 | `MegaProvider` passes the SAME 8-method conformance contract as `DriveProvider` (idempotent ensureFolder, immutable-new-file writeFile, in-place overwriteFile at a fixed id, byte round-trip, list/delete/stat) | contract | `npx vitest run tests/storage/megaProvider.contract.test.ts` | ❌ Wave 0 |
| STOR-07 | `overwriteFile` emulation keeps the logical id valid across repeated overwrites + leaves exactly one node | unit | (in the contract test above) | ❌ Wave 0 |
| STOR-07 | Session persist→restore round-trip: `login()` writes `toJSON()` to `db.meta`; `restore()` rebuilds via `fromJSON` WITHOUT password | unit | `npx vitest run tests/storage/megaAuth.test.ts` | ❌ Wave 0 |
| STOR-07 | Disconnect wipes the persisted session (D-06-03) | unit | (in megaAuth.test.ts) | ❌ Wave 0 |
| STOR-07 | Quota error (-17) maps to `markError('Mega transfer quota reached…')` (D-06-11) | unit | `npx vitest run tests/features/connect/megaQuota.test.ts` | ❌ Wave 0 |
| STOR-07 | 2FA: `secondFactorCode` passed through to Storage (D-06-08) | unit | (in megaAuth.test.ts) | ❌ Wave 0 |
| STOR-07 | Provider-switch round-trip: export from Drive → connect Mega → restore → identical DB (D-06-06, criterion 3) | E2E | `npx playwright test` (mode e2e, `window.__rb`) | ❌ Wave 0 |
| STOR-07 | Blocking one-time warning gates credential entry (D-06-09) | component/E2E | Playwright | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/storage/megaProvider.contract.test.ts` (+ the specific unit file touched)
- **Per wave merge:** `npm test` (run `npm install` in the main tree first — MEMORY: worktree-npm-install-node-modules-sync — so `megajs` resolves in the post-merge build gate)
- **Phase gate:** full suite green + `npm run build` (tsc + vite) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/storage/megaProvider.contract.test.ts` — reuse the shared conformance assertions from `driveProvider.contract.test.ts`, backed by a fake in-memory megajs Storage (mock `Storage`/`MutableFile`: children arrays, `mkdir`, `upload().complete`, `downloadBuffer`, `delete`). Covers STOR-07 interface parity.
- [ ] `tests/storage/megaAuth.test.ts` — mock `Storage`/`Storage.fromJSON`; assert login persists `toJSON()`, restore rebuilds without password, disconnect calls `close()` + deletes the meta key, 2FA code passthrough.
- [ ] `tests/features/connect/megaQuota.test.ts` — inject an `EOVERQUOTA`/-17 error; assert `markError` message.
- [ ] E2E: extend `window.__rb` bridge (mode e2e) so the provider-switch round-trip and warning-gate flows are drivable without a live Mega account.
- [ ] Framework install: `npm install megajs@1.3.10` (also a phase task).

*Testability note:* megajs must be mockable at the module boundary (`vi.mock('megajs')`) — keep all megajs calls inside `mega/auth.ts` + `MegaProvider.ts` so tests inject a fake, exactly as `driveProvider.contract.test.ts` fakes `fetch`.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`. Precedent: 04-SECURITY.md (all threats ACCEPTED under single-curator / provider-level-security v1 boundary).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Mega email/password → session via `megajs`; password in-memory only, discarded after key derivation (mirror `drive/auth`) |
| V3 Session Management | yes | **Persisted session blob in `db.meta` (D-06-01/02) — ACCEPTED, not a defect.** `close()` server logout + wipe on Disconnect (D-06-03) |
| V4 Access Control | yes (accepted) | Mega login = full-account access; NO scoped equivalent of `drive.file`. Accepted per D-06-02 (single-curator, own device) |
| V5 Input Validation | yes | email/password/2FA form inputs; render all user/error text as JSX (no `dangerouslySetInnerHTML`) — mirror Phase-4 XSS boundary |
| V6 Cryptography | yes | E2E crypto owned by `megajs` — NEVER hand-roll. Browser build uses WebCrypto + audited pure-JS crypto |
| V14 Config / Dependencies | yes | `megajs` is an UNOFFICIAL community SDK — accepted supply-chain risk (verdict OK, pinned 1.3.10), mirror T-04-SC |

### Known Threat Patterns for {browser PWA + megajs}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Persisted session blob = full-account bearer credential + master key** in IndexedDB | Information Disclosure / Elevation | **ACCEPTED (D-06-02).** The `toJSON()` blob contains the account **master key** + `sid` (`[VERIFIED: qgustavor/mega source]` — `toJSON` returns `{key, sid, name, user, options}`, NOT the email/password). On a shared device or via XSS this grants full account + decryption access. Accepted under single-curator/own-device; disclosed to user (D-06-04/10); wiped on Disconnect (D-06-03). Record in 06-SECURITY.md as ACCEPTED. |
| Password persistence | Info Disclosure | Password NEVER persisted — used only in the `Storage` constructor, then discarded (D-06-01) |
| Session blob leaked via a shared/exported backup | Info Disclosure | Verify the export serializer excludes `megaSession` (Open Q3) — filter session keys from any shareable backup |
| Unofficial SDK supply chain | Tampering | `megajs` pinned 1.3.10, MIT, no postinstall, real repo, 20.7k wk downloads; accepted (mirror T-04-SC) |
| User/error text (email, Mega error messages) in DOM | Tampering (XSS) | Render as JSX children — no HTML injection (Phase-4 boundary holds) |
| Mega quota/network failure blocking the app | Denial of Service | Non-blocking: Dexie is source of truth; failures surface on the pill only (D-06-11) |

**Security gate directive:** The persisted-session decision (D-06-02) MUST be logged in 06-SECURITY.md as an **Accepted Risk**, not an open threat. Do not recommend reverting to in-memory-only. Note additionally that the persisted blob includes the **master decryption key** (stronger than a plain bearer token) — the acceptance rationale should state this explicitly for informed sign-off.

## Project Constraints (from CLAUDE.md)

- **No backend / fully serverless PWA** — Mega is client-side only; no server ever. ✓ (megajs runs in-browser)
- **Free + OSS only** — `megajs` is MIT, free. ✓
- **megajs browser build**, native WebCrypto, **NOT `crypto-browserify`**; set `userAgent: null` (Firefox CORS). ✓ (Pitfall 5, Anti-Patterns)
- **Avoid the stale `mega` (qgustavor) port** — use `megajs`. ✓
- **GSD workflow enforcement** — all edits through a GSD command. (process, not code)
- **Storage providers user-selectable (Drive + Mega)** via official/free APIs. ✓ (D-06-07 picker)
- **Provider-level security only in v1**, app-level encryption deferred. ✓ (Security Domain — Mega E2E is the v1 boundary)

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/mega_js_1_0` — Storage login, `secondFactorCode` 2FA, `getAccountInfo` quota, `close()`, upload/download/mkdir/find, browser ESM import
- `qgustavor/mega` source (`lib/storage.mjs`, raw GitHub) — `toJSON()`/`fromJSON()` exact payload (`{key, sid, name, user, options}`), `fromJSON` reuses sid (no re-login), `close()` → `a:'sml'`, `mkdir`/`upload` delegation
- npm registry (`npm view megajs`) + `gsd-tools query package-legitimacy check` — v1.3.10, MIT, no postinstall, 20.7k wk downloads, repo, verdict OK (2026-08-06)
- Repo code read: `StorageProvider.ts`, `DriveProvider.ts`, `drive/auth.ts`, `driveRest.ts`, `providerFactory.ts`, `InMemoryProvider.ts`, `useSyncEngine.ts`, `ConnectDrive.tsx`, `syncStatusStore.ts`, `App.tsx`, `db/schema.ts`, `sync/syncEngine.ts`, `sync/manifest.ts`, `tests/storage/driveProvider.contract.test.ts`, `vite.config.ts`

### Secondary (MEDIUM confidence)
- `mega.js.org/docs/1.0/tutorial/login` + `/api` — login options, browser import path, userAgent/CORS caveat, mkdir/upload options
- Mega API error tables (servmask knowledge base; MegaApiClient `Exceptions.cs`) — `EOVERQUOTA` = -17, rolling ~6h quota reset

### Tertiary (LOW confidence)
- General bundle-size / crypto-browserify context (search) — informs the "measure bundle in spike" recommendation, not a load-bearing claim

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — megajs verified on registry + Context7 + legitimacy gate; single, project-mandated pick
- Architecture (interface mapping + overwriteFile emulation): HIGH — grounded in the actual locked interface, manifest.ts, and verified megajs node semantics
- Session lifecycle (D-06-01/03/08): HIGH — `toJSON`/`fromJSON`/`close`/`secondFactorCode` verified in source + docs
- Quota (D-06-11): MEDIUM — error code -17 well-attested but exact megajs Error shape to confirm in live test
- Pitfalls: HIGH for #1/#2 (derived from real commit code); MEDIUM for #4/#5 (confirm in spike)

**Research date:** 2026-08-06
**Valid until:** 2026-09-05 (30 days — megajs is stable/slow-moving; re-verify version before install)

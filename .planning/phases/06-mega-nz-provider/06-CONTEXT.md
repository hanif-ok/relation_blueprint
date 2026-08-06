# Phase 6: Mega.nz Provider - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Add **Mega.nz as a second, opt-in storage backend** behind the already-proven
`StorageProvider` seam that Google Drive established in Phase 1. The rest of the
app must behave identically regardless of which provider is active — the sync
engine, atomic manifest-swap, export/restore, and `media/<hash>` layout run over
the interface unchanged. Credentials are entered by the user (email + password,
no OAuth); the password is never persisted. Data is portable between providers
via the provider-agnostic sharded layout.

**In scope:** a `MegaProvider` implementing the locked interface; a Mega
connect/disconnect flow (login form + mandatory security warning + optional 2FA);
a provider chooser + persisted active-provider preference; Mega-aware
reconnect/status chrome; quota/throttle error surfacing.

**Out of scope:** app-level encryption (deferred project-wide, provider security
only in v1); cross-provider auto-migration/copy (see Deferred Ideas); any change
to the `StorageProvider` interface signatures; simultaneous multi-provider sync
(each provider holds its own independent database).

</domain>

<decisions>
## Implementation Decisions

### Session & Reconnect
- **D-06-01 (session persistence):** The Mega **session-id is ALWAYS persisted**
  to IndexedDB so a page reload reconnects silently (no re-login). The **password
  is NEVER persisted** — it lives in memory only during the login call and is
  discarded immediately after megajs derives the session.
- **D-06-02 (criterion amendment — SECURITY-GATE CRITICAL):** D-06-01
  **deliberately amends success-criterion 2** ("session token in memory only").
  The user made this call with full disclosure that a persisted Mega session-id
  is a **full-account bearer credential** (Mega login grants access to the entire
  account — there is NO scoped equivalent of Drive's `drive.file`). The Phase 6
  security gate (`/gsd-secure-phase`) MUST record persisted-session-id as an
  **ACCEPTED design decision, not a defect or open threat**. Do not "fix" it back
  to in-memory-only.
- **D-06-03 (disconnect wipes it):** Explicit Disconnect MUST erase the persisted
  session-id from IndexedDB (server-side logout best-effort via megajs).
- **D-06-04 (disclosure):** The security warning MUST disclose that the session
  "stays connected on this device" so the persistence is informed.

### Provider Switching
- **D-06-05 (independent databases):** Each provider holds its **own independent
  database**. Switching connects to whatever exists in that provider's folder.
  **No cross-provider migration/copy code** is built.
- **D-06-06 (move via export/restore):** Moving data between providers uses the
  **existing, shipped, round-trip-tested export/restore** (Phase 1) — it is
  provider-agnostic. This is the sanctioned manual bridge; the app does not do it
  automatically.
- **D-06-07 (picker + remembered preference):** When disconnected, the top-bar
  connect affordance offers **both** providers ("Connect Google Drive" / "Connect
  Mega.nz"). The **last-used provider is persisted in `db.meta`** and pre-selected
  next launch; the status pill shows which backend is live. Switching = disconnect,
  then connect the other. Extend the existing single-pill top bar with minimal new
  chrome — do NOT introduce a settings panel for this.

### Connect Flow & Security Warning
- **D-06-08 (support 2FA now):** The login form includes an **optional 2FA (TOTP)
  field**; if Mega reports the account requires a second factor, prompt for the
  code and pass it to megajs. Rationale: a privacy-minded audience likely has 2FA
  enabled, and locking them out would gut the feature. **Pending spike
  confirmation** that the megajs browser build exposes the 2FA parameter (see
  Canonical References → research flag).
- **D-06-09 (blocking one-time warning):** The first time a user chooses Mega,
  show the security warning with a **required "I understand" acknowledgement
  BEFORE the email/password fields appear** — credentials cannot be entered until
  it is acknowledged. **Reuse the existing one-time-dismiss pattern** (mirror
  `privacyNoticeDismissed` in `db.meta`) so it does not nag every session.
- **D-06-10 (warning content):** The warning must convey: (a) the Mega password is
  handled **directly in the browser via an unofficial community SDK** (megajs);
  (b) Mega is **end-to-end encrypted**; (c) the session **stays connected on this
  device** (D-06-04); (d) v1 is **provider-security-only, no app-level encryption**.

### Second-Class Treatment & Quota
- **D-06-11 (distinct quota message, same pill):** Detect Mega free-tier
  **quota/throttle errors** (via megajs error codes — identify in the spike) and
  map them to a **specific, actionable message on the EXISTING error pill** (e.g.
  "Mega transfer quota reached — try later"). **No new UI surface.** Local Dexie
  data stays intact and the app keeps working offline regardless — never block on a
  cloud quota failure.

### Claude's Discretion
- Exact copy/wording of the security warning and the quota message (content
  constraints fixed above; phrasing is open).
- The visual form of the provider chooser within the existing top-bar chrome.
- Where in `db.meta` the active-provider preference and Mega-warning-dismissed
  flags are keyed (follow the existing `privacyNoticeDismissed` convention).
- Whether Mega's reconnect chrome reuses `ReconnectBanner`/`StatusPill` as-is or
  needs a provider-aware variant (interface holds either way).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 6: Mega.nz Provider) — goal, the 3 success
  criteria, and the **research flag** (megajs browser-build behavior, session-token
  lifecycle + whether a session-id can be safely serialized, 2FA parameter, and
  quota/throttle under real photo uploads). **NEEDS DEEPER RESEARCH — full spike
  before PLAN.**
- `.planning/REQUIREMENTS.md` — **STOR-07** (Mega.nz as storage provider,
  session-only credentials, never persisted). Note D-06-01/02 refine "never
  persisted" to: password never persisted; session-id persisted by design.

### Project constraints & boundaries
- `.planning/PROJECT.md` §Constraints (Storage providers; Security = provider-level
  only in v1) and §Out of Scope (app-level encryption explicitly deferred —
  reinforces that Mega's E2E encryption IS the v1 boundary).
- `.claude/CLAUDE.md` §Technology Stack — **megajs 1.3.x browser build** guidance:
  use the browser entry (native WebCrypto, **NOT `crypto-browserify`** which bloats
  the bundle), set `userAgent: null`, credentials entered by user (no OAuth),
  free-tier transfer-quota throttling applies. Also §What NOT to Use (avoid the
  stale qgustavor `mega` port — use `megajs`).

### Security precedent (mirror the posture, adapt the mechanism)
- `src/storage/drive/auth.ts` — the in-memory-only credential model, connect/revoke
  from a user gesture, non-destructive expiry → Reconnect. Mega mirrors the
  *posture* but D-06-01 diverges on persistence (session-id, not password).
- `.planning/phases/04-relationships-graph/04-SECURITY.md` — precedent for a STRIDE
  register formally ACCEPTED under the single-curator / provider-security v1
  boundary; the Phase 6 gate should record D-06-02 in the same accepted form.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/storage/StorageProvider.ts`** — the LOCKED 8-method interface
  (`ensureFolder / list / readFile / writeFile / overwriteFile / delete / stat`).
  `MegaProvider` implements it verbatim. Do not change signatures.
- **`src/storage/memory/InMemoryProvider.ts`** — the conformance fake every
  provider is validated against. `MegaProvider` MUST pass the same conformance
  contract (as `DriveProvider` does).
- **`src/storage/drive/DriveProvider.ts`** — the reference adapter shape (thin
  mapping from a backend's file resources onto `FileEntry`). Mirror this structure.
- **Export/restore (Phase 1, shipped + round-trip tested)** — the sanctioned
  cross-provider data bridge (D-06-06); no new code needed to satisfy criterion 3.
- **`db.meta` key/value store** (`src/db/schema.ts`, key `'key'`) — already used for
  `privacyNoticeDismissed` and `SYNCED_MEDIA_KEY`. Host the active-provider
  preference, the Mega-warning-dismissed flag, and the persisted session-id here.

### Established Patterns
- **`src/storage/providerFactory.ts`** — the SINGLE switch point, already carrying
  an explicit Phase-6 seam: `ProviderKind = 'drive' | 'mega'` (commented) and
  `getActiveProvider(kind)`. Wire `'mega'` here so nothing downstream imports a
  concrete provider. The factory reads the persisted preference (D-06-07).
- **`src/features/connect/useSyncEngine.ts`** — ALREADY provider-agnostic: boots the
  `SyncEngine` from `getActiveProvider()` (with a `provider` override for tests),
  runs `reconcileMedia` + `reconcileOnOpen` + initial push. Works over `MegaProvider`
  unchanged once the factory returns it. ⚠️ `reconcileMedia` is **eager** (downloads
  ALL missing media on connect) — flagged in the code as the future lazy-fetch scale
  optimization; the spike must judge whether Mega's quota forces lazy-on-Mega now.
- **`src/features/connect/ConnectDrive.tsx` (`useConnectDrive`)** — the connect
  controller pattern: the ONLY caller of auth connect/revoke, from a user gesture;
  flow = auth → `ensureFolder(APP_FOLDER_NAME)` → `markConnected` →
  `onConnected(folderId)`. Build an analogous Mega connect controller
  (login form + warning gate + 2FA), reusing the same `syncStatusStore` + `onConnected`
  wiring so `useSyncEngine` boots identically.
- **One-time-dismiss notice** (`privacyNoticeDismissed` in `db.meta`, surfaced in
  `App.tsx`) — the template for the blocking Mega security warning (D-06-09).

### Integration Points
- **`src/app/App.tsx`** (~L84–89, L290–299) — top bar mounts a single `ConnectDrive`
  pill + `ReconnectBanner`, wired to `useSyncEngine`. This is where the provider
  chooser and Mega-aware status/reconnect chrome slot in.
- **`syncStatusStore` (`markConnected/markDisconnected/markError/markNeedsReconnect`)**
  — reuse for Mega status; the quota message (D-06-11) rides `markError`.

### New dependency
- **`megajs` (~1.3.x) is NOT yet installed.** Add the browser build (see CLAUDE.md
  guidance). Confirm bundle impact + WebCrypto behavior in the spike before pinning.

</code_context>

<specifics>
## Specific Ideas

- Mega is explicitly the **"second-class, opt-in"** provider — Drive proved the
  abstraction and remains the primary/default. "Second-class" here means: no
  cross-provider migration convenience (D-06-05), quota surfaced but not
  proactively metered (D-06-11), and the session-persistence tradeoff (D-06-01) is
  a Mega-only affordance. It does NOT mean degraded core behavior — criterion 1
  requires the app behaves identically once connected.
- The user consciously prioritized **low-friction reconnect over the stricter
  in-memory-only posture** for Mega, accepting the full-account-bearer-credential
  risk on their own device (single-curator, own-data model).

</specifics>

<deferred>
## Deferred Ideas

- **Cross-provider auto-copy / migration on switch** — actively copying the whole
  DB (shards + media) from one provider to the other when switching. Rejected for
  this phase (new capability, quota/throttle risk, beyond "plug Mega in behind the
  abstraction"). Revisit as its own phase if manual export/restore proves too
  clunky.
- **Proactive Mega quota indicator/meter** — a dedicated quota UI beyond the
  actionable error message. Out of scope for a second-class provider.
- **Lazy on-demand media fetch for Mega** — if the spike shows the eager
  `reconcileMedia` blows Mega's quota, a lazy fetch may be needed; treat as a
  research finding that could expand scope, not a pre-committed decision.

### Reviewed Todos (not folded)
`cross_reference_todos` surfaced 5 keyword matches; all reviewed, **none folded** —
all are out of Phase 6 scope:
- *Graph node repositioning*, *Dynamic ego focus*, *Map & graph appearance settings*
  — these are **Phase 7** (Relationships & Map Visual Polish) items; keyword
  overlap only ("layout", "phase").
- *Map-editor & profile-media UX enhancements* — already delivered in Phases 2–3;
  stale match.
- *Enable COOP header for Drive OAuth* — **Drive-OAuth-specific**; Mega uses no
  OAuth popup, so COOP is irrelevant to this phase (it remains a real Drive-deploy
  blocker tracked separately).

</deferred>

---

*Phase: 6-mega-nz-provider*
*Context gathered: 2026-08-06*

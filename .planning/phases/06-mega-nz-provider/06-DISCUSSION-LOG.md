# Phase 6: Mega.nz Provider - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-06
**Phase:** 6-mega-nz-provider
**Areas discussed:** Session & reconnect, Provider switching, Connect flow & warning, Second-class / quota

---

## Session & Reconnect

**Q1 — After the user logs into Mega, what should survive a page reload?**

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing — re-login each session | Mirror Drive: email+password in memory only, dropped on reload. Most secure, honors criterion 2 literally. | |
| Persist session-id (never password) | Store megajs session-id (not password) in IndexedDB for silent reconnect. Lower friction, contradicts criterion 2. | ✓ |
| You decide | Capture in-memory-only recommendation as default. | |

**User's choice:** Persist session-id (never password)
**Notes:** Claude flagged the tension with locked criterion 2 and the full-account-bearer-credential risk before proceeding.

**Q2 — Persisting the session-id widens the attack surface. How to bound it?**

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in, default OFF | "Keep me connected" checkbox default unchecked; in-memory unless opted in. | |
| Always persist | Reload always reconnects silently, no checkbox. Fully overrides criterion 2. | ✓ |
| Reconsider — in-memory only | Reverse to Drive-style in-memory only. | |

**User's choice:** Always persist
**Notes:** Chosen with full disclosure that a Mega session-id is a full-account bearer credential (no scoped equivalent of Drive's `drive.file`). Recorded as a deliberate amendment to success-criterion 2 — the Phase 6 security gate must treat it as ACCEPTED, not a defect. Disconnect wipes the stored session-id; the security warning discloses "stays connected on this device."

---

## Provider Switching

**Q1 — When switching Drive↔Mega, what happens to the data?**

| Option | Description | Selected |
|--------|-------------|----------|
| Independent copies; move via export/restore | Each provider holds its own DB; carry data via the shipped export/restore. No migration code. | ✓ |
| Auto-copy on switch | App actively copies the whole DB across on switch. New migration logic, quota risk. | |
| You decide | Independent copies + export/restore; auto-copy deferred. | |

**User's choice:** Independent copies; move via export/restore

**Q2 — How should the user pick which provider is active?**

| Option | Description | Selected |
|--------|-------------|----------|
| Provider chooser, remembered | Top-bar offers both; last-used persisted in `db.meta`; pill shows active backend. | ✓ |
| Settings-panel selection | Dedicated settings area for provider choice (net-new surface). | |
| You decide | Top-bar chooser + persisted preference. | |

**User's choice:** Provider chooser, remembered

---

## Connect Flow & Warning

**Q1 — Should the connect flow support Mega 2FA (TOTP)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Support 2FA now | Optional TOTP field; prompt when Mega requires a second factor. | ✓ |
| Defer 2FA | email+password only; 2FA accounts fail with a clear message. | |
| You decide | Support 2FA now, pending spike confirmation. | |

**User's choice:** Support 2FA now
**Notes:** Pending spike confirmation that the megajs browser build exposes the 2FA parameter. Rationale: a privacy-minded audience likely has 2FA enabled.

**Q2 — How should the mandatory security warning gate the connect flow?**

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking ack before login form | Required "I understand" before credential fields appear; one-time dismiss via `db.meta`. | ✓ |
| Inline notice on the form | Always-visible but non-blocking notice above the fields. | |
| You decide | Blocking one-time acknowledgement. | |

**User's choice:** Blocking ack before login form
**Notes:** Reuses the existing one-time privacy-notice pattern (`privacyNoticeDismissed` in `db.meta`). Warning content fixed: unofficial community SDK handles password in-browser, Mega is E2E-encrypted, session stays connected on this device, provider-security-only v1.

---

## Second-Class / Quota

**Q1 — How should Mega free-tier quota/throttle failures surface?**

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct quota message, same pill | Detect Mega quota errors, map to an actionable message on the existing error pill. No new UI. | ✓ |
| Generic error only | Quota failures ride the generic "Sync failed" pill. | |
| You decide | Distinct actionable quota message, existing pill. | |

**User's choice:** Distinct quota message, same pill
**Notes:** Local Dexie data stays intact and offline is unaffected — never block on a cloud quota failure. Exact quota error codes to be identified in the research spike.

---

## Claude's Discretion

- Exact copy/wording of the security warning and the quota message.
- Visual form of the provider chooser within the existing top-bar chrome.
- `db.meta` keying for the active-provider preference, Mega-warning-dismissed flag, and persisted session-id (follow the `privacyNoticeDismissed` convention).
- Whether Mega reuses `ReconnectBanner`/`StatusPill` as-is or needs a provider-aware variant.

## Deferred Ideas

- Cross-provider auto-copy / migration on switch (own future phase).
- Proactive Mega quota indicator/meter.
- Lazy on-demand media fetch for Mega (if the spike shows eager `reconcileMedia` blows the quota).

## Reviewed Todos (not folded)

5 keyword matches reviewed; none folded — all out of Phase 6 scope:
- Graph node repositioning, Dynamic ego focus, Map & graph appearance settings → Phase 7 items.
- Map-editor & profile-media UX enhancements → already delivered (Phases 2–3).
- Enable COOP header for Drive OAuth → Drive-OAuth-specific; Mega uses no OAuth popup.

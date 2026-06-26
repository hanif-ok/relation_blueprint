---
phase: 02
slug: custom-fields-full-entity-model
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-26
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> **Register origin:** authored at plan time (6 of 7 plans carry parseable `<threat_model>` blocks). Mitigations were VERIFIED against the implementation by `gsd-security-auditor` (read-only); no new register was built.

**Result: SECURED.** 14 / 14 threats resolved (13 `mitigate` CLOSED, 1 `accept` documented). No high-severity (or any) mitigation gap found at `block_on: high`. No blocker.

The highest-value threat for this phase — **T-03-01 / T-02-06-03 (XSS → in-memory Drive-token exfiltration)** — is verified at the strongest level: a tree-wide grep finds **zero** genuine `dangerouslySetInnerHTML` JSX usages (all matches are `//` security comments), and **zero** `.innerHTML` / `insertAdjacentHTML` / `outerHTML` / `document.write` / `eval` / `new Function` sinks anywhere in `src`. Every user-text render surface emits React children.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| cloud shard / backup file → Dexie | Shards and import bundles are untrusted-at-rest; new entity arrays + fieldDefs + custom values must pass zod before entering the DB | Serialized entity JSON (Person/MapDoc/Group/RelationshipLink), fieldDefs, custom-value maps |
| user-entered custom values + field definitions → persistence | Field labels/options and custom values are user-controlled and must validate without poisoning the manifest/backup schema | Field labels, options, typed custom values |
| user text → React DOM render | Names, tags, secondary lines, custom values/labels/options, link labels, lightbox captions, confirm copy — all potential XSS vectors; exfiltrating the in-memory Drive token is the high-value target | Arbitrary user-controlled strings |
| entity media bytes → object URLs | Full-res lightbox decode + per-row/per-tile thumbnail URLs must revoke to avoid leaks and survive corrupt blobs | Stored image Blobs |
| link-to-entity id (untrusted reference) → resolve + render | A stored id may point at a deleted or wrong-type entity | Entity id reference |
| stored phone custom-value → `tel:` URI in the DOM | A stored string is interpolated into an href; a non-phone string could craft a non-dialable URI | Phone custom-value string |
| user destructive action → data deletion | Two destructive actions with very different blast radii (remove marker vs cascade-delete entity) must be unambiguous | Delete intent |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (verified) | Status |
|-----------|----------|-----------|-------------|------------------------|--------|
| T-02-01 | Tampering (import/deserialize) | importDb / shard deserialize of new entity arrays + fieldDefs | mitigate | `BackupSchema.parse(raw)` runs BEFORE the rw transaction (`importDb.ts:81`→`:99`); new arrays + fieldDefs validated via `BackupSchema` (`domain/schemas.ts:152-166`); custom Photo values swept by `collectMimes`/`addCustom` (`importDb.ts:41-67`); repo write-path parses every create/update through zod before `db.put` (`db/repository.ts:70,94,240,266,316,336,372,399,439,462`) | closed |
| T-02-02 | Tampering (schema poisoning) | FieldDef.type / CustomValue shape | mitigate | Closed `FieldTypeSchema` `z.enum` (`domain/schemas.ts:114`); closed `CustomValueSchema` `z.union` (`schemas.ts:38-44`); `CustomValuesSchema` closed `z.record` (`schemas.ts:47`); per-type check in `validateCustomValue` (`features/fields/customValue.ts:38-75`) | closed |
| T-02-03 | Info Disclosure / Tampering (media GC) | media GC over custom Photo-field values | mitigate | `collectEntityMediaHashes` spans photo/gallery/background + custom Photo MediaRefs (`db/repository.ts:124-140`); still-referenced sweep iterates all five live entity types, deletes a candidate only when unreferenced, in one rw txn (`repository.ts:175-206`) | closed |
| T-03-01 | Info Disclosure (XSS → token exfil) | all user-text render surfaces | mitigate | Tree-wide **0** real `dangerouslySetInnerHTML` and **0** raw-HTML sinks; React children verified at BrowseRow (`BrowseRow.tsx:94,100-106`), ViewSwitcher (`ViewSwitcher.tsx:139`), CustomFieldRows (`CustomFieldRows.tsx:152-153,162,220`), CustomFieldInputs (`CustomFieldInputs.tsx:91-209`), lightbox caption (`PhotoLightbox.tsx:187-189`), ConfirmDialog (`ConfirmDialog.tsx:50-59`) | closed |
| T-03-02 | DoS (corrupt blob decode) | corrupt/oversized blob decoded full-res in lightbox | mitigate | Decode-error state "This photo couldn't be opened." on null/`<img onError>` (`PhotoLightbox.tsx:64,72,132-136,143`); URL revoked on change/unmount (`:55-69`) | closed |
| T-03-03 | DoS / data loss (wrong destructive action) | accidental cascade delete via wrong action | mitigate | Context-gated separate actions: neutral "Remove from map" → `deleteMarker` vs brick "Delete {entity}" → `deleteEntity` cascade, never both (`ProfileSidebar.tsx:321-372`); ConfirmDialog focuses Cancel (`ConfirmDialog.tsx:44-48`) | closed |
| T-03-04 | DoS (memory, large browse lists) | browse lists at thousands of rows + per-row media URLs | mitigate | Constant 64px row windowing (`BrowseList.tsx:23,112-127,197`); indexed `orderBy` (`BrowseList.tsx:80-81`) on real Dexie indexes (`schema.ts:59-60,72-73`); per-row thumb URL revoked on scroll-out/unmount (`useEntityThumb.ts:34-49`) | closed |
| T-03-05 | Tampering (show-on-map / nav target) | show-on-map / nav targeting non-existent or wrong-type entity | mitigate | Show-on-map `disabled={!spatial}` + disabled-reason (`BrowseRow.tsx:114-116,120`; `browseTypes.ts:29-36`); target resolved via live Dexie read with missing-target fallback (`App.tsx:167-172`) | closed |
| T-03-06 | Tampering (link-to-entity target) | link-to-entity pointing at missing/wrong-type entity | mitigate | `LinkValue` resolves id via live `useLiveQuery` Dexie read + type-checks table, renders muted "(removed)" on null/wrong-type (`CustomFieldRows.tsx:63-98`) | closed |
| T-03-07 | DoS (object-URL leak) | repeated lightbox open/close + per-tile previews leaking URLs | mitigate | One full-res URL at a time, revoked on change/unmount via shared `resolveMediaUrl` lifecycle (`PhotoLightbox.tsx:52-74`; mirrored `CustomFieldRows.tsx:42-61`, `useEntityThumb.ts:34-49`) | closed |
| T-02-06-01 | Tampering (coerced put) | applyFieldTypeChange writing coerced values to Dexie | mitigate | Re-validates each rewritten row through Person/MapDoc/Group/RelationshipLink schema before `put`; no raw un-validated put; whole change is one rw txn (`db/repository.ts:602-641`, gate at `:625-638`) | closed |
| T-02-06-02 | Info Disclosure / Injection (`tel:`) | `tel:` href built from a phone custom-value | mitigate | Value stripped to dialable `[\d+*#,;]` before `tel:` interpolation; displayed text stays raw value as React child (`CustomFieldRows.tsx:157-164`) | closed |
| T-02-06-03 | Tampering / Spoofing (XSS, phone case) | custom-field phone-case rendering | mitigate | Subsumed by T-03-01: React children throughout; phone case at `CustomFieldRows.tsx:160-163` uses no innerHTML | closed |
| T-02-06-04 | Tampering (quarantine-key collision) | reserved quarantine key colliding with a real field id | **accept** | See Accepted Risks Log — rationale verified sound | closed |
| T-02-06-SC | Tampering (supply chain) | npm/pip/cargo installs | mitigate | `git diff 16ae0c9^..HEAD -- package.json` is **empty** — zero dependency changes across the phase; no new runtime deps | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-06-04 | Quarantine keys are built only via `quarantineKey(fieldId, sourceType)` = `` `${QUARANTINE_KEY_PREFIX}${fieldId}:${sourceType}` `` with `QUARANTINE_KEY_PREFIX = '__quarantine:'`, single-sourced at `db/repository.ts:483,494-496`. `FieldDef.id` is produced by default `nanoid()` (`repository.ts:9,440`); no `customAlphabet` is configured anywhere in `src`. The default nanoid alphabet (`A-Za-z0-9_-`) **cannot** contain the `:` separator, so a reserved key can never structurally collide with a live field id. Low risk, single-curator data within the v1 "provider-level security only" posture (app-level encryption explicitly deferred per CLAUDE.md). | gsd-security-auditor (verified) | 2026-06-26 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-26 | 14 | 14 | 0 | gsd-security-auditor (opus) |

---

## Informational Observations (non-blocking, out of register scope)

1. **Pull-from-cloud reconcile path is not zod-revalidated.** `SyncEngine.reconcileOnOpen` (`sync/syncEngine.ts:242-269`) calls `deserializeShards` (`serializer.ts:70-88`), which does a raw `JSON.parse(...) as T[]` (`serializer.ts:87`) then writes to Dexie via `upsert` — no zod parse. T-02-01 is scoped to "importDb / shard deserialize of the new entity arrays + fieldDefs," and its primary claim (`BackupSchema.parse` before the rw transaction in `importDb`) is CLOSED. This unvalidated reconcile read is **pre-existing Phase 01 behavior** (`c3084a5`/`2a3b7bf`, only extended — not introduced — by Phase 02 `16ae0c9`), so it is neither a Phase 02 regression nor in this audit's declared scope. Trust boundary is mitigated by the v1 single-curator + provider-E2E model. **Backlog:** validate pulled shards through the entity zod schemas before `upsert`, matching the importDb posture.
2. **CR-01 BLOCKER (re-quarantine data loss) is closed in-code.** The 02-REVIEW BLOCKER is resolved by keying quarantine slots per source field-type — `quarantineKey(fieldId, sourceType)` (`repository.ts:494-496,562`) — so two successive quarantines from different source types cannot collide. This strengthens T-02-06-01's data-preservation guarantee.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-26

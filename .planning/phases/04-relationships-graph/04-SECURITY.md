---
phase: 04
slug: relationships-graph
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-03
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> **Disposition summary:** all 7 plan-time threats were formally **accepted** under the
> project's v1 security boundary (provider-level security only; single-curator model —
> each user owns their entire database in their own Google Drive / Mega.nz, so there is no
> cross-user trust boundary and no server to compromise). Where the planned mitigation was
> nonetheless implemented, it is noted below (evidence: `04-REVIEW.md`, 2026-07-03).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| authoring UI → repository write | User-supplied endpoint refs + label/date/notes cross into persisted data | relationship-link record |
| imported backup file → Dexie (`BackupSchema`) | Untrusted-at-rest bundle validated before the write transaction | full backup bundle |
| author input (label / notes / names) → DOM & canvas render | User-authored strings drawn in the profile Relationships section, map connectors, and graph | user-authored text |
| `npm install` (cytoscape, react-cytoscapejs) | New third-party code enters the build | dependency source |
| relationship endpoints → projections (profile / connectors / graph) | Links may reference deleted or unplaced entities | endpoint ids |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Tampering / Info-disclosure (XSS) | Relationship label/notes + entity names in ProfileSidebar, Konva connector labels, Cytoscape graph node/edge labels | accept | Implemented as planned: all user text renders as JSX children / Konva `Text` / Cytoscape canvas text — no `dangerouslySetInnerHTML` or DOM string injection (confirmed in 04-REVIEW.md: "React/Konva text boundaries hold"). Residual risk accepted (single-curator, own DB). | closed |
| T-04-02 | Tampering / Elevation | `RelationshipLinkSchema` endpoint fields at write path + `BackupSchema` import + AddRelationshipDialog picker | accept | Implemented as planned: `z.enum(['people','groups'])` rejects a Location/`maps` endpoint at BOTH the repository write and the import boundary; picker lists only People/Groups. Residual risk accepted (self-authored data, own DB). | closed |
| T-04-03 | Denial of Service (dangling data) | `deleteEntity('people'\|'groups')` | accept | Implemented as planned: cascade-deletes relationship-links inside the existing rw transaction so no dangling edge/connector remains. Residual risk accepted. | closed |
| T-04-04 | Denial of Service (resource leak) | Graph node avatar object-URLs on element rebuild | accept | Implemented as planned: object-URLs resolved in an effect keyed by photo hash and revoked on unmount / hash change. Residual risk accepted (client-side, own session). | closed |
| T-04-10 | Tampering / DoS (crash) | Endpoint pointing at a deleted/missing id (incl. imported backup) | accept | Implemented as planned: orphan-guard muted "(deleted person/group)" rows; `buildConnectors` / `toGraphElements` drop endpoint-less/unplaced/half-endpoint links (no throw, no dangling edge). Residual risk accepted. | closed |
| T-04-11 | Denial of Service (perf) | Per-frame writes during marker drag | accept | Implemented as planned: transient rAF-throttled position override, persist to Dexie only on `dragEnd` (no per-frame writes / relayout thrash). Residual risk accepted. | closed |
| T-04-SC | Tampering (supply chain) | `npm install cytoscape react-cytoscapejs` | accept | Both packages audited OK in RESEARCH § Package Legitimacy Audit (real source repos, high downloads, no postinstall hooks); versions pinned (cytoscape 3.34.0, react-cytoscapejs 2.0.0). Residual supply-chain risk accepted (free/OSS MIT, no runtime secrets to exfiltrate). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-01 | Single-curator model: user renders only their own authored text; no cross-user surface. Canvas/JSX text rendering is in place regardless. Provider-level security only in v1. | Project owner (curator) | 2026-07-03 |
| AR-04-02 | T-04-02 | Data is authored and owned by the single curator; enum gate implemented as defense-in-depth. No multi-tenant elevation path exists. | Project owner (curator) | 2026-07-03 |
| AR-04-03 | T-04-03 | Cascade implemented; residual risk limited to the curator's own local/cloud DB. | Project owner (curator) | 2026-07-03 |
| AR-04-04 | T-04-04 | Client-side resource concern only, scoped to the curator's own browser session; revocation implemented. | Project owner (curator) | 2026-07-03 |
| AR-04-10 | T-04-10 | Orphan-guards implemented; worst case is a muted placeholder row in the curator's own view. | Project owner (curator) | 2026-07-03 |
| AR-04-11 | T-04-11 | Performance concern only, no data exposure; throttle implemented. | Project owner (curator) | 2026-07-03 |
| AR-04-SC | T-04-SC | Free/OSS MIT deps, audited and pinned; no server, no secrets, no postinstall — supply-chain blast radius limited to the static client bundle. | Project owner (curator) | 2026-07-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-03 | 7 | 7 | 0 | /gsd-secure-phase (accept-all, curator decision) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-03 (all threats accepted under v1 single-curator / provider-level-security boundary)

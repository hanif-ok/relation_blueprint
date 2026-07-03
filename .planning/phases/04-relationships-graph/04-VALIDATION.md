---
phase: 4
slug: relationships-graph
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from `04-RESEARCH.md` § Validation Architecture. Task IDs are assigned by the planner; this contract binds the per-requirement test map that plans must embed as `<automated>` verify blocks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (unit/integration) + Playwright 1.61.1 (E2E) |
| **Config file** | `vitest.config.ts` (present); `fake-indexeddb` 6.2.5 for Dexie tests |
| **Quick run command** | `npx vitest run <file> -t <name>` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30 s quick; full suite varies |

> **Env note** ([[vitest-forks-timeout-under-load]]): post-merge `vitest run` can false-fail with fork-worker startup timeouts under load — re-run with `--no-file-parallelism` to confirm environmental vs code defect.
> **Env note** ([[testbridge-requires-e2e-build-mode]]): `window.__rb` UAT DB-seeding is absent under `npm run dev` — E2E specs that seed the real repository must run under `npx vite --mode e2e` (or `build:e2e && preview`).

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file>` (target < 30 s)
- **After every plan wave:** Run `npm test` (full Vitest); add `--no-file-parallelism` if fork timeouts appear
- **Before `/gsd-verify-work`:** Full Vitest suite green **and** both Playwright specs green
- **Max feedback latency:** 30 seconds (quick run)

---

## Per-Task Verification Map

*Task IDs are assigned during planning; rows below bind each phase requirement to its automated proof. The planner must embed the matching command as an `<automated>` verify on the task that delivers the behavior.*

| Task ID | Req | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-----|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | REL-01 | Create person↔person / person↔group / group↔group link; Location endpoint rejected | T-03-10 | `z.enum(['people','groups'])` rejects invalid `fromType`/`toType` | unit | `npx vitest run src/db/repository.relationships.test.ts` | ❌ W0 | ⬜ pending |
| TBD | REL-01 | `listRelationshipsFor(x)` returns links where x is `from` OR `to` (indexed `.or()`) | — | N/A | unit | `npx vitest run src/db/repository.relationships.test.ts -t "reverse lookup"` | ❌ W0 | ⬜ pending |
| TBD | REL-01 | Deleting a Person/Group cascades its relationship-links (no orphan) | — | Cascade-delete prevents dangling-edge crash | unit | `npx vitest run src/db/repository.relationships.test.ts -t "cascade"` | ❌ W0 | ⬜ pending |
| TBD | REL-02 | label/date/notes persist + round-trip through backup (`BackupSchema`) with endpoints | T-03-10 | Import validates endpoints before write transaction | unit | `npx vitest run src/sync/relationshipRoundTrip.test.ts` | ❌ W0 | ⬜ pending |
| TBD | REL-03 | Connector geometry: person↔person both placed → an Arrow; group-involving → none; drop when a marker is absent | — | Orphan guard renders nothing rather than crashing | unit | `npx vitest run src/features/person-map/connectors.test.ts` | ❌ W0 | ⬜ pending |
| TBD | REL-03 | Connector follows a marker on drag (transient position) then persists on `dragEnd` | — | N/A | e2e | `npx playwright test tests/e2e/connectors.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | REL-04 | `toGraphElements` maps people/groups→nodes, links→edges, drops endpoint-less shells | — | N/A | unit | `npx vitest run src/features/graph/graphElements.test.ts` | ❌ W0 | ⬜ pending |
| TBD | REL-04 | Position cache: cose→save→reopen uses `preset`; node-set change invalidates | — | Revoke avatar object-URLs on unmount/hash change (no resource DoS) | unit | `npx vitest run src/features/graph/positionCache.test.ts` | ❌ W0 | ⬜ pending |
| TBD | REL-04 | Node tap opens ProfileSidebar + announces selection (AT bridge); viewer-only (no edit) | T-03-01 | Labels via React children / Konva `Text` / Cytoscape canvas text — never `dangerouslySetInnerHTML` | e2e | `npx playwright test tests/e2e/graph.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/db/repository.relationships.test.ts` — create / validate / reverse-lookup / cascade (REL-01)
- [ ] `src/sync/relationshipRoundTrip.test.ts` — endpoints survive export/restore (REL-02)
- [ ] `src/features/person-map/connectors.test.ts` — pure connector geometry (REL-03)
- [ ] `src/features/graph/graphElements.test.ts` — pure people/groups→nodes, links→edges mapping (REL-04)
- [ ] `src/features/graph/positionCache.test.ts` — position cache + invalidation (REL-04)
- [ ] `tests/e2e/connectors.spec.ts` — drag-follow + persist on dragEnd (REL-03; needs `--mode e2e` test bridge)
- [ ] `tests/e2e/graph.spec.ts` — node-tap → sidebar, viewer-only (REL-04; needs `--mode e2e` test bridge)
- Framework install: **none** — Vitest + Playwright already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual quality of `cose` layout on a dense real graph (Open Question A3) | REL-04 | Layout aesthetics are subjective; automated test asserts positions exist, not that they look good | Open the relationship graph on a DB with 50+ interconnected entities; confirm nodes are readable and non-overlapping. If poor, a `cose-bilkent`/`fcose` extension is a scoped v2 follow-up. |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

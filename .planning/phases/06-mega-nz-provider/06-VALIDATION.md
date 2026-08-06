---
phase: 6
slug: mega-nz-provider
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` § Validation Architecture. Task-ID rows are
> filled by the planner/executor as plans land; behaviors + commands below are
> fixed by the research.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (unit/contract) + Playwright 1.61.1 (E2E) |
| **Config file** | `vite.config.ts` (Vitest via Vite) / Playwright config |
| **Quick run command** | `npx vitest run tests/storage/megaProvider.contract.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30–60s full suite (measure in Wave 0); quick contract run < 10s |

> If fork-worker timeouts appear under machine load, re-run
> `npx vitest run --no-file-parallelism` to confirm it is environmental, not a
> code defect (MEMORY: vitest-forks-timeout-under-load).

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/storage/megaProvider.contract.test.ts` (+ the specific unit file touched)
- **After every plan wave:** Run `npm test` — **first run `npm install` in the main tree** so `megajs` resolves in the post-merge build gate (MEMORY: worktree-npm-install-node-modules-sync)
- **Before `/gsd-verify-work`:** Full suite green **and** `npm run build` (tsc + vite) clean
- **Max feedback latency:** < 10s (quick contract run)

---

## Per-Task Verification Map

> Task IDs are assigned when plans are written; each STOR-07 behavior below must
> map to at least one plan task with an `<automated>` verify (or a Wave 0 test).

| Behavior | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|----------|-------------|------------|-----------|-------------------|-------------|--------|
| `MegaProvider` passes the SAME 8-method conformance contract as `DriveProvider` (idempotent ensureFolder, immutable-new-file writeFile, in-place overwriteFile at a fixed id, byte round-trip, list/delete/stat) | STOR-07 | — | contract | `npx vitest run tests/storage/megaProvider.contract.test.ts` | ❌ W0 | ⬜ pending |
| `overwriteFile` alias-map emulation keeps the logical id valid across repeated overwrites and leaves exactly one node | STOR-07 | — | unit | (in the contract test above) | ❌ W0 | ⬜ pending |
| Session persist→restore round-trip: `login()` writes `toJSON()` to `db.meta`; `restore()` rebuilds via `fromJSON` WITHOUT password | STOR-07 | T-06 (V3) | unit | `npx vitest run tests/storage/megaAuth.test.ts` | ❌ W0 | ⬜ pending |
| Disconnect calls `close()` + wipes the persisted session key (D-06-03) | STOR-07 | T-06 (V3) | unit | (in `megaAuth.test.ts`) | ❌ W0 | ⬜ pending |
| Export serializer excludes the `megaSession` credential blob (Open-Q3 / V6) | STOR-07 | T-06 (V6) | unit | `npx vitest run tests/storage/megaAuth.test.ts` (or export test) | ❌ W0 | ⬜ pending |
| 2FA: `secondFactorCode` passed through to `Storage` (D-06-08) | STOR-07 | — | unit | (in `megaAuth.test.ts`) | ❌ W0 | ⬜ pending |
| Quota error (-17 / `EOVERQUOTA`) maps to `markError('Mega transfer quota reached…')` (D-06-11) | STOR-07 | — | unit | `npx vitest run tests/features/connect/megaQuota.test.ts` | ❌ W0 | ⬜ pending |
| Blocking one-time security warning gates credential entry (D-06-09) | STOR-07 | — | component/E2E | Playwright (mode e2e) | ❌ W0 | ⬜ pending |
| Provider-switch round-trip: export from Drive → connect Mega → restore → identical DB (D-06-06, criterion 3) | STOR-07 | — | E2E | `npx playwright test` (mode e2e, `window.__rb`) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install megajs@1.3.10` — new dependency (also a phase task); confirm the browser build resolves under Vite
- [ ] `tests/storage/megaProvider.contract.test.ts` — reuse the shared conformance assertions from `driveProvider.contract.test.ts`, backed by a fake in-memory megajs `Storage` (mock `Storage`/`MutableFile`: children arrays, `mkdir`, `upload().complete`, `downloadBuffer`, `delete`)
- [ ] `tests/storage/megaAuth.test.ts` — mock `Storage`/`Storage.fromJSON`; assert login persists `toJSON()`, restore rebuilds without password, disconnect calls `close()` + deletes the meta key, 2FA passthrough, export excludes `megaSession`
- [ ] `tests/features/connect/megaQuota.test.ts` — inject an `EOVERQUOTA`/-17 error; assert `markError` message
- [ ] E2E: extend the `window.__rb` bridge (mode e2e) so the provider-switch round-trip and warning-gate flows are drivable without a live Mega account

> **Testability note:** keep ALL megajs calls inside `mega/auth.ts` + `MegaProvider.ts` so tests inject a fake via `vi.mock('megajs')`, exactly as `driveProvider.contract.test.ts` fakes `fetch`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Mega connect + real upload/download against a real account | STOR-07 | Requires a real Mega.nz account + network; not mockable in CI | At UAT: connect with real credentials, store DB, reload → silent reconnect, disconnect → wiped. Same posture as Drive's deferred live-connect (STATE P06). |
| Real free-tier quota/throttle (-17) surfacing under a large photo DB | STOR-07 (D-06-11) | Depends on real Mega quota state / bandwidth | At UAT on a large-media DB: observe the error-pill message on quota hit; confirm app stays usable offline. |

---

## Validation Sign-Off

- [ ] All STOR-07 behaviors mapped to a plan task with `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING (❌) references
- [ ] No watch-mode flags in any verify command
- [ ] Feedback latency < 10s (quick contract run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: 1
slug: storage-spine-first-person-on-a-map
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` → ## Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/integration) + Playwright (E2E/flows) |
| **Config file** | none yet — **Wave 0** creates `vitest.config.ts` + `playwright.config.ts` |
| **Quick run command** | `npx vitest run` (or `npx vitest related <file>` per-file) |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~30s unit/integration; +Playwright flows on phase gate |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` for the touched module(s) (< 30s)
- **After every plan wave:** Run full `npx vitest run` (all unit/integration green)
- **Before `/gsd-verify-work`:** Full suite (`npx vitest run && npx playwright test`) green, plus the manual Drive-consent + visible-folder verification (SC#1)
- **Max feedback latency:** ~30 seconds (quick), full suite on wave merge

---

## Per-Task Verification Map

> Keyed by requirement until the planner assigns plan/wave/task IDs. The two **bold** rows are the highest-value failure-injection / round-trip tests for the spine.

| Requirement | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------|-------------------|-------------|--------|
| STOR-01 | Drive connect, `drive.file`, visible named folder, consent wording | T-scope / T-token | manual/E2E | `playwright test e2e/drive-connect.spec.ts` | ❌ W0 | ⬜ pending |
| STOR-02 | Sharded manifest + per-type shards + media written | — | unit (fake provider) | `vitest run tests/sync/serializer.test.ts` | ❌ W0 | ⬜ pending |
| STOR-03 | App reads/writes fully offline against Dexie | — | integration | `vitest run tests/db/repository.offline.test.ts` | ❌ W0 | ⬜ pending |
| STOR-04 | Background sync, last-write-wins single curator | — | unit (fake) | `vitest run tests/sync/reconcile.test.ts` | ❌ W0 | ⬜ pending |
| **STOR-05** | **Atomic write — interrupted write leaves last-good DB intact** | T-corrupt-write | unit (failure injection) | `vitest run tests/sync/atomicity.test.ts` | ❌ W0 | ⬜ pending |
| STOR-06 | PWA install + `navigator.storage.persist()` requested | — | E2E + unit | `playwright test e2e/pwa-install.spec.ts` | ❌ W0 | ⬜ pending |
| DATA-02 | Person with name/photo/phone/description/tags/notes | T-bundle-validate | unit | `vitest run tests/domain/person.test.ts` | ❌ W0 | ⬜ pending |
| DATA-04 | Edit + delete a person | — | integration | `vitest run tests/db/repository.crud.test.ts` | ❌ W0 | ⬜ pending |
| PROF-01 | Click person → sidebar shows all data | — | E2E | `playwright test e2e/profile.spec.ts` | ❌ W0 | ⬜ pending |
| PROF-02 | Thumbnail + photo gallery | — | integration | `vitest run tests/media/thumbnails.test.ts` | ❌ W0 | ⬜ pending |
| PROF-03 | Photos thumbnailed client-side, stored as media blobs | — | unit | `vitest run tests/media/mediaManager.test.ts` | ❌ W0 | ⬜ pending |
| MAP-01 | Map from uploaded background image | — | E2E | `playwright test e2e/map-create.spec.ts` | ❌ W0 | ⬜ pending |
| MAP-04 | Person placed as round photo-avatar marker; drag persists | — | E2E | `playwright test e2e/marker.spec.ts` | ❌ W0 | ⬜ pending |
| EXPT-01 | Export whole DB (shards + media) | — | unit | `vitest run tests/backup/export.test.ts` | ❌ W0 | ⬜ pending |
| **EXPT-02** | **Restore reconstitutes DB incl. photos (round-trip)** | T-corrupt-write | unit (round-trip) | `vitest run tests/backup/roundtrip.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### The two highest-value tests (must exist and be green)

1. **Atomicity (STOR-05):** Drive the sync engine against `InMemoryProvider` wrapped by a fault-injecting provider that throws (crash/401/quota) at every step boundary of the manifest-pointer-swap commit. **Assert: after any injected failure, the manifest still points at the previous shards and the reconstructed DB deep-equals the last committed state.** No partial commit, ever.
2. **Export round-trip (EXPT-02):** Property-style — generate N people + maps + markers + photo blobs, `export → clear IndexedDB → import`, then assert **deep-equality of all entities AND byte-equality of every photo blob**.

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + `playwright.config.ts` — no test infra exists yet
- [ ] `tests/_fakes/InMemoryProvider.ts` — the fake `StorageProvider` (lock the interface against it first)
- [ ] `tests/_fakes/faultInjectingProvider.ts` — wraps the fake to throw at step boundaries (for STOR-05)
- [ ] `tests/_fixtures/` — sample image blobs + a generated DB fixture for round-trip tests
- [ ] Framework install: `npm i -D vitest @vitest/ui playwright @playwright/test fake-indexeddb` (`fake-indexeddb` lets Dexie run under Vitest/node)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drive OAuth consent shows only `drive.file` ("never all your Drive files") and a visible named app folder appears in Drive | STOR-01 | Real Google consent screen + real Drive account; cannot be asserted headlessly | Connect Drive in the running app; confirm consent wording, then open Drive web UI and confirm the named app folder is visible |
| `requestAccessToken({prompt:''})` re-issues silently after >1h (token-expiry cycle) | STOR-01 | Requires a real >1h session against live Google auth (Assumption A1) | Leave a session open >1h, perform a write, confirm re-auth behaviour (silent vs. prompted "Reconnect to Drive") |
| PWA installs and `navigator.storage.persist()` is granted | STOR-06 | Install prompt + storage-persistence grant are browser/OS-mediated | Install the app from the browser; confirm install + persistence grant (and graceful behaviour if denied) |
| iOS PWA not evicted by 7-day rule | STOR-06 | Real-device only (Assumption A5) | Install on iOS, leave idle >7 days, confirm DB survives |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test infra + fakes + fixtures)
- [ ] No watch-mode flags (CI-safe `vitest run`, not `vitest`)
- [ ] Feedback latency < 30s (quick run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

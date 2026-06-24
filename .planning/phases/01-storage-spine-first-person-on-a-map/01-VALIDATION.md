---
phase: 1
slug: storage-spine-first-person-on-a-map
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
validated: 2026-06-25
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

> Keyed by requirement. The two **bold** rows are the highest-value failure-injection / round-trip tests for the spine. Audited 2026-06-25 against the executed phase: full suite green (84/84 unit + 13/13 E2E).

| Requirement | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------|-------------------|-------------|--------|
| STOR-01 | Drive connect, `drive.file`, visible named folder, consent wording | T-scope / T-token | unit + E2E (live = manual) | `vitest run tests/storage/auth.test.ts tests/storage/driveProvider.contract.test.ts` · `playwright test e2e/drive-connect.spec.ts` | ✅ | ✅ green ¹ |
| STOR-02 | Sharded manifest + per-type shards + media written | — | unit (fake provider) | `vitest run tests/sync/serializer.test.ts tests/connect/useSyncEngine.test.tsx` | ✅ | ✅ green |
| STOR-03 | App reads/writes fully offline against Dexie | — | integration | `vitest run tests/db/repository.offline.test.ts` | ✅ | ✅ green |
| STOR-04 | Background sync, last-write-wins single curator | — | unit (fake) | `vitest run tests/sync/reconcile.test.ts tests/connect/useSyncEngine.test.tsx` | ✅ | ✅ green |
| **STOR-05** | **Atomic write — interrupted write leaves last-good DB intact** | T-corrupt-write | unit (failure injection) | `vitest run tests/sync/atomicity.test.ts` | ✅ | ✅ green |
| STOR-06 | PWA install + `navigator.storage.persist()` requested | — | unit + E2E (grant = manual) | `vitest run tests/pwa/persistence.test.ts` · `playwright test e2e/pwa-install.spec.ts` | ✅ | ✅ green ¹ |
| DATA-02 | Person with name/photo/phone/description/tags/notes | T-bundle-validate | unit | `vitest run tests/domain/person.test.ts` | ✅ | ✅ green |
| DATA-04 | Edit + delete a person | — | integration + E2E | `vitest run tests/db/repository.crud.test.ts` · `playwright test e2e/profile.spec.ts` | ✅ | ✅ green |
| PROF-01 | Click person → sidebar shows all data | — | E2E | `playwright test e2e/profile.spec.ts` | ✅ | ✅ green |
| PROF-02 | Thumbnail + photo gallery | — | integration | `vitest run tests/media/thumbnails.test.ts` | ✅ | ✅ green |
| PROF-03 | Photos thumbnailed client-side, stored as media blobs | — | unit | `vitest run tests/media/mediaManager.test.ts` | ✅ | ✅ green |
| MAP-01 | Map from uploaded background image | — | E2E | `playwright test e2e/map-create.spec.ts` | ✅ | ✅ green |
| MAP-04 | Person placed as round photo-avatar marker; drag persists | — | E2E | `playwright test e2e/marker.spec.ts` | ✅ | ✅ green |
| EXPT-01 | Export whole DB (shards + media) | — | unit | `vitest run tests/backup/export.test.ts` | ✅ | ✅ green |
| **EXPT-02** | **Restore reconstitutes DB incl. photos (round-trip)** | T-corrupt-write | unit (round-trip) | `vitest run tests/backup/roundtrip.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

¹ Automated tests cover everything assertable headlessly (drive.file scope, six-state status pill, 401→non-destructive Reconnect, provider contract, manifest scope/SW precache, post-action `persist()`). The **live** Google OAuth consent wording + visible Drive folder (STOR-01) and the browser install + storage-persistence grant (STOR-06) remain Manual-Only below — inherent runtime behaviors against Google/the browser, not coverage gaps.

### The two highest-value tests (must exist and be green)

1. **Atomicity (STOR-05):** Drive the sync engine against `InMemoryProvider` wrapped by a fault-injecting provider that throws (crash/401/quota) at every step boundary of the manifest-pointer-swap commit. **Assert: after any injected failure, the manifest still points at the previous shards and the reconstructed DB deep-equals the last committed state.** No partial commit, ever.
2. **Export round-trip (EXPT-02):** Property-style — generate N people + maps + markers + photo blobs, `export → clear IndexedDB → import`, then assert **deep-equality of all entities AND byte-equality of every photo blob**.

---

## Wave 0 Requirements

- [x] `vitest.config.ts` + `playwright.config.ts` — both present at repo root
- [x] Fake `StorageProvider` — `src/storage/memory/InMemoryProvider.ts` (`implements StorageProvider`); interface-lock test `tests/_fakes/InMemoryProvider.test.ts`
- [x] `tests/_fakes/faultInjectingProvider.ts` — wraps the fake to throw at every commit-step boundary (drives STOR-05)
- [x] `tests/_fixtures/` — `sample-photo-a.png`, `sample-photo-b.png`, `generateDbFixture.ts` for round-trip tests
- [x] Framework install: `vitest`, `@vitest/ui`, `playwright`, `@playwright/test`, `fake-indexeddb`, `jsdom` all in `devDependencies`; `tests/setup.ts` imports `fake-indexeddb/auto`

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

- [x] All requirements have automated verify (every row green); live-only residuals justified Manual-Only
- [x] Sampling continuity: no 3 consecutive requirements without automated verify
- [x] Wave 0 delivered all test infra + fakes + fixtures (no MISSING references)
- [x] No watch-mode flags — suite runs via `npm test` → `vitest run` (CI-safe); `test:watch` is separate
- [x] Feedback latency < 30s (quick run: `npx vitest run` ≈ 11s for 84 tests)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-25 — `/gsd-validate-phase 1` audit (full suite green, 0 gaps)

---

## Validation Audit 2026-06-25

Audited the executed phase (State A: existing VALIDATION.md). Confirmed every requirement's
suggested test file exists and runs green, then ran the full suite to verify.

| Metric | Count |
|--------|-------|
| Requirements audited | 15 |
| COVERED (automated, green) | 15 |
| PARTIAL | 0 |
| MISSING | 0 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Evidence:** `npx vitest run` → 84/84 across 15 files (~11s); `npx playwright test` → 13/13 (~27s).
No auditor spawn required (no gaps). Manual-Only items unchanged — they are inherent live
Google-OAuth / browser-install behaviors, consistent with `01-VERIFICATION.md` (status `human_needed`,
4/5 truths verified, 1 present-behavior-unverified for live Drive connect).

---
phase: 02
slug: custom-fields-full-entity-model
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-26
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed retroactively from phase artifacts (State B: 7 SUMMARYs, no prior VALIDATION.md).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (unit + jsdom component) · Playwright 1.61.1 (E2E) |
| **Config file** | `vitest.config.ts` · `playwright.config.ts` (pre-existing from Phase 1) |
| **Quick run command** | `npm test` (`vitest run`) |
| **Full suite command** | `npm test && npm run test:e2e` |
| **Estimated runtime** | unit ~68s (sequential) · E2E ~1.7min (6 workers) |

> **Known caveat (project memory):** Under heavy machine load the default fork pool can
> false-fail with "Failed to start forks worker / Timeout". Re-run with
> `npx vitest run --no-file-parallelism` to confirm green — this is environmental, not a
> code defect. Last confirmed: 2026-06-26, **30 files / 169 tests pass**.

---

## Sampling Rate

- **After every task commit:** Run `npm test` (unit suite, ~68s).
- **After every plan wave:** Run `npm test` + the plan's new `e2e/*.spec.ts`.
- **Before `/gsd-verify-work`:** Full suite (unit + E2E) must be green.
- **Max feedback latency:** ~68s (unit) / ~170s (full).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | DATA-01 / DATA-03 | T-02-02 | Closed zod unions reject out-of-band field types/values | unit | `npx vitest run tests/domain/entityModel.schemas.test.ts` | ✅ | ✅ green |
| 02-01-02 | 01 | 1 | DATA-01 / DATA-03 | T-02-01 | BackupSchema.parse before single rw txn; round-trip integrity | unit | `npx vitest run tests/db/entityModel.crud.test.ts tests/sync/serializer.entities.test.ts tests/backup/roundtrip.entities.test.ts` | ✅ | ✅ green |
| 02-02-01 | 02 | 2 | DATA-01 | T-02-03 | Media GC refcount sweep never collects a shared blob | unit | `npx vitest run tests/db/delete.cascade.test.ts` | ✅ | ✅ green |
| 02-02-02 | 02 | 2 | DATA-01 | — | Remove-from-map ≠ delete; names render as React children | e2e | `npx playwright test e2e/delete-vs-remove.spec.ts` | ✅ | ✅ green |
| 02-03-01 | 03 | 3 | DATA-01 | — | Roving focus + aria-current; no router (local state) | unit + e2e | `npx vitest run tests/nav/viewSwitcher.a11y.test.tsx` · `npx playwright test e2e/browse-and-create.spec.ts` | ✅ | ✅ green |
| 02-03-02 | 03 | 3 | BRWS-01 / BRWS-02 | T-03-04 | Lazy thumb object-URL revoked on hash-change/unmount | e2e | `npx playwright test e2e/browse-and-create.spec.ts` | ✅ | ✅ green |
| 02-03-03 | 03 | 3 | Criterion 4 (privacy notice) | — | One-time notice; meta-flag persisted, not re-shown | e2e | `npx playwright test e2e/privacy-notice.spec.ts` | ✅ | ✅ green |
| 02-04-01 | 04 | 4 | DATA-03 | T-02-02 | validate type + required only (D-06); keep-or-quarantine never discards | unit | `npx vitest run tests/fields/customValue.test.ts` | ✅ | ✅ green |
| 02-04-02 | 04 | 4 | DATA-03 | T-03-01 / T-03-06 | All custom values render as React children; "(removed)" for missing link target | e2e | `npx playwright test e2e/custom-fields.spec.ts` | ✅ | ✅ green |
| 02-05-01 | 05 | 5 | DATA-01 (criterion 5) | T-03-02 / T-03-07 | Lightbox decode-error state; single full-res URL revoked on change/unmount | e2e | `npx playwright test e2e/lightbox.spec.ts` | ✅ | ✅ green |
| 02-05-02 | 05 | 5 | DATA-01 (criterion 6) | — | Keyboard reorder persists across reload (order IS the data) | e2e | `npx playwright test e2e/gallery-reorder.spec.ts` | ✅ | ✅ green |
| 02-06-01/02 | 06 | 6 | DATA-03 (D-05) | T-02-06-01 | coerceOnTypeChange re-validated through zod before put; quarantine rides reserved key | unit | `npx vitest run tests/db/applyFieldTypeChange.test.ts` | ✅ | ✅ green |
| 02-06-03 | 06 | 6 | DATA-03 (D-05) | — | FieldEditor.handleSave invokes applyFieldTypeChange on type change | e2e | `npx playwright test e2e/custom-fields.spec.ts` | ✅ | ✅ green |
| 02-06-04..07 | 06 | 6 | DATA-03 (WR-01/02/04/06) | T-02-06-02 | NaN→null; `tel:` href sanitized to dialable chars; per-record ChangeEvent contract | unit | `npx vitest run tests/entity-form/customFieldHints.test.tsx tests/db/entityModel.crud.test.ts` | ✅ | ✅ green |
| 02-07-01/02 | 07 | 7 | DATA-03 (D-05, CR-01) | — | Source-type-keyed quarantine; multi-hop preserves BOTH originals (no clobber) | unit | `npx vitest run tests/db/applyFieldTypeChange.test.ts` | ✅ | ✅ green |
| 02-07-03 | 07 | 7 | DATA-03 (WR-02) | T-03-01 | `Array.isArray` guard before `.map` on tags read path | unit | `npx vitest run tests/fields/customValue.test.ts` | ✅ | ✅ green |
| UAT-BLK | — | UAT | DATA-03 | — | v3 backfill `custom={}` on legacy records; `(custom ?? {})[id]` read guard | unit | `npx vitest run tests/db/migration.customBackfill.test.ts tests/profile/legacyCustomMap.test.tsx` | ✅ | ✅ green |
| UAT-F2 | — | UAT | DATA-03 | — | Set-aside (quarantine) values surfaced as recoverable, not data loss | unit | `npx vitest run tests/db/quarantinedEntries.test.ts tests/fields/setAsideNote.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure (Vitest + Playwright + fake-indexeddb + Testing Library, all installed in Phase 1) covers all phase requirements. No Wave 0 install was required.*

---

## Manual-Only Verifications

These are inherently-visual styling checks that jsdom and grep cannot assert. The
*behavior* underneath each is automated (E2E / a11y unit tests); only the visual
appearance remains manual.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Active nav item shows an **ink left-edge bar** (not amber) | DATA-01 / D-13 | Computed visual styling — a11y test proves roving focus + `aria-current` + `aria-label`, but not the bar's visual appearance | In a running app, Tab to the ViewSwitcher and confirm the active item has an ink left-edge bar; at viewport ≤900px confirm icon-only items show a hover `title` tooltip (F-3) |
| Lightbox **scrim appearance** (slate #1B2230 @ 92%) and reduced-motion shimmer | DATA-01 / criterion 5 | Pure visual — open/navigate/Esc/focus-return are E2E-covered (`lightbox.spec.ts`); the scrim color/animation is not | Open a gallery photo; confirm the full-viewport dark scrim and that `prefers-reduced-motion` suppresses the shimmer |
| Gallery first-tile **"Thumbnail" badge** placement | DATA-01 / criterion 6 | Pure visual — reorder + persistence are E2E-covered (`gallery-reorder.spec.ts`); the badge styling is not | Open an entity's gallery; confirm the first tile is badged "Thumbnail" and single-photo galleries show no reorder affordance |
| D-05 caution copy + Set-aside note **visual surfacing** | DATA-03 / F-2 | Copy presence is unit-tested (`setAsideNote.test.tsx`); the muted in-context styling is visual | Change a field type with a non-convertible value; confirm the caution shows before save and a muted "set aside, recoverable" note appears on the field afterward |

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify (unit or E2E); none deferred to Wave 0
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — N/A (no MISSING references)
- [x] No watch-mode flags (suite uses `vitest run`, not `vitest`)
- [x] Feedback latency < 170s (unit ~68s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-26

---

## Validation Audit 2026-06-26

| Metric | Count |
|--------|-------|
| Requirements audited | 4 (DATA-01, DATA-03, BRWS-01, BRWS-02) |
| Success criteria covered | 6/6 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated (manual-only) | 4 (all inherently-visual styling) |
| Suite at audit | 30 files / 169 tests green (`--no-file-parallelism`) |

**Verdict:** Phase 02 is **Nyquist-compliant** — every requirement and success criterion
has automated verification (unit + E2E) that exists on disk and runs green. No auditor
spawn was required (zero MISSING/PARTIAL gaps).

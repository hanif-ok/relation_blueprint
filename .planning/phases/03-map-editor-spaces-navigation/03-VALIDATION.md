---
phase: 3
slug: map-editor-spaces-navigation
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-27
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from the `## Validation Architecture` section of `03-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit/data-model) + Playwright (E2E/canvas interaction) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` (confirm during Wave 0) |
| **Quick run command** | `npx vitest run --no-file-parallelism` |
| **Full suite command** | `npx vitest run --no-file-parallelism && npm run test:e2e` |
| **Estimated runtime** | ~{N} seconds (measure in Wave 0) |

> `--no-file-parallelism` is mandatory: project memory [[vitest-forks-timeout-under-load]] notes
> `vitest run` false-fails with fork-worker startup timeouts when the machine is loaded; the flag
> serializes the run and avoids the environmental flake.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched module> --no-file-parallelism`
- **After every plan wave:** Run the full suite (`npx vitest run --no-file-parallelism && npm run test:e2e`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds (set after Wave 0 measures runtime)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | MAP-02/03/05/06/07 | T-03-05 | New zod fields optional-with-default; old data validates (no crash) | unit | `npx tsc --noEmit && npx vitest run tests/domain --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | MAP-05 / P1-UAT#6,#7 | T-03-06 / T-03-07 | version(4) backfill performs NO per-marker coord rewrite; pre-Phase-3 backup still parses | unit (migration + round-trip) | `npx vitest run tests/db/markerCoordMigration.test.ts tests/db/multiPlacement.test.ts tests/features/markerTransform.roundtrip.test.ts tests/features/bgTransform.anchor.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | MAP-07 | T-03-08 | coords guards scale==0 (no divide-by-zero on corrupt transform) | unit | `npx vitest run tests/features/coords.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | MAP-07 | T-03-08 | Active-map render composes through validated backgroundTransform; culling bounds mounted nodes | unit | `npx tsc --noEmit && npx vitest run tests/features --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | MAP-07 | T-03-09 / T-03-10 | Breadcrumb walk caps depth + visited-Set; cyclic/dangling parentId terminates safely | unit + E2E | `npx vitest run tests/features/hierarchy.test.ts --no-file-parallelism` (+ `npx playwright test e2e/map-switch.spec.ts`) | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | MAP-02 | — | Draw modes suppress single-pointer pan; two-finger always pans (gesture disambiguation) | unit | `npx vitest run tests/features/useToolMode.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | MAP-02 | T-03-01 | Zone labels render as Konva Text only (no dangerouslySetInnerHTML) | unit | `npx tsc --noEmit && npx vitest run tests/features --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 2 | MAP-02 | T-03-11 | Shapes persist via updateMap (validate→stamp→emit); size threshold rejects degenerate draws | unit + E2E | `npx vitest run tests/features/shapes.test.ts --no-file-parallelism` (+ `npx playwright test e2e/draw-shapes.spec.ts`) | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 3 | MAP-02 / P1-UAT#6 | T-03-13 | Transformer resets scale to 1 + bakes width/height; persists ONLY via repository | unit | `npx vitest run tests/features/transformerOverlay.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 3 | MAP-02 / P1-UAT#6,#7 | T-03-12 / T-03-01 | Image-space anchoring; name label XSS-safe; transform writes validated on load | unit | `npx tsc --noEmit && npx vitest run tests/features --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-04-03 | 04 | 3 | P1-UAT#6,#7 | T-03-07 | Marker transform + background transform persist; markers stay anchored across reload | E2E (round-trip) | `npx playwright test e2e/transform-marker.spec.ts e2e/transform-background.spec.ts` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 4 | MAP-03 | T-03-14 | Dangling object.layerId resolves to default layer (no drop/crash) | unit | `npx vitest run tests/features/layers.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 4 | MAP-03 | T-03-01 / T-03-15 | Layer names render as React text; LayerSchema validates on load | unit | `npx tsc --noEmit && npx vitest run tests/features --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-05-03 | 05 | 4 | MAP-03 | T-03-15 | Hidden hides / locked disables / reorder z-order reflected on canvas | E2E | `npx playwright test e2e/layers.spec.ts` | ❌ W0 | ⬜ pending |
| 03-06-01 | 06 | 5 | MAP-06 / MAP-07 | T-03-10 | Portal door-arch (not round); deleted target degrades to "destination deleted" (no crash) | unit | `npx tsc --noEmit && npx vitest run tests/features --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-06-02 | 06 | 5 | MAP-06 / MAP-07 | T-03-09 / T-03-10 | Create-or-pick sets child parentId; picker excludes current map (anti self-cycle); cancel removes portal | unit | `npx vitest run tests/features/portal.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-06-03 | 06 | 5 | MAP-06 / MAP-07 | T-03-10 | Double-click navigates / single-click selects; breadcrumb shows A▸child hierarchy | E2E | `npx playwright test e2e/portal.spec.ts` | ❌ W0 | ⬜ pending |
| 03-07-01 | 07 | 6 | MAP-05 | T-03-01 / T-03-04 | Pick = new Marker row (kind:person) via repository; picker rows XSS-safe + bounded | unit | `npx vitest run tests/features/personPicker.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-07-02 | 07 | 6 | MAP-05 | T-03-01 / T-03-10 | "Appears on" names render as React children; canonical-record edit propagates; deleted map skipped | unit | `npx vitest run tests/features/appearsOn.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 03-07-03 | 07 | 6 | MAP-05 | T-03-01 | Multi-placement (2 markers / 1 Person) + jump-to-placement + propagation, end to end | E2E | `npx playwright test e2e/place-person.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. "File Exists" ❌ W0 = the test file is created during the phase (Wave 0 test infra confirmed first); flips to ✅ once the owning task lands.*

**Nyquist continuity:** Every task above carries an `<automated>` command — there is no window of 3 consecutive implementation tasks lacking an automated verify, so `nyquist_compliant: true`.

---

## Wave 0 Requirements

- [ ] Coordinate round-trip test (image-space marker anchoring, D-16) — the highest-value test per RESEARCH (A1); prove identity-transform backfill before building the editor.
- [ ] Dexie `version(4)` migration test — schema triple (`types.ts` ↔ `schemas.ts` ↔ `db/schema.ts`) round-trips through export/restore (`BackupSchema`).
- [ ] Confirm vitest + Playwright config present; install/configure if missing.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Perceived no-jank at thousands of markers | Success criterion 5 | Subjective frame-rate threshold; needs ~1000-marker spike (RESEARCH A2) | Load a map with ~1000 markers, pan/zoom, confirm no visible stutter |
| Finger draw/place/transform on a touch device | D-19 | Real multi-touch gestures cannot be fully simulated in CI | On a tablet, draw a shape, place a person, pinch-zoom, resize a marker |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (all commands use `vitest run` / `playwright test`, never `--watch`)
- [ ] Feedback latency < {N}s (measure in Wave 0)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (Wave 0 to measure runtime / feedback latency)

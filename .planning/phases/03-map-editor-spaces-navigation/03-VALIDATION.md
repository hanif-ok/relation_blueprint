---
phase: 3
slug: map-editor-spaces-navigation
status: draft
nyquist_compliant: false
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
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run && npm run test:e2e` |
| **Estimated runtime** | ~{N} seconds (measure in Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run the full suite (unit + E2E)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds (set after Wave 0 measures runtime)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 0 | MAP-* | T-03-01 / — | {expected secure behavior or "N/A"} | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |

*Populated during planning once plan/task IDs exist. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

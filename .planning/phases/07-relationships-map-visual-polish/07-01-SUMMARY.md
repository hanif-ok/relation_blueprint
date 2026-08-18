---
phase: 07-relationships-map-visual-polish
plan: 01
subsystem: person-map / common
tags: [POL-01, color, legibility, dexie-meta, persistence, tdd]
status: complete
requires:
  - "src/db/schema.ts (db.meta table, version 1 — no migration)"
  - "src/app/tokens.ts (colors.paper, colors.slate)"
provides:
  - "relativeLuminance(hex) — WCAG sRGB→linear relative luminance"
  - "outlineColorFor(hex) — luminance-opposite neutral halo (contrast-ratio variant)"
  - "mapAppearance.ts — per-map colour persistence (loadAppearance/getMapAppearance/setMapColor/clearMapColor)"
  - "Dexie meta key 'mapAppearance' (Record<mapId,{labelColor,connectorColor}>)"
affects:
  - "Plan 02 (consumes both helpers to paint map labels/connectors)"
tech-stack:
  added: []
  patterns:
    - "One-row Dexie meta projection (graph/positionCache.ts)"
    - "PURE resolver + read-merge-write-in-rw-transaction (search/useScopeSelection.ts)"
    - "WCAG contrast-ratio neutral pick (research A1 — safer than 0.5 threshold)"
key-files:
  created:
    - "src/features/person-map/mapAppearance.ts"
    - "tests/features/color.test.ts"
    - "tests/features/mapAppearance.test.ts"
  modified:
    - "src/features/common/color.ts"
decisions:
  - "outlineColorFor uses WCAG contrast-ratio (Lmax+0.05)/(Lmin+0.05) rather than a 0.5-luminance threshold — deterministic, never a same-luminance halo (research A1)"
  - "clearMapColor drops the whole map key once no valid field remains, so a fully-reset map resolves cleanly to the D-06 default"
  - "Bad-hex coercion centralised in a single coerceHex(#rrggbb) gate — the trust boundary for T-07-01"
metrics:
  duration: "~5 min"
  completed: "2026-08-18"
  tasks: 2
  files: 4
  tests_added: 23
---

# Phase 7 Plan 01: Legibility Helpers + Per-Map Colour Persistence Summary

Built the pure, unit-tested "brain" of POL-01 — the luminance-derived outline helpers and the per-map colour persistence module — proving the D-04 legibility derivation and D-05/D-06 Dexie-meta read/merge/clear semantics at the pure-function seam before any pixel is painted (Plan 02 consumes them).

## What Was Built

### Task 1 — `relativeLuminance` + `outlineColorFor` (`src/features/common/color.ts`)
- `relativeLuminance(hex)`: WCAG sRGB→linear per-channel transfer, weighted `0.2126·R + 0.7152·G + 0.0722·B`, reusing the existing `hexToRgba` parse shape. White ≈ 1.0, black === 0, paper > 0.8, slate < 0.05.
- `outlineColorFor(hex)`: returns the luminance-opposite neutral (`colors.slate` for light fills, `colors.paper` for dark). Uses the WCAG contrast-ratio variant `(Lmax+0.05)/(Lmin+0.05)` against both neutrals and returns the higher-contrast one (tie → slate) — the research-A1 safer choice that removes the 0.5-threshold assumption.
- `hexToRgba` export left unchanged (still imported by ConnectorLayer / graphStyle).

### Task 2 — `mapAppearance.ts` per-map colour persistence (`src/features/person-map/mapAppearance.ts`)
- One Dexie `meta` row `'mapAppearance'`, shape `Record<mapId,{labelColor,connectorColor}>`. NO `db.version()` bump, NO new table, NO MapDoc field — rides the existing `meta` table.
- `loadAppearance()` reads the row (→ `{}` when absent). `getMapAppearance(record, mapId)` is the PURE resolver: absent map → D-06 defaults `{ labelColor: colors.paper, connectorColor: null }`; each stored field validated against strict `#rrggbb` and coerced to its default when malformed (threat T-07-01).
- `setMapColor` / `clearMapColor` read-merge-put inside a single `db.transaction('rw', db.meta, …)` (the `useScopeSelection` pattern) so rapid concurrent writes compose over the latest record. Solid `#rrggbb` stored straight from the picker — alpha applied at render in Plan 02, never baked.
- `clearMapColor` drops the map key once no valid field remains, so a reset map resolves cleanly to the default.

## Verification

- `npx vitest run tests/features/color.test.ts tests/features/mapAppearance.test.ts` → **23 passed (2 files)**.
- `git diff --exit-code src/db/schema.ts` → empty (NO migration — Dexie meta pattern).
- `git diff --exit-code package.json` → empty (zero new dependencies — T-07-SC).
- `npx tsc --noEmit` → clean.

## TDD Gate Compliance

Both tasks followed RED → GREEN. Gate commits present:
- Task 1: `test(07-01)` (bd2de63, 9 failing) → `feat(07-01)` (37d80f9, green).
- Task 2: `test(07-01)` (e79dcc4, import-fail RED) → `feat(07-01)` (b11fe1b, 14 green).
No REFACTOR commits needed — implementations were minimal and clean on first green.

## Threat Mitigations Applied

- **T-07-01 (Tampering, getMapAppearance)** — mitigated: a single `coerceHex(/^#[0-9a-fA-F]{6}$/)` gate coerces any non-`#rrggbb` stored value to its default (paper / null). Explicitly unit-tested (`'red'`, `'#12'`, `'#12ZZ34'`, `'rgba(...)'`, `'blue'`) — no malformed value can reach the canvas.
- **T-07-SC (Tampering, npm installs)** — mitigated: zero packages installed; `git diff --exit-code package.json` passes.
- **T-07-03 (meta row tampering)** — accepted per plan (regenerable local convenience, no integrity requirement).

## Deviations from Plan

None — plan executed exactly as written.

## Notes for Plan 02

- Import `outlineColorFor(labelColor)` to derive the halo stroke; import `hexToRgba(connectorColor, alpha)` to apply connector alpha at render (do NOT bake alpha into the stored hex).
- `getMapAppearance` is PURE and synchronous — call `loadAppearance()` once (or via `useLiveQuery` on `db.meta.get('mapAppearance')`) then resolve per map id.
- A map with no stored appearance renders identically to today (paper label, default hairline connector).

## Self-Check: PASSED

- FOUND: src/features/common/color.ts (modified)
- FOUND: src/features/person-map/mapAppearance.ts
- FOUND: tests/features/color.test.ts
- FOUND: tests/features/mapAppearance.test.ts
- FOUND commit bd2de63 (test color RED)
- FOUND commit 37d80f9 (feat color GREEN)
- FOUND commit e79dcc4 (test mapAppearance RED)
- FOUND commit b11fe1b (feat mapAppearance GREEN)

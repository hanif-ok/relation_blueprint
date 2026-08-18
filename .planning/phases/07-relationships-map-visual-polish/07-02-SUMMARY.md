---
phase: 07-relationships-map-visual-polish
plan: 02
subsystem: ui
tags: [konva, react-konva, dexie, color, legibility, map-editor, POL-01]

# Dependency graph
requires:
  - phase: 07-01
    provides: "color helpers (outlineColorFor, hexToRgba, relativeLuminance) + mapAppearance persistence (loadAppearance/getMapAppearance/setMapColor/clearMapColor)"
provides:
  - "Per-map marker-label colour with luminance-opposite Konva halo (fillAfterStrokeEnabled + shadow)"
  - "Per-map connector colour over a cased underlay Arrow (+2px, luminance-opposite @0.6 alpha)"
  - "Two native <input type=color> pickers + per-row Reset in the map LayersPanel Appearance block"
  - "MapView live threading: useLiveQuery(loadAppearance) → getMapAppearance → labelColor/connectorColor props + setMapColor/clearMapColor writers"
affects: [graph-visual-polish, map-editor, uat-legibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Konva luminance halo: fill + stroke=outlineColorFor(fill) + fillAfterStrokeEnabled keeps glyph colour/weight while outlining"
    - "Konva cased line: an underlay Arrow (+2px, opposite-neutral @0.6) beneath the coloured Arrow reads on any background"
    - "Leaf Konva components stay presentational — colours arrive as props; MapView owns the mapAppearance live query + writers"

key-files:
  created: []
  modified:
    - src/features/person-map/AvatarMarker.tsx
    - src/features/person-map/editor/ConnectorLayer.tsx
    - src/features/person-map/editor/LayersPanel.tsx
    - src/features/person-map/editor/LayersPanel.module.css
    - src/features/person-map/MapView.tsx

key-decisions:
  - "Casing luminance derived from a SOLID hex basis (lineHex), not the rgba CONNECTOR_HAIRLINE stroke — outlineColorFor cannot parse an rgba() string"
  - "Customised connector renders at full opacity (solid hex from the picker); the 55%-alpha hairline is kept only for the D-06 default"
  - "Colours are per-map, device-local, unsynced — never routed through repository/serializer/SyncEngine"

patterns-established:
  - "Pattern: Konva luminance halo/casing via outlineColorFor keeps user-chosen colours legible over any background image (POL-01, D-04)"
  - "Pattern: appearance prefs live in Dexie meta and thread through MapView props, keeping leaf canvas components stateless"

requirements-completed: [POL-01]

# Metrics
duration: 22min
completed: 2026-08-18
status: complete
---

# Phase 7 Plan 02: Customizable Map Colors (visible surface) Summary

**Per-map marker-label + connector colours with auto luminance halo/casing, wired through Konva render, two native LayersPanel pickers, and live Dexie-meta persistence — closing the Phase-04 white-on-white legibility gap structurally.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-18T17:28Z (approx)
- **Completed:** 2026-08-18T17:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AvatarMarker name label now paints in a per-map `labelColor` (default `colors.paper`) over a luminance-opposite halo — `stroke={outlineColorFor(labelColor)}`, `strokeWidth={2}`, `fillAfterStrokeEnabled`, `lineJoin="round"`, black shadow @0.55 — so any chosen colour reads on light AND dark maps.
- ConnectorLayer draws a casing underlay Arrow (+2px, `hexToRgba(outlineColorFor(lineHex), 0.6)`) beneath the coloured line; the resting line uses a per-map `connectorColor` (null → `CONNECTOR_HAIRLINE`, D-06); a selected connector still swaps its TOP line to amber while the casing stays (A8).
- LayersPanel gained an "Appearance" block: two labelled native `<input type="color">` pickers (`data-testid="map-label-color"` / `map-connector-color`), each in a ≥44px row with a per-row "Reset" button (`aria-label="Reset to default color"`).
- MapView reads appearance via `useLiveQuery(() => loadAppearance())` + `getMapAppearance(record, map.id)`, threads `labelColor`/`connectorColor` onto AvatarMarker/ConnectorLayer, and passes four `map.id`-bound `setMapColor`/`clearMapColor` writers to LayersPanel — so dragging a picker live-updates the halo-backed canvas.

## Task Commits

Each task was committed atomically:

1. **Task 1: Marker-label halo + connector casing (Konva render)** - `0ec29c6` (feat)
2. **Task 2: LayersPanel Appearance pickers + MapView live threading** - `5d509f2` (feat)

## Files Created/Modified
- `src/features/person-map/AvatarMarker.tsx` - `labelColor?` prop (default `colors.paper`) + luminance halo on the name-label Text; imports `outlineColorFor`.
- `src/features/person-map/editor/ConnectorLayer.tsx` - `connectorColor?: string | null` prop + cased underlay Arrow; solid-hex luminance basis for casing.
- `src/features/person-map/editor/LayersPanel.tsx` - Appearance block with two colour pickers + per-row Reset; five new presentational props.
- `src/features/person-map/editor/LayersPanel.module.css` - `.appearance` / `.colorRow` / `.colorLabel` / `.colorSwatch` / `.resetColor` styles (≥44px rows).
- `src/features/person-map/MapView.tsx` - `useLiveQuery(loadAppearance)` + `getMapAppearance`; threads colours to leaf components and writers to LayersPanel.

## Decisions Made
- **Casing luminance basis** — the casing colour is derived from a solid hex (`lineHex = selected ? amber : connectorColor ?? colors.hairline`), NOT from the actual stroke, because the default `CONNECTOR_HAIRLINE` is an `rgba()` string that `outlineColorFor` (which parses `#rrggbb`) cannot read. See Deviations.
- **Full-opacity custom connector** — a user-picked connector colour renders solid; the 55%-alpha hairline is reserved for the untouched D-06 default only (UI-SPEC: store solid hex, apply the default alpha at render).
- **Device-local, unsynced** — per-map colours live in the existing Dexie `meta` row via Plan 01's helpers; never wired into the manifest/sync path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Casing colour derived from a solid hex, not the rgba line stroke**
- **Found during:** Task 1 (ConnectorLayer casing)
- **Issue:** The plan's literal instruction computed `line = selected ? amber : (connectorColor ?? CONNECTOR_HAIRLINE)` and then `hexToRgba(outlineColorFor(line), 0.6)`. In the D-06 default case `line` is `CONNECTOR_HAIRLINE`, an `rgba(216, 210, 196, 0.55)` string. `outlineColorFor` does `hex.replace('#','')` + `parseInt(slice, 16)`, so an rgba string yields `NaN` channels and a meaningless casing colour.
- **Fix:** Split into two values — `lineHex` (always a `#rrggbb`: `selected ? amber : connectorColor ?? colors.hairline`) used only for `outlineColorFor`, and `lineStroke` (the actual paint: `selected ? amber : connectorColor ?? CONNECTOR_HAIRLINE`) used for the top Arrow. Casing = `hexToRgba(outlineColorFor(lineHex), 0.6)`. Default look and D-06 hairline alpha are preserved exactly.
- **Files modified:** src/features/person-map/editor/ConnectorLayer.tsx
- **Verification:** `npx tsc --noEmit` clean; `tests/features/color.test.ts` (9) + full suite (381) green.
- **Committed in:** `0ec29c6` (Task 1 commit)

**2. [Rule 3 - Blocking] Added LayersPanel.module.css Appearance styles**
- **Found during:** Task 2 (LayersPanel Appearance block)
- **Issue:** The new picker rows reference `styles.appearance` / `.colorRow` / `.colorLabel` / `.colorSwatch` / `.resetColor`, none of which existed; the block would render unstyled and miss the ≥44px accessibility target. `LayersPanel.module.css` was not in the plan's `files_modified` list.
- **Fix:** Added the five CSS classes (≥44px `.colorRow`, 28px swatch, amber focus-visible rings) reusing existing tokens.
- **Files modified:** src/features/person-map/editor/LayersPanel.module.css
- **Verification:** tsc clean; full unit suite green; visual verification deferred to MANUAL UAT (canvas legibility is not headless-assertable per plan).
- **Committed in:** `5d509f2` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary for correctness and the a11y hit-area contract. No scope creep — the appearance surface is exactly the two-picker + Reset block specified.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Verification
- `npx tsc -p tsconfig.json --noEmit` — clean.
- `npx vitest run` — full suite 381/381 passing (59 files); targeted `color.test.ts` (9) + `mapAppearance.test.ts` (14) green.
- `git diff --exit-code package.json` — no new dependency (native `<input type=color>` + existing Konva, threat T-07-SC satisfied).
- `src/features/graph/graphStyle.ts` — untouched (graph stays token-driven, D-01).
- **MANUAL UAT (VALIDATION.md, not headless-assertable):** light-map light label reads via dark halo; dark-map dark label reads via light halo; connector casing reads on both — screenshots pending.

## Known Stubs
None — the appearance path is fully wired (picker → mapAppearance meta → getMapAppearance → Konva props), not a placeholder.

## Next Phase Readiness
- POL-01 visible surface complete; Plan 01's derivation/persistence now drives the live canvas.
- Remaining Phase-7 work (draggable graph nodes IC-2/IC-3, dynamic ego focus IC-4) is independent of these files.
- Canvas legibility requires MANUAL UAT sign-off (screenshots) — flagged in VALIDATION.md, cannot be asserted headlessly.

## Self-Check: PASSED

- All 5 modified files present on disk.
- Commits `0ec29c6`, `5d509f2`, `20edd9d` present in worktree history.
- `npx tsc --noEmit` clean; full unit suite 381/381 green; `package.json` and `graphStyle.ts` untouched.

---
*Phase: 07-relationships-map-visual-polish*
*Completed: 2026-08-18*

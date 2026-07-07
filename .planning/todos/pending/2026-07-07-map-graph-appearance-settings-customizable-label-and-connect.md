---
created: 2026-07-07T02:05:52.553Z
title: Map & graph appearance settings — customizable label and connector colors
area: ui
files:
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/graph/graphStyle.ts
  - src/features/common/color.ts
  - src/app/tokens.ts
---

## Problem

Surfaced during Phase 04 UAT (see `.planning/phases/04-relationships-graph/04-UAT.md` → Out-of-Scope Notes, tests 6 & 7). Enhancement, not a defect — Phase 4 met its delivered contract.

Two related legibility gaps, both about colors being hardcoded with no user control:

1. **Marker name-label text color** — the map marker name label (Phase 03 D-20 "Names" toggle) uses a fixed text color. White label text over a light or white background image is hard to read. The user wants an option to change the name-label text color.
2. **Connector line color** — map relationship connectors (`ConnectorLayer`) draw a fixed warm hairline (derived from `colors.hairline` via `hexToRgba`), amber when selected. The user wants the connector line color to be customizable too.

## Solution

TBD. Design a small shared "appearance" settings surface rather than two one-off toggles:

- Consider a single "connector / label / graph appearance" settings cluster (color pickers) so map connectors, marker name-labels, and graph edges/labels read from one user-config source.
- Persist the chosen colors in the Dexie `meta` table (same pattern as the graph position cache / layer state), so it survives reload and syncs like other settings.
- Keep the token system as the default fallback (`src/app/tokens.ts` / `color.ts`); user overrides layer on top.
- Watch contrast: offer sensible defaults that read on both light and dark background images.

Scope note: spans map editor (Konva) + graph (Cytoscape) + a settings UI — likely a small dedicated phase or a slice of a future "polish/settings" milestone.

---
created: 2026-07-07T02:05:52.553Z
title: Graph node repositioning — drag to rearrange layout (no data mutation)
area: ui
files:
  - src/features/graph/GraphView.tsx
  - src/features/graph/positionCache.ts
---

## Problem

Surfaced during Phase 04 UAT (see `.planning/phases/04-relationships-graph/04-UAT.md` → test 10 / Out-of-Scope Notes). Enhancement, not a defect.

The relationship graph is viewer-only via Cytoscape `autoungrabify`, so nodes **cannot be dragged at all** today. The user would like to drag nodes to rearrange the layout for readability.

## Solution

TBD. Allow manual node repositioning while preserving the viewer-only DATA contract:

- Relax `autoungrabify` (or make it a mode toggle) so nodes become grabbable for LAYOUT only.
- Node drags must NEVER mutate entity/relationship data — this is purely visual arrangement.
- Optionally persist the user's manual positions to the existing `graphPositions` meta row (same mechanism `positionCache.ts` uses for the `cose` layout → `preset` reopen), so a hand-arranged layout survives reload. A node-set change still invalidates → fresh `cose` (D-13), unless we decide manual positions should be sticky.
- Keep `boxSelectionEnabled={false}` and tap-to-open-profile behavior intact.

Interacts with the "dynamic ego focus" todo — decide how a manual layout coexists with an ego-centric temporary re-layout (manual positions probably take precedence, or ego focus is a transient overlay that restores the saved layout on exit).

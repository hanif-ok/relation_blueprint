---
created: 2026-07-07T02:05:52.553Z
title: Dynamic ego focus — re-layout graph around the focused person, follow taps
area: ui
files:
  - src/features/graph/GraphView.tsx
  - src/features/graph/graphElements.ts
  - src/features/graph/positionCache.ts
---

## Problem

Surfaced during Phase 04 UAT (see `.planning/phases/04-relationships-graph/04-UAT.md` → test 10 / Out-of-Scope Notes). Enhancement, not a defect.

Today, opening the graph from a profile highlights that person's node with an amber "ego" ring and centers/zooms on it (D-12), but the overall layout does not change. The user wants ego focus to be more dynamic:

1. **Re-layout around the ego.** When a node is ego-focused (opened from a profile, or tapped), temporarily rearrange the graph into an ego-centric layout centered on that person — not just highlight + pan.
2. **Ego follows the tap.** While in ego focus, clicking a DIFFERENT node should re-ego onto that newly tapped person: move the amber highlight to them AND re-center the temporary layout around them.

## Solution

TBD. Likely a transient ego layout that does not clobber the saved base layout:

- On ego focus, run an ego-centric layout (e.g. `concentric` with the ego at center, or `breadthfirst` rooted at the ego, or `cose` on the ego's neighborhood) as a TEMPORARY overlay.
- On tapping another node while focused, recompute the ego layout around the new node (ego focus follows the tap) and re-apply the amber `.ego` class to the new node.
- Preserve the base/saved layout: exiting ego focus (e.g. closing the profile, or an explicit "reset view") restores the persisted `preset` positions from `positionCache.ts` rather than leaving the transient ego arrangement in place.
- Keep it viewer-only — no data mutation. Coordinate with the "graph node repositioning" todo on how manual positions and ego re-layout interact (ego layout is transient; manual/base layout is the resting state).

Scope note: pure Cytoscape layout/interaction work in `GraphView`; a good candidate for a future graph-polish slice.

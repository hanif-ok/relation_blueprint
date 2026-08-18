# Phase 7: Relationships & Map Visual Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 7-relationships-map-visual-polish
**Areas discussed:** Color scope & surface, Defaults & legibility, Graph node dragging, Dynamic ego focus

---

## Color scope & surface

### Which elements should get user-customizable colors?
| Option | Description | Selected |
|--------|-------------|----------|
| Map colors only | Marker name-label text + connector line only; matches criterion 1; graph stays token-driven | ✓ |
| Map + graph unified | Also graph edge + node-label colors from one shared config (added scope) | |

### How should the user pick a color?
| Option | Description | Selected |
|--------|-------------|----------|
| Native color picker | `<input type=color>`, full freedom, no deps; legibility handled separately | ✓ |
| Curated preset swatches | Small fixed set of legible palette-consistent colors | |
| Presets + custom | Swatches plus a custom picker | |

### Where should the color controls live?
| Option | Description | Selected |
|--------|-------------|----------|
| In the map LayersPanel | Alongside existing name-label/connector-label toggles; reuse existing surface | ✓ |
| New Settings view | Dedicated ViewSwitcher entry; central but brand-new surface | |
| Map toolbar popover | Separate appearance popover on the map toolbar | |

**User's choice:** Map-only scope, native color picker, controls in the LayersPanel.
**Notes:** Consistent with the Phase 3–4 "reuse existing surfaces" preference; graph color extension explicitly out of scope for this phase.

---

## Defaults & legibility

### How should labels/connectors stay legible over light AND dark backgrounds?
| Option | Description | Selected |
|--------|-------------|----------|
| Text halo/outline | Konva Text stroke + subtle shadow (cartographic technique); any color then reads on any background | ✓ |
| Auto-contrast from background | Sample background luminance and flip text light/dark; costly, fragile, can flicker | |
| Safer fixed default only | Just a better mid-tone default; doesn't guarantee legibility | |

### Should the chosen colors be per-map or global?
| Option | Description | Selected |
|--------|-------------|----------|
| Per-map | Each map remembers its own colors, keyed by map id in Dexie meta | ✓ |
| Global | One color pair across every map; simpler but can't tune per image | |

### What should the default colors be, before customization?
| Option | Description | Selected |
|--------|-------------|----------|
| Keep today's look + halo | Paper-white label + warm hairline @55%, made robust by the halo; existing maps unchanged | ✓ |
| New neutral defaults | New defaults for max legibility; changes every existing map's look | |
| You decide | Leave exact default hexes to planner/UI-spec | |

**User's choice:** Halo/outline for legibility, per-map colors, keep today's look as the halo-backed default.
**Notes:** Directly resolves the white-on-white gap from Phase 04 UAT (tests 6 & 7). Legibility is guaranteed structurally, freeing the color choice.

---

## Graph node dragging

### How should dragging be enabled (nodes are autoungrabify today; tap opens a profile)?
| Option | Description | Selected |
|--------|-------------|----------|
| Always draggable | Relax autoungrabify; Cytoscape separates tap (opens profile) from drag (moves node); no mode | ✓ |
| 'Arrange layout' toggle | Explicit View/Arrange mode; zero accidental moves but adds a mode | |

### Should hand-placed positions persist, and what happens when a new person is added?
| Option | Description | Selected |
|--------|-------------|----------|
| Sticky persist | Save on dragfree; a new node keeps everyone's positions and only auto-places the newcomer | ✓ |
| Persist, re-cose on node change | Reload restores positions but any node-set change re-runs fresh cose (current D-13) | |
| Session-only | Rearrange for the session; nothing persists across reload | |

### With sticky positions, should there be a way back to an automatic layout?
| Option | Description | Selected |
|--------|-------------|----------|
| 'Reset layout' button | Re-runs fresh cose and clears saved manual positions | ✓ |
| No reset control | Hand-arranged layout stays until nodes change; near one-way door | |
| You decide | Leave reset exposure to the planner | |

**User's choice:** Always-draggable, sticky persistence, plus a 'Reset layout' button.
**Notes:** Layout-only — never mutates data (viewer-only contract preserved). Sticky behavior changes the D-13 invalidation rule to preserve hand-arranged layouts.

---

## Dynamic ego focus

### When a person is ego-focused, how much of the graph re-arranges?
| Option | Description | Selected |
|--------|-------------|----------|
| Re-layout whole graph | All nodes stay visible, reorganized by distance from the ego | ✓ |
| Neighborhood only | Emphasize ego + 1–2 hops, dim/hide the rest | |

### Which arrangement should the ego layout use?
| Option | Description | Selected |
|--------|-------------|----------|
| Concentric | Ego at center, connections in rings by hop-distance; Cytoscape built-in | ✓ |
| Breadthfirst (rooted) | Tree rooted at the ego; hierarchical but org-chart feel | |
| You decide | Leave the exact algorithm to planner/research | |

### How does the user exit ego focus and get the base layout back?
| Option | Description | Selected |
|--------|-------------|----------|
| Reset button + close profile | Explicit exit-focus/Reset-view control + closing ProfileSidebar; transient ego never overwrites base | ✓ |
| Close profile only | Implicit exit on profile close; fewer controls, less discoverable | |
| You decide | Leave the exit affordance to the planner | |

**User's choice:** Whole-graph re-layout, concentric arrangement, exit via Reset-view button + closing the profile.
**Notes:** "Focus follows the tap" is locked by criterion 3. Ego is a transient overlay; the resting state is always the saved base layout.

---

## Claude's Discretion

- Exact ego-layout config (concentric spacing/`minNodeSpacing`, animate vs snap, breadthfirst for directed graphs).
- Placement of the Reset-layout / Exit-focus controls in the existing GraphView toolbar.
- Halo/outline exact stroke color, width, and shadow values (must guarantee contrast on light and dark).
- Per-map meta storage shape (one row per map vs a single `map id → colors` row) and exact default hex values.
- Large-graph performance of re-running concentric per tap and `cose` on reset.

## Deferred Ideas

- Unified map + graph appearance config (customizable graph edge/node-label colors).
- Curated preset swatches / presets+custom color input.
- Cross-device sync of appearance & manual-position prefs (travel with the database rather than device-local meta).
- Breadthfirst/hierarchical ego layout; neighborhood-only ego focus.
- Reviewed-but-not-folded todos: 2026-06-24 map-editor/media UX (keyword false-positive), 2026-07-03 Drive OAuth COOP header (separate infra).

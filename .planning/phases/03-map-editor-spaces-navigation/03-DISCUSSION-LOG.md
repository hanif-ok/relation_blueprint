# Phase 3: Map Editor — Spaces & Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 3-map-editor-spaces-navigation
**Areas discussed:** Drawing & layers, Map navigation & hierarchy, One person on many maps, Transform handles, Editor interaction (create gesture / new maps / touch / labels)

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Drawing & layers | Shapes/zones + layer system | ✓ |
| Map navigation & hierarchy | Switching maps, portals, nested map-groups | ✓ |
| One person on many maps | Multi-placement flow + surfacing | ✓ |
| Transform handles | Marker resize/rotate + background transform | ✓ |

**User's choice:** All four areas, then opted to explore more (editor interaction details).

---

## Drawing & layers

### Drawing tools (MAP-02)
| Option | Description | Selected |
|--------|-------------|----------|
| Rect, ellipse, line, polygon | Covers rectilinear rooms + irregular areas | ✓ |
| Rect, ellipse, line only | Simplest; no polygon vertex-editing | |
| Add freehand pencil | Most expressive but messy for clean outlines | |

### Zone first-classness
| Option | Description | Selected |
|--------|-------------|----------|
| Styled shape + text label | Zone = named fillable shape; not a 5th entity | ✓ |
| Distinct named region in a panel | Tracked separately, still not full entities | |
| Full entity w/ profile + fields | Zones get gallery/custom fields like Locations | |

### Styling control
| Option | Description | Selected |
|--------|-------------|----------|
| Minimal preset palette + fill toggle | Curated colors from UI-SPEC tokens | |
| Full: color, stroke, opacity, dashes | More control, more UI | |
| You decide | Follow UI-SPEC palette, keep minimal | ✓ |

### Layer system (MAP-03)
| Option | Description | Selected |
|--------|-------------|----------|
| User layers panel (shapes + markers) | Create/show/hide/lock/reorder, full Photoshop-lite | ✓ |
| Layers for shapes only | People always on a fixed top layer | |
| Fixed preset layers | Background/Zones/People, no custom layers | |

**Notes:** Zones deliberately kept out of the four-entity model; styling left to Claude within UI-SPEC tokens.

---

## Map navigation & hierarchy

### Active-map switcher
| Option | Description | Selected |
|--------|-------------|----------|
| Locations list + map switcher | Reuse Phase-2 Locations browse + toolbar switcher | ✓ |
| Toolbar dropdown only | Single picker, no list entry | |
| Only portals + hierarchy | No flat switcher; risk of getting stranded | |

### Portal marker (MAP-06)
| Option | Description | Selected |
|--------|-------------|----------|
| Distinct glyph, double-click travels | Single-click selects, double-click navigates; target = any Map | ✓ |
| Distinct glyph, single-click travels | One click navigates; harder to select for editing | |
| Reuse link-to-entity field | One-way non-navigable pointer (D-10) — would need rework | |

### Hierarchy definition (MAP-07)
| Option | Description | Selected |
|--------|-------------|----------|
| Parent pointer per map | Every level is a Map; no new entity type | ✓ |
| Drag into group containers | New container concept to model + sync | |
| Portals define nesting implicitly | Nesting as a hard-to-reorganize side-effect | |

### Up/down navigation
| Option | Description | Selected |
|--------|-------------|----------|
| Breadcrumb + descend via portals | Street ▸ Building ▸ Floor up; portals down | ✓ |
| Collapsible tree sidebar | Great overview, takes panel space | |
| Both breadcrumb + tree | Most capable, most UI | |

**Notes:** Spatial map-groups kept distinct from social Groups; hierarchy is purely Map→parent-Map.

---

## One person on many maps (MAP-05)

### Placement entry point
| Option | Description | Selected |
|--------|-------------|----------|
| From the map: pick existing person | On-map searchable picker drops a marker | ✓ |
| From the profile: 'Add to map →' | Profile-side target picker | |
| Both entry points | Most flexible, more UI | |

### Surfacing multi-placement
| Option | Description | Selected |
|--------|-------------|----------|
| List 'Appears on' w/ jump | Per-map links; makes criterion-4 propagation visible | ✓ |
| Count/badge only | Just 'On 3 maps', no links | |
| Nothing explicit | Discover by opening each map | |

### Per-map look
| Option | Description | Selected |
|--------|-------------|----------|
| Per-placement | Each marker has own position/size/rotation; identity shared | ✓ |
| Shared everywhere | Resize/rotate affects all maps | |

---

## Transform handles (Phase-1 UAT criteria 6 & 7)

### Transforms & targets (criterion 6)
| Option | Description | Selected |
|--------|-------------|----------|
| Resize + rotate, all objects | Transformer on markers, portals, shapes | ✓ |
| Resize all; rotate shapes/portals only | Avatars don't rotate | |
| Resize + rotate w/ angle snapping | Plus 15° snapping | |

### Background transform (criterion 7)
| Option | Description | Selected |
|--------|-------------|----------|
| Markers anchored to image | People move/scale with the background | |
| Background independent | Markers keep canvas positions | |
| You decide | Research picks a model that keeps placement stable | ✓ |

### Selection model
| Option | Description | Selected |
|--------|-------------|----------|
| Single-select | Click one object for handles | ✓ |
| Multi-select + marquee | Group transform; more work | |
| You decide | Default single-select | |

---

## Editor interaction (additional gray areas)

### Create gesture
| Option | Description | Selected |
|--------|-------------|----------|
| Tool palette + modes | Select/Rect/Ellipse/Line/Polygon/Portal/Person | ✓ |
| Direct manipulation, no modes | Drag from palette; harder precise zones | |
| You decide | Tool palette anyway (polygon needs a mode) | |

### Creating new maps
| Option | Description | Selected |
|--------|-------------|----------|
| Locations +New & inline portal target | Create-or-pick target when dropping a portal | ✓ |
| Locations +New only | Portals target existing maps only | |
| You decide | Enable inline target creation | |

### Touch capability
| Option | Description | Selected |
|--------|-------------|----------|
| Desktop-first; touch = view | Editing best-effort on touch | |
| Full touch parity | Draw/place/transform with fingers | ✓ |
| You decide | Desktop-first, touch deferred | |

### Marker labels
| Option | Description | Selected |
|--------|-------------|----------|
| Avatar only; name on hover/select | Clean canvas, best at scale | |
| Always-on name labels | Easier scanning, clutters | |
| Toggle via a layer/setting | User chooses show/hide | ✓ |

**Notes:** Full touch parity is more ambitious than the desktop-first recommendation — flagged in CONTEXT.md Specifics as a research-critical scope bump (Konva pointer/touch handling, gesture disambiguation, finger-sized hit targets, Transformer handle sizing).

---

## Claude's Discretion

- Shape/zone styling palette & fill defaults — follow UI-SPEC tokens, keep minimal (D-03).
- Background-transform coordinate model / marker-anchoring math — research/planner choose; constraint = placements stay stable and the transform persists & round-trips (D-16).
- Data-model shape for shapes/zones/layers — own cloud shard vs. sub-objects on `MapDoc` (planner tradeoff; manifest swap stays the sole atomic commit point).
- Portal glyph iconography, breadcrumb styling, layers-panel & tool-palette layout — per UI-SPEC.

## Deferred Ideas

- Multi-select / marquee selection + group transform.
- Full per-shape styling (color picker, stroke width, opacity, dashes).
- Zones as full entities (profile/gallery/custom fields).
- Map-group container nodes / drag-into-group tree.
- Collapsible tree sidebar of all maps.
- Always-on marker name labels (v1 defaults the toggle to hidden).
- Profile-side "Add to map →" placement entry point.

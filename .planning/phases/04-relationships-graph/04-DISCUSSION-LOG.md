# Phase 4: Relationships & Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 4-relationships-graph
**Areas discussed:** Direction & symmetry, Authoring flow, Map connectors, Graph view

---

## Direction & symmetry

| Option | Description | Selected |
|--------|-------------|----------|
| Per-link choice | Author picks directed ("mentor → mentee", arrow) or symmetric ("friends", plain line) per relationship; stores ordered from/to + a `directed` flag. | ✓ |
| Always directed | Every link from→to with an arrowhead; mutual ones show an arbitrary arrow. | |
| Always symmetric | No direction, all mutual; loses "mentor of / reports to / parent of". | |

**User's choice:** Per-link choice (recommended).
**Notes:** Single `label` carries the phrasing for v1; reciprocal per-direction labels deferred (D-02).

---

## Authoring flow & the existing "+ Relationship-link" entity

| Option | Description | Selected |
|--------|-------------|----------|
| Profile section; drop bare +New | "Relationships" section with "+ Add relationship" on Person & Group profiles; one record shows on both ends; remove endpoint-less "+ New → Relationship-link"; keep the browse list. | ✓ |
| Profile section; keep bare +New too | Same in-profile authoring, but standalone endpoint-less create path remains. | |
| Keep standalone-only | No in-profile section; set endpoints as fields on a created link. Weakest fit for REL-01. | |

**User's choice:** Profile section; drop the bare +New (recommended).

**Follow-up — what a relationship record shows:**

| Option | Description | Selected |
|--------|-------------|----------|
| Full entity profile | Reuse existing ProfileSidebar: endpoints + label/date/notes + gallery + custom fields. | ✓ |
| Slim edit popover | Only endpoints + label/date/notes; drop gallery/custom for relationships. | |

**User's choice:** Full entity profile (recommended) — reuse `ProfileSidebar`.

---

## Map connectors

| Option | Description | Selected |
|--------|-------------|----------|
| Person↔person, both placed; groups graph-only | Connector only when both people have a marker on that map; group links graph-only; non-interactive layer beneath markers, image-space, arrowhead if directed, labels OFF by default with toggle. | ✓ |
| Same, but labels ON by default | Identical rule, connector labels shown at midpoint by default. | |
| Also show group relationships on the map | Connect a person to each member of a related group; more complex, deferred. | |

**User's choice:** Finalized on the recommended option (person↔person, both placed; groups graph-only; labels off by default) after the user stepped away mid-discussion. Open to revision before planning.

---

## Graph view

| Option | Description | Selected |
|--------|-------------|----------|
| Whole-DB graph in left-nav; profile opens it focused | New "Graph" ViewSwitcher entry; nodes = people + groups, edges = relationship-links (labeled, arrow if directed); click node → profile; force-directed (`cose`), positions cached. | ✓ |
| Per-entity ego graph only | No global view; always the selected entity + neighbors. | |
| Both as distinct modes | A global view plus a separate ego/neighbors mode toggle. | |

**User's choice:** Finalized on the recommended option (whole-DB graph in the left-nav, profile-focus emphasis) after the user stepped away mid-discussion. Open to revision before planning.

---

## Claude's Discretion

- Reciprocal per-direction relationship labels (single `label` for v1).
- Number of connectors when a person has multiple markers on one map.
- Concrete Dexie endpoint shape + reverse index for "links where entity X is an endpoint".
- Final Cytoscape layout selection + node-position caching mechanism (light research per roadmap flag).
- Connector / graph visual styling — follow `01-UI-SPEC.md` tokens.

## Deferred Ideas

- Reciprocal per-direction labels.
- Group relationships rendered on the map (person→group-members connectors).
- Graph filtering/grouping by type or group (v2 GRPH-01).
- Search across relationships/groups/locations (v2 SRCH-03).
- Multi-select / bulk relationship editing.
- Social-network analytics over the graph (v2 ANLY-01).

## Flagged Blocker (not a decision)

- **"Can't navigate to a location from the list"** — the Phase-2/3 Locations-list → open-map path (D-05) is reported broken. It is the surface Phase 4 connectors render on. Recommend a `/gsd-debug` pass before/alongside Phase 4. Recorded in CONTEXT.md Domain section.

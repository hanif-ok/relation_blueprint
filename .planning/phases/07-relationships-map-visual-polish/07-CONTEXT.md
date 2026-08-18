# Phase 7: Relationships & Map Visual Polish - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Visually tailor and more fluidly navigate the **already-shipped** map/graph/relationship features (Phases 3–4). This is a **viewer-only polish** phase — it changes appearance and interaction, **never** the data model or the relationship/entity data. Three deliverables, one per ROADMAP success criterion:

1. **Customizable map colors** — the map marker **name-label text** color and the map relationship **connector line** color, with defaults that read on light *and* dark background images, persisted across reloads (criterion 1).
2. **Draggable graph nodes** — drag to rearrange the relationship graph for readability, strictly viewer-only (no data mutation); manual positions may persist (criterion 2).
3. **Dynamic ego focus** — opening/tapping a node re-lays-out the graph around that person, tapping a different node re-egos onto it, and exiting restores the saved layout (criterion 3).

**Requirements:** marked TBD in ROADMAP — formalize during `/gsd-plan-phase 7`. Source is the three Phase-04 UAT enhancement todos (folded below).

**Explicitly NOT this phase (clarify HOW, never add WHAT):**
- Customizable **graph** edge/node-label colors (graph keeps its token-driven look) → deferred; criterion 1 is map-only.
- Editing relationships inside the graph (graph stays viewer-only, PROJECT.md).
- Cross-device sync of appearance/layout prefs (criterion 1 specifies local Dexie `meta` persistence) → deferred.
- Any change to the relationship/entity data model.

</domain>

<decisions>
## Implementation Decisions

### Color customization (criterion 1)
- **D-01:** Scope is **MAP-ONLY** — exactly the two colors the goal names: (a) map marker **name-label text** color and (b) map relationship **connector line** color. Graph edge/node-label colors stay token-driven this phase. (A unified map+graph appearance config was considered and **deferred**.)
- **D-02:** Color input is a **native `<input type="color">` picker** — full freedom, zero new dependencies. Legibility is guaranteed structurally by the halo (D-04), **not** by restricting the palette.
- **D-03:** Controls live **in the existing map LayersPanel** (`LayersPanel.tsx`), alongside its Phase-3 D-20 name-label / connector-label toggles. Reuse an established surface — **no new top-level view**.

### Legibility & defaults (criterion 1)
- **D-04:** Legibility via a **text halo/outline** — render the marker name label with a thin contrasting Konva `Text` stroke + subtle shadow (the standard cartographic-label technique), and give connector arrows a matching subtle outline/shadow. Any user-chosen color then reads over **light AND dark** background images.
- **D-05:** Colors are **PER-MAP** — each map remembers its own label + connector color, keyed by **map id in the Dexie `meta` table** (same key/value pattern as `graphPositions` / `scopeSelection`; **no schema migration**, [[schema-gate-dexie-false-positive]]). Fits controls living in the per-map LayersPanel, and lets a light map and a dark map each be tuned.
- **D-06:** Defaults **keep today's look** — default label = current paper-white (`colors.paper`), default connector = current warm hairline @55% — now made robust by the D-04 halo. Existing databases render identically until the user customizes; nothing shifts unexpectedly.

### Graph node dragging (criterion 2)
- **D-07:** Nodes become **always draggable** — relax `autoungrabify` in `GraphView.tsx`. Cytoscape natively distinguishes a **tap** (no movement → opens `ProfileSidebar`, existing D-12 behavior preserved) from a **drag** (moves the node). No mode toggle. Dragging is **layout-only and NEVER mutates** entity/relationship data (viewer-only contract, PROJECT.md + Phase 4 D-13).
- **D-08:** Manual positions are **STICKY-persisted** — save on `dragfree` to the existing `graphPositions` meta row (`positionCache.ts`). This **changes the current D-13 invalidation rule**: when the node-set changes (a person/group added), **keep everyone's saved positions and only auto-place the newcomer**, rather than blowing away the hand-arranged layout with a fresh `cose`.
- **D-09:** A **'Reset layout'** control re-runs a fresh `cose` and clears the saved manual positions — the escape hatch back to an automatic arrangement.

### Dynamic ego focus (criterion 3)
- **D-10:** Focusing **re-lays-out the WHOLE graph** around the ego (all nodes stay visible, reorganized by distance) — not just the highlight+pan it does today (Phase 4 D-12).
- **D-11:** The ego arrangement is **concentric** (ego at center, connections in rings by hop-distance). Cytoscape built-in; cheap.
- **D-12:** Ego is a **transient overlay** — it **never overwrites the persisted base positions**. Enter: opening the graph from a profile (existing `egoId` path) **or** tapping a node (tap = open profile **and** re-ego + re-layout; "focus follows the tap" is locked by criterion 3). Exit: an explicit **exit-focus / 'Reset view'** control restores the saved base layout, and closing the `ProfileSidebar` also exits focus.

### Cross-cutting reconciliation
- **D-13:** **Two distinct reset actions — do not conflate.** **Reset layout** (D-09) discards manual positions and re-runs `cose`. **Exit focus / Reset view** (D-12) leaves the transient ego overlay and returns to the **saved base** layout, discarding nothing. The **resting state is always the base layout** (manual or `cose`); ego focus is a transient overlay on top of it.

### Claude's Discretion
- **Ego-layout config:** concentric is chosen (D-11), but exact params (spacing, `minNodeSpacing`, `animate` vs snap, whether a directed graph should root a `breadthfirst` instead) — planner/research discretion within "ego at center."
- **Graph toolbar placement:** where the Reset-layout (D-09) and Exit-focus (D-12) controls sit in the existing `GraphView` toolbar (which already hosts the "Relationship labels on/off" toggle + viewer note) — planner/UI-spec discretion.
- **Halo parameters:** exact halo/outline stroke color, width, and shadow values — must guarantee contrast on both light and dark backgrounds (D-04).
- **Per-map meta shape & default hexes:** one row per map vs a single `map id → colors` row; exact default hex values within the halo-backed "reads on light and dark" constraint (D-05/D-06).
- **Large-graph performance:** re-running concentric on every tap and `cose` on reset — planner should watch; graphs are viewer-only and typically modest, but reuse the Phase-4 `animate:false` / viewport patterns.

### Folded Todos
- **Map & graph appearance settings — customizable label and connector colors** (`.planning/todos/pending/2026-07-07-map-graph-appearance-settings-customizable-label-and-connect.md`) → criterion 1 (D-01…D-06). Folded **map-only**; the todo's speculative graph-color extension is deferred.
- **Graph node repositioning — drag to rearrange layout** (`.planning/todos/pending/2026-07-07-graph-node-repositioning-drag-to-rearrange-layout.md`) → criterion 2 (D-07…D-09).
- **Dynamic ego focus — re-layout around focused person, follow taps** (`.planning/todos/pending/2026-07-07-dynamic-ego-focus-graph-re-center-and-follow-tapped-node.md`) → criterion 3 (D-10…D-13).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (scope anchor)
- `.planning/ROADMAP.md` §"Phase 7: Relationships & Map Visual Polish" — the three success criteria (Requirements marked TBD → formalize during plan-phase).

### Source todos (the phase's origin — read for full problem framing)
- `.planning/todos/pending/2026-07-07-map-graph-appearance-settings-customizable-label-and-connect.md` — label/connector color gap (Phase 04 UAT tests 6 & 7).
- `.planning/todos/pending/2026-07-07-graph-node-repositioning-drag-to-rearrange-layout.md` — viewer-only node dragging.
- `.planning/todos/pending/2026-07-07-dynamic-ego-focus-graph-re-center-and-follow-tapped-node.md` — dynamic ego re-layout + follow taps.

### Prior decisions this phase builds directly on
- `.planning/phases/04-relationships-graph/04-CONTEXT.md` — **D-13** (graph viewer-only + `cose` + preset position cache), **D-12** (node tap → `ProfileSidebar`; opening from a profile = ego emphasis), **D-08/D-09** (connectors in image-space through `backgroundTransform`; connector labels off-by-default toggle).
- `.planning/phases/03-map-editor-spaces-navigation/03-CONTEXT.md` — **D-20** marker name-label toggle (the very label whose color becomes customizable), LayersPanel as the per-map toggle surface, and the image-space coordinate model.

### Visual language & constraints (always in force)
- `.planning/phases/01-storage-spine-first-person-on-a-map/01-UI-SPEC.md` — token palette (`src/app/tokens.ts` / `tokens.css`), **amber reserved for selection + ego only (A8)** — user colors must not appropriate amber's role; the **canvas→assistive-tech bridge** (graph/connectors are canvas-opaque to screen readers — selection announces via `ProfileSidebar`); **no `dangerouslySetInnerHTML`** (all labels are canvas text).
- `.planning/PROJECT.md` — graph is **viewer-only** (no editing in the graph view), relationships are data-driven, serverless / free-OSS / single-curator constraints.

### Prescriptive stack
- `.claude/CLAUDE.md` — Konva 10.3 + react-konva (map canvas), Cytoscape 3.34 + react-cytoscapejs (graph, `concentric`/`cose` are built-in layouts), Dexie 4 `meta` table for settings persistence. **No new dependencies expected** (native color input; built-in Cytoscape layouts).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/features/graph/GraphView.tsx`** — the graph host. Relax `autoungrabify` (D-07); add a `dragfree` handler to persist manual positions (D-08); add concentric ego re-layout driven by `egoId` + node taps (D-10…D-12); add toolbar controls (Reset layout D-09, Exit focus D-12) beside the existing "Relationship labels" toggle. The existing `registerCy` once-attach pattern, `layoutstop` save, and the two ego effects (class-toggle + center/zoom keyed on `egoId`) are the exact hooks to extend.
- **`src/features/graph/positionCache.ts`** — `savePositions` / `loadPositions` / `hasCachedPositions` on the `graphPositions` meta row. D-08 sticky behavior **modifies `hasCachedPositions` semantics**: a partial cache should place only the missing node(s), not force full invalidation. D-09 Reset clears the row.
- **`src/features/graph/graphElements.ts`** — `toGraphElements` + `GraphPositions` type; preset positions feed from cache.
- **`src/features/graph/graphStyle.ts`** — token-driven Cytoscape stylesheet; **UNCHANGED this phase** (graph colors stay token-driven per D-01). Ego/`:selected` are already amber.
- **`src/features/person-map/AvatarMarker.tsx`** — the name-label Konva `Text` (currently `fill={colors.paper}`, ~l.265). Add a per-map customizable `fill` + the D-04 halo stroke/shadow (D-02/D-04/D-06).
- **`src/features/person-map/editor/ConnectorLayer.tsx`** — connector `Arrow` stroke (currently `CONNECTOR_HAIRLINE` = `hexToRgba(colors.hairline, 0.55)`). Add a per-map customizable line color + subtle outline/shadow (D-02/D-04/D-06); amber-on-select stays.
- **`src/features/person-map/editor/LayersPanel.tsx`** — the per-map toggle surface; the two color pickers mount here (D-03).
- **`src/app/tokens.ts` + `src/features/common/color.ts`** — default palette + `hexToRgba` helper; defaults fall back here (D-06).
- **`db.meta`** (`src/db/schema.ts`) — established key/value settings store (`graphPositions`, `scopeSelection`, `privacyNoticeDismissed`, syncedMedia). Per-map colors persist here keyed by map id (D-05) — no new table, no migration.

### Established Patterns
- **Dexie `meta` key/value row is THE settings-persistence pattern** (`positionCache.ts`, `useScopeSelection.ts`, `App.tsx` privacy notice). Colors + sticky positions ride it — no new table, no migration ([[schema-gate-dexie-false-positive]]).
- **Viewer-only graph contract** — no drag or interaction may mutate entity/relationship data (PROJECT.md, Phase 4 D-13). Dragging (D-07) and ego re-layout (D-10) are layout-only.
- **Canvas→AT bridge** — node/marker selection announces through `ProfileSidebar`; preserve this on tap even though tap now also re-egos (D-12).
- **Amber reserved for selection + ego only** (UI-SPEC A8) — customizable user colors must not take amber's role; selection/ego stay amber.
- **Default-OFF / opt-in richness** — name labels + connector labels default hidden (Phase 3 D-20 / Phase 4 D-09); customization layers on top of those existing toggles.

### Integration Points
- **Colors and manual positions are LOCAL appearance prefs** (like `graphPositions`) — a regenerable device convenience, **not authored data**. Per D-05 they live in Dexie `meta`, **device-local and unsynced** (matching `graphPositions`). If a future phase wants them to travel with the database across devices, that needs manifest/sync wiring — see [[sync-push-pull-gap-pattern]]. Kept out of scope here per criterion 1's "(Dexie meta)" wording.
- **LayersPanel is per-map** and already reads/writes per-map toggle state — the color pickers hook the same per-map state path (D-03/D-05).
- **GraphView toolbar** currently holds one toggle + a viewer note — the Reset-layout / Exit-focus controls join it (D-09/D-12).

</code_context>

<specifics>
## Specific Ideas

- **Reuse existing surfaces over inventing new ones** — a strong preference carried from Phases 3–4 and reaffirmed here: color pickers in the existing LayersPanel, graph controls in the existing GraphView toolbar, taps reuse ProfileSidebar. The user explicitly chose LayersPanel over a new Settings view.
- **Guarantee legibility structurally, not by restricting choice** — the user paired a free native color picker (D-02) with a halo/outline (D-04) so any color reads, rather than limiting the palette. This resolves the concrete **white-on-white gap on a light background image** (Phase 04 UAT tests 6 & 7) that motivated the phase.
- **Hand-arranged layout should be durable** — the user chose sticky persistence (D-08) with a clear escape hatch (D-09), signalling that manual arrangement is effort worth preserving across edits/reloads.
- **The user took the recommended option on every question** — the recommendations reflect: keep scope tight to the three criteria, keep the graph strictly viewer-only, and change nothing about existing maps until the user opts in.

</specifics>

<deferred>
## Deferred Ideas

- **Unified map + graph appearance config** (customizable graph edge + node-label colors from one shared source) — considered; out of scope for criterion 1 (map-only). Graph keeps its token-driven look (D-01).
- **Curated preset swatches / presets+custom color input** — considered; chose the native picker (D-02).
- **Cross-device sync of appearance & manual-position prefs** (travel with the database rather than device-local `meta`) — deferred; criterion 1 specifies local Dexie-meta persistence, matching the unsynced `graphPositions` pattern.
- **Breadthfirst / hierarchical ego layout** — considered; chose concentric (D-11).
- **Neighborhood-only ego focus** (dim/hide non-neighbors) — considered; chose whole-graph re-layout (D-10).

### Reviewed Todos (not folded)
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** (`.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md`) — matched at 0.9 but a **keyword false-positive** (already addressed in Phases 2–3; it's map-editor/media UX, not relationship/graph polish). Same not-folded call as Phase 4.
- **Enable COOP header in production for Drive OAuth** (`.planning/todos/pending/2026-07-03-enable-coop-header-in-production-for-drive-oauth.md`) — matched at 0.2; a separate deployment/infra concern (the Drive OAuth GitHub Pages COOP blocker, [[drive-oauth-coop-github-pages-blocker]]), unrelated to visual polish. Not folded.

</deferred>

---

*Phase: 7-relationships-map-visual-polish*
*Context gathered: 2026-08-18*

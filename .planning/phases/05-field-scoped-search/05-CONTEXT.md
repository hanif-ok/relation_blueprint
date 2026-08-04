# Phase 5: Field-Scoped Search - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **signature feature**: fuzzy search over **People** across their attributes, with **per-attribute checkboxes** that scope which fields a query matches — the "smith" (matches names) vs "blacksmith" (job field off) behavior — staying fast toward thousands of records via an index that updates **incrementally** rather than rebuilding every load.

**Requirements in scope:** SRCH-01 (fuzzy search people across attributes), SRCH-02 (per-attribute checkbox scoping).

**Success criteria (from ROADMAP.md):**
1. Fuzzy-search people across their attributes with tolerant, relevant matches.
2. Toggle per-attribute checkboxes to scope which fields a query matches.
3. Stay fast toward thousands of multi-field records; index updates incrementally on entity changes, not a full rebuild every load.

**Explicitly NOT this phase (clarify HOW, never add WHAT):**
- **Search across Locations / Groups / Relationship-links** → **v2 (SRCH-03)**. This phase is People-only, locked by the roadmap.
- Filter/group the relationship graph → v2 (GRPH-01).
- Mega.nz provider → Phase 6.
- Map/graph visual polish (label/connector colors, draggable graph nodes, dynamic ego focus) → Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Search surface (SRCH-01/02)
- **D-01:** Search gets a **dedicated "Search" view in the left-nav `ViewSwitcher` rail** (a new `ViewKey` `'search'`, sibling to People/Graph), **not** a filter bolted onto the People browse list and **not** a global top-bar box. It carries **no count pill** (like `map`/`graph`). The surface is: a search input + a field-scope checkbox panel + a results list that reuses the `BrowseRow` pattern.
- **D-02:** Results are **live as-you-type** (debounced), with MiniSearch queries running on the **main thread**. A **Web Worker is a fallback only if profiling shows main-thread jank** at large DBs — it is NOT built up-front (roadmap: "optional Web Worker for large databases").

### Field scoping — the signature feature (SRCH-02)
- **D-03:** **Every searchable person attribute gets its own scope checkbox:** the built-ins (name, phone, description, tags, notes) **plus every custom field defined on People**. **Photo/gallery are excluded** (no text). **Number/date** custom values are **stringified** for indexing; **`link-to-entity`** is indexed by the **target entity's display name**. (Custom fields are exactly what the blacksmith example scopes against — a "job" field must be a togglable checkbox.)
- **D-04:** **Default scope = ALL fields ON.** Scoping is **subtractive** — the user unchecks a field to exclude it (uncheck "job" → "smith" matches names, not blacksmiths). This matches the signature example's mental model where scoping is a subtractive act.
- **D-05:** The user's checkbox scope **persists across sessions** (stored in Dexie meta/settings). The checkbox list is derived **live from the People field schema**: **soft-deleted custom fields drop out automatically**; the persisted selection is keyed by **stable `FieldDef.id`** so a field **rename** does not reset it. (No new synced entity — this is a local UI preference.)

### Fuzzy matching & ranking (SRCH-01)
- **D-06:** **Moderate typo tolerance** — MiniSearch `fuzzy` (edit distance scaled to term length, ~0.2) combined with **`prefix: true`** so partial words match as you type ("smi" → "Smith"). Not exact-only; not aggressive.
- **D-07:** **Field-boosted ranking** — **name** weighted highest, then **tags/phone**, then **description/notes**; **custom fields get a neutral default weight**. A name hit outranks a stray notes hit.
- **D-08:** Results begin at the **2nd typed character** (a 1-char prefix matches nearly everyone at thousands of records — avoid dumping the whole DB on the first keystroke).

### Results & row behavior
- **D-09:** A result row **reuses `BrowseRow`** (thumbnail + name) and adds a **matched-field snippet** on the secondary line — it shows **which field matched**, with the matched term **highlighted** (e.g. `job: black[smith]`). When the match is on the name, fall back to the normal tags secondary line.
- **D-10:** Row actions **mirror `BrowseRow`** (Phase 2 D-16): **click → `ProfileSidebar`**; plus **"Show on map"** (People are spatial). Reuse the existing row-action wiring.
- **D-11:** **Distinct states:** a **pre-query prompt** ("Search people by name, tags, or any field…"); a **zero-match** message ("No people match "{query}""); and an **"all fields off" guard** that tells the user nothing is searchable rather than showing a mysteriously empty result set. Mirrors `BrowseList`'s careful state handling.

### Claude's Discretion (deferred to research/planner)
- **Index lifecycle & persistence:** whether to rebuild the MiniSearch index **in-memory from Dexie on load** vs. **persist a serialized index** locally; and the concrete mechanism for **incremental updates** (hooking the repository's change events → MiniSearch `add`/`replace`/`discard`). The locked requirement (criterion 3) is only *that* it updates incrementally and stays fast toward thousands — the mechanism is planner discretion (standard MiniSearch territory; roadmap flags skip-research).
- **Web Worker offload** — only if profiling shows main-thread jank; not built up-front (D-02).
- **Tuning knobs** — debounce interval, exact fuzzy constant, precise per-field boost weights, snippet-context length.
- **Field-scope panel layout** within the Search view (fixed sidebar vs. collapsible) — follow `01-UI-SPEC.md` tokens; a `/gsd-ui-phase` pass may refine.
- **Keyboard focus / "/" shortcut** to jump to search — optional polish, not decided.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (scope + wording)
- `.planning/ROADMAP.md` §"Phase 5: Field-Scoped Search" — the 3 success criteria, People-only scope, and the skip-research / MiniSearch-per-field-indexing / optional-Web-Worker flag.
- `.planning/REQUIREMENTS.md` — SRCH-01, SRCH-02 wording + traceability. **SRCH-03 (search across locations/groups) is v2 — NOT this phase.**

### Entity & field model this phase indexes (the foundation the checkboxes stand on)
- `.planning/phases/02-custom-fields-full-entity-model/02-CONTEXT.md` — **D-01** per-type field schema, **D-03** field-defs tied to one entity type, **D-05** soft-delete with retained/hidden values, and the code_context note: "*Phase 5 search will index custom-field values per field … keep field identity stable (stable field IDs) so a soft-deleted/renamed field doesn't break the index.*"
- `src/domain/types.ts` — `Person` (name/phone/description/tags/notes/gallery/`custom`) and `FieldDef` (`id`/`entityType`/`label`/`type`/`options`/`targetType`/`deleted`) — the exact shapes the index reads.

### Surfaces to reuse (strong Phases 2–4 reuse-over-invent preference)
- `src/features/nav/ViewSwitcher.tsx` — add the `'search'` `ViewKey` + `VIEW_ITEMS` entry; include `'search'` in `NO_PILL`.
- `src/features/browse/BrowseList.tsx` + `BrowseRow.tsx` + `browseTypes.ts` — the 64px windowed row list, lazy media (`useEntityThumb`), and row actions (`onOpen`/`onShowOnMap`) to reuse for results; `isSpatial('people')` drives Show-on-map.
- `src/features/profile/ProfileSidebar.tsx` — opened on a result click.
- `src/db/repository.ts` — the single mutation path (stamps `updatedAt`+`dirty`, emits a change signal); the incremental-index updater subscribes here.
- `src/db/schema.ts` — **Dexie** (a meta/settings store persists the field-scope selection; `people` indexed by name/updatedAt). **NOTE: Dexie, not Drizzle — there is no migration-push step** ([[schema-gate-dexie-false-positive]]).

### Project constraints (always in force)
- `.planning/PROJECT.md` — the signature-feature definition ("field-scoped smart search"); serverless / free-OSS-only / single-curator; "degrade gracefully from dozens to thousands"; provider-level-security v1 boundary.

### Prescriptive stack
- `.claude/CLAUDE.md` — **MiniSearch 7.2.x** is the prescribed lib (per-field indexing; restrict `fields` at query time = the checkboxes; `fuzzy` + `prefix` + `boost`), **NOT yet installed** (the one net-new dep this phase; MIT/free-OSS). Optional Web Worker for large DBs; Fuse.js only as a small-DB fallback (not needed here). **No `dangerouslySetInnerHTML`** — matched-term highlighting must render as React children.

No external ADRs exist — decisions are captured in this file and the docs above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/features/nav/ViewSwitcher.tsx`** — `ViewKey` union + `VIEW_ITEMS` list + `NO_PILL` set. Add `{ key: 'search', label: 'Search', icon: Search }` (lucide `Search`) and put `'search'` in `NO_PILL` (no count pill). Roving-focus nav wiring is generic — a new item rides it.
- **`src/features/browse/BrowseRow.tsx` / `BrowseList.tsx`** — fixed 64px-row windowing, lazy media via `useEntityThumb`, and row actions (`onOpen`/`onEdit`/`onDelete`/`onShowOnMap`/`onOpenMap`). The results list reuses the row; the matched-field snippet is a secondary-line variant.
- **`src/features/browse/browseTypes.ts`** — `isSpatial('people') === true` gates the Show-on-map action; `entityTags`/`entityMedia` helpers reused for row rendering.
- **`src/db/repository.ts`** — single write path stamping `updatedAt`+`dirty` and emitting a change signal; the incremental MiniSearch updater hooks here (add on create, replace on update, discard on delete). `deleteEntity` cascade already fires.
- **`src/db/schema.ts`** — a meta/settings store already holds app state (persist the field-scope selection there); `people` table indexed by `name`/`updatedAt`.
- **`src/features/profile/ProfileSidebar.tsx`** — opened on result click (reuses `onOpen`).

### Established Patterns
- **ViewSwitcher-driven single-surface swap** (Phase 2 D-13) — Search is a new top-level view, not a modal or router.
- **Type ↔ zod ↔ Dexie triple** — search itself needs **no schema change** (read-only over existing tables); the persisted scope is app-meta, not a new entity. Adding MiniSearch is a **build-time dep with no data migration**.
- **Windowed lists at a fixed row height** keep thousands cheap — the results list follows the same windowing as `BrowseList`.
- **Live reactivity via `dexie-react-hooks`** — the index must stay in sync with the same live data through repository change events (criterion 3's incremental update).
- **No `dangerouslySetInnerHTML` — ever** — matched-term highlighting wraps the matched substring in a React element (`<mark>`/`<span>`), never injected HTML (XSS boundary; a leaked Drive token is the modeled threat).

### Integration Points
- **New dependency:** `minisearch` (MIT/free-OSS, per `.claude/CLAUDE.md`) — the only net-new lib this phase.
- **Index source = the Dexie `people` table** (source of truth). The index is a **derived, rebuildable projection** — it is **not** persisted to the cloud/backup, so **no serializer / SyncEngine / `BackupSchema` change**. Any locally cached serialized index lives in Dexie only and is safely rebuildable.
- **Persisted field-scope selection** is a **local UI preference** (Dexie meta); it does not need to sync to the cloud (single-curator) — planner may decide whether it round-trips.
- **Custom-field awareness:** the searchable field list = live People `FieldDef`s (non-deleted) + built-ins; keep it in sync as fields are added/renamed/soft-deleted (stable `FieldDef.id`).

</code_context>

<specifics>
## Specific Ideas

- **The "smith vs blacksmith" behavior is the whole point** — the field checkboxes and the **subtractive all-on default** (D-04) are the core UX. The **matched-field snippet** (D-09) exists specifically so the user can *see* the scoping working and trust it.
- **Reuse-over-invent** continues from Phases 2–4: Search is a `ViewSwitcher` entry, results reuse `BrowseRow`, clicks reuse `ProfileSidebar`, and the scope preference persists in the existing meta store.
- **The user accepted the recommended option on every question across all four areas** — the decisions above are the recommended defaults, and all are open to revision before planning.

</specifics>

<deferred>
## Deferred Ideas

- **Index lifecycle / Web-Worker mechanics** → research/planner discretion (see Claude's Discretion); the locked requirement is incremental + fast-at-thousands only.
- **Search across Locations / Groups / Relationship-links** (SRCH-03) → **v2**. Phase 5 is People-only.
- **Filter/group results by tag or relationship, saved searches, search history** → not v1.
- **Advanced query syntax** (boolean operators, exact-phrase quotes) → not v1; simple tolerant matching only.
- **"/" keyboard shortcut / command-palette-style search** → optional polish, not decided.

### Reviewed Todos (not folded)
- **Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)** (`.planning/todos/pending/2026-06-24-map-editor-and-profile-media-ux-enhancements-deferred-from-p.md`) — 0.7 keyword match ("phase"/"user"/area:ui) but a false positive: map/media UX already addressed in Phases 2–3, **not search work. Not folded.**
- **Dynamic ego focus / Graph node repositioning / Map & graph appearance settings** (`.planning/todos/pending/2026-07-07-*.md` ×3) — Phase-04 UAT graph/map polish, already roadmapped into **Phase 7**. **Not folded.**
- **Enable COOP header for Drive OAuth** (`.planning/todos/pending/2026-07-03-enable-coop-header-in-production-for-drive-oauth.md`) — Drive deployment/tooling item, unrelated to search. **Not folded.**

</deferred>

---

*Phase: 5-field-scoped-search*
*Context gathered: 2026-08-04*

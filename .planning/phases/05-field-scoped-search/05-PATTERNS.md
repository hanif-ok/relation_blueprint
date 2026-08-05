# Phase 5: Field-Scoped Search - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 8 net-new + 3 modified
**Analogs found:** 11 / 11 (every net-new file has a strong in-repo analog — this phase is deliberately reuse-over-invent; only the MiniSearch index service is genuinely novel, and even it has a persistence analog in `positionCache.ts`)

This phase adds NO schema change (Dexie, not Drizzle — no migration-push). The one net-new dependency is `minisearch` 7.2.x (MIT). All paths below were verified to exist.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/features/nav/ViewSwitcher.tsx` *(modify)* | nav | event-driven | *(itself — add `'search'`)* | exact |
| `src/app/App.tsx` *(modify)* | provider/shell | event-driven | *(itself — add render branch)* | exact |
| `src/features/search/SearchView.tsx` *(new)* | component (view) | request-response (query→results) | `src/features/browse/BrowseList.tsx` | role + flow |
| `src/features/search/ScopePanel.tsx` *(new)* | component (control) | CRUD (toggle → persisted meta) | `src/features/fields/FieldManager.tsx` (live `FieldDef` list) + native `<fieldset>` | role-match |
| `src/features/search/SearchResultRow.tsx` *(new)* | component (row) | request-response | `src/features/browse/BrowseRow.tsx` | exact |
| `src/features/search/searchIndex.ts` *(new)* | service | transform / event-driven | **no direct analog — new** (MiniSearch); persistence analog `src/features/graph/positionCache.ts` | partial (persistence only) |
| `src/features/search/useSearchIndex.ts` *(new)* | hook | event-driven (repo change → index) | `src/features/connect/useSyncEngine.ts` (subscribes `onChange`) | role-match |
| `src/features/search/useScopeSelection.ts` *(new)* | hook | CRUD (meta read/write + live) | `src/app/App.tsx` privacy-flag meta pattern + `src/features/graph/positionCache.ts` | role-match |
| `src/features/search/snippet.ts` *(new)* | utility | transform | **no direct analog — new** (pure string→React-children highlight) | none (new) |
| `src/features/search/SearchView.module.css` *(new)* | config (styles) | — | `src/features/person-map/editor/PersonPicker.module.css` (`.input`) + `BrowseList.module.css` | role-match |
| *(scope-panel field derivation)* | utility | transform | `repository.ts` `listFieldDefs` + `CustomFieldRows.tsx` `LinkValue` (target-name resolve) | role-match |

---

## Artifacts this phase produces (NOT drift)

The planner should treat these net-new files as expected outputs, not untracked drift:

- `src/features/search/SearchView.tsx` — S1 input + S2 scope panel + S3 results + S4 states composition.
- `src/features/search/ScopePanel.tsx` — S2 native `<fieldset>` checkbox list, live-derived from People `FieldDef`s + built-ins.
- `src/features/search/SearchResultRow.tsx` — S3 `BrowseRow` variant with matched-field snippet.
- `src/features/search/searchIndex.ts` — the MiniSearch index service (add/replace/discard; build-from-Dexie).
- `src/features/search/useSearchIndex.ts` — subscribes `repository.onChange`, drives incremental index updates.
- `src/features/search/useScopeSelection.ts` — persisted field-scope selection hook (Dexie meta).
- `src/features/search/snippet.ts` — pure highlight helper (returns React children, never HTML).
- `src/features/search/SearchView.module.css` — token-only stylesheet.
- **New dep:** `minisearch` 7.2.x in `package.json`.

---

## Pattern Assignments

### `src/features/nav/ViewSwitcher.tsx` (modify — nav)

**Analog:** itself. Add the `'search'` entry to three exact seams (all in this file).

1. **`ViewKey` union** (line 32) — add `'search'`:
```typescript
export type ViewKey = 'map' | 'people' | 'maps' | 'groups' | 'relationship-links' | 'graph' | 'search';
```

2. **`VIEW_ITEMS`** (lines 50-57) — add an item (import `Search` from `lucide-react`, per UI-SPEC nav glyph). Placement per UI-SPEC IA: a sibling of People/Graph:
```typescript
{ key: 'search', label: 'Search', icon: Search },
```

3. **`NO_PILL`** (line 60) — add `'search'` (no count pill, like `map`/`graph`):
```typescript
const NO_PILL: ReadonlySet<ViewKey> = new Set<ViewKey>(['map', 'graph', 'search']);
```

**Roving-focus seam (do NOT rebuild):** the nav is a single generic tab-stop group — `order = VIEW_ITEMS.map(v => v.key)` (line 89), `itemRefs`, `onItemKeyDown` (lines 99-113), `tabIndex={index === activeIndex ? 0 : -1}` (line 143). A new `VIEW_ITEMS` entry rides this automatically; no wiring change needed. Note `EntityViewKey = Exclude<ViewKey, 'map' | 'graph'>` (line 35) — since `'search'` is in `NO_PILL` but NOT excluded there, guard the `counts` lookup by `NO_PILL.has` (already done at line 127) so `'search'` never indexes `counts`. **Add `'search'` to the `EntityViewKey` Exclude or the `counts` Record will demand a key.** Preferred: widen the exclude to `Exclude<ViewKey, 'map' | 'graph' | 'search'>`.

---

### `src/app/App.tsx` (modify — shell)

**Analog:** itself, lines 300-346. Add a render branch for `activeView === 'search'` beside the existing `map` / `graph` / `BrowseList` branches:
```typescript
) : activeView === 'search' ? (
  <SearchView
    onOpen={(id) => openFromList('people', id)}
    onShowOnMap={(id) => void showOnMap(id)}
  />
) : (
  <BrowseList ... />
)}
```
`EntityView = Exclude<ViewKey, 'map' | 'graph'>` (line 26) — must also exclude `'search'` so the `BrowseList` fallback never receives it: `Exclude<ViewKey, 'map' | 'graph' | 'search'>`. Reuse `openFromList('people', id)` (opens `ProfileSidebar`) and `showOnMap(id)` verbatim — both already exist and are wired to `BrowseList`.

---

### `src/features/search/SearchView.tsx` (new — view component)

**Analog:** `src/features/browse/BrowseList.tsx` (windowing + state handling).

**Windowing pattern to copy** (BrowseList lines 22-23, 96-129) — the constant-64px windowed list keeps results cheap at thousands:
```typescript
const ROW_HEIGHT = 64;
const OVERSCAN = 6;
// scrollRef + ResizeObserver measuring viewportH (lines 104-112)
// useMemo → { start, end, padTop, padBottom } (lines 115-129)
// render rows.slice(start, end) inside a padTop/padBottom spacer (lines 198-211)
```
Copy this block wholesale; the only difference is each row is a `SearchResultRow`, not a `BrowseRow`.

**State-panel pattern to copy** (BrowseList lines 166-190) — loading/empty branches. Search has three DISTINCT states (UI-SPEC S4 / D-11), each a centered panel (Display/28 heading + Body/16 sub-line + Lucide glyph, **NO CTA button** — search creates nothing, B4):
- Pre-query (query < 2 chars, D-08/B5) — glyph `Search`, "Search people".
- Zero-match (query ≥2, ≥1 field ON, 0 results) — glyph `SearchX`, `No people match "{query}"` — `{query}` renders as a React child, never HTML.
- All-fields-off guard (every checkbox OFF) — glyph `Filter`/`FilterX`, "Nothing to search". This is a DISTINCT third branch (B9), NOT a zero-match reuse.

**Live-query import pattern** (BrowseList lines 13-20): `useLiveQuery` from `dexie-react-hooks`, `db` from `@/db/schema`, styles from a co-located `.module.css`, path alias `@/`.

**Debounce (D-02):** MiniSearch runs on the main thread; debounce the input ~150-250ms (planner tuning). No Web Worker up-front (B10).

**Live-region (UI-SPEC S1):** a visually-hidden `aria-live="polite"` announcing `{n} people match` — mirrors the ProfileSidebar selection announcement already used in `App.tsx` (lines 349+).

---

### `src/features/search/SearchResultRow.tsx` (new — row component)

**Analog:** `src/features/browse/BrowseRow.tsx` — copy the row skeleton verbatim, add a snippet secondary line.

**Prop interface to mirror** (BrowseRow lines 37-45) — the results row is a subset (find-and-open surface; overflow Edit/Delete is OPTIONAL per B7):
```typescript
export interface SearchResultRowProps {
  entity: Person;              // always a Person this phase
  match: FieldMatch;           // NEW: which field matched + the term span (from searchIndex)
  onOpen: (id: string) => void;
  onShowOnMap: (id: string) => void;
}
```

**Row structure to copy** (BrowseRow lines 76-120):
- `role="button"` + `tabIndex={0}` + Enter/Space → `onOpen(entity.id)` (lines 77-88).
- Thumbnail: `const thumbUrl = useEntityThumb(photo, gallery)` from `./useEntityThumb` (verified `src/features/browse/useEntityThumb.ts`); round avatar via `initialsOf(entity.name)` from `@/features/common/initials` (verified) — people branch, lines 90-101.
- Name: `styles.rowName` Body/16 (lines 103-106).
- **Secondary line (THE new bit)** — replaces the tags/updatedAgo block (lines 107-119). When the match is on a NON-name field, render the snippet `{fieldLabel}: …{context}<mark>{term}</mark>{context}…` (see `snippet.ts`). When the match is on the **Name** field (B6), FALL BACK to the exact existing secondary line (tags chips via `entityTags`, else `updatedAgo(entity.updatedAt)`) — copy lines 107-119 unchanged for that case.

**Show-on-map action to copy** (BrowseRow lines 138-153) — the non-openable-map branch: `isSpatial('people') === true` (from `browseTypes.ts` line 29), so the button is enabled; reuse `onShowOnMap` + `data-testid="browse-show-on-map"` wiring and `stopPropagation`. Omit the `isOpenableMap` branch (people are never maps).

**Security (BrowseRow line 12 / UI-SPEC XSS boundary):** name, snippet, field label, and `<mark>` term all render as React children — never `dangerouslySetInnerHTML` (T-03-01).

---

### `src/features/search/ScopePanel.tsx` (new — control)

**Analog:** live `FieldDef` derivation from `repository.listFieldDefs` + native `<fieldset>` (UI-SPEC B2). No Radix.

**Field list = built-ins + live custom fields (D-03):**
- Built-ins (fixed, stable keys): **Name, Phone, Description, Tags, Notes** — keyed by stable built-in string ids (e.g. `'builtin:name'`). Photo/gallery EXCLUDED (no text).
- Custom fields: `useLiveQuery(() => listFieldDefs('people'))` — `listFieldDefs` (repository.ts lines 840-847) already excludes soft-deleted (`deleted`) defs and sorts by `order`, so soft-deleted fields drop out automatically (D-05). Key each checkbox by the stable `FieldDef.id` (types.ts line 57) so a rename never resets the persisted selection.

**Live reactivity:** the panel re-derives via the same `useLiveQuery(dexie-react-hooks)` path BrowseList/ViewSwitcher use — no reload needed when a field is added/renamed/soft-deleted (UI-SPEC S2 "Live reactivity").

**Markup (UI-SPEC B2):** native `<fieldset>` + visually-hidden `<legend>`; each item a `<label>` wrapping `<input type="checkbox">`. Checked = ink fill via `accent-color: var(--ink)` (B3) — NOT amber.

---

### `src/features/search/searchIndex.ts` (new — service; **no direct analog — new**)

The one genuinely novel module. Standard MiniSearch territory (roadmap skip-research). Persistence analog: `src/features/graph/positionCache.ts` (a derived, rebuildable projection persisted as ONE Dexie `meta` row).

**What to index per Person (D-03):** built-ins `name/phone/description/tags(joined)/notes` + every custom value. Number/date custom values → stringified. `link-to-entity` custom value → the **target entity's display name**, resolved exactly like `CustomFieldRows.tsx` `LinkValue` (lines 63-88): read `db.<targetType>.get(id)` and use `.name`. Skip `QUARANTINE_KEY_PREFIX` keys (repository.ts line 640 — the comment there explicitly anticipates "a future Phase-5 search indexer can skip every key beginning with this prefix").

**MiniSearch config (D-06/D-07):** `fuzzy: ~0.2`, `prefix: true`, per-field `boost` (name highest, then tags/phone, then description/notes, custom neutral). Query-time `fields` restriction = the scope checkboxes (SRCH-02).

**Persistence (planner discretion, D-05 note):** either rebuild in-memory from `db.people.toArray()` on load, or persist a serialized index in ONE Dexie `meta` row (mirror `positionCache.savePositions`/`loadPositions`, lines 20-32). The index is a LOCAL, rebuildable projection — it NEVER enters the cloud/backup serializer (no `BackupSchema`/`syncEngine` change).

---

### `src/features/search/useSearchIndex.ts` (new — hook)

**Analog:** `src/features/connect/useSyncEngine.ts` (the other `repository.onChange` subscriber).

**Incremental update seam (criterion 3):** subscribe to the repository change signal — exact API from `repository.ts` lines 37-52:
```typescript
export interface ChangeEvent {
  entityType: 'people' | 'maps' | 'markers' | 'groups' | 'relationship-links' | 'fieldDefs' | 'media';
  entityId: string;
  op: 'create' | 'update' | 'delete';
}
export function onChange(listener: ChangeListener): () => void  // returns unsubscribe
```
In a `useEffect`, `const off = onChange(ev => …); return off;`. Map `op` → MiniSearch: `create` → `add`, `update` → `replace` (remove+add; guard the not-yet-indexed case), `delete` → `discard`. **Filter to `entityType === 'people'`** for entity rows. Also react to `entityType === 'fieldDefs'` (a field add/rename/type-change/soft-delete changes what's indexed) — a `link-to-entity` target rename is a `people`/`groups` update that changes an indexed display name, so consider re-indexing referrers (planner discretion).

**Note:** `updatePerson` emits `op: 'update'` (repository.ts line 105); `deleteEntity` emits `op: 'delete'` AFTER commit (line 249); `applyFieldTypeChange` emits per-touched-entity updates AFTER commit (lines 801-804). All post-commit, so subscribers only ever see persisted state.

---

### `src/features/search/useScopeSelection.ts` (new — hook)

**Analog:** the Dexie-meta persistence pattern in `App.tsx` (privacy flag, lines 75-146) and `positionCache.ts`.

**Read/write pattern** (App.tsx lines 79 + 146):
```typescript
// read (live):
const dismissed = useLiveQuery(async () => (await db.meta.get('privacyNoticeDismissed'))?.value === true);
// write:
await db.meta.put({ key: 'privacyNoticeDismissed', value: true });
```
Persist the scope selection under one stable meta key (e.g. `'searchFieldScope'`) as `Record<fieldKey, boolean>`, keyed by stable `FieldDef.id` / built-in id (D-05). `MetaRecord` shape is `{ key: string; value: unknown }` (schema.ts lines 33-37) — no schema change. **Default = ALL ON, subtractive (D-04):** an absent key means ON; the stored map records only user un-checks. Merge live-derived field list ⨝ stored selection so a newly-added field defaults ON and a soft-deleted field's stale entry is simply ignored (B8). This is a LOCAL preference — does NOT sync to cloud/backup (B8).

---

### `src/features/search/snippet.ts` (new — utility; **no direct analog — new**)

Pure helper: given a field value string + matched term(s), return React children — a leading `{fieldLabel}: `, context text, and the matched substring wrapped in a real `<mark>` element. Context window ~24-40 chars each side (planner tuning). NEVER returns an HTML string; never `dangerouslySetInnerHTML` (UI-SPEC XSS boundary, T-03-01). This is the "evidence the scoping works" surface (D-09).

---

### `src/features/search/SearchView.module.css` (new — styles)

**Analogs:** `PersonPicker.module.css` (`.input`, lines 50-64) + `BrowseList.module.css`.

**Input treatment to reuse** (PersonPicker.module.css lines 50-64) — paper-shade fill, hairline border, amber focus ring; UI-SPEC S1 says "extend/share, do not reinvent":
```css
.input {
  font-family: var(--font-body); font-size: 16px; color: var(--ink);
  background: var(--paper-shade); border: var(--border-hairline);
  border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md); outline: none;
}
.input:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }
```
(UI-SPEC wants min-height 44px on the search input and a leading `Search` glyph.) All values are token vars only (`--paper`, `--paper-shade`, `--ink`, `--ink-muted`, `--amber`, `--hairline`, `--space-*`, `--radius-*`, `--font-*`) — no inline literals (A5). Reuse `BrowseList.module.css` row/state/shimmer classes for the results column where possible rather than forking.

---

## Shared Patterns

### Repository change signal (incremental index)
**Source:** `src/db/repository.ts` lines 37-52 (`ChangeEvent`, `onChange`, `emit`).
**Apply to:** `useSearchIndex.ts` (the ONLY cross-cutting correctness requirement — index stays in sync with live data). Subscribe, map `op`→`add`/`replace`/`discard`, unsubscribe on unmount. All emits are post-commit.

### Live-query reactivity
**Source:** `dexie-react-hooks` `useLiveQuery` — `BrowseList.tsx` line 14/72-84, `ViewSwitcher.tsx` line 74, `App.tsx` line 79.
**Apply to:** `ScopePanel` (live `FieldDef` list), `useScopeSelection` (live meta read), `SearchView` (if reading rows). Keeps the scope panel and index in sync with live `FieldDef` changes with no reload.

### Dexie meta persistence (local, rebuildable, un-synced)
**Source:** `src/features/graph/positionCache.ts` lines 16-32 + `App.tsx` lines 79/146.
**Apply to:** `useScopeSelection` (scope selection) and optionally `searchIndex` (serialized index cache). One `meta` key/value row each; never enters cloud/backup.

### Link-to-entity display-name resolution
**Source:** `src/features/profile/CustomFieldRows.tsx` `LinkValue` lines 63-88 (read `db.<targetType>.get(id)` → `.name`).
**Apply to:** `searchIndex.ts` when indexing a `link-to-entity` custom value (D-03 — indexed by the target's display name).

### Quarantine-key skip
**Source:** `src/db/repository.ts` line 640 (`QUARANTINE_KEY_PREFIX = '__quarantine:'`).
**Apply to:** `searchIndex.ts` — skip every `custom` key starting with this prefix (the comment there anticipates exactly this Phase-5 use).

### XSS boundary (React children only)
**Source:** `BrowseRow.tsx` line 12, `BrowseList.tsx` line 11.
**Apply to:** `snippet.ts`, `SearchResultRow.tsx`, all S4 state copy — matched term in a real `<mark>`, `{query}` as a child, never `dangerouslySetInnerHTML` (T-03-01).

### Spatial gate for Show-on-map
**Source:** `src/features/browse/browseTypes.ts` line 29 (`isSpatial('people') === true`).
**Apply to:** `SearchResultRow` — enables the reused Show-on-map action (S6).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/features/search/searchIndex.ts` | service | transform | No MiniSearch (or any search-index) service exists yet — net-new dependency. Persistence shape only is analogous to `positionCache.ts`. Standard MiniSearch patterns (roadmap flags skip-research). |
| `src/features/search/snippet.ts` | utility | transform | No existing matched-term-highlight helper. Pure string→React-children transform; novel but tiny. |

---

## Metadata

**Analog search scope:** `src/features/nav`, `src/features/browse`, `src/features/profile`, `src/features/fields`, `src/features/graph`, `src/features/connect`, `src/db`, `src/domain`, `src/app`, `src/features/person-map/editor`.
**Files scanned:** ViewSwitcher.tsx, BrowseList.tsx, BrowseRow.tsx, browseTypes.ts, repository.ts, schema.ts, types.ts, PersonPicker.module.css, positionCache.ts, App.tsx, CustomFieldRows.tsx (+ verified existence of useEntityThumb.ts, initials.ts).
**Pattern extraction date:** 2026-08-05
**Schema note:** Dexie schema — NO migration-push step this phase ([[schema-gate-dexie-false-positive]]). Search is read-only over existing tables; scope selection is app-meta, not a new entity.
</content>
</invoke>

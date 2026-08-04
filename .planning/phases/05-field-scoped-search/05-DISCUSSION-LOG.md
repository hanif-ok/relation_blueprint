# Phase 5: Field-Scoped Search - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-04
**Phase:** 5-field-scoped-search
**Areas discussed:** Search surface, Field checkboxes, Fuzzy & ranking, Results & actions

---

## Search surface

### Where should search primarily live?

| Option | Description | Selected |
|--------|-------------|----------|
| New left-nav "Search" view | Own surface in the ViewSwitcher rail (like People/Graph); search box + field-scope checkboxes + results list reusing BrowseRow. | ✓ |
| Search bar over People list | Search as a filter mode on the existing People browse list; checkboxes in a popover. | |
| Global top-bar search box | Always-visible input in the top chrome; results in a dropdown/overlay. | |

### When should results appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Live as-you-type | Debounced results per keystroke; MiniSearch on main thread (Worker only if jank). | ✓ |
| Submit (Enter) to search | One query per explicit submit. | |

**User's choice:** New "Search" view + live as-you-type.
**Notes:** Dedicated view gives the field-checkbox panel room and stays consistent with the ViewSwitcher pattern. Main-thread MiniSearch is fast enough for thousands; Web Worker deferred to a profiling-driven fallback.

---

## Field checkboxes

### Which attributes get a scope checkbox (and are searchable)?

| Option | Description | Selected |
|--------|-------------|----------|
| All fields — built-ins + every custom field | name/phone/description/tags/notes + every People custom field; photo excluded; number/date stringified; link-to-entity by target name. | ✓ |
| Built-ins + text-ish custom only | Exclude number/date/link-to-entity to cut noise. | |
| Built-ins only | Ignore custom fields entirely. | |

### Default on/off state?

| Option | Description | Selected |
|--------|-------------|----------|
| All fields ON | Subtractive scoping — turn OFF "job" to exclude blacksmiths. | ✓ |
| Name only ON | Narrow default; turn fields ON to broaden. | |
| Name + tags + description ON | Middle ground. | |

### Persist the checkbox scope between sessions?

| Option | Description | Selected |
|--------|-------------|----------|
| Persist across sessions | Saved in Dexie meta; soft-deleted fields drop out; stable FieldDef ids survive renames. | ✓ |
| Reset to defaults each open | Stateless start. | |

**User's choice:** All fields scopable · all ON by default · scope persisted.
**Notes:** Custom fields are exactly what the blacksmith example scopes against, so they must be togglable. Default all-on matches the signature example's subtractive mental model.

---

## Fuzzy & ranking

### How tolerant should matching be?

| Option | Description | Selected |
|--------|-------------|----------|
| Moderate fuzzy + prefix | ~0.2 edit distance scaled to term length + prefix matching as you type. | ✓ |
| Prefix only, no fuzz | Partial words match, typos don't. | |
| Aggressive fuzzy | High tolerance, more noise. | |

### How should results rank across fields?

| Option | Description | Selected |
|--------|-------------|----------|
| Boost by field importance | name > tags/phone > description/notes; custom neutral. | ✓ |
| Flat — all fields equal | Every field weighted the same. | |

### Minimum characters before results?

| Option | Description | Selected |
|--------|-------------|----------|
| From the 2nd character | Avoids dumping the whole DB on the first keystroke. | ✓ |
| From the 1st character | Most instant, but a huge/noisy opening set. | |

**User's choice:** Moderate fuzzy + prefix · field-boosted ranking · from 2nd char.
**Notes:** Satisfies SRCH-01's "tolerant, relevant matches" without burying exact hits.

---

## Results & actions

### What should each result row show?

| Option | Description | Selected |
|--------|-------------|----------|
| BrowseRow + matched-field snippet | thumbnail+name plus a secondary line showing which field matched, term highlighted; falls back to tags line on name matches. | ✓ |
| Plain browse-row only | Identical to the People list, no match explanation. | |

### What actions should a result row offer?

| Option | Description | Selected |
|--------|-------------|----------|
| Open profile + Show on map | Row click → ProfileSidebar; plus Show on map (mirrors BrowseRow / D-16). | ✓ |
| Open profile only | No map-jump from search. | |

### How should empty/edge states read?

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct states incl. "all fields off" guard | Pre-query prompt + zero-match message + all-fields-off nudge. | ✓ |
| Just a no-results message | Only the zero-matches case. | |

**User's choice:** BrowseRow + matched-field snippet · open profile + Show on map · distinct states incl. all-fields-off guard.
**Notes:** The matched-field snippet exists specifically so the user can see the scoping working.

---

## Claude's Discretion

- Index lifecycle & persistence (rebuild-in-memory from Dexie vs. persisted serialized index; incremental-update wiring via repository change events) — criterion 3 locks *incremental + fast at thousands*; mechanism left to research/planner (standard MiniSearch, skip-research per roadmap).
- Web Worker offload — only if profiling shows main-thread jank.
- Tuning: debounce interval, exact fuzzy constant, per-field boost weights, snippet-context length.
- Field-scope panel layout within the Search view — follow UI-SPEC tokens; a UI-phase may refine.
- "/" keyboard-focus shortcut — optional polish, not decided.

## Deferred Ideas

- Search across Locations / Groups / Relationship-links (SRCH-03) → v2.
- Filter/group results, saved searches, search history → not v1.
- Advanced query syntax (boolean operators, exact-phrase quotes) → not v1.
- Reviewed-not-folded todos: Map-editor/media UX (Phases 2–3), the three Phase-04 graph/map polish todos (→ Phase 7), and the Drive COOP header tooling item — none are search work.

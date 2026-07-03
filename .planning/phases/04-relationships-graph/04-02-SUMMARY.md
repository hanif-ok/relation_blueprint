---
phase: 04-relationships-graph
plan: 02
subsystem: profile-ui
tags: [relationships, profile-sidebar, radix-dialog, dexie-react-hooks, authoring, xss-boundary]

# Dependency graph
requires:
  - phase: 04-relationships-graph
    plan: 01
    provides: "endpoint fields (fromType/fromId/toType/toId/directed), createRelationshipLink endpoints, listRelationshipsFor reverse lookup, cascade-on-delete"
provides:
  - "relationships.ts pure helpers (directionGlyphFor, resolveOtherEndpoint, buildRelationshipRows) — read a canonical link from either end, drop endpoint-less shells"
  - "AddRelationshipDialog — pick people|groups (never Locations), Mutual-default direction, label/date/notes -> one canonical RelationshipLink"
  - "ProfileSidebar Relationships section (People + Group) with reactive listRelationshipsFor read + orphan guard"
  - "NewEntityMenu standalone '+ Relationship-link' item removed (D-05)"
affects: [04-03-map-connectors, 04-04-graph-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected name-resolver keeps relationship row-building pure/Dexie-free (mirrors groupPlacementsByMap for 'Appears on')"
    - "Direction is a shape (Lucide ArrowRight/ArrowLeft/ArrowLeftRight), never a color (B2) — glyph char is the semantic key mapped to an icon at render"
    - "Two-hit-area row: a record button (glyph+label) + a sibling endpoint button, avoiding invalid nested <button> while giving each its own affordance"

key-files:
  created:
    - src/features/profile/relationships.ts
    - src/features/profile/AddRelationshipDialog.tsx
    - src/features/profile/AddRelationshipDialog.module.css
    - tests/features/relationships.test.ts
    - e2e/relationships.spec.ts
    - .planning/phases/04-relationships-graph/deferred-items.md
  modified:
    - src/features/profile/ProfileSidebar.tsx
    - src/features/profile/ProfileSidebar.module.css
    - src/features/nav/NewEntityMenu.tsx
    - e2e/browse-and-create.spec.ts

key-decisions:
  - "buildRelationshipRows drops any link missing fromId/toId so a legacy endpoint-less shell never renders as a broken row (single guard covers 'not an endpoint' too)"
  - "directionGlyphFor returns the glyph char ('→'|'←'|'↔'); ProfileSidebar maps it to a Lucide icon — keeps the helper pure/testable while satisfying the Lucide render (UI-SPEC R1)"
  - "AddRelationshipDialog is a single dialog (not a 3-step wizard): searchable people|groups picker + Mutual-default direction toggle + label/date/notes, Save gated on a picked endpoint"
  - "Save button is a neutral emphasized paper button, NOT amber — authoring a relationship is not the reserved amber '+ Person' shell act (B3); amber only rings the selected candidate"
  - "The relationship's derived record name = the label if given, else '{fromName} → {otherName}'"

patterns-established:
  - "Reactive endpoint-name resolution: a memoized people+groups id->name map feeds the injected resolver so a deleted endpoint surfaces as undefined -> muted '(deleted person/group)' orphan row (T-04-10)"

requirements-completed: [REL-01, REL-02]

# Metrics
duration: ~15min
completed: 2026-07-03
status: complete
---

# Phase 4 Plan 02: Relationship Authoring Vertical Slice Summary

**Person and Group profiles now author and display relationships from one canonical record: a reactive "Relationships" section (sibling of "Appears on") with a "+ Add relationship" flow that picks a person/group, sets per-link direction, and fills label/date/notes — the link auto-appears on both endpoints, and the meaningless standalone "+ Relationship-link" menu item is gone.**

## Performance
- **Duration:** ~15 min
- **Tasks:** 3
- **Files:** 10 (6 created, 4 modified)

## Accomplishments
- `relationships.ts` pure helpers (`directionGlyphFor`, `resolveOtherEndpoint`, `buildRelationshipRows`) read the same canonical link from BOTH endpoints (D-04), pick the direction glyph (a shape, never a color — B2), and DROP legacy endpoint-less shells so nothing renders broken. Fully unit-covered (11 assertions).
- `AddRelationshipDialog` authors ONE canonical link via `createRelationshipLink` (validate→stamp→emit): a searchable picker scoped to People/Groups only (Locations never listed, D-03/D-07, with the author excluded — no self-links), a two-option direction control defaulting to Mutual (B5) with a "{This} → {Other}" preview when Directed, and label/date/notes inputs (REL-02).
- `ProfileSidebar` gained a "Relationships" section rendered ONLY for People/Groups: a reactive `listRelationshipsFor(id)` read keyed on `[id, requestedType]`, rows built by the pure helpers, each row a record button (glyph + label) plus a nested endpoint button (`onOpenEntity`, D-10). Empty state "No relationships yet."; a deleted other-endpoint degrades to a muted "(deleted person/group)" row (T-04-10) instead of crashing.
- `NewEntityMenu` no longer offers the standalone "+ Relationship-link" create item (D-05); People/Location/Group remain and the relationship-links browse list is untouched.

## Task Commits
1. **Task 1 — failing unit + E2E (RED):** `8b49d38` (test)
2. **Task 2 — helpers + AddRelationshipDialog + menu removal (GREEN):** `58eea81` (feat)
3. **Task 3 — ProfileSidebar Relationships section + orphan guard:** `53414fd` (feat)

_No REFACTOR commit — the GREEN implementation was already minimal._

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Repaired the existing browse-and-create E2E broken by the D-05 menu removal**
- **Found during:** Task 2 (deleting the `relationship-links` ITEM from `NewEntityMenu`).
- **Issue:** `e2e/browse-and-create.spec.ts` created a relationship-link via `createViaMenu(page, 'relationship-links', …)`, which clicks the now-deleted `new-entity-relationship-links` item.
- **Fix:** seed the relationship-link through the `__rb.createRelationshipLink` bridge instead, added an assertion that the standalone menu item is gone, and retitled the test. Directly caused by this task's change (D-05), so in-scope.
- **Files modified:** `e2e/browse-and-create.spec.ts`
- **Commit:** `58eea81`

## Threat Surface (threat_model dispositions applied)
- **T-04-01 (XSS→token exfil):** all relationship `label`/`date`/`notes` + endpoint names render exclusively as React children in both the ProfileSidebar section and AddRelationshipDialog — no `dangerouslySetInnerHTML`, no HTML string injection.
- **T-04-02 (elevation — non-person/group endpoint):** the picker lists only People/Groups; the write still flows through `createRelationshipLink` → `RelationshipLinkSchema` `z.enum(['people','groups'])` (defense in depth with 04-01).
- **T-04-10 (crash on deleted endpoint):** orphan-guard muted "(deleted person/group)" row via the injected name-resolver returning `undefined`.

No new security surface beyond the plan's threat model.

## Known Stubs
None — the section reads live `listRelationshipsFor` data reactively; no hardcoded/empty data flows to the UI.

## Deferred Issues
- **Pre-existing, unrelated:** `e2e/browse-and-create.spec.ts` "sort toggle reorders the list" fails (the auto-opened ProfileSidebar overlaps the sort toolbar and intercepts the `sort-recent` click). Confirmed failing identically on the pre-Task-3 base (before any 04-02 change), so it is NOT a regression from this plan. Logged to `deferred-items.md`. Out of scope for 04-02.

## Verification
- `npx vitest run tests/features/relationships.test.ts` — 11/11 green.
- `npx vitest run` (full suite) — 301/301 across 50 files green.
- `npx tsc --noEmit` — clean.
- `npx playwright test e2e/relationships.spec.ts` — 1/1 green (built `--mode e2e`): authoring a Mutual relationship from Ada's profile writes ONE canonical link that appears naming Charles on Ada AND naming Ada on Charles.
- `npx playwright test e2e/browse-and-create.spec.ts` — 3/4 green; the 1 failure is the pre-existing sort-toggle defect above (reproduced on base, out of scope).

## Self-Check: PASSED

All 6 created + 4 modified files exist on disk; all three task commits (`8b49d38`, `58eea81`, `53414fd`) present in git history.

---
*Phase: 04-relationships-graph*
*Completed: 2026-07-03*

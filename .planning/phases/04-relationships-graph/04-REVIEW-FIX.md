---
phase: 04-relationships-graph
fixed_at: 2026-07-03T18:52:00Z
review_path: .planning/phases/04-relationships-graph/04-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-07-03T18:52:00Z
**Source review:** .planning/phases/04-relationships-graph/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 critical + 6 warnings; the 2 info findings are out of scope for `critical_warning`)
- Fixed: 7
- Skipped: 0

Every fix was type-checked (`tsc --noEmit`, exit 0) after application. The pure-projection changes
(connectors, graphElements) and the delete cascade were additionally covered by the existing unit
suites: `connectors.test.ts` (7 passed), `graphElements.test.ts` + `repository.relationships.test.ts`
(12 passed).

## Fixed Issues

### CR-01: "Remove from map" deletes an arbitrary marker for a multi-placed person

**Files modified:** `src/features/person-map/MapView.tsx`, `src/app/App.tsx`
**Commit:** a23848e
**Status:** fixed: requires human verification
**Applied fix:** Threaded the EXACT clicked marker id instead of re-deriving it. Widened
`MapView.onSelect` to `(personId, markerId?)` and passed `mk.id` at the person-marker click; added a
`markerId` field to `App`'s `profile` state and populated it from both the map click and
`showOnMap` (which already resolves the target marker). The re-derivation now serves only as a
fallback for the auto-place-on-create path (a single fresh marker), and even that fallback is scoped
to `activeMapId` so `.first()` can no longer resolve a placement on a different map. Flagged for human
verification because it changes destructive-action targeting across the MapView→App→ProfileSidebar
selection paths and is best confirmed via UAT (single-map click, multi-placement, show-on-map,
newly-created person).

### WR-01: Delete cascade emits no ChangeEvent for cascaded markers or relationship-links

**Files modified:** `src/db/repository.ts`
**Commit:** f553573
**Status:** fixed
**Applied fix:** `deleteEntity` now captures the ids of every cascaded marker and relationship-link
inside the rw transaction (`primaryKeys()` before each `delete()`) and emits a `delete` ChangeEvent
per id AFTER commit — mirroring `applyFieldTypeChange`/`reorderFieldDefs`, and always using a real row
id as `entityId` (never the entityType string).

### WR-02: Cascade-deleted relationship-links leak their media (GC skips them)

**Files modified:** `src/db/repository.ts`
**Commit:** 9bbf942
**Status:** fixed
**Applied fix:** Built the GC `candidates` set BEFORE the link cascade and the early-out, and read the
cascaded links as objects so their own photo/gallery hashes are folded into `candidates`. Since the
still-referenced sweep runs after the links are gone, this is the only point at which their media can
be collected; otherwise those blobs orphaned permanently. Replaced the `if (!victim) return` early-out
with a `candidates.size === 0` check so orphaned-link media is still GC'd when the victim row is
already absent.

### WR-03: Graph position cache stops updating after the first layout (`cy.one`)

**Files modified:** `src/features/graph/GraphView.tsx`
**Commit:** f834904
**Status:** fixed
**Applied fix:** Changed the layout-cache handler from `cy.one('layoutstop', …)` to
`cy.on('layoutstop', …)`. The handler is still registered exactly once per Cytoscape instance (guarded
by `attachedRef`), but now re-saves positions idempotently after every `cose` re-run, so a node added
after the first layout is persisted and the D-13 `preset` fast-path keeps working for edited databases.

### WR-04: Graph builds edges without verifying the endpoint nodes exist

**Files modified:** `src/features/graph/graphElements.ts`
**Commit:** 597375b
**Status:** fixed
**Applied fix:** Built a `nodeIds` set from the people/groups just projected and extended the edge
filter to `nodeIds.has(l.fromId) && nodeIds.has(l.toId)`, dropping any edge whose endpoint has no node
(reachable via the untrusted-at-rest import path, which does no referential-integrity check). This
prevents Cytoscape's "nonexistant source/target" throw from white-screening the graph, matching the
ProfileSidebar's graceful deleted-endpoint handling.

### WR-05: "Primary placement" relies on an ordering Dexie does not guarantee

**Files modified:** `src/features/person-map/connectors.ts`
**Commit:** 2f87ba5
**Status:** fixed
**Applied fix:** Replaced the "first-seen in array wins" primary-placement rule with a deterministic
selection by `(updatedAt, id)` — earliest-touched marker wins, tie-broken by id for a total, stable
order — so the connector anchors the same placement on every read regardless of Dexie's primary-key
iteration order. The existing multi-placement unit test still passes (now for the right reason: both
fixture markers share `updatedAt: 0`, so the `id` tiebreaker deterministically selects `A-primary`).
Note: the `Marker` type carries no `createdAt`, so `updatedAt` is the closest available proxy for
creation order; the App `showOnMap` and ProfileSidebar `groupPlacementsByMap` cross-references (jump
targets, where any placement is valid) were left unchanged to keep the fix scoped to the "primary"
guarantee.

### WR-06: `AddRelationshipDialog.save()` has no error handling; failure wedges the dialog

**Files modified:** `src/features/profile/AddRelationshipDialog.tsx`, `src/features/profile/AddRelationshipDialog.module.css`
**Commit:** 5a41e4b
**Status:** fixed
**Applied fix:** Wrapped the `createRelationshipLink` write in `try/catch/finally`: `saving` is reset in
`finally` (so a rejection no longer permanently disables the "Add relationship" button), and a caught
error sets an inline `error` message rendered with `role="alert"` above the actions. Added an `error`
state (reset on dialog open) and a brick-colored `.error` CSS class mirroring the EntityForm error
treatment.

---

_Fixed: 2026-07-03T18:52:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

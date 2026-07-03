---
phase: 04-relationships-graph
reviewed: 2026-07-03T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - e2e/browse-and-create.spec.ts
  - e2e/connectors.spec.ts
  - e2e/graph.spec.ts
  - e2e/relationships.spec.ts
  - package.json
  - src/app/App.tsx
  - src/db/repository.ts
  - src/db/schema.ts
  - src/domain/schemas.ts
  - src/domain/types.ts
  - src/features/graph/GraphView.module.css
  - src/features/graph/GraphView.tsx
  - src/features/graph/graphElements.ts
  - src/features/graph/graphStyle.ts
  - src/features/graph/positionCache.ts
  - src/features/nav/NewEntityMenu.tsx
  - src/features/nav/ViewSwitcher.tsx
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/MapView.tsx
  - src/features/person-map/connectors.ts
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/person-map/editor/LayersPanel.tsx
  - src/features/profile/AddRelationshipDialog.module.css
  - src/features/profile/AddRelationshipDialog.tsx
  - src/features/profile/ProfileSidebar.module.css
  - src/features/profile/ProfileSidebar.tsx
  - src/features/profile/relationships.ts
  - src/types/react-cytoscapejs.d.ts
  - tests/backup/roundtrip.relationships.test.ts
  - tests/db/repository.relationships.test.ts
  - tests/features/connectors.test.ts
  - tests/features/graphElements.test.ts
  - tests/features/positionCache.test.ts
  - tests/features/relationships.test.ts
findings:
  critical: 1
  warning: 6
  info: 2
  total: 9
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-03
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

This phase adds relationship endpoints to the `RelationshipLink` model, a profile authoring
UI (`AddRelationshipDialog` + the ProfileSidebar Relationships section), viewer-only Konva
map connectors, and a viewer-only Cytoscape relationship graph. The endpoint model, zod gate
(closed `people|groups` enum), reverse-lookup index (v5 `fromId`/`toId`), and the pure
projections (`connectors.ts`, `relationships.ts`) are well-factored and well-tested. XSS
discipline (all user text as React/canvas children, never `dangerouslySetInnerHTML`) is
consistently honored across every new surface.

The most serious finding is that the graph edge projection (`graphElements.ts`) does NOT guard
edges against the current node set — unlike the sibling `connectors.ts`, whose own doc comment
it copies. Deleting a node that has relationships while the graph is open can hand Cytoscape an
edge whose source/target node is absent, which Cytoscape throws on — an uncaught exception with
no error boundary. Several robustness gaps around the authoring dialog (Escape handling, error
handling) and the delete/sync path round out the findings.

Note: the documented deferred items (layerless-map marker render; browse-list sort-toggle E2E
overlap) were treated as out of scope per the review brief and are not reported.

## Critical Issues

### CR-01: Graph edges are not validated against the node set — deleting a related node can crash the graph

**File:** `src/features/graph/graphElements.ts:41-51`
**Issue:** `toGraphElements` drops only links whose `fromId`/`toId` are *missing*, but emits an
edge for any link that HAS both ids — even when the referenced person/group node is no longer
present. The file's own comment claims it also handles "one whose endpoint was deleted", but a
deleted endpoint leaves `fromId`/`toId` intact (pointing at a ghost), so that case is NOT
handled. Cytoscape throws (`Can not create edge … with nonexistant source/target`) when an edge
references a node it doesn't have; `CytoscapeComponent.normalizeElements` does no validation and
there is no React error boundary in `App.tsx`, so the throw blanks the app.

This is reachable through a normal flow: in the Graph view, tap a node to open its profile
(list context), click "Delete {entity}". `deleteEntity` cascades the person/group + its links in
one transaction, then the three independent `useLiveQuery` reads (`people`, `groups`, `links`)
re-resolve as separate promises. In any render where `links` has updated but `people`/`groups`
has not yet (or vice-versa), an edge references a missing node and the graph throws. The pure
`connectors.ts` avoids exactly this by resolving endpoints through `primaryByPerson` and dropping
a link when an endpoint is unresolved — `graphElements.ts` should apply the same guard.

**Fix:**
```ts
const nodeIds = new Set<string>([...people.map((p) => p.id), ...groups.map((g) => g.id)]);
const edges: cytoscape.ElementDefinition[] = links
  .filter((l) => l.fromId && l.toId && nodeIds.has(l.fromId!) && nodeIds.has(l.toId!))
  .map((l) => ({
    data: {
      id: l.id,
      source: l.fromId!,
      target: l.toId!,
      label: l.label ?? '',
      directed: l.directed === true,
    },
  }));
```

## Warnings

### WR-01: ProfileSidebar Escape handler doesn't guard the Add-relationship dialog — one Esc closes both

**File:** `src/features/profile/ProfileSidebar.tsx:300-311` (handler) / `634-644` (dialog)
**Issue:** The sidebar's window-level `keydown` (capture) handler closes the sidebar on Escape
unless `confirmOpen` or the lightbox is open. It does NOT check `addRelOpen`. So when the
AddRelationshipDialog is open and the user presses Escape, Radix closes the dialog AND the
sidebar's handler fires `onClose()` — closing the whole sidebar underneath (which unmounts the
dialog). The lightbox and confirm dialog are explicitly guarded here; the add-relationship dialog
was missed.
**Fix:** Track the dialog-open state in a ref (like `lightboxOpenRef`) and add it to the guard:
```ts
const addRelOpenRef = useRef(false);
addRelOpenRef.current = addRelOpen;
// …
if (e.key === 'Escape' && !confirmOpen && !lightboxOpenRef.current && !addRelOpenRef.current) onClose();
```

### WR-02: AddRelationshipDialog.save() has no error handling — a failed write wedges the dialog

**File:** `src/features/profile/AddRelationshipDialog.tsx:93-112`
**Issue:** `save()` sets `saving = true`, awaits `createRelationshipLink(...)`, then closes. There
is no `try/catch/finally`. If the write rejects (e.g. `RelationshipLinkSchema.parse` throws), the
dialog never closes, `saving` stays `true` (the Save button is permanently `disabled`), and the
rejection is an unhandled promise rejection because the caller uses `onClick={() => void save()}`.
The user is stuck with no feedback and must reload.
**Fix:** Wrap the write and reset `saving` on failure:
```ts
try {
  const link = await createRelationshipLink({ /* … */ });
  onCreated?.(link.id);
  onOpenChange(false);
} catch {
  setSaving(false);
  // surface an inline error to the user
}
```

### WR-03: "Remove from map" can remove the wrong placement for a multi-placed person

**File:** `src/app/App.tsx:158-164`
**Issue:** For a marker-context people profile, `selectedMarkerId` is resolved with
`db.markers.where('personId').equals(profile.id).first()` — the FIRST marker across ALL maps in
insertion order. `App` never learns which specific marker was clicked (MapView's `onSelect` passes
only `personId`). When a person is placed on multiple maps, clicking their marker on map B and
choosing "Remove from map" can delete their placement on map A instead. Multi-placement is a
first-class feature (D-13), so this is reachable. `showOnMap` (line 204-207) has the same
`.first()` assumption, though there it only picks which map to open.
**Fix:** Thread the clicked marker id from `AvatarMarker`/`MapView` up to the profile, or resolve
the marker scoped to the currently active map (`.where({ personId, mapId: activeMapId })`).

### WR-04: Cascade deletes emit no dirty state and the change event's op is ignored — deletions may never reach the cloud

**File:** `src/db/repository.ts:182-223` (`deleteEntity`) / cross-ref `src/features/connect/useSyncEngine.ts:215`, `src/sync/syncEngine.ts:188-191`
**Issue:** `deleteEntity` removes the entity, cascade-deletes its markers (`db.markers.where(...).delete()`)
and relationship-links (`db.relationshipLinks.where('fromId')…delete()`), and emits exactly ONE
`{ op: 'delete' }` event for the primary entity. A row deletion leaves no `dirty` record behind.
The sync subscriber ignores the event payload — `onChange(() => schedulePush())` — and
`SyncEngine.push()` early-returns when `getDirtyTypes()` is empty (`syncEngine.ts:190`). Because a
pure delete dirties nothing, the affected shard types are not in `dirtyTypes`, so the shard is
never rebuilt and the deleted person/markers/relationship-links persist in the cloud shard. On the
next LWW pull they can even be resurrected locally. This matches the project's documented
"Sync push/pull gap" pattern and is compounded this phase by the new relationship-link cascade.
**Fix:** Make deletions visible to the push gate — e.g. record deletions in the `syncQueue`
table (which the repository currently never writes) and have `getDirtyTypes()` include queued
deletions, or force-mark the affected shard types dirty on a `delete` event. Verify both
directions (push removes the row from the cloud shard; pull does not re-add a tombstoned id).

### WR-05: Media GC misses blobs owned only by cascade-deleted relationship-links

**File:** `src/db/repository.ts:203-219`
**Issue:** In `deleteEntity`, the GC candidate set is built ONLY from the primary victim's media
(`collectEntityMediaHashes(victim)`). The relationship-links cascade-deleted at line 198 are
removed before the `stillReferenced` sweep, so a blob referenced solely by one of those links
(a link `photo`/`gallery`/custom Photo value — reachable via EntityForm editing) is neither a GC
candidate nor still-referenced. It becomes an orphaned blob that is never collected. Not data
loss, but a storage/quota leak that contradicts the T-02-03 "no orphaned blobs" invariant.
**Fix:** Collect the cascade-deleted links' media into the candidate set before deleting them:
```ts
const cascaded = await db.relationshipLinks.where('fromId').equals(id).or('toId').equals(id).toArray();
await db.relationshipLinks.bulkDelete(cascaded.map((l) => l.id));
for (const l of cascaded) collectEntityMediaHashes(l).forEach((h) => candidates.add(h));
```
(then include the marker/link candidate hashes in the existing sweep).

### WR-06: ConnectorLayer hardcodes an rgba color literal instead of deriving it from the token

**File:** `src/features/person-map/editor/ConnectorLayer.tsx:26`
**Issue:** `const CONNECTOR_HAIRLINE = 'rgba(216,210,196,0.55)';` is an inline color literal,
violating the strict "no inline color literals — Konva reads shared token constants" convention
(UI-SPEC A5) that this very phase relies on. The comment even hand-copies the token hex
(`#D8D2C4`), so if `colors.hairline` changes, the connector tint silently drifts out of sync.
`graphStyle.ts:19-28` solves the identical "translucent hairline" need correctly with a
`hexToRgba(colors.hairline, 0.55)` helper.
**Fix:** Reuse the same derivation instead of a literal:
```ts
import { colors } from '@/app/tokens';
const CONNECTOR_HAIRLINE = hexToRgba(colors.hairline, 0.55); // shared helper (see graphStyle.ts)
```

## Info

### IN-01: Graph positions are re-cached only once per Cytoscape instance

**File:** `src/features/graph/GraphView.tsx:188-190`
**Issue:** `cy.one('layoutstop', …)` saves positions exactly once per Cytoscape instance. When
the node set changes in the same session (add a person/group), `usePreset` flips to `false` and a
fresh `cose` runs, but its `layoutstop` no longer saves because the one-shot handler was already
consumed. The new node's position isn't cached until the view is unmounted and remounted (which
re-arms `.one`), so the preset fast-path silently fails to update within a session.
**Fix:** Use `cy.on('layoutstop', …)` (persistent) with a debounce, or re-register the one-shot
whenever the preset/cose decision flips.

### IN-02: Connector label pill is not actually centered on the segment midpoint

**File:** `src/features/person-map/editor/ConnectorLayer.tsx:77-85`
**Issue:** The `<Tag offsetX={0}>` is commented "Center the pill on the midpoint (Label anchors at
its top-left by default)", but `offsetX={0}` is a no-op — the Label stays anchored at its
top-left corner at the midpoint, so the pill sits to the lower-right of the line's center rather
than centered on it. Cosmetic; the comment overstates what the code does.
**Fix:** Anchor via the Label's `offsetX`/`offsetY` set to half the rendered pill width/height
after measuring, or accept the offset and correct the comment.

---

_Reviewed: 2026-07-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

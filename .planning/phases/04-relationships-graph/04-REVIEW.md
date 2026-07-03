---
phase: 04-relationships-graph
reviewed: 2026-07-03T11:36:26Z
depth: standard
files_reviewed: 34
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

**Reviewed:** 2026-07-03T11:36:26Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 4 wires relationship endpoints onto the `RelationshipLink` shell, adds the viewer-only Cytoscape graph, and projects data-driven connectors onto the Konva map. The pure projection helpers (`connectors.ts`, `graphElements.ts`, `relationships.ts`) are well-factored, DOM-free, and thoroughly unit-tested, and the XSS boundary discipline (React children / Konva canvas text, no `dangerouslySetInnerHTML`, no `eval`) holds across every new surface. No injection, secret-leak, or unsafe-deserialization defects were found.

The defects are correctness and robustness gaps, not surface-level ones. The most serious is that the map "Remove from map" action re-derives its target marker with `.first()` and can delete the **wrong placement** for a multi-placed person (a supported feature, D-13). Supporting issues cluster around the delete cascade (no change-events and no media GC for cascaded relationship-links) and the graph's position cache (which stops updating after the first layout), plus the graph's willingness to build an edge to a node that may not exist.

## Critical Issues

### CR-01: "Remove from map" deletes an arbitrary marker for a multi-placed person

**File:** `src/app/App.tsx:158-164` (with `src/features/profile/ProfileSidebar.tsx:568-603`)
**Issue:** When a person profile is opened from a marker, the marker to remove is re-derived in `App`:

```ts
const selectedMarkerId = useLiveQuery<string | undefined>(
  async () =>
    profile?.openedFrom === 'marker' && profile.type === 'people'
      ? (await db.markers.where('personId').equals(profile.id).first())?.id
      : undefined,
  [profile?.id, profile?.openedFrom, profile?.type],
);
```

The clicked marker's identity is never propagated — `MapView`'s `onSelect(personId)` passes only the person id — so `App` recovers "a" marker via `.first()`. This query is **not scoped to `activeMapId`** and `.first()` returns the lowest primary key (a random `nanoid`), not the clicked marker. For a person placed on more than one map (multi-placement is an explicit feature, D-13), "Remove from map" can delete a placement on a **different map** than the one on screen, leaving the intended marker in place. Even for two placements on the same map it removes an arbitrary one. The user is told "only the marker on this map is removed" (ProfileSidebar body copy) while a different marker silently disappears.

**Fix:** Thread the actual clicked marker id from the map through selection instead of re-deriving it — `MapView` already has `mk.id` in the `visibleMarkers.map`. Widen `onSelect` to carry the marker id, store it on `profile`, and pass it to `ProfileSidebar.markerId`. If re-derivation must stay, at minimum scope it to the active map:

```ts
(await db.markers
  .where('personId').equals(profile.id)
  .filter((m) => m.kind === 'person' && m.mapId === activeMapId)
  .first())?.id
```

## Warnings

### WR-01: Delete cascade emits no ChangeEvent for cascaded markers or relationship-links

**File:** `src/db/repository.ts:182-223`
**Issue:** `deleteEntity` cascades marker deletes and, new in Phase 4, relationship-link deletes (`relationshipLinks.where('fromId').equals(id).or('toId')…delete()`), but only calls `emit()` **once**, for the top-level entity (line 222). The module header states the emit is the signal "the sync engine subscribes to flush dirty records," and a deleted row cannot be found by a `dirty` flag. Cascaded markers and links are removed from IndexedDB with **no delete notification**. This matches the recorded "Sync push/pull gap" project-memory pattern: the local delete succeeds but a Plan-05 sync engine keying off `ChangeEvent`s never learns to remove those rows from the cloud — leaving dangling cloud links that can resurrect or reference a since-deleted person on another device (which then trips WR-04).

**Fix:** Collect the cascaded marker/link ids inside the transaction and emit a `delete` per id after commit (mirroring `applyFieldTypeChange`/`reorderFieldDefs`):

```ts
const removed = await db.relationshipLinks.where('fromId').equals(id).or('toId').equals(id).primaryKeys();
// …after the transaction commits:
for (const lId of removed) emit({ entityType: 'relationship-links', entityId: lId, op: 'delete' });
```

### WR-02: Cascade-deleted relationship-links leak their media (GC skips them)

**File:** `src/db/repository.ts:194-219`
**Issue:** The media refcount sweep collects GC candidates only from `victim` (the person/group/map being deleted). When deleting an endpoint entity cascades its relationship-links, those links can carry their own `photo`/`gallery` (both exist on `RelationshipLinkSchema`), but their hashes are never added to `candidates`, so their blobs are never collected. The `stillReferenced` sweep runs *after* the cascade, so the just-deleted links no longer protect that media either — it becomes permanently orphaned in the `media` table. This is the exact drift the "one source of truth" comment (lines 121-126) set out to prevent, but the cascaded links sit outside the candidate set.

**Fix:** Read the links before deleting them and fold their media hashes into `candidates` (building `candidates` before the `if (!victim) return` early-out):

```ts
if (entityType === 'people' || entityType === 'groups') {
  const links = await db.relationshipLinks.where('fromId').equals(id).or('toId').equals(id).toArray();
  for (const l of links) for (const h of collectEntityMediaHashes(l)) candidates.add(h);
  await db.relationshipLinks.where('fromId').equals(id).or('toId').equals(id).delete();
}
```

### WR-03: Graph position cache stops updating after the first layout (`cy.one`)

**File:** `src/features/graph/GraphView.tsx:180-191`
**Issue:** `registerCy` attaches the layout-cache handler with `cy.one('layoutstop', …)`, which fires **exactly once** per Cytoscape instance and then removes itself. react-cytoscapejs keeps a single `cy` instance for the component's lifetime, so after the first `cose` run saves positions, every subsequent `cose` re-run (triggered whenever a node is added — `hasCachedPositions` returns false and `layout` flips back to `cose`) fires `layoutstop` with **no listener**. The new node's position is never persisted, `hasCachedPositions` stays false forever after any node-set change, and the D-13 "reopen with `preset` for an instant render" fast-path is permanently defeated for any database that is ever edited.

**Fix:** Use `cy.on('layoutstop', …)` so the cache is re-saved after each layout (it is idempotent), or re-register the one-shot handler whenever the layout decision flips back to `cose`.

### WR-04: Graph builds edges without verifying the endpoint nodes exist

**File:** `src/features/graph/graphElements.ts:41-52`
**Issue:** `toGraphElements` filters out endpoint-less shells (`l.fromId && l.toId`) but never checks that `fromId`/`toId` correspond to a node in the `people`/`groups` sets it just built. Cytoscape throws (`Can not create edge … with nonexistant source/target`) when an edge references a missing node, crashing the whole graph view rather than dropping the bad edge. In single-device operation the delete cascade keeps things consistent, but this state is reachable through the untrusted-at-rest import path: `BackupSchema` validates that `fromId` is a string but performs **no referential-integrity check**, so a corrupted/hand-crafted backup with a link pointing at a non-existent person imports cleanly and then white-screens the graph. The sibling `ProfileSidebar` handles the same "deleted endpoint" case gracefully; the graph should be equally defensive.

**Fix:** Drop edges whose endpoints are not in the node set:

```ts
const nodeIds = new Set([...people.map((p) => p.id), ...groups.map((g) => g.id)]);
const edges = links
  .filter((l) => l.fromId && l.toId && nodeIds.has(l.fromId) && nodeIds.has(l.toId))
  .map(/* … */);
```

### WR-05: "Primary placement" relies on an ordering Dexie does not guarantee

**File:** `src/features/person-map/connectors.ts:68-74` (also `src/app/App.tsx:206-207`, `ProfileSidebar.tsx:73-82`)
**Issue:** `buildConnectors` picks a multi-placed person's primary marker as "first-seen" in the `markers` array, and the comment asserts "Array order is insertion order, so the first-seen marker wins." That array comes from `db.markers.where('mapId').equals(map.id).toArray()`, which Dexie returns ordered by the index then by **primary key (`id`)** — and `id` is a random `nanoid`, not an insertion timestamp. So the connector attaches to a lexicographically-arbitrary placement, and the B6 "first/primary placement" guarantee is not honored deterministically. The passing unit test only works because it hand-orders the input array; real Dexie reads won't.

**Fix:** Make "primary" deterministic — sort candidate markers by a stable field before choosing (e.g. `updatedAt`, or a persisted creation order) and correct the comment to match.

### WR-06: `AddRelationshipDialog.save()` has no error handling; failure wedges the dialog

**File:** `src/features/profile/AddRelationshipDialog.tsx:93-112`
**Issue:** `save()` sets `saving = true`, then `await createRelationshipLink(...)` with no `try/catch`. `createRelationshipLink` runs `RelationshipLinkSchema.parse` and a Dexie `put`, both of which can throw (validation failure, `QuotaExceededError`, aborted transaction). On rejection, `onOpenChange(false)` never runs, the dialog stays open, and `saving` stays `true`, permanently disabling the "Add relationship" button until the dialog is reopened. Because the caller is `onClick={() => void save()}`, the rejection is also an unhandled promise rejection with no user feedback.

**Fix:** Wrap the write and reset `saving` in a `finally`, surfacing an inline error on failure:

```ts
setSaving(true);
try {
  const link = await createRelationshipLink({ /* … */ });
  onCreated?.(link.id);
  onOpenChange(false);
} catch {
  setError("Couldn't save this relationship. Try again.");
} finally {
  setSaving(false);
}
```

## Info

### IN-01: Connector label pill is not actually centered

**File:** `src/features/person-map/editor/ConnectorLayer.tsx:77-85`
**Issue:** The `<Tag offsetX={0} />` carries the comment "Center the pill on the midpoint (Label anchors at its top-left by default)," but `offsetX={0}` is a no-op — the `Label` still anchors at its top-left at the segment midpoint, so the pill sits down-and-right of the midpoint rather than centered. Cosmetic only.
**Fix:** Center by offsetting half the measured pill width, or remove the misleading comment/prop if the current placement is intended.

### IN-02: Inconsistent dependency pinning for the graph libraries

**File:** `package.json:25,32`
**Issue:** Every dependency is exact-pinned except `cytoscape: "^3.34.0"` and `react-cytoscapejs: "^2.0.0"`, which use caret ranges. Because the hand-written ambient module `src/types/react-cytoscapejs.d.ts` is tied to the exact 2.0.0 surface (including the undocumented `global` prop), a caret-allowed bump could drift the runtime away from the declared types.
**Fix:** Pin both to exact versions, consistent with the rest of the manifest and the CLAUDE.md guidance to pin react-cytoscapejs to a specific line.

---

_Reviewed: 2026-07-03T11:36:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

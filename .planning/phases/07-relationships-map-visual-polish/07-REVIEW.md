---
phase: 07-relationships-map-visual-polish
reviewed: 2026-08-19T04:19:56Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/features/graph/GraphView.tsx
  - src/features/person-map/editor/ConnectorLayer.tsx
  - src/features/person-map/connectors.ts
  - e2e/graph.spec.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-19T04:19:56Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found
**Diff base:** `73848fb` (phase start)

## Summary

Reviewed the Phase-07 gap-closure delta (07-05): WR-01 fences the graph newcomer-placement
effect off the ego-focus session and re-triggers it after exit; WR-02 renders a custom connector
colour at the default 0.55 resting alpha; WR-03 removes the unreachable
`selectedRelationshipId` / `Connector.selected` wiring.

The stated invariants hold up under trace:

- **Viewer-only write boundary — PASS.** The only writer of persisted layout state is
  `savePositions(cy)`, reached exclusively from the `dragfree` and `layoutstop` handlers, both of
  which target the `graphPositions` meta row. The placement effect no longer writes at all (it
  now relies on the fenced `layoutstop`). No path in the delta touches `db.people` /
  `db.groups` / `db.relationshipLinks`.
- **`suspendSaveRef` fence — PASS.** The placement effect now bails at `if (suspendSaveRef.current)
  return;` *before* recording the newcomer in `placedMissingRef` (GraphView.tsx:351), so a
  mid-focus newcomer is neither placed nor marked, and both concentric-overlay exit branches drop
  the fence and bump `postFocusPlaceTick` to re-run the (now-unfenced) placement. The single
  fenced `layoutstop` is the sole persistence path — the collapse of the old double-save
  (explicit save + layoutstop) is correct, and the layoutstop-based save for the placement `cose`
  is proven to work because it was already the redundant second save pre-fix.
- **No dangling `selected` / `selectedRelationshipId` — PASS.** Grep across `src` finds no residual
  reference; the sole caller (`MapView.tsx:857`) does not pass the removed props, and the
  `Connector` consumers destructure `{ id, a, b, directed, label }`. `colors.amber` is fully
  removed from `ConnectorLayer` while `colors` stays used (hairline/paperShade/ink/slate/paper),
  so no unused-import or dangling-token defect. `tests/features/connectors.test.ts` does not
  reference the removed field.
- **No Dexie schema/version change, no new dependency — PASS.** The delta is component/logic-only.

WR-02 is correct: `lineStroke = connectorColor ? hexToRgba(connectorColor, 0.55) : CONNECTOR_HAIRLINE`
replaces the prior solid full-alpha custom stroke, and the casing luminance still derives from the
SOLID `lineHex` (`connectorColor ?? colors.hairline`), never from the rgba string.

No blockers. One robustness warning and two coverage/clarity notes below.

## Warnings

### WR-01: Fence-lift re-trigger added inside an unguarded async promise (no cancelled/mounted guard, no error handling)

**File:** `src/features/graph/GraphView.tsx:316-327`
**Issue:** The delta adds `setPostFocusPlaceTick((t) => t + 1)` inside the async exit-fallback
branch (`basePosRef.current === null`), which runs as `void loadPositions().then((positions) => { … })`.
This callback dereferences the captured `cy` (`cy.nodes().positions(...)`, `cy.nodes().removeClass('ego')`)
and calls the state setter, but has **no `cancelled`/mounted guard and no `.catch`** — unlike the
mount-time `loadPositions` effect (GraphView.tsx:125-133) and the avatar effect, which both use a
`cancelled` flag. If `GraphView` unmounts (or the Cytoscape core is torn down) during the awaited
`loadPositions()`, the resolved callback runs against a destroyed `cy`, which can throw an
uncaught rejection, and `setPostFocusPlaceTick` fires post-unmount. The window is small (an
IndexedDB read), and this fallback path is only reached when focus was entered before a base
snapshot was captured, but the pattern is inconsistent with the rest of the file and swallows
errors silently.
**Fix:** Guard the callback the same way the sibling effects do, and swallow/log the rejection:
```ts
} else {
  let cancelled = false; // capture from an effect-scoped flag if you hoist it
  void loadPositions()
    .then((positions) => {
      const cy2 = cyRef.current;
      if (!cy2 || cancelled) return;
      if (positions) cy2.nodes().positions((n) => positions[n.id()] ?? n.position());
      cy2.nodes().removeClass('ego');
      suspendSaveRef.current = false;
      prevFocusedRef.current = null;
      setPostFocusPlaceTick((t) => t + 1);
    })
    .catch(() => {
      // restore the fence invariant even if the reload fails, else the graph stays permanently fenced
      suspendSaveRef.current = false;
      prevFocusedRef.current = null;
    });
}
```
Note the secondary hazard the fix also closes: if `loadPositions()` **rejects**, the current code
leaves `suspendSaveRef.current` stuck `true` forever (the fence is only dropped inside the
resolve callback), permanently disabling every subsequent layout save for that session.

## Info

### IN-01: Async exit-fallback fence-lift path is untested

**File:** `e2e/graph.spec.ts:422-539`
**Issue:** The WR-01 e2e test exercises only the **synchronous** exit branch
(GraphView.tsx:304-315) — it pre-seeds a base so `basePosRef` is captured on enter, and it forces
`reducedMotion: 'reduce'` so the concentric run is synchronous. The trickier async fallback branch
(GraphView.tsx:316-327), where `basePosRef.current` is `null` and the fence is lifted *inside* a
promise, is never driven. That branch is the one most likely to harbour ordering bugs (it is the
reason `setPostFocusPlaceTick` had to be bumped inside the callback rather than synchronously), yet
has no regression coverage.
**Fix:** Add a case that enters focus while the ego node is still absent (elements catching up) so
`basePosRef` stays null, then adds a newcomer and exits, asserting the newcomer is persisted and no
base row is corrupted — mirroring the existing WR-01 assertions.

### IN-02: Placement persistence depends implicitly on the initial-cose layoutstop registration ordering

**File:** `src/features/graph/GraphView.tsx:348-360`, `e2e/graph.spec.ts:416-420`
**Issue:** With the explicit save removed, all newcomer persistence flows through the `layoutstop`
handler. The e2e comment (graph.spec.ts:416-420) documents that the **first** `cose`'s `layoutstop`
fires *before* `registerCy` attaches the handler, so a fresh DB does not persist a `graphPositions`
row until a drag or a newcomer add occurs. This is pre-existing (not introduced by this delta) and
the layout is regenerable, but the delta increases reliance on the layoutstop path being the sole
writer, making the ordering assumption load-bearing. Worth a short code comment near the placement
effect making the "layoutstop is the only writer" contract explicit for future maintainers, so the
implicit dependency on handler-registration ordering is not silently broken by a later refactor.
**Fix:** Add an inline note at the placement effect stating persistence is delegated to the
once-registered `layoutstop` handler (already partially covered at GraphView.tsx:334-347), and
consider persisting the initial fresh-cose layout explicitly on first mount if a durable row on
first open is ever desired.

---

_Reviewed: 2026-08-19T04:19:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

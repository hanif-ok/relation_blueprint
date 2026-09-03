// positionCache — the graph's position cache. Node positions are a regenerable local convenience
// (NOT authored data): they are persisted as ONE key/value row (`graphPositions`) in the Dexie
// `meta` table — cheap to write, trivially skipped on a fresh device (where `cose` recomputes).
// Positions are written on `layoutstop` (reset/newcomer layouts, i.e. every layout from the SECOND
// one onward) AND on `dragfree` (POL-02: a manual node drag sticky-persists its new spot). The
// FIRST layout of a core is persisted instead by GraphView's one-shot recovery layout-effect, gated
// by `shouldPersistInitialLayout` below — its `layoutstop` is raised before our listener exists
// (F5X-DEF-1; see the LAYOUT PERSISTENCE section of the GraphView header). Dragging is viewer-only —
// it writes ONLY this meta row, never `db.people`/`db.relationshipLinks`.
//
// D-08 SUPERSEDES the old D-13 full-invalidation rule. Previously any node-set change made the gate
// return false → a fresh `cose` blew away the whole hand-arranged layout. Now `partitionCached`
// splits the current node-set into `cached` (saved spots kept) vs `missing` (the newcomer(s)):
//   - allCached  → `preset` fast-path (instant, physics-free — Phase-4 backward-compat).
//   - noneCached → fresh `cose` (first build, or after Reset layout clears the row).
//   - partial    → `preset` for the cached anchors, then GraphView locks them and runs `cose` over
//     the full graph so ONLY the unlocked newcomer relaxes into place, then re-saves.
// `hasCachedPositions` is retained (still the simple binary "is the whole set cached" check).
// `clearPositions` is the Reset-layout escape hatch: it deletes the row so the gate falls to
// noneCached → a fresh `cose` re-arranges automatically. Stale entries for removed nodes are
// harmless (ignored by both the gate and the partition).

import type cytoscape from 'cytoscape';
import { db } from '@/db/schema';
import type { GraphPositions } from './graphElements';

/** The single meta key under which the whole position map lives. */
const GRAPH_POSITIONS_KEY = 'graphPositions';

/** Persist the current layout (every node's id → position) as one meta row. */
export async function savePositions(cy: cytoscape.Core): Promise<void> {
  const map: GraphPositions = {};
  cy.nodes().forEach((n) => {
    map[n.id()] = { ...n.position() };
  });
  await db.meta.put({ key: GRAPH_POSITIONS_KEY, value: map });
}

/** Read the cached position map back, or undefined when nothing has been cached yet. */
export async function loadPositions(): Promise<GraphPositions | undefined> {
  const row = await db.meta.get(GRAPH_POSITIONS_KEY);
  return row?.value as GraphPositions | undefined;
}

/**
 * True only when the cache is present AND every current node id has a stored position — the
 * signal to use `layout: 'preset'`. Any missing id (a newly-added node) → false → relayout.
 */
export function hasCachedPositions(
  positions: GraphPositions | undefined,
  nodeIds: string[],
): boolean {
  if (!positions) return false;
  return nodeIds.every((id) => Object.prototype.hasOwnProperty.call(positions, id));
}

/**
 * The three-way layout gate (D-08). Partition the current node ids into `cached` (an id with a
 * stored position) and `missing` (a newcomer with none), using the same own-property check
 * `hasCachedPositions` uses. `allCached` (⇒ preset) is true when nothing is missing AND a cache
 * exists; `noneCached` (⇒ fresh cose) is true when nothing is cached. A partial result (some
 * cached, ≥1 missing) drives the lock-anchors → cose(newcomer) → unlock → save path in GraphView.
 * Pure: reads only its arguments, mutates nothing.
 */
export function partitionCached(
  positions: GraphPositions | undefined,
  nodeIds: string[],
): { cached: string[]; missing: string[]; allCached: boolean; noneCached: boolean } {
  const cached = nodeIds.filter(
    (id) => !!positions && Object.prototype.hasOwnProperty.call(positions, id),
  );
  const missing = nodeIds.filter((id) => !cached.includes(id));
  return {
    cached,
    missing,
    allCached: missing.length === 0 && !!positions,
    noneCached: cached.length === 0,
  };
}

/**
 * The initial-layout recovery gate (quick-260903-nyu / F5X-DEF-1). react-cytoscapejs runs the mount
 * layout inside `patch()` and only afterwards invokes the `cy` prop callback that attaches our
 * `layoutstop` listener (`react-cytoscapejs component.js:46-88` → `patch.js:57-70`), and `cose` with
 * `animate:false` emits `layoutstop` SYNCHRONOUSLY inside that run — so the first layout's event is
 * raised into a void and no row is ever written. GraphView recovers by persisting from a one-shot
 * `useLayoutEffect` (by then the nodes already sit at their final `cose` spots), but ONLY when all
 * four inputs below agree. Each one prevents a distinct failure mode:
 *
 *  - `probed` — `posCache.probed` can still be false when `CytoscapeComponent` mounts, because the
 *    `loadPositions()` probe races three `useLiveQuery` reads. Recovering then would persist a fresh
 *    `cose` OVER the curator's saved hand-arranged layout. This is the data-loss guard; never drop it.
 *  - `noneCached` — restricts recovery to the only case where the missed event was load-bearing.
 *    `allCached`'s missed `preset` `layoutstop` would have been an identical no-op re-save; `partial`'s
 *    newcomer IS persisted by the placement effect's own (heard) `cose` `layoutstop`, and recovering
 *    there would race a newcomers-at-origin snapshot against it.
 *  - `!layoutStopSeen` — once ANY `layoutstop` has reached the handler, the handler owns persistence
 *    for that core forever. This is what stops Reset layout (a heard `cose`) from double-saving.
 *  - `!saveSuspended` — the ego-focus fence, read from the SAME `suspendSaveRef` the `layoutstop`
 *    handler reads. One fence, two readers.
 *
 * Pure: reads only its argument, mutates nothing (exactly like `partitionCached` above).
 */
export function shouldPersistInitialLayout(gate: {
  probed: boolean;
  noneCached: boolean;
  layoutStopSeen: boolean;
  saveSuspended: boolean;
}): boolean {
  return gate.probed && gate.noneCached && !gate.layoutStopSeen && !gate.saveSuspended;
}

/**
 * Reset layout (D-09) — delete the whole `graphPositions` meta row so the gate falls to
 * `noneCached` and a fresh `cose` re-arranges the graph automatically. The escape hatch back to an
 * automatic layout; discards only the regenerable local position cache, never entity data.
 */
export async function clearPositions(): Promise<void> {
  await db.meta.delete(GRAPH_POSITIONS_KEY);
}

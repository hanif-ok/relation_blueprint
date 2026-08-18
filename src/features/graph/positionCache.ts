// positionCache — the graph's position cache. Node positions are a regenerable local convenience
// (NOT authored data): they are persisted as ONE key/value row (`graphPositions`) in the Dexie
// `meta` table — cheap to write, trivially skipped on a fresh device (where `cose` recomputes).
// Positions are written on `layoutstop` (fresh/reset/newcomer layouts) AND on `dragfree` (POL-02:
// a manual node drag sticky-persists its new spot). Dragging is viewer-only — it writes ONLY this
// meta row, never `db.people`/`db.relationshipLinks`.
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
 * Reset layout (D-09) — delete the whole `graphPositions` meta row so the gate falls to
 * `noneCached` and a fresh `cose` re-arranges the graph automatically. The escape hatch back to an
 * automatic layout; discards only the regenerable local position cache, never entity data.
 */
export async function clearPositions(): Promise<void> {
  await db.meta.delete(GRAPH_POSITIONS_KEY);
}

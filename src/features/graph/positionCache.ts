// positionCache — the graph's D-13 position cache. Node positions are a regenerable local
// convenience (NOT authored data): run `cose` once, persist the resulting layout on `layoutstop`,
// and reopen with `layout: 'preset'` for an instant, physics-free render. The whole cache is ONE
// key/value row (`graphPositions`) in the Dexie `meta` table — cheap to write, trivially skipped
// on a fresh device (where `cose` simply recomputes).
//
// `hasCachedPositions` is the invalidation gate: the cache is only usable when EVERY current node
// id has a stored position. Adding a person/group (a node-set change) leaves the new node without
// a cached position → the gate returns false → GraphView falls back to a fresh `cose` run and
// re-caches. Stale entries for removed nodes are harmless (ignored).

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

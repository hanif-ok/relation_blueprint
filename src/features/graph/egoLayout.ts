// egoLayout — the PURE brain of the POL-03 concentric ego overlay (D-10/D-11). Given an undirected
// adjacency and a chosen ego, `computeHopLevels` derives each node's breadth-first hop-distance
// (ego = 0, its neighbours = 1, …) and parks any node unreachable from the ego at maxHop+1 — never
// undefined/NaN, so the concentric layout always has a finite ring for every node. `concentricValue`
// maps a hop to a Cytoscape `concentric` value as `-hop`, so the nearer a node is, the HIGHER its
// value → the inner ring (the ego sits at the centre).
//
// Both functions are pure over the plain adjacency structure and hold NO Cytoscape instance (mirrors
// graphElements/positionCache purity), so they unit-test without a live core — the research seam.
// GraphView builds the `Adjacency` undirected from the graph's edges before calling in.

/** A node-id → neighbour-ids map. Treated as UNDIRECTED by computeHopLevels (an edge on either
 *  endpoint's list is traversed both ways), so GraphView may build it from directed edges directly. */
export type Adjacency = Record<string, string[]>;

/**
 * Breadth-first hop-distance of every node from `egoId` over the UNDIRECTED adjacency.
 * ego → 0, a direct neighbour → 1, a 2-hop node → 2, …; a node present in the adjacency but
 * unreachable from the ego is parked at maxHop+1 (a finite outer ring — never undefined/NaN).
 * Pure: reads only its arguments, mutates nothing, no I/O.
 */
export function computeHopLevels(adjacency: Adjacency, egoId: string): Record<string, number> {
  // Symmetrise: collect the full node set (keys ∪ referenced neighbours) and an undirected
  // neighbour set per node, so an edge listed on only one endpoint is still traversed both ways.
  const neighbours = new Map<string, Set<string>>();
  const ensure = (id: string): Set<string> => {
    let set = neighbours.get(id);
    if (!set) {
      set = new Set<string>();
      neighbours.set(id, set);
    }
    return set;
  };
  for (const [node, list] of Object.entries(adjacency)) {
    ensure(node);
    for (const other of list) {
      ensure(node).add(other);
      ensure(other).add(node); // undirected: the reverse edge too
    }
  }

  // BFS from the ego, recording the nearest depth for every reachable node.
  const levels: Record<string, number> = {};
  if (neighbours.has(egoId)) {
    levels[egoId] = 0;
    let frontier = [egoId];
    let depth = 0;
    while (frontier.length > 0) {
      depth += 1;
      const next: string[] = [];
      for (const node of frontier) {
        for (const other of ensure(node)) {
          if (levels[other] === undefined) {
            levels[other] = depth;
            next.push(other);
          }
        }
      }
      frontier = next;
    }
  }

  // Park every unvisited node (disconnected from the ego) at maxHop+1 — a finite outer ring.
  const visitedDepths = Object.values(levels);
  const maxHop = visitedDepths.length > 0 ? Math.max(...visitedDepths) : 0;
  for (const node of neighbours.keys()) {
    if (levels[node] === undefined) levels[node] = maxHop + 1;
  }

  return levels;
}

/**
 * Map a hop-distance to a Cytoscape `concentric` value: `-hop`. The ego (hop 0) yields 0 — the
 * maximum — placing it at the centre; farther nodes yield more-negative values → outer rings.
 * Monotonic decreasing in hop, so nearer → higher value → inner ring.
 */
export function concentricValue(hop: number): number {
  return 0 - hop; // `0 - hop` (not `-hop`) so hop 0 yields +0, never -0 (Object.is cleanliness)
}

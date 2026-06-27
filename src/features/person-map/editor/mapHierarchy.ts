// mapHierarchy — the pure, cycle-safe ancestor-chain builder for the Breadcrumb (D-10 / MAP-07).
//
// Walking `MapDoc.parentId` upward from the active map crosses a trust boundary: a tampered or
// corrupt `parentId` could be CYCLIC (A→B→A) or DANGLING (points at a deleted map). Either would
// hang the breadcrumb render in an infinite walk (threat T-03-09, a DoS). This module is the
// single hard guard: it caps the walk depth AND tracks visited ids in a Set, so a cycle terminates
// and a dangling parent degrades the map to top-level (the chain built so far) rather than crashing
// (threat T-03-10). It is pure (a plain `Map<id, {id,name,parentId}>` in, an ordered chain out) so
// it is unit-testable without rendering — Breadcrumb is the thin React wrapper over it.

/** The minimal node shape the chain builder needs (a subset of MapDoc). */
export interface HierarchyNode {
  id: string;
  name: string;
  parentId?: string;
}

/** Hard cap on the walk depth — defends against a cyclic/over-deep chain (threat T-03-09). A real
 *  nested-space hierarchy is a handful deep; 32 is far beyond any legitimate depth. */
export const MAX_CHAIN_DEPTH = 32;

/**
 * Build the ancestor chain for `activeId`, ordered ROOT → … → active (so the breadcrumb reads
 * left-to-right top-down). Returns `[]` when `activeId` is absent from `byId`.
 *
 * Cycle/dangling safety (NON-negotiable, threat T-03-09/T-03-10):
 *  - a `visited` Set stops the walk the instant a node repeats (cyclic parentId),
 *  - the `MAX_CHAIN_DEPTH` cap is a belt-and-braces bound even if the Set logic were bypassed,
 *  - a `parentId` pointing at a missing node simply ends the walk (that map is treated top-level).
 * In every degenerate case the function returns the bounded chain built so far — it never loops.
 */
export function buildAncestorChain(
  activeId: string | null | undefined,
  byId: Map<string, HierarchyNode>,
): HierarchyNode[] {
  if (!activeId) return [];
  const start = byId.get(activeId);
  if (!start) return [];

  // Walk upward collecting nodes current → root, then reverse to root → current.
  const chain: HierarchyNode[] = [];
  const visited = new Set<string>();
  let current: HierarchyNode | undefined = start;
  let depth = 0;

  while (current && depth < MAX_CHAIN_DEPTH) {
    if (visited.has(current.id)) break; // cycle detected — stop the walk (T-03-09)
    visited.add(current.id);
    chain.push(current);
    depth += 1;
    const parentId = current.parentId;
    if (!parentId) break; // top-level map
    const parent = byId.get(parentId);
    if (!parent) break; // dangling parent — degrade to top-level (T-03-10)
    current = parent;
  }

  return chain.reverse();
}

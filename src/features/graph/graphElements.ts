// graphElements — the PURE projection that turns the reactive people/groups/links census into
// the `elements` array react-cytoscapejs consumes. It is deliberately DOM-free and holds NO
// Cytoscape instance (mirrors the coords.ts purity precedent), so the mapping unit-tests without
// a canvas.
//
//   nodes: people → { data: { id, label, kind: 'people' } }, groups → { ..., kind: 'groups' }
//   edges: each relationship-link with BOTH endpoints → { data: { id, source, target, label, directed } }
//
// Two robustness rules live here (both from RESEARCH Pitfall 4):
//   - a link missing fromId/toId (a legacy endpoint-less shell, or one whose endpoint was
//     deleted) is DROPPED — it can't be drawn, so it never becomes a dangling edge (T-04-10).
//   - `directed` is normalized at read (`=== true`) so an old record with `directed: undefined`
//     renders a plain (arrowhead-less) edge rather than an inconsistent one.
//
// An optional cached-positions map is applied to each node's `position`, driving the D-13
// `preset` fast-path; when absent the node has no position and Cytoscape's `cose` lays it out.

import type cytoscape from 'cytoscape';
import type { Group, Person, RelationshipLink } from '@/domain/types';

/** A cached graph position keyed by entity id (see positionCache). */
export type GraphPositions = Record<string, { x: number; y: number }>;

export function toGraphElements(
  people: Person[],
  groups: Group[],
  links: RelationshipLink[],
  positions?: GraphPositions,
): cytoscape.ElementDefinition[] {
  const nodes: cytoscape.ElementDefinition[] = [
    ...people.map((p) => ({
      data: { id: p.id, label: p.name, kind: 'people' as const },
      position: positions?.[p.id],
    })),
    ...groups.map((g) => ({
      data: { id: g.id, label: g.name, kind: 'groups' as const },
      position: positions?.[g.id],
    })),
  ];

  const edges: cytoscape.ElementDefinition[] = links
    .filter((l) => l.fromId && l.toId) // drop legacy endpoint-less shells (Pitfall 4 / T-04-10)
    .map((l) => ({
      data: {
        id: l.id,
        source: l.fromId!,
        target: l.toId!,
        label: l.label ?? '',
        directed: l.directed === true, // normalize optional flag at read (Pitfall 4)
      },
    }));

  return [...nodes, ...edges];
}

// POL-03 (D-10/D-11) — the pure brain of the concentric ego overlay. `computeHopLevels` derives
// each node's breadth-first hop-distance from a chosen ego over an UNDIRECTED adjacency (ego=0,
// neighbour=1, …), parking any node unreachable from the ego at maxHop+1 (never undefined/NaN).
// `concentricValue(hop) = -hop` maps a hop-distance to a Cytoscape concentric value so that the
// nearer a node is, the HIGHER its value → the inner ring (ego at the centre). Both are pure over
// the plain adjacency structure (no cytoscape import), so they unit-test without a live core — the
// research seam.

import { describe, expect, it } from 'vitest';
import { computeHopLevels, concentricValue, type Adjacency } from '@/features/graph/egoLayout';

describe('POL-03 — computeHopLevels (breadth-first hop-distance from the ego)', () => {
  it('assigns ego=0, direct neighbours=1, a 2-hop node=2, and parks a disconnected node at maxHop+1', () => {
    const adjacency: Adjacency = {
      ego: ['a', 'b'],
      a: ['ego'],
      b: ['ego', 'c'],
      c: ['b'],
      iso: [],
    };
    // maxHop over the connected component is 2 (c), so the disconnected `iso` parks at 3.
    expect(computeHopLevels(adjacency, 'ego')).toEqual({ ego: 0, a: 1, b: 1, c: 2, iso: 3 });
  });

  it('a single isolated node maps to just { ego: 0 }', () => {
    expect(computeHopLevels({ ego: [] }, 'ego')).toEqual({ ego: 0 });
  });

  it('never returns undefined/NaN for a node present in the adjacency (disconnected → maxHop+1)', () => {
    const adjacency: Adjacency = { ego: ['a'], a: ['ego'], lonely: [] };
    const levels = computeHopLevels(adjacency, 'ego');
    for (const id of Object.keys(adjacency)) {
      expect(Number.isFinite(levels[id])).toBe(true);
    }
    // ego reaches a at hop 1 (maxHop 1); `lonely` is unreachable → parked at maxHop+1 = 2.
    expect(levels.lonely).toBe(2);
  });

  it('treats the adjacency as UNDIRECTED — an edge listed on only one endpoint is still traversed both ways', () => {
    // Only `b` lists `a`; `a` lists nobody. Undirected traversal must still reach b via a→b.
    const adjacency: Adjacency = { ego: ['a'], a: [], b: ['a'] };
    expect(computeHopLevels(adjacency, 'ego')).toEqual({ ego: 0, a: 1, b: 2 });
  });

  it('records breadth-first depth (nearest path wins) when a node is reachable by multiple lengths', () => {
    // d is reachable directly from ego (hop 1) and via a→b→c→d (hop 4); BFS records the nearest, 1.
    const adjacency: Adjacency = {
      ego: ['a', 'd'],
      a: ['ego', 'b'],
      b: ['a', 'c'],
      c: ['b', 'd'],
      d: ['ego', 'c'],
    };
    expect(computeHopLevels(adjacency, 'ego')).toEqual({ ego: 0, a: 1, d: 1, b: 2, c: 3 });
  });
});

describe('POL-03 — concentricValue (nearer hop → higher value → inner ring)', () => {
  it('is -hop', () => {
    expect(concentricValue(0)).toBe(0);
    expect(concentricValue(1)).toBe(-1);
    expect(concentricValue(3)).toBe(-3);
  });

  it('is monotonic decreasing in hop (concentricValue(0) > concentricValue(1) > concentricValue(2))', () => {
    expect(concentricValue(0)).toBeGreaterThan(concentricValue(1));
    expect(concentricValue(1)).toBeGreaterThan(concentricValue(2));
  });
});

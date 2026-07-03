// REL-04 — the pure `toGraphElements` mapping that feeds react-cytoscapejs.
//
// This is a DOM-free, Cytoscape-instance-free projection (mirrors the coords.ts purity
// precedent): people/groups become nodes, relationship-links become edges. Two invariants
// are pinned here with data only:
//   (1) every person → a { kind:'people' } node; every group → a { kind:'groups' } node;
//       every link with BOTH endpoints → an edge (source=fromId, target=toId, label, directed)
//   (2) a link missing fromId/toId (a legacy endpoint-less shell) is DROPPED (Pitfall 4) —
//       it can't be drawn, so it never reaches the graph
//   (3) an optional cached-positions map is applied to each node's `position` when present
//       (drives the D-13 `preset` fast-path); absent → node.position is undefined (cose lays out)

import { describe, expect, it } from 'vitest';
import { toGraphElements } from '@/features/graph/graphElements';
import type { Group, Person, RelationshipLink } from '@/domain/types';

function person(id: string, name: string): Person {
  return {
    id,
    name,
    tags: [],
    gallery: [],
    custom: {},
    updatedAt: 1,
    dirty: false,
  } as unknown as Person;
}

function group(id: string, name: string): Group {
  return {
    id,
    name,
    gallery: [],
    custom: {},
    updatedAt: 1,
    dirty: false,
  } as unknown as Group;
}

function link(partial: Partial<RelationshipLink> & { id: string }): RelationshipLink {
  return {
    name: partial.name ?? 'rel',
    gallery: [],
    custom: {},
    updatedAt: 1,
    dirty: false,
    ...partial,
  } as unknown as RelationshipLink;
}

describe('REL-04 — toGraphElements maps entities→nodes and links→edges', () => {
  it('maps each person to a people-kind node and each group to a groups-kind node', () => {
    const els = toGraphElements([person('p1', 'Alice')], [group('g1', 'Team')], []);
    const p = els.find((e) => e.data.id === 'p1');
    const g = els.find((e) => e.data.id === 'g1');
    expect(p?.data).toMatchObject({ id: 'p1', label: 'Alice', kind: 'people' });
    expect(g?.data).toMatchObject({ id: 'g1', label: 'Team', kind: 'groups' });
    // Nodes carry no source/target — they are not edges.
    expect(p?.data).not.toHaveProperty('source');
  });

  it('maps a two-endpoint link to an edge (source=fromId, target=toId, label, directed)', () => {
    const els = toGraphElements(
      [person('p1', 'Alice'), person('p2', 'Bob')],
      [],
      [link({ id: 'l1', label: 'knows', fromId: 'p1', toId: 'p2', directed: true })],
    );
    const edge = els.find((e) => e.data.id === 'l1');
    expect(edge?.data).toMatchObject({
      id: 'l1',
      source: 'p1',
      target: 'p2',
      label: 'knows',
      directed: true,
    });
  });

  it('normalizes a missing `directed` to false (backward-compat, Pitfall 4)', () => {
    const els = toGraphElements(
      [person('p1', 'A'), person('p2', 'B')],
      [],
      [link({ id: 'l1', fromId: 'p1', toId: 'p2' })],
    );
    expect(els.find((e) => e.data.id === 'l1')?.data.directed).toBe(false);
  });

  it('DROPS a link missing fromId or toId (legacy endpoint-less shell) — no dangling edge', () => {
    const els = toGraphElements(
      [person('p1', 'A'), person('p2', 'B')],
      [],
      [
        link({ id: 'shell' }), // no endpoints at all
        link({ id: 'halfA', fromId: 'p1' }), // missing toId
        link({ id: 'halfB', toId: 'p2' }), // missing fromId
        link({ id: 'ok', fromId: 'p1', toId: 'p2' }),
      ],
    );
    const edgeIds = els.filter((e) => 'source' in e.data).map((e) => e.data.id);
    expect(edgeIds).toEqual(['ok']);
  });

  it('applies a cached position to a node when the positions map has its id', () => {
    const els = toGraphElements([person('p1', 'A')], [], [], { p1: { x: 12, y: 34 } });
    expect(els.find((e) => e.data.id === 'p1')?.position).toEqual({ x: 12, y: 34 });
  });

  it('leaves node.position undefined when no positions map is supplied', () => {
    const els = toGraphElements([person('p1', 'A')], [], []);
    expect(els.find((e) => e.data.id === 'p1')?.position).toBeUndefined();
  });
});

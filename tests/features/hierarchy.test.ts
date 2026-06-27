// Task 3 (MAP-07) — the parent-chain builder behind the Breadcrumb (D-10). This pins the
// up-navigation hierarchy AND the NON-negotiable cycle/dangling safety (threat T-03-09/T-03-10):
// a tampered cyclic or dangling `parentId` must NOT hang the walk. The builder is pure (a
// `Map<id, node>` in, an ordered chain out) so it is tested here without rendering Breadcrumb.
//
// We seed three maps street ⊇ building ⊇ floor through the REAL repository (createMap + updateMap)
// to prove the parentId field round-trips, then build the chain from the persisted rows — and
// separately assert the cycle/dangling guards against hand-built node maps (so the cycle case can
// be constructed without persisting a corrupt row).

import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMap, updateMap } from '@/db/repository';
import {
  buildAncestorChain,
  MAX_CHAIN_DEPTH,
  type HierarchyNode,
} from '@/features/person-map/editor/mapHierarchy';

const bg = { hash: 'bg', mime: 'image/png' };

beforeEach(async () => {
  await db.maps.clear();
});

/** Build the id→node map the builder consumes, from the live `maps` table. */
async function nodesFromDb(): Promise<Map<string, HierarchyNode>> {
  const maps = await db.maps.toArray();
  return new Map(maps.map((m) => [m.id, { id: m.id, name: m.name, parentId: m.parentId }]));
}

describe('mapHierarchy — ancestor chain (MAP-07 / D-10)', () => {
  it('builds the root→current chain for a 3-level street ⊇ building ⊇ floor hierarchy', async () => {
    const street = await createMap({ name: 'Street', background: bg, width: 100, height: 100 });
    const building = await createMap({ name: 'Building', background: bg, width: 100, height: 100 });
    const floor = await createMap({ name: 'Floor', background: bg, width: 100, height: 100 });
    await updateMap(building.id, { parentId: street.id });
    await updateMap(floor.id, { parentId: building.id });

    const byId = await nodesFromDb();
    const chain = buildAncestorChain(floor.id, byId);

    expect(chain.map((n) => n.name)).toEqual(['Street', 'Building', 'Floor']);
    expect(chain.map((n) => n.id)).toEqual([street.id, building.id, floor.id]);
  });

  it('returns a single-element chain for a top-level map (no parent)', async () => {
    const street = await createMap({ name: 'Street', background: bg, width: 100, height: 100 });
    const chain = buildAncestorChain(street.id, await nodesFromDb());
    expect(chain.map((n) => n.id)).toEqual([street.id]);
  });

  it('returns [] for an unknown active id', () => {
    expect(buildAncestorChain('does-not-exist', new Map())).toEqual([]);
    expect(buildAncestorChain(null, new Map())).toEqual([]);
  });

  it('TERMINATES on a cyclic parentId (street→floor→building→street) — no infinite loop', () => {
    // Hand-build a corrupt cycle: street.parentId = floor, floor.parentId = building,
    // building.parentId = street. Walking up from floor must stop, not hang.
    const byId = new Map<string, HierarchyNode>([
      ['street', { id: 'street', name: 'Street', parentId: 'floor' }],
      ['building', { id: 'building', name: 'Building', parentId: 'street' }],
      ['floor', { id: 'floor', name: 'Floor', parentId: 'building' }],
    ]);

    // If the walk looped forever this assertion would never be reached (the test would time out).
    const chain = buildAncestorChain('floor', byId);

    // The walk visits each node at most once, so the chain is bounded by the node count.
    expect(chain.length).toBeLessThanOrEqual(3);
    expect(chain.length).toBeLessThanOrEqual(MAX_CHAIN_DEPTH);
    // No id repeats in the returned chain (the visited-Set guard held).
    const ids = chain.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('degrades a DANGLING parentId (points at a deleted map) to top-level', () => {
    // floor.parentId points at an id absent from the map → the walk ends, floor is top-level.
    const byId = new Map<string, HierarchyNode>([
      ['floor', { id: 'floor', name: 'Floor', parentId: 'deleted-building' }],
    ]);
    const chain = buildAncestorChain('floor', byId);
    expect(chain.map((n) => n.id)).toEqual(['floor']);
  });

  it('caps an over-deep chain at MAX_CHAIN_DEPTH', () => {
    // Build a linear chain longer than the cap: n0 → n1 → … → n(MAX+5).
    const total = MAX_CHAIN_DEPTH + 5;
    const byId = new Map<string, HierarchyNode>();
    for (let i = 0; i < total; i++) {
      byId.set(`n${i}`, {
        id: `n${i}`,
        name: `N${i}`,
        parentId: i === 0 ? undefined : `n${i - 1}`,
      });
    }
    const chain = buildAncestorChain(`n${total - 1}`, byId);
    expect(chain.length).toBeLessThanOrEqual(MAX_CHAIN_DEPTH);
  });
});

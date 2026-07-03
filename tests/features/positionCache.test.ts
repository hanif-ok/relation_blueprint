// REL-04 — the graph position cache (D-13). Positions are regenerable local convenience
// stored as ONE `graphPositions` row in the Dexie `meta` table: run `cose` once, persist on
// `layoutstop`, and reopen with `layout: 'preset'` for instant render. This pins, with data only:
//   (1) savePositions(cy) writes a `graphPositions` meta row of { id -> {x,y} } read from the core
//   (2) loadPositions() reads it back (undefined when nothing cached yet)
//   (3) hasCachedPositions(positions, nodeIds) is the invalidation gate — true ONLY when EVERY
//       current node id is present in the cache; a node-set change (added node) → false → relayout

import { beforeEach, describe, expect, it } from 'vitest';
import type cytoscape from 'cytoscape';
import { db } from '@/db/schema';
import { hasCachedPositions, loadPositions, savePositions } from '@/features/graph/positionCache';

/** A minimal fake Cytoscape core exposing only what savePositions reads (nodes().forEach → id/position). */
function fakeCy(nodes: Array<{ id: string; x: number; y: number }>): cytoscape.Core {
  return {
    nodes() {
      return {
        forEach(fn: (n: { id: () => string; position: () => { x: number; y: number } }) => void) {
          nodes.forEach((n) => fn({ id: () => n.id, position: () => ({ x: n.x, y: n.y }) }));
        },
      };
    },
  } as unknown as cytoscape.Core;
}

beforeEach(async () => {
  await db.meta.clear();
});

describe('REL-04 — graph position cache over the meta table', () => {
  it('savePositions writes a graphPositions row and loadPositions reads it back', async () => {
    await savePositions(
      fakeCy([
        { id: 'p1', x: 10, y: 20 },
        { id: 'g1', x: 30, y: 40 },
      ]),
    );
    const loaded = await loadPositions();
    expect(loaded).toEqual({ p1: { x: 10, y: 20 }, g1: { x: 30, y: 40 } });

    // It lives under the canonical `graphPositions` key.
    const row = await db.meta.get('graphPositions');
    expect(row?.value).toEqual({ p1: { x: 10, y: 20 }, g1: { x: 30, y: 40 } });
  });

  it('loadPositions returns undefined when nothing has been cached', async () => {
    expect(await loadPositions()).toBeUndefined();
  });

  it('hasCachedPositions is true when every current node id is cached', () => {
    const positions = { p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 } };
    expect(hasCachedPositions(positions, ['p1', 'p2'])).toBe(true);
  });

  it('hasCachedPositions is false when a NEW node has no cached position (node-set change → relayout)', () => {
    const positions = { p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 } };
    expect(hasCachedPositions(positions, ['p1', 'p2', 'p3'])).toBe(false);
  });

  it('hasCachedPositions ignores stale extra cache entries (a removed node still leaves the rest valid)', () => {
    const positions = { p1: { x: 0, y: 0 }, gone: { x: 9, y: 9 } };
    expect(hasCachedPositions(positions, ['p1'])).toBe(true);
  });

  it('hasCachedPositions is false when there is no cache at all', () => {
    expect(hasCachedPositions(undefined, ['p1'])).toBe(false);
  });
});

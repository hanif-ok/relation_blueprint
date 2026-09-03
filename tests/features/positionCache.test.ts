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
import {
  clearPositions,
  hasCachedPositions,
  loadPositions,
  partitionCached,
  savePositions,
  shouldPersistInitialLayout,
} from '@/features/graph/positionCache';

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

describe('POL-02 — partitionCached (three-way gate, D-08 place-newcomer-only)', () => {
  it('no cache at all → everything missing, allCached false, noneCached true', () => {
    expect(partitionCached(undefined, ['p1'])).toEqual({
      cached: [],
      missing: ['p1'],
      allCached: false,
      noneCached: true,
    });
  });

  it('a full cache classifies as allCached (Phase-4 backward-compat / preset fast-path)', () => {
    expect(partitionCached({ p1: { x: 0, y: 0 } }, ['p1'])).toEqual({
      cached: ['p1'],
      missing: [],
      allCached: true,
      noneCached: false,
    });
  });

  it('a partial cache isolates the newcomer in missing (some cached, ≥1 missing)', () => {
    expect(
      partitionCached({ p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 } }, ['p1', 'p2', 'p3']),
    ).toEqual({
      cached: ['p1', 'p2'],
      missing: ['p3'],
      allCached: false,
      noneCached: false,
    });
  });

  it('a cache with none of the current ids → cached empty, noneCached true', () => {
    expect(partitionCached({ p1: { x: 0, y: 0 } }, ['p2'])).toEqual({
      cached: [],
      missing: ['p2'],
      allCached: false,
      noneCached: true,
    });
  });

  it('ignores stale extra cache entries (a removed node still leaves the rest allCached)', () => {
    expect(partitionCached({ p1: { x: 0, y: 0 }, gone: { x: 9, y: 9 } }, ['p1'])).toEqual({
      cached: ['p1'],
      missing: [],
      allCached: true,
      noneCached: false,
    });
  });
});

describe('F5X-DEF-1 — shouldPersistInitialLayout (the one-shot recovery gate, quick-260903-nyu)', () => {
  /** The four gate inputs, defaulted to the ONLY combination that permits the recovery save. */
  const permit = {
    probed: true,
    noneCached: true,
    layoutStopSeen: false,
    saveSuspended: false,
  };

  it('probed + noneCached + no layoutstop seen + not suspended → true (the only true row)', () => {
    expect(shouldPersistInitialLayout({ ...permit })).toBe(true);
  });

  it('probe still in flight (probed:false) → false — persisting here would clobber a saved layout', () => {
    expect(shouldPersistInitialLayout({ ...permit, probed: false })).toBe(false);
  });

  it('not noneCached (allCached / partial) → false — those paths are not this defect', () => {
    expect(shouldPersistInitialLayout({ ...permit, noneCached: false })).toBe(false);
  });

  it('a layoutstop has already been heard → false — the handler is live and owns persistence', () => {
    expect(shouldPersistInitialLayout({ ...permit, layoutStopSeen: true })).toBe(false);
  });

  it('the ego-focus fence is up (saveSuspended) → false — same fence the layoutstop handler reads', () => {
    expect(shouldPersistInitialLayout({ ...permit, saveSuspended: true })).toBe(false);
  });

  it('is pure: same input → same answer twice, and it never touches the meta table', async () => {
    await db.meta.clear();
    const gate = { ...permit };
    const first = shouldPersistInitialLayout(gate);
    const second = shouldPersistInitialLayout(gate);
    expect(second).toBe(first);
    // The argument is not mutated…
    expect(gate).toEqual(permit);
    // …and no Dexie write happened as a side effect.
    expect(await db.meta.get('graphPositions')).toBeUndefined();
    expect(await db.meta.toArray()).toEqual([]);
  });
});

describe('POL-02 — clearPositions (Reset layout escape hatch)', () => {
  it('deletes the graphPositions row so loadPositions() returns undefined again', async () => {
    await savePositions(fakeCy([{ id: 'p1', x: 10, y: 20 }]));
    expect(await loadPositions()).toEqual({ p1: { x: 10, y: 20 } });

    await clearPositions();
    expect(await loadPositions()).toBeUndefined();
    expect(await db.meta.get('graphPositions')).toBeUndefined();
  });
});

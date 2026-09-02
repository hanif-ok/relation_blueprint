// quick-260902-nfs Task 2 (RED→GREEN) — the pure group-move geometry behind a marquee drag.
//
// `groupMove.ts` converts ONE stage-space drag delta into the image-space patches every non-grabbed
// selected object needs. It is the piece that must not be hand-rolled twice: object positions are
// stored in IMAGE space while the drag happens in STAGE space, so the delta has to be converted by
// `stageToImage(delta) − stageToImage({0,0})` — the only derivation that correctly undoes the
// background rotation and scale (the identical technique `ShapeNode.handlePointsDragEnd` uses).
//
// These assertions pin, before the implementation exists:
//   (1) the identity case (a delta is itself),
//   (2) a full round-trip under a scaled + rotated transform,
//   (3) points-bearing shapes shift every VERTEX and leave x/y alone,
//   (4) markers shift their stored image-space position,
//   (5) T-NFS-03 — a non-finite delta or a zero/non-finite transform scale yields an EMPTY result
//       rather than NaN patches (corrupt at-rest geometry degrades to "nothing moved"),
//   (6) D-4 — the grabbed object is never in the output (its own drag-end handler persists it, so
//       including it here would apply the delta twice).

import { describe, expect, it } from 'vitest';
import type { BackgroundTransform, Marker, Shape } from '@/domain/types';
import { imageToStage } from '@/features/person-map/coords';
import { computeGroupMove, stageDeltaToImage } from '@/features/person-map/editor/groupMove';

const identity: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const skewed: BackgroundTransform = {
  offsetX: 100,
  offsetY: 50,
  scale: 2,
  rotation: Math.PI / 4,
};

function rect(id: string, x: number, y: number): Shape {
  return {
    id,
    layerId: 'layer-0',
    kind: 'rect',
    x,
    y,
    width: 80,
    height: 60,
    rotation: 0,
    preset: 'stone',
    fill: true,
  };
}

function poly(id: string, points: number[]): Shape {
  return {
    id,
    layerId: 'layer-0',
    kind: 'polygon',
    points,
    rotation: 0,
    preset: 'stone',
    fill: true,
  };
}

function marker(id: string, x: number, y: number): Marker {
  return { id, mapId: 'map-1', kind: 'person', personId: 'p1', x, y, updatedAt: 0, dirty: false };
}

describe('stageDeltaToImage', () => {
  it('is the identity at the identity transform', () => {
    expect(stageDeltaToImage({ x: 10, y: -5 }, identity)).toEqual({ x: 10, y: -5 });
  });

  it('undoes scale and rotation (the offset cancels in a DELTA)', () => {
    const d = stageDeltaToImage({ x: 10, y: -5 }, skewed)!;
    // Re-composing the image delta through the transform's linear part must return the stage delta.
    const back = imageToStage(d, skewed);
    const zero = imageToStage({ x: 0, y: 0 }, skewed);
    expect(back.x - zero.x).toBeCloseTo(10, 6);
    expect(back.y - zero.y).toBeCloseTo(-5, 6);
  });

  it('returns null for a non-finite delta component (T-NFS-03)', () => {
    expect(stageDeltaToImage({ x: Number.NaN, y: 0 }, identity)).toBeNull();
    expect(stageDeltaToImage({ x: 0, y: Number.POSITIVE_INFINITY }, identity)).toBeNull();
  });

  it('returns null for a zero or non-finite transform scale (T-NFS-03)', () => {
    expect(stageDeltaToImage({ x: 10, y: 10 }, { ...identity, scale: 0 })).toBeNull();
    expect(stageDeltaToImage({ x: 10, y: 10 }, { ...identity, scale: Number.NaN })).toBeNull();
  });
});

describe('computeGroupMove', () => {
  it('shifts a rect shape by exactly the delta at the identity transform', () => {
    const out = computeGroupMove({
      deltaStage: { x: 10, y: -5 },
      transform: identity,
      shapes: [rect('s1', 200, 300)],
      markers: [],
    });
    expect(out.shapePatches).toEqual([{ id: 's1', patch: { x: 210, y: 295 } }]);
    expect(out.markerPositions).toEqual([]);
  });

  it('round-trips under a scaled + rotated transform', () => {
    const deltaStage = { x: 37, y: -21 };
    const start = { x: 200, y: 300 };
    const out = computeGroupMove({
      deltaStage,
      transform: skewed,
      shapes: [rect('s1', start.x, start.y)],
      markers: [],
    });
    const patch = out.shapePatches[0].patch as { x: number; y: number };
    // The moved object, re-composed to stage space, must land at its original stage point plus the
    // stage delta — the property that makes a group drag land exactly where the cursor did.
    const landed = imageToStage({ x: patch.x, y: patch.y }, skewed);
    const original = imageToStage(start, skewed);
    expect(landed.x - original.x).toBeCloseTo(deltaStage.x, 6);
    expect(landed.y - original.y).toBeCloseTo(deltaStage.y, 6);
  });

  it('shifts EVERY vertex of a points-bearing shape and leaves x/y untouched', () => {
    const out = computeGroupMove({
      deltaStage: { x: 10, y: -5 },
      transform: identity,
      shapes: [poly('s1', [0, 0, 100, 0, 100, 80])],
      markers: [],
    });
    expect(out.shapePatches).toEqual([
      { id: 's1', patch: { points: [10, -5, 110, -5, 110, 75] } },
    ]);
    // A points patch must NOT carry x/y — ShapeNode renders a line/polygon from `points` only.
    expect(out.shapePatches[0].patch).not.toHaveProperty('x');
    expect(out.shapePatches[0].patch).not.toHaveProperty('y');
  });

  it("returns a marker's stored position plus the image delta", () => {
    const out = computeGroupMove({
      deltaStage: { x: 10, y: -5 },
      transform: identity,
      shapes: [],
      markers: [marker('m1', 320, 340)],
    });
    expect(out.markerPositions).toEqual([{ id: 'm1', x: 330, y: 335 }]);
  });

  it('returns an EMPTY result for a non-finite delta (T-NFS-03)', () => {
    const out = computeGroupMove({
      deltaStage: { x: Number.NaN, y: 4 },
      transform: identity,
      shapes: [rect('s1', 200, 300)],
      markers: [marker('m1', 320, 340)],
    });
    expect(out).toEqual({ shapePatches: [], markerPositions: [] });
  });

  it('returns an EMPTY result for a zero / non-finite transform scale (T-NFS-03)', () => {
    const zero = computeGroupMove({
      deltaStage: { x: 10, y: 10 },
      transform: { ...identity, scale: 0 },
      shapes: [rect('s1', 200, 300)],
      markers: [marker('m1', 320, 340)],
    });
    expect(zero).toEqual({ shapePatches: [], markerPositions: [] });

    const nan = computeGroupMove({
      deltaStage: { x: 10, y: 10 },
      transform: { ...identity, scale: Number.NaN },
      shapes: [rect('s1', 200, 300)],
      markers: [],
    });
    expect(nan).toEqual({ shapePatches: [], markerPositions: [] });
  });

  it('never emits the excluded (grabbed) id — D-4, or the delta would apply twice', () => {
    const out = computeGroupMove({
      deltaStage: { x: 10, y: -5 },
      transform: identity,
      shapes: [rect('s1', 200, 300), rect('grabbed', 400, 420)],
      markers: [marker('m1', 320, 340), marker('grabbed-mk', 500, 500)],
      excludeId: 'grabbed',
    });
    expect(out.shapePatches.map((p) => p.id)).toEqual(['s1']);
    expect(out.markerPositions.map((p) => p.id)).toEqual(['m1', 'grabbed-mk']);

    const outMk = computeGroupMove({
      deltaStage: { x: 10, y: -5 },
      transform: identity,
      shapes: [rect('s1', 200, 300)],
      markers: [marker('m1', 320, 340), marker('grabbed-mk', 500, 500)],
      excludeId: 'grabbed-mk',
    });
    expect(outMk.markerPositions.map((p) => p.id)).toEqual(['m1']);
  });
});

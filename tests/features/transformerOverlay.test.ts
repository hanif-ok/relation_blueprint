// Task 1 (RED→GREEN) — the scale-reset-to-1 persist logic of the Transformer overlay (RESEARCH
// Pattern 1, Anti-pattern "never persist raw scale"). A Konva Transformer resizes by mutating a
// node's scaleX/scaleY; persisting that scale verbatim would compound on every edit and make
// strokes scale non-uniformly. The correct move (RESEARCH) is, on `transformend`: read scaleX/scaleY,
// BAKE them into width/height, reset the node's scale back to 1, and persist the baked width/height
// + rotation. For a MARKER the dropped x/y must be converted back to IMAGE space (stageToImage) so
// the stored model stays image-space (Pattern 7); for a SHAPE the geometry is rewritten on the
// shapes array. This test pins that pure logic without a DOM:
//   (1) scaleX=2, width=50 → persisted width 100 (and the reset returns scale 1, not the scale),
//   (2) rotation passes through (radians),
//   (3) a below-MIN baked size is clamped to MIN,
//   (4) for a marker the persisted x/y are the stageToImage-converted (image-space) values,
//   (5) the marker branch yields an upsertMarker-shaped payload, the shape branch an
//       updateMap-shaped (shapes-array) payload.

import { describe, expect, it } from 'vitest';
import type { BackgroundTransform, Shape } from '@/domain/types';
import {
  computeTransformPersist,
  MIN_TRANSFORM_SIZE,
  type NodeLike,
} from '@/features/person-map/editor/TransformerOverlay';

const identity: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const moved: BackgroundTransform = { offsetX: 100, offsetY: 50, scale: 2, rotation: Math.PI / 4 };

/** A fake Konva node exposing only the getters the persist logic reads. */
function fakeNode(over: Partial<NodeLike>): NodeLike {
  return {
    scaleX: () => over.scaleX?.() ?? 1,
    scaleY: () => over.scaleY?.() ?? 1,
    width: () => over.width?.() ?? 50,
    height: () => over.height?.() ?? 50,
    rotation: () => over.rotation?.() ?? 0,
    x: () => over.x?.() ?? 0,
    y: () => over.y?.() ?? 0,
  };
}

describe('computeTransformPersist — scale-reset-to-1 bake (RESEARCH Pattern 1)', () => {
  it('bakes scaleX=2 into width (50 → 100) and resets node scale to 1, never persisting raw scale', () => {
    const reset: { x?: number; y?: number } = {};
    const node = fakeNode({
      scaleX: () => 2,
      scaleY: () => 2,
      width: () => 50,
      height: () => 50,
      rotation: () => 0,
      x: () => 10,
      y: () => 20,
    });
    let resetScaleX: number | undefined;
    let resetScaleY: number | undefined;
    const result = computeTransformPersist({
      node,
      kind: 'person',
      transform: identity,
      mapId: 'm1',
      objectId: 'mk1',
      personId: 'p1',
      resetScale: (sx, sy) => {
        resetScaleX = sx;
        resetScaleY = sy;
      },
    });
    void reset;

    expect(result.branch).toBe('marker');
    if (result.branch !== 'marker') throw new Error('expected marker branch');
    expect(result.payload.width).toBe(100);
    expect(result.payload.height).toBe(100);
    // The node's scale was reset to 1 (NOT persisted as 2).
    expect(resetScaleX).toBe(1);
    expect(resetScaleY).toBe(1);
  });

  it('converts Konva degrees to the stored radians (node.rotation() is degrees)', () => {
    // Konva reports rotation in DEGREES; the persisted model + renderers use RADIANS.
    const node = fakeNode({ scaleX: () => 1, scaleY: () => 1, rotation: () => 90 });
    const result = computeTransformPersist({
      node,
      kind: 'person',
      transform: identity,
      mapId: 'm1',
      objectId: 'mk1',
      personId: 'p1',
    });
    if (result.branch !== 'marker') throw new Error('expected marker branch');
    expect(result.payload.rotation).toBeCloseTo(Math.PI / 2, 10);
  });

  it('clamps a below-MIN baked size up to MIN_TRANSFORM_SIZE', () => {
    const node = fakeNode({
      scaleX: () => 0.01,
      scaleY: () => 0.01,
      width: () => 50,
      height: () => 50,
    });
    const result = computeTransformPersist({
      node,
      kind: 'shape',
      transform: identity,
      mapId: 'm1',
      objectId: 's1',
      shapes: [{ id: 's1', layerId: 'L', kind: 'rect', x: 0, y: 0, width: 50, height: 50, rotation: 0, preset: 'stone', fill: true }],
    });
    if (result.branch !== 'shape') throw new Error('expected shape branch');
    const updated = result.shapes.find((s) => s.id === 's1')!;
    expect(updated.width).toBe(MIN_TRANSFORM_SIZE);
    expect(updated.height).toBe(MIN_TRANSFORM_SIZE);
  });

  it('marker branch: persisted x/y are the stageToImage (image-space) values under a non-identity transform', () => {
    // The node sits at a STAGE point; under `moved` its image-space x/y differ from the stage point.
    const node = fakeNode({ scaleX: () => 1, scaleY: () => 1, x: () => 120, y: () => 80 });
    const result = computeTransformPersist({
      node,
      kind: 'person',
      transform: moved,
      mapId: 'm1',
      objectId: 'mk1',
      personId: 'p1',
    });
    if (result.branch !== 'marker') throw new Error('expected marker branch');
    // Image-space x/y must NOT equal the raw stage x/y (they were inverse-composed).
    expect(result.payload.x).not.toBe(120);
    expect(result.payload.y).not.toBe(80);
    // And composing them forward returns the stage point (round-trip sanity, image-space is stored).
    const cos = Math.cos(moved.rotation);
    const sin = Math.sin(moved.rotation);
    const fwdX = moved.offsetX + (result.payload.x * cos - result.payload.y * sin) * moved.scale;
    const fwdY = moved.offsetY + (result.payload.x * sin + result.payload.y * cos) * moved.scale;
    expect(fwdX).toBeCloseTo(120, 6);
    expect(fwdY).toBeCloseTo(80, 6);
  });

  it('marker branch yields an upsertMarker-shaped payload (id/mapId/personId/x/y/width/height/rotation)', () => {
    const node = fakeNode({ scaleX: () => 2, scaleY: () => 1, width: () => 40, height: () => 60, x: () => 5, y: () => 6 });
    const result = computeTransformPersist({
      node,
      kind: 'person',
      transform: identity,
      mapId: 'm1',
      objectId: 'mk1',
      personId: 'p1',
    });
    if (result.branch !== 'marker') throw new Error('expected marker branch');
    expect(result.payload).toMatchObject({
      id: 'mk1',
      mapId: 'm1',
      personId: 'p1',
      width: 80, // 40 * 2
      height: 60,
    });
    expect(result.payload.x).toBe(5);
    expect(result.payload.y).toBe(6);
  });

  it('shape branch yields an updateMap-shaped payload (the whole shapes array, one entry rewritten)', () => {
    const shapes: Shape[] = [
      { id: 's1', layerId: 'L', kind: 'rect', x: 0, y: 0, width: 50, height: 50, rotation: 0, preset: 'stone', fill: true },
      { id: 's2', layerId: 'L', kind: 'ellipse', x: 10, y: 10, width: 30, height: 30, rotation: 0, preset: 'sage', fill: true },
    ];
    const node = fakeNode({ scaleX: () => 2, scaleY: () => 2, width: () => 50, height: () => 50, rotation: () => 90 });
    const result = computeTransformPersist({
      node,
      kind: 'shape',
      transform: identity,
      mapId: 'm1',
      objectId: 's1',
      shapes,
    });
    if (result.branch !== 'shape') throw new Error('expected shape branch');
    expect(result.shapes).toHaveLength(2);
    const s1 = result.shapes.find((s) => s.id === 's1')!;
    const s2 = result.shapes.find((s) => s.id === 's2')!;
    expect(s1.width).toBe(100);
    expect(s1.height).toBe(100);
    // Konva degrees (90) → stored radians (π/2), minus the identity bg rotation (0).
    expect(s1.rotation).toBeCloseTo(Math.PI / 2, 10);
    // The untouched shape is preserved verbatim.
    expect(s2).toEqual(shapes[1]);
  });
});

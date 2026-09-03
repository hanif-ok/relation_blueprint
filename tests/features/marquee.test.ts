// marquee — the PURE hit-test module behind the Select-tool rubber-band selection
// (quick-260821-nac). Hit-testing is data-driven, NOT Konva-node-driven: `AvatarMarker`'s Konva
// `name` is keyed by PERSON id (which collides under multi-placement, D-13) and `draw-shapes.spec`
// asserts an exact node name, so enumerating scene-graph nodes by name would be both wrong and
// breaking. Instead the module recomposes stored geometry with the SAME `imageToStage` math the
// renderer uses — which is why it can be unit-tested here with no DOM and no Konva.
//
// Pins:
//   (1) normalizeBox turns two arbitrary drag corners into a positive-origin box,
//   (2) boxesIntersect is a standard axis-aligned overlap AND returns false for any non-finite
//       coordinate — the corrupt-geometry guard (T-QT-03), mirroring stageToImage's scale guard so
//       a tampered record yields an EMPTY selection rather than a NaN-poisoned one,
//   (3) shapeStageBox reproduces the renderer's composition exactly (origin via imageToStage,
//       extents by transform.scale; a points-bearing shape by the bbox of its composed vertices),
//   (4) markerStageBox is the square of 2·halfExtent centred on an already-composed stage point,
//   (5) marqueeHits returns every intersecting shape/marker id, omits near-misses, and treats a
//       zero-extent band as no selection at all (a stray click can never build a delete set).

import { describe, expect, it } from 'vitest';
import {
  normalizeBox,
  boxesIntersect,
  shapeStageBox,
  markerStageBox,
  marqueeHits,
  screenBoxToWorld,
  type Box,
} from '@/features/person-map/editor/marquee';
import type { BackgroundTransform, Shape } from '@/domain/types';

const IDENTITY: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const SCALED_2X: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 2, rotation: 0 };

/** A minimal rect Shape at the given image-space geometry. */
function rect(id: string, x: number, y: number, width: number, height: number): Shape {
  return { id, layerId: 'l0', kind: 'rect', x, y, width, height, rotation: 0, preset: 'stone', fill: true };
}

describe('marquee — normalizeBox', () => {
  it('turns two drag corners into a positive-origin box regardless of drag direction', () => {
    // dragged up-and-left
    expect(normalizeBox({ x: 200, y: 200 }, { x: 150, y: 120 })).toEqual({
      x: 150,
      y: 120,
      width: 50,
      height: 80,
    });
    // the same band dragged down-and-right normalizes identically
    expect(normalizeBox({ x: 150, y: 120 }, { x: 200, y: 200 })).toEqual({
      x: 150,
      y: 120,
      width: 50,
      height: 80,
    });
  });

  it('a band with both corners at the same point has zero extent', () => {
    expect(normalizeBox({ x: 40, y: 40 }, { x: 40, y: 40 })).toEqual({
      x: 40,
      y: 40,
      width: 0,
      height: 0,
    });
  });
});

describe('marquee — boxesIntersect', () => {
  const a: Box = { x: 0, y: 0, width: 100, height: 100 };

  it('is true for partially overlapping boxes', () => {
    expect(boxesIntersect(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
  });

  it('is true when one box fully contains the other (either way round)', () => {
    const inner: Box = { x: 25, y: 25, width: 10, height: 10 };
    expect(boxesIntersect(a, inner)).toBe(true);
    expect(boxesIntersect(inner, a)).toBe(true);
  });

  it('is false for disjoint boxes', () => {
    expect(boxesIntersect(a, { x: 200, y: 200, width: 10, height: 10 })).toBe(false);
    expect(boxesIntersect(a, { x: -50, y: 0, width: 10, height: 100 })).toBe(false);
  });

  it('is false whenever EITHER box carries a non-finite coordinate or extent (T-QT-03)', () => {
    expect(boxesIntersect(a, { x: NaN, y: 0, width: 100, height: 100 })).toBe(false);
    expect(boxesIntersect(a, { x: 0, y: 0, width: Infinity, height: 100 })).toBe(false);
    expect(boxesIntersect({ x: NaN, y: NaN, width: NaN, height: NaN }, a)).toBe(false);
  });
});

describe('marquee — shapeStageBox reproduces the renderer composition', () => {
  it('returns the stored geometry unchanged under the identity transform', () => {
    expect(shapeStageBox(rect('s', 10, 20, 100, 70), IDENTITY)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 70,
    });
  });

  it('composes the origin and scales the extents by transform.scale', () => {
    expect(shapeStageBox(rect('s', 10, 20, 100, 70), SCALED_2X)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 140,
    });
  });

  it('returns the bounding box of a polygon/line vertex set, composed to stage space', () => {
    const poly: Shape = {
      id: 'p',
      layerId: 'l0',
      kind: 'polygon',
      points: [10, 10, 60, 0, 40, 50],
      rotation: 0,
      preset: 'stone',
      fill: true,
    };
    expect(shapeStageBox(poly, IDENTITY)).toEqual({ x: 10, y: 0, width: 50, height: 50 });
  });
});

describe('marquee — markerStageBox', () => {
  it('is the square of 2·halfExtent centred on the composed stage position', () => {
    expect(markerStageBox({ x: 100, y: 200 }, 48)).toEqual({
      x: 52,
      y: 152,
      width: 96,
      height: 96,
    });
  });
});

describe('marquee — marqueeHits', () => {
  const shapes = [rect('shape-a', 100, 100, 80, 60), rect('shape-b', 400, 400, 80, 60)];
  const markers = [
    { id: 'mk-near', pos: { x: 150, y: 150 } },
    { id: 'mk-far', pos: { x: 900, y: 900 } },
  ];

  it('returns every shape and marker whose box intersects the band', () => {
    const band: Box = { x: 90, y: 90, width: 200, height: 200 };
    const hits = marqueeHits(band, shapes, markers, IDENTITY, 48);
    expect(hits.shapeIds).toEqual(['shape-a']);
    expect(hits.markerIds).toEqual(['mk-near']);
  });

  it('omits objects that only come close (no false positives)', () => {
    // The band stops well short of shape-a's box (100,100 → 180,160) and of mk-near's
    // 48px half-extent square (102,102 → 198,198).
    const band: Box = { x: 0, y: 0, width: 50, height: 50 };
    const hits = marqueeHits(band, shapes, markers, IDENTITY, 48);
    expect(hits.shapeIds).toEqual([]);
    expect(hits.markerIds).toEqual([]);
  });

  it('selects EVERYTHING a band spanning the whole scene touches', () => {
    const band: Box = { x: 0, y: 0, width: 1000, height: 1000 };
    const hits = marqueeHits(band, shapes, markers, IDENTITY, 48);
    expect(hits.shapeIds).toEqual(['shape-a', 'shape-b']);
    expect(hits.markerIds).toEqual(['mk-near', 'mk-far']);
  });

  it('treats a zero-extent band as NO selection — a stray click can never build a delete set', () => {
    // The point sits INSIDE shape-a, but a click is not a drag.
    const band: Box = { x: 140, y: 130, width: 0, height: 0 };
    const hits = marqueeHits(band, shapes, markers, IDENTITY, 48);
    expect(hits.shapeIds).toEqual([]);
    expect(hits.markerIds).toEqual([]);
  });

  it('yields an EMPTY selection against a corrupt transform rather than NaN-poisoned ids', () => {
    const corrupt: BackgroundTransform = { offsetX: NaN, offsetY: 0, scale: 1, rotation: 0 };
    const hits = marqueeHits({ x: 0, y: 0, width: 1000, height: 1000 }, shapes, [], corrupt, 48);
    expect(hits.shapeIds).toEqual([]);
  });
});

describe('marquee — screenBoxToWorld', () => {
  it('undoes a pure Stage PAN, moving the band into world space', () => {
    // Stage panned +200/+100 with no zoom: a band drawn at screen (240,230) sits at world (40,130).
    expect(
      screenBoxToWorld({ x: 240, y: 230, width: 120, height: 110 }, { x: 200, y: 100, scale: 1 }),
    ).toEqual({ x: 40, y: 130, width: 120, height: 110 });
  });
});

// marquee — the PURE hit-test behind the Select-tool rubber-band (marquee) selection.
//
// COORDINATE SPACE. Everything in this module lives in STAGE-CONTAINER pixels — the space
// `stage.getPointerPosition()` returns and the space the DOM band overlay is positioned in. The
// band therefore needs no transform composition of its own; only the OBJECTS have to be brought
// into that space, which this module does with the exact same `imageToStage` math the renderer
// uses (`ShapeNode`: origin via `imageToStage`, extents multiplied by `transform.scale`).
//
// WHY DATA-DRIVEN, NOT KONVA-NODE-DRIVEN (D-5). Hit-testing could in principle walk the Konva
// scene graph, but `AvatarMarker`'s node `name` is keyed by PERSON id — which collides whenever a
// person is multi-placed (D-13) — and `e2e/draw-shapes.spec.ts` asserts an exact node-name string,
// so a name-based enumeration would be both wrong and breaking. Composing the STORED geometry
// instead keeps this module free of React and Konva, and unit-testable without a DOM (mirroring
// `useToolMode`'s pure helpers).
//
// ROTATION is deliberately NOT applied: a rotated shape is hit-tested by its UNROTATED composed
// bounding box. That is a slightly generous box, which is the right failure direction for a
// selection gesture (a curator who bands a rotated room gets it) and keeps the math cheap enough
// to run over every on-screen object on release.

import type { BackgroundTransform, Shape } from '@/domain/types';
import { imageToStage, type Point } from '../coords';

/** An axis-aligned box in STAGE-CONTAINER pixels, with a positive origin and extents. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True only when every coordinate and extent of a box is a finite number. */
function isFiniteBox(b: Box): boolean {
  return (
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height)
  );
}

/**
 * Turn the two corners of a drag into a positive-origin {@link Box}, whichever direction the
 * curator dragged in.
 */
export function normalizeBox(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Standard axis-aligned overlap test.
 *
 * Threat T-QT-03: returns **false** whenever either box carries a non-finite coordinate or extent.
 * Shape geometry and `backgroundTransform` are read from Dexie — at-rest data that a user-supplied
 * backup can restore — so a tampered record must degrade to "not selected" rather than poison the
 * selection with NaN comparisons. This mirrors `coords.stageToImage`'s zero/non-finite scale guard:
 * corrupt input yields an empty result, never a corrupt one.
 */
export function boxesIntersect(a: Box, b: Box): boolean {
  if (!isFiniteBox(a) || !isFiniteBox(b)) return false;
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

/**
 * The stage-space bounding box of a stored {@link Shape}, composed exactly as `ShapeNode` renders
 * it: a points-bearing shape (line/polygon) becomes the bounding box of its composed vertices;
 * a rect/ellipse becomes its composed origin with extents scaled by the uniform `transform.scale`.
 *
 * Rotation is intentionally not applied — see the module header.
 */
export function shapeStageBox(shape: Shape, transform: BackgroundTransform): Box {
  if (shape.points && shape.points.length >= 2) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < shape.points.length; i += 2) {
      const p = imageToStage({ x: shape.points[i], y: shape.points[i + 1] }, transform);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  const origin = imageToStage({ x: shape.x ?? 0, y: shape.y ?? 0 }, transform);
  return {
    x: origin.x,
    y: origin.y,
    width: (shape.width ?? 0) * transform.scale,
    height: (shape.height ?? 0) * transform.scale,
  };
}

/**
 * The square of `2 · halfExtent` centred on an ALREADY-COMPOSED stage position — the same box the
 * viewport-culling pass uses for a marker, so what can be banded is exactly what is drawn.
 */
export function markerStageBox(pos: Point, halfExtent: number): Box {
  return {
    x: pos.x - halfExtent,
    y: pos.y - halfExtent,
    width: halfExtent * 2,
    height: halfExtent * 2,
  };
}

/**
 * Every shape and marker whose stage-space box intersects `band`.
 *
 * A band with no extent in EITHER axis selects nothing: a click is not a drag, and a stray click
 * must never be able to build a delete set (T-QT-01).
 *
 * Threat T-QT-02: callers pass ALREADY-CULLED markers (the `visibleMarkers`/`visiblePortals`
 * memos), so the cost of a release is bounded by what is on screen — never by the size of the
 * marker table. This runs once, on pointer-up, never per `pointermove`.
 */
export function marqueeHits(
  band: Box,
  shapes: Shape[],
  markers: Array<{ id: string; pos: Point }>,
  transform: BackgroundTransform,
  markerHalfExtent: number,
): { shapeIds: string[]; markerIds: string[] } {
  const empty = { shapeIds: [] as string[], markerIds: [] as string[] };
  if (!isFiniteBox(band)) return empty;
  if (!(band.width > 0) && !(band.height > 0)) return empty;

  const shapeIds: string[] = [];
  for (const shape of shapes) {
    if (boxesIntersect(band, shapeStageBox(shape, transform))) shapeIds.push(shape.id);
  }
  const markerIds: string[] = [];
  for (const mk of markers) {
    if (boxesIntersect(band, markerStageBox(mk.pos, markerHalfExtent))) markerIds.push(mk.id);
  }
  return { shapeIds, markerIds };
}

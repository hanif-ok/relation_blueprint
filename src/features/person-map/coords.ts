// coords.ts — the image-space ↔ stage-space coordinate composition (RESEARCH Pattern 7).
//
// Marker/shape `x`/`y` are stored in the background image's intrinsic IMAGE space and composed
// onto the live `MapDoc.backgroundTransform` at render time. This is the single most subtle piece
// of Phase 3: it is why re-fitting / resizing / rotating the background keeps every placed person
// in the same physical spot (the lobby person stays in the lobby, criterion 7 / Pitfall 5).
//
// `imageToStage` composes an image-space point through (rotate → uniform scale → offset) to a
// stage-space point. `stageToImage` is its exact inverse (subtract offset → divide by scale →
// rotate by −rotation), used on a marker's drag-end to convert the dropped stage point back to
// image space before persisting. At the IDENTITY transform (offset 0, scale 1, rotation 0) both
// are the identity function — which is exactly why the version(4) upgrade did NOT rewrite any
// existing marker coordinate (03-01): old stage-space coords are already valid image-space at
// identity. This file centralizes the arithmetic that 03-01 asserted inline in
// markerCoordMigration.test.ts and bgTransform.anchor.test.ts (the reference implementation).

import type { BackgroundTransform } from '@/domain/types';

export interface Point {
  x: number;
  y: number;
}

/**
 * Compose an image-space point onto a background transform to get its stage-space position.
 *
 *   x = offsetX + (p.x·cos − p.y·sin)·scale
 *   y = offsetY + (p.x·sin + p.y·cos)·scale
 *
 * At the identity transform this returns `p` unchanged (the identity function).
 */
export function imageToStage(p: Point, t: BackgroundTransform): Point {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    x: t.offsetX + (p.x * cos - p.y * sin) * t.scale,
    y: t.offsetY + (p.x * sin + p.y * cos) * t.scale,
  };
}

/**
 * The exact inverse of `imageToStage`: convert a stage-space point back to image space (used on
 * marker drag-end before persisting the new image-space coordinate). Subtract the offset, divide
 * by the scale, then rotate by −rotation.
 *
 * Threat T-03-08: a corrupt transform with `scale === 0` (or a non-finite scale) would otherwise
 * divide-by-zero and emit NaN/∞ into the marker math. We guard by treating a zero/non-finite
 * scale as 1 (the identity scale) so the function degrades gracefully instead of poisoning the
 * coordinate. The 03-01 schema defaults prevent a valid map from ever reaching this branch; the
 * guard exists purely for tampered/at-rest-corrupt data.
 */
export function stageToImage(p: Point, t: BackgroundTransform): Point {
  const safeScale = t.scale !== 0 && Number.isFinite(t.scale) ? t.scale : 1;
  // Undo offset, then undo uniform scale.
  const dx = (p.x - t.offsetX) / safeScale;
  const dy = (p.y - t.offsetY) / safeScale;
  // Undo rotation: rotate by −rotation (cos(−θ)=cos θ, sin(−θ)=−sin θ).
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

// groupMove — the PURE geometry that turns ONE stage-space drag delta into the image-space patches
// every non-grabbed object of a marquee selection needs.
//
// COORDINATE SPACES. Object positions are stored in IMAGE space (the background image's intrinsic
// space — see `coords.ts`), but a drag happens in STAGE space. The conversion of a DELTA is not the
// same as the conversion of a point: the transform's offset must cancel, and only its linear part
// (rotation + uniform scale) may apply. The one derivation that gets this right is
//
//     imageDelta = stageToImage(delta) − stageToImage({ x: 0, y: 0 })
//
// which is exactly what `ShapeNode.handlePointsDragEnd` already does for a single dragged line. It
// is reused here rather than hand-rolling a second transform implementation, because two
// independent copies of this arithmetic WILL drift and the drift is invisible until someone rotates
// a background.
//
// WHY THE GRABBED OBJECT IS EXCLUDED (D-4). `AvatarMarker.handleDragEnd`, `PortalGlyph.handleDragEnd`
// and `ShapeNode.handleRectDragEnd`/`handlePointsDragEnd` already persist the node they belong to,
// and they cannot be suppressed without modifying those three components (which this task
// deliberately leaves untouched). So the caller passes the grabbed id as `excludeId` and MapView
// persists only the REST — otherwise the delta lands on the grabbed object twice.
//
// Threat T-NFS-03. `deltaStage` derives from pointer input and `transform` is at-rest Dexie data
// restorable from a user-supplied backup, so both are untrusted. A non-finite delta component, or a
// zero / non-finite transform scale, returns an EMPTY result — "nothing moved" — rather than
// emitting NaN coordinates into the stored model. This mirrors `marquee.boxesIntersect`'s
// non-finite guard and `coords.stageToImage`'s zero-scale guard: corrupt input yields an empty
// result, never a corrupt one. Note this is deliberately STRICTER than `stageToImage`, which
// silently substitutes scale 1: a selection that silently moves by a wrong amount is worse than a
// selection that does not move, because there is no undo.

import type { BackgroundTransform, Marker, Shape } from '@/domain/types';
import { stageToImage, type Point } from '../coords';

/** One shape's id paired with the partial descriptor patch a group move applies to it. */
export interface ShapePatch {
  id: string;
  patch: Partial<Shape>;
}

/** One marker's id paired with its new IMAGE-space position. */
export interface MarkerPosition {
  id: string;
  x: number;
  y: number;
}

export interface GroupMoveResult {
  shapePatches: ShapePatch[];
  markerPositions: MarkerPosition[];
}

export interface GroupMoveInput {
  /** The drag delta in STAGE space (the wrapper Group's transient x/y at drag-end). */
  deltaStage: Point;
  /** The active map's background transform. */
  transform: BackgroundTransform;
  /** The SELECTED shapes (callers pass the selection, not the whole map). */
  shapes: Shape[];
  /** The SELECTED markers and portals. */
  markers: Marker[];
  /** The grabbed object's id — it persists itself, so it is dropped here (D-4). */
  excludeId?: string | null;
}

const EMPTY: GroupMoveResult = { shapePatches: [], markerPositions: [] };

/** True only when every component of a transform that affects a DELTA is usable. */
function isUsableTransform(t: BackgroundTransform): boolean {
  return (
    Number.isFinite(t.scale) &&
    t.scale !== 0 &&
    Number.isFinite(t.rotation) &&
    Number.isFinite(t.offsetX) &&
    Number.isFinite(t.offsetY)
  );
}

/**
 * Convert a STAGE-space drag delta to an IMAGE-space delta, undoing the background rotation and
 * scale while cancelling its offset.
 *
 * Returns `null` — never a NaN point — for a non-finite delta or an unusable transform (T-NFS-03).
 */
export function stageDeltaToImage(delta: Point, t: BackgroundTransform): Point | null {
  if (!Number.isFinite(delta?.x) || !Number.isFinite(delta?.y)) return null;
  if (!isUsableTransform(t)) return null;
  // The offset cancels between these two conversions, leaving only rotation + scale undone.
  const zero = stageToImage({ x: 0, y: 0 }, t);
  const moved = stageToImage({ x: delta.x, y: delta.y }, t);
  const d = { x: moved.x - zero.x, y: moved.y - zero.y };
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return null;
  return d;
}

/**
 * The patches a group drag must persist for every selected object EXCEPT the grabbed one.
 *
 * A points-bearing shape (line/polygon) yields a `points` patch with every vertex shifted and NO
 * x/y — those shapes render from `points` alone, so writing x/y would be meaningless at best.
 * A rect/ellipse yields an `x`/`y` patch. Markers and portals yield image-space positions.
 */
export function computeGroupMove({
  deltaStage,
  transform,
  shapes,
  markers,
  excludeId = null,
}: GroupMoveInput): GroupMoveResult {
  const d = stageDeltaToImage(deltaStage, transform);
  if (!d) return { ...EMPTY };

  const shapePatches: ShapePatch[] = [];
  for (const shape of shapes ?? []) {
    if (shape.id === excludeId) continue;
    if (shape.points && shape.points.length >= 2) {
      // Every vertex shifts by the same image delta (x at even indices, y at odd).
      const points = shape.points.map((v, i) => (i % 2 === 0 ? v + d.x : v + d.y));
      shapePatches.push({ id: shape.id, patch: { points } });
      continue;
    }
    shapePatches.push({
      id: shape.id,
      patch: { x: (shape.x ?? 0) + d.x, y: (shape.y ?? 0) + d.y },
    });
  }

  const markerPositions: MarkerPosition[] = [];
  for (const mk of markers ?? []) {
    if (mk.id === excludeId) continue;
    markerPositions.push({ id: mk.id, x: mk.x + d.x, y: mk.y + d.y });
  }

  return { shapePatches, markerPositions };
}

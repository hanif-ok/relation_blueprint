// TransformerOverlay — a single Konva.Transformer giving resize + rotate handles to the ONE
// selected object (marker / portal / shape) or the background image (D-14/D-15, criterion 6).
//
// RESEARCH Pattern 1: there is NO pure-declarative react-konva way to drive a Transformer — the
// official pattern is a ref + `useEffect` that calls `trRef.current.nodes([selectedNode])` +
// `getLayer()?.batchDraw()` when a node is selected and clears the nodes when none. We make the
// attach effect IDEMPOTENT so React StrictMode's double-invoke does not double-attach (Pitfall 1).
//
// On `transformend` the Transformer changes the node's scaleX/scaleY — NOT its width/height.
// Persisting raw scale would compound across edits and distort stroke widths (RESEARCH Anti-pattern).
// So we read scaleX/scaleY, RESET both to 1, BAKE them into width/height (clamped to a minimum),
// pass rotation through, and persist via the repository ONLY (upsertMarker for a marker — with x/y
// inverse-composed back to IMAGE space via stageToImage so the stored model stays image-space,
// Pattern 7; updateMap for a shape — rewriting the geometry on the map's shapes array). NEVER a
// straight Dexie write (threat T-03-13). A `boundBoxFunc` enforces the minimum size at edit time
// (threat T-03-12). Handles are amber (the one canvas accent); anchors are 24px on a coarse pointer
// (finger-grabbable, D-19) else 12px, with an enlarged touch hit area.

import { useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';
import type Konva from 'konva';
import { colors } from '@/app/tokens';
import { upsertMarker, updateMap } from '@/db/repository';
import type { BackgroundTransform, MarkerKind, Shape } from '@/domain/types';
import { stageToImage } from '../coords';

/** Minimum baked width/height (image-space px). A Transformer drag below this is clamped up. */
export const MIN_TRANSFORM_SIZE = 12;

/** The kinds of object a Transformer can be attached to. Markers (person/portal) bake onto the
 *  marker record; a shape bakes onto the map's shapes array; the background bakes the map transform. */
export type TransformKind = MarkerKind | 'shape';

/** The minimal node surface the pure persist logic reads — a real Konva.Node satisfies this. */
export interface NodeLike {
  scaleX(): number;
  scaleY(): number;
  width(): number;
  height(): number;
  rotation(): number;
  x(): number;
  y(): number;
}

/** The upsertMarker-shaped payload the marker branch produces. */
export interface MarkerPersistPayload {
  id: string;
  mapId: string;
  kind: MarkerKind;
  personId?: string;
  targetMapId?: string;
  /** The editor layer the marker belongs to — threaded through so a transform-end never drops it
   *  (upsertMarker does a full put; an omitted layerId would silently reassign the default layer). */
  layerId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type TransformPersistResult =
  | { branch: 'marker'; payload: MarkerPersistPayload }
  | { branch: 'shape'; shapes: Shape[] };

export interface ComputeTransformPersistArgs {
  node: NodeLike;
  kind: TransformKind;
  transform: BackgroundTransform;
  mapId: string;
  /** The marker id or shape id being transformed. */
  objectId: string;
  /** Person marker only. */
  personId?: string;
  /** Portal marker only. */
  targetMapId?: string;
  /** Marker branch only: the editor layer the marker belongs to, preserved across the transform. */
  layerId?: string;
  /** Marker branch only: the intrinsic base box size (image-space px) to bake the scale onto. A
   *  marker/portal node is a Konva Group with NO intrinsic `width()` — the Transformer resizes a
   *  Group by mutating scaleX/scaleY, not width, so `node.width()` returns 0 and every resize would
   *  collapse to MIN_TRANSFORM_SIZE. Pass the known base box (2*R for a person, PORTAL_W/PORTAL_H for
   *  a portal). Absent → fall back to `node.width()`/`node.height()` (correct for real shape nodes). */
  baseWidth?: number;
  baseHeight?: number;
  /** Shape branch only: the current shapes array (one entry is rewritten). */
  shapes?: Shape[];
  /** Optional callback to reset the live node's scale back to 1 (the side-effect, kept injectable
   *  so the pure logic is unit-testable). */
  resetScale?: (scaleX: number, scaleY: number) => void;
}

/**
 * The pure scale-reset-to-1 bake (RESEARCH Pattern 1). Reads scaleX/scaleY off the node, computes
 * the new baked width/height (clamped to MIN_TRANSFORM_SIZE), passes rotation through, and returns
 * the repository-shaped payload for the right branch. For a marker the node's stage x/y are inverse-
 * composed back to IMAGE space via `stageToImage` (so the stored coordinate stays image-space,
 * Pattern 7). The optional `resetScale` callback resets the LIVE node's scale to 1 — the value 1 is
 * what is applied, NEVER the raw scale (the Anti-pattern this whole helper exists to avoid).
 */
export function computeTransformPersist(args: ComputeTransformPersistArgs): TransformPersistResult {
  const { node, kind, transform, mapId, objectId, personId, targetMapId, layerId, shapes, resetScale } =
    args;
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  // A marker/portal Group has no intrinsic width()/height() (Transformer mutates scale, not size),
  // so fall back to the caller-supplied base box; real shape nodes carry a real width()/height().
  const baseWidth = args.baseWidth ?? node.width();
  const baseHeight = args.baseHeight ?? node.height();
  // Konva's `node.rotation()` returns DEGREES, but the stored model + every renderer treats the
  // persisted `rotation` as RADIANS (they multiply by 180/π on the way out). Convert at this
  // boundary so the shape subtraction below and the marker payload both stay in radians.
  const rotation = (node.rotation() * Math.PI) / 180;
  const width = Math.max(MIN_TRANSFORM_SIZE, baseWidth * scaleX);
  const height = Math.max(MIN_TRANSFORM_SIZE, baseHeight * scaleY);

  // Reset the live node's scale to 1 — bake-into-width/height keeps strokes uniform.
  resetScale?.(1, 1);

  if (kind === 'shape') {
    // A shape node renders at STAGE size (image-size × bg scale). The baked width/height above are
    // in stage space; divide by the bg scale to store IMAGE-space geometry (Pattern 7). At the
    // identity transform (scale 1) this is a no-op. `rotation` is the shape's OWN rotation: the
    // node's rotation includes the bg rotation, so subtract it back out.
    const bgScale = transform.scale !== 0 && Number.isFinite(transform.scale) ? transform.scale : 1;
    const imgWidth = Math.max(MIN_TRANSFORM_SIZE, width / bgScale);
    const imgHeight = Math.max(MIN_TRANSFORM_SIZE, height / bgScale);
    const ownRotation = rotation - transform.rotation;
    const current = shapes ?? [];
    const next = current.map((s) =>
      s.id === objectId ? { ...s, width: imgWidth, height: imgHeight, rotation: ownRotation } : s,
    );
    return { branch: 'shape', shapes: next };
  }

  // marker (person | portal): convert the dropped stage point back to image space before persisting.
  const img = stageToImage({ x: node.x(), y: node.y() }, transform);
  return {
    branch: 'marker',
    payload: {
      id: objectId,
      mapId,
      kind: kind === 'portal' ? 'portal' : 'person',
      personId,
      targetMapId,
      layerId,
      x: img.x,
      y: img.y,
      width,
      height,
      rotation,
    },
  };
}

/** Persist a computed result through the repository (NEVER straight to Dexie — threat T-03-13). */
export function persistTransformResult(result: TransformPersistResult, mapId: string): void {
  if (result.branch === 'marker') {
    void upsertMarker(result.payload);
  } else {
    void updateMap(mapId, { shapes: result.shapes });
  }
}

/** True on a coarse (touch) pointer — drives the finger-grabbable 24px anchors (D-19). */
function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

export interface TransformerOverlayProps {
  /** The live Konva node to attach the Transformer to, or null when nothing is selected. */
  selectedNode: Konva.Node | null;
}

/**
 * The imperative Transformer overlay. Mounted in the L2 overlay layer; attaches to `selectedNode`
 * via a ref + effect (the official react-konva pattern) and detaches when null. The actual
 * transform-end persistence is wired on the selectable NODE (AvatarMarker / ShapeNode) which owns
 * its repository call; this component owns ONLY the handles + the attach/detach lifecycle and the
 * boundBoxFunc min-size guard (so even mid-drag the box never goes below MIN_TRANSFORM_SIZE).
 */
export function TransformerOverlay({ selectedNode }: TransformerOverlayProps) {
  const trRef = useRef<Konva.Transformer>(null);
  const coarse = isCoarsePointer();

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    // Idempotent attach: nodes() is set to exactly [selectedNode] or [] every run, so a StrictMode
    // double-invoke can never double-attach (Pitfall 1).
    if (selectedNode) {
      tr.nodes([selectedNode]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedNode]);

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      flipEnabled={false}
      anchorSize={coarse ? 24 : 12}
      // Enlarge the hit area on touch so a finger can grab a 24px anchor reliably (D-19, 44px target).
      anchorStrokeWidth={coarse ? 2 : 1}
      ignoreStroke
      anchorStroke={colors.amber}
      anchorFill={colors.paper}
      borderStroke={colors.amber}
      borderStrokeWidth={2}
      // Min-size guard at edit time: return the old box when the new one drops below MIN.
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_TRANSFORM_SIZE || newBox.height < MIN_TRANSFORM_SIZE ? oldBox : newBox
      }
    />
  );
}

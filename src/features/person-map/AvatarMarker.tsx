// AvatarMarker — the signature round photo-avatar marker, drawn on the Konva Stage.
//
// A marker is a draggable Group containing a circular-clipped avatar (or an initials
// fallback), a ring whose color/width encodes selection, and a short pin-stem whose tip
// touches the geographic point. Spec: UI-SPEC ## Round Photo-Avatar Marker.
//
// Phase-3 (03-04): the marker is composed through the map's `backgroundTransform` (Pattern 7) —
// the parent supplies the already-composed STAGE `position`, and on drag-end the dropped stage
// point is converted BACK to image space via `coords.stageToImage(transform)` before persisting,
// so the stored model stays image-space and a background re-fit keeps the marker anchored. The
// marker consumes its persisted `width`/`height`/`rotation` (applied to the Group), exposes its
// Group node via `onNodeRef` so the L2 TransformerOverlay can attach to it, and renders an
// optional name label (default hidden, D-20) as an XSS-safe Konva Text child. On `transformend`
// the marker bakes the Transformer scale into width/height + rotation and persists through the
// repository (computeTransformPersist / persistTransformResult — never straight to Dexie).
//
// The selected-ring amber is read from the shared tokens (`colors.amber`) so the canvas
// and the DOM focus mirror never drift (UI-SPEC A5/A8).

import { useEffect, useRef } from 'react';
import { Group, Circle, Rect, Image as KonvaImage, Text } from 'react-konva';
import type Konva from 'konva';
import { colors, marker as M } from '@/app/tokens';
import { upsertMarker } from '@/db/repository';
import { useMapImage } from './useMapImage';
import { stageToImage, type Point } from './coords';
import {
  computeTransformPersist,
  persistTransformResult,
} from './editor/TransformerOverlay';
import type { BackgroundTransform, Marker, Person } from '@/domain/types';

const R = M.R; // avatar radius (diameter 48px)

/** Up to two initials from a name, for the no-photo fallback. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarMarkerProps {
  marker: Marker;
  person: Person;
  /**
   * The STAGE-space position to render at, composed by the parent from the marker's IMAGE-space
   * `x`/`y` through the map's `backgroundTransform` (`imageToStage`). The marker does NOT read
   * `marker.x`/`marker.y` directly so it stays anchored when the background is re-fit.
   */
  position: Point;
  /**
   * The active background transform — used to convert the dropped stage point back to IMAGE space
   * on drag-end (the inverse of how `position` was composed), so the stored coordinate is always
   * image-space (Pattern 7).
   */
  transform: BackgroundTransform;
  selected: boolean;
  onSelect: (personId: string) => void;
  /**
   * Expose this marker's Group node to the parent when selected (null on deselect/unmount) so the
   * L2 TransformerOverlay can attach to it. RESEARCH A3: attach to the Group first.
   */
  onNodeRef?: (node: Konva.Group | null) => void;
  /** D-20: show the person's name as a Konva Text label below the stem. Default hidden. */
  showLabels?: boolean;
  /**
   * REL-03 (Pitfall 1): report the marker's LIVE stage position during a drag so the connector
   * layer can track it mid-drag WITHOUT a per-frame Dexie write. rAF-throttled internally — the
   * parent stores it as transient state and clears it on drag-end. Persistence still happens only
   * on drag-end (the existing upsertMarker path); this is a pure viewer-follow signal.
   */
  onDragMove?: (markerId: string, x: number, y: number) => void;
  /** REL-03: fired after the drag persists, so the parent can clear the transient drag override. */
  onDragEnd?: () => void;
}

export function AvatarMarker({
  marker,
  person,
  position,
  transform,
  selected,
  onSelect,
  onNodeRef,
  showLabels = false,
  onDragMove,
  onDragEnd,
}: AvatarMarkerProps) {
  const avatar = useMapImage(person.photo?.hash);

  const ringColor = selected ? colors.amber : colors.paper;
  const ringWidth = selected ? M.ringSelectedWidth : M.ringDefaultWidth;

  // rAF handle coalescing per-frame dragmove reports into a single connector update (Pattern 2).
  const dragRafRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (dragRafRef.current != null) cancelAnimationFrame(dragRafRef.current);
    },
    [],
  );

  // Report the marker's LIVE stage position to the parent during a drag, throttled to one update
  // per animation frame (no Dexie write here — persistence is on drag-end only, Pitfall 1).
  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    if (!onDragMove) return;
    const node = e.target;
    if (dragRafRef.current != null) return; // already scheduled this frame — coalesce.
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      onDragMove(marker.id, node.x(), node.y());
    });
  }

  // Persist the dragged position to the repository on drag end (Dexie is source of truth). The
  // dropped point is in STAGE space; convert it back to IMAGE space via the inverse transform so
  // the stored model stays image-space (Pattern 7) — a background re-fit then keeps the marker
  // anchored. At the identity transform this is the identity function (unchanged Phase-1 behavior).
  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    // Cancel any queued live-follow update — the persisted position (below) is now authoritative,
    // and the transient override is about to be cleared via onDragEnd.
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const img = stageToImage({ x: e.target.x(), y: e.target.y() }, transform);
    void upsertMarker({
      id: marker.id,
      mapId: marker.mapId,
      kind: marker.kind,
      personId: person.id,
      // Preserve the marker's editor layer across a move (upsertMarker does a full put — an omitted
      // layerId would silently reassign it to the default/first layer, destroying layer organization).
      layerId: marker.layerId,
      x: img.x,
      y: img.y,
      // Preserve any baked Transformer state across a move.
      width: marker.width,
      height: marker.height,
      rotation: marker.rotation,
    });
    // Notify the parent so it can clear the transient drag override — useLiveQuery then recomputes
    // the connector from the source of truth (which now equals the drop position).
    onDragEnd?.();
  }

  // On transform-end (Transformer resize/rotate): bake scale into width/height + rotation and
  // persist through the repository (computeTransformPersist resets scale to 1 — never persists raw
  // scale). The node is the marker Group; its x/y are inverse-composed back to image space.
  function handleTransformEnd(e: Konva.KonvaEventObject<Event>) {
    const node = e.target as Konva.Group;
    const result = computeTransformPersist({
      node,
      kind: 'person',
      transform,
      mapId: marker.mapId,
      objectId: marker.id,
      personId: person.id,
      layerId: marker.layerId,
      // The node is a Konva Group (no intrinsic width()); bake the scale onto the avatar's base box.
      baseWidth: 2 * R,
      baseHeight: 2 * R,
      resetScale: (sx, sy) => {
        node.scaleX(sx);
        node.scaleY(sy);
      },
    });
    persistTransformResult(result, marker.mapId);
  }

  // Apply persisted Transformer state. width/height drive an even uniform avatar scale (so the
  // round avatar + stem scale together); rotation rotates the whole Group. A marker with no baked
  // width keeps the intrinsic size (scale 1). The base bounding box is the avatar diameter.
  const baseSize = 2 * R;
  const scaleX = marker.width ? marker.width / baseSize : 1;
  const scaleY = marker.height ? marker.height / baseSize : 1;
  const rotationDeg = marker.rotation ? (marker.rotation * 180) / Math.PI : 0;

  return (
    <Group
      ref={(node) => onNodeRef?.(node)}
      x={position.x}
      y={position.y}
      scaleX={scaleX}
      scaleY={scaleY}
      rotation={rotationDeg}
      draggable
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      onClick={() => onSelect(person.id)}
      onTap={() => onSelect(person.id)}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
      // Marker selection has no DOM node; the test bridge reads this name.
      name={`marker-${person.id}`}
    >
      {/* Pin-stem below the circle; tip touches the geographic origin (0,0 of the group). */}
      <Rect
        x={-M.stemWidth / 2}
        y={R}
        width={M.stemWidth}
        height={M.stemHeight}
        fill={ringColor}
        cornerRadius={M.stemWidth / 2}
      />

      {/* The avatar circle floats above the stem; group origin sits at the stem tip, so
          the circle center is offset up by (R + stemHeight). */}
      <Group x={0} y={-M.stemHeight}>
        {avatar ? (
          // Circular-clipped photo. clipFunc arcs a full circle of radius R.
          <Group
            clipFunc={(ctx) => {
              ctx.arc(0, -R, R, 0, Math.PI * 2, false);
            }}
          >
            <KonvaImage image={avatar} x={-R} y={-2 * R} width={2 * R} height={2 * R} />
          </Group>
        ) : (
          // No-photo fallback: paper-shade fill + up to two initials.
          <>
            <Circle x={0} y={-R} radius={R} fill={colors.paperShade} />
            <Text
              x={-R}
              y={-R - R}
              width={2 * R}
              height={2 * R}
              text={initialsOf(person.name)}
              fontFamily="Inter, system-ui, sans-serif"
              fontStyle="600"
              fontSize={20}
              fill={colors.ink}
              align="center"
              verticalAlign="middle"
            />
          </>
        )}

        {/* Ring: 2px paper default / 3px amber when selected (the one amber on canvas). */}
        <Circle
          x={0}
          y={-R}
          radius={R}
          stroke={ringColor}
          strokeWidth={ringWidth}
          shadowColor="#000000"
          shadowBlur={3}
          shadowOpacity={selected ? 0.3 : 0.45}
          shadowOffsetY={1}
          listening={false}
        />
      </Group>

      {/* Optional name label below the stem (D-20, default hidden). User text flows straight into
          the Konva Text `text` prop — never as raw HTML (XSS boundary, exactly like ZoneLabel). */}
      {showLabels && (
        <Text
          x={-60}
          y={M.stemHeight + 4}
          width={120}
          text={person.name}
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={12}
          fill={colors.paper}
          align="center"
          listening={false}
        />
      )}
    </Group>
  );
}

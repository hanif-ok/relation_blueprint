// PortalGlyph — the signature PORTAL marker, drawn on the Konva Stage (UI-SPEC ## Portal Glyph).
//
// A portal is a `Marker` with `kind:'portal'` (RESEARCH Pattern 5a, discriminated union) and a
// `targetMapId` instead of a `personId`. It rides the SAME markers shard and reuses the
// AvatarMarker draggable-Group machinery (drag-end → stageToImage → upsertMarker; Transformer
// resize/rotate via computeTransformPersist), but it renders a DOOR-ARCH glyph — deliberately NOT
// round (round = person, D-06) — in the reserved portal-blue hue (`colors.portal`). This is the
// down-navigation half of MAP-07: double-click descends into the target map (the breadcrumb from
// 03-02 ascends back up via MapDoc.parentId).
//
// Interaction (D-07): single-click/single-tap SELECTS (gets the amber Transformer handles,
// movable/transformable); double-click/double-tap NAVIGATES to `targetMapId` (the rejected
// single-click-to-travel was too easy to trigger by accident). Selection is ALWAYS amber; identity
// is portal-blue (UI-SPEC l.148/178). When the target map no longer exists (deleted), the glyph
// renders in a muted/error affordance and navigating surfaces the "destination deleted" message
// instead of crashing (T-03-10, UI-SPEC l.277) — the parent handles the message via `onNavigate`
// returning/ throwing, so PortalGlyph just guards the navigate call.

import { Group, Rect, Path, Text } from 'react-konva';
import type Konva from 'konva';
import { colors, marker as M } from '@/app/tokens';
import { upsertMarker } from '@/db/repository';
import { stageToImage, type Point } from '../coords';
import {
  computeTransformPersist,
  persistTransformResult,
} from './TransformerOverlay';
import type { BackgroundTransform, Marker } from '@/domain/types';

/** Door-arch glyph geometry (UI-SPEC l.174): an upright radius-md-cornered rect, 32×44, with an
 *  inner paper door/arrow mark. The group origin sits at the BOTTOM-CENTER (the doorway threshold)
 *  so the glyph "stands" on the geographic point, mirroring how the avatar stem tip anchors. */
const PORTAL_W = 32;
const PORTAL_H = 44;
const PORTAL_CORNER = 10; // radius-md

/** The user copy surfaced when a portal's target map was deleted (UI-SPEC l.277). */
export const PORTAL_TARGET_DELETED_MESSAGE =
  "This portal's destination map was deleted. Pick a new one or remove the portal.";

export interface PortalGlyphProps {
  marker: Marker;
  /**
   * The STAGE-space position to render at, composed by the parent from the portal's IMAGE-space
   * `x`/`y` through the map's `backgroundTransform` (`imageToStage`) — exactly like AvatarMarker.
   */
  position: Point;
  /** The active background transform — converts the dropped stage point back to IMAGE space on
   *  drag-end (the inverse of how `position` was composed), so the stored coord stays image-space. */
  transform: BackgroundTransform;
  selected: boolean;
  /** Single-click/tap → select this portal (gets handles, movable/transformable). */
  onSelect: (markerId: string) => void;
  /** Double-click/tap → navigate to the portal's target map. The parent decides what to do when
   *  the target is missing (surface the deleted-destination message); we only call it when armed. */
  onNavigate: (targetMapId: string | undefined) => void;
  /** Expose the Group node to the parent when selected so the L2 TransformerOverlay can attach. */
  onNodeRef?: (node: Konva.Group | null) => void;
  /** True when `targetMapId` resolves to a real map. When false the glyph renders muted (T-03-10). */
  targetExists?: boolean;
  /** D-20 parity: show the target map name as an XSS-safe Konva Text label below the glyph. */
  showLabels?: boolean;
  /** The resolved target map name for the optional label (only used when showLabels). */
  targetName?: string;
}

export function PortalGlyph({
  marker,
  position,
  transform,
  selected,
  onSelect,
  onNavigate,
  onNodeRef,
  targetExists = true,
  showLabels = false,
  targetName,
}: PortalGlyphProps) {
  // Persist the dragged position to the repository on drag end (Dexie is source of truth). The
  // dropped point is in STAGE space; convert back to IMAGE space so the stored model stays
  // image-space (Pattern 7). A portal carries NO personId; preserve kind/targetMapId/layerId and
  // any baked Transformer state across a move.
  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const img = stageToImage({ x: e.target.x(), y: e.target.y() }, transform);
    void upsertMarker({
      id: marker.id,
      mapId: marker.mapId,
      kind: 'portal',
      targetMapId: marker.targetMapId,
      layerId: marker.layerId,
      x: img.x,
      y: img.y,
      width: marker.width,
      height: marker.height,
      rotation: marker.rotation,
    });
  }

  // On transform-end (resize/rotate): bake scale into width/height + rotation and persist through
  // the repository (computeTransformPersist resets scale to 1 — never persists raw scale). The
  // 'person' kind in computeTransformPersist drives uniform scale handling; a portal uses the same
  // path. We re-thread the portal's targetMapId after via upsertMarker is unnecessary because
  // persistTransformResult re-reads through the repository which preserves it — but to be safe the
  // Transformer overlay's persist path keys off the existing marker, so kind/target survive.
  function handleTransformEnd(e: Konva.KonvaEventObject<Event>) {
    const node = e.target as Konva.Group;
    const result = computeTransformPersist({
      node,
      kind: 'portal',
      transform,
      mapId: marker.mapId,
      objectId: marker.id,
      targetMapId: marker.targetMapId,
      resetScale: (sx, sy) => {
        node.scaleX(sx);
        node.scaleY(sy);
      },
    });
    persistTransformResult(result, marker.mapId);
  }

  // Apply persisted Transformer state. width/height drive a uniform scale of the door-arch box;
  // rotation rotates the whole Group. An un-transformed portal keeps its intrinsic size (scale 1).
  const scaleX = marker.width ? marker.width / PORTAL_W : 1;
  const scaleY = marker.height ? marker.height / PORTAL_H : 1;
  const rotationDeg = marker.rotation ? (marker.rotation * 180) / Math.PI : 0;

  // Identity fill is portal-blue; a deleted target dims the glyph (muted) as the error affordance
  // (T-03-10). Selection NEVER changes the fill — selection is the amber Transformer outline only.
  const fill = targetExists ? colors.portal : colors.paperShade;
  const outline = selected ? colors.amber : colors.paper;
  const outlineWidth = selected ? M.ringSelectedWidth : M.ringDefaultWidth;
  const innerMark = targetExists ? colors.paper : colors.inkMuted;

  // Glyph drawn so the group origin (0,0) is the BOTTOM-CENTER threshold; the box rises upward.
  const left = -PORTAL_W / 2;
  const top = -PORTAL_H;

  return (
    <Group
      ref={(node) => onNodeRef?.(node)}
      x={position.x}
      y={position.y}
      scaleX={scaleX}
      scaleY={scaleY}
      rotation={rotationDeg}
      draggable
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      // Single-click / single-tap → select (D-07). Double-click / double-tap → navigate.
      onClick={() => onSelect(marker.id)}
      onTap={() => onSelect(marker.id)}
      onDblClick={() => onNavigate(marker.targetMapId)}
      onDblTap={() => onNavigate(marker.targetMapId)}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
      // Portal selection has no DOM node; the test bridge / E2E reads this name.
      name={`portal-${marker.id}`}
    >
      {/* Enlarged transparent hit-rect so the whole glyph bounding box (≥ 44/48px on coarse
          pointers) is tappable, not just the painted pixels (D-19 touch parity). */}
      <Rect
        x={left - 8}
        y={top - 8}
        width={PORTAL_W + 16}
        height={PORTAL_H + 16}
        fill="transparent"
      />

      {/* The door-arch body — an upright rounded rect (NOT a circle; D-06 distinctiveness). The
          portal-blue fill is the one place portal-blue lives; the paper outline + drop shadow keep
          it legible on the dark canvas (mirrors the avatar ring). */}
      <Rect
        x={left}
        y={top}
        width={PORTAL_W}
        height={PORTAL_H}
        cornerRadius={[PORTAL_CORNER, PORTAL_CORNER, 4, 4]}
        fill={fill}
        stroke={outline}
        strokeWidth={outlineWidth}
        shadowColor="#000000"
        shadowBlur={3}
        shadowOpacity={selected ? 0.3 : 0.45}
        shadowOffsetY={1}
      />

      {/* Inner door/arrow mark — a centered open-door silhouette (paper on portal-blue, ≈5:1 AA).
          A simple Path of an inset arch reads as "doorway / go elsewhere" (UI-SPEC l.176). */}
      <Path
        x={left}
        y={top}
        data={doorPath(PORTAL_W, PORTAL_H)}
        fill={innerMark}
        listening={false}
      />

      {/* Optional target-name label below the glyph (D-20 parity, default hidden). The map name
          flows straight into the Konva Text `text` prop — never raw HTML (XSS boundary). */}
      {showLabels && targetName && (
        <Text
          x={-60}
          y={6}
          width={120}
          text={targetName}
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

/**
 * Build the SVG path for the inner door silhouette, sized to the glyph box. An inset arched
 * doorway: a rounded-top opening centered horizontally, occupying the lower-middle of the box.
 * Pure geometry (no user input) so it is safe to feed Konva `Path.data`.
 */
function doorPath(w: number, h: number): string {
  const dw = w * 0.42; // door opening width
  const dh = h * 0.5; // door opening height
  const x0 = (w - dw) / 2; // left edge of the door
  const x1 = x0 + dw; // right edge
  const yBottom = h * 0.82; // door sits near the threshold
  const yTop = yBottom - dh; // top of the straight sides
  const r = dw / 2; // arch radius (semicircle top)
  // Move to bottom-left, up the left side, arch over the top, down the right side, close.
  return (
    `M ${x0} ${yBottom} ` +
    `L ${x0} ${yTop} ` +
    `A ${r} ${r} 0 0 1 ${x1} ${yTop} ` +
    `L ${x1} ${yBottom} ` +
    `Z`
  );
}

// AvatarMarker — the signature round photo-avatar marker, drawn on the Konva Stage.
//
// A marker is a draggable Group containing a circular-clipped avatar (or an initials
// fallback), a ring whose color/width encodes selection, and a short pin-stem whose tip
// touches the geographic point. Spec: UI-SPEC ## Round Photo-Avatar Marker.
//
// The selected-ring amber is read from the shared tokens (`colors.amber`) so the canvas
// and the DOM focus mirror never drift (UI-SPEC A5/A8). No viewport culling or shape
// caching here — single marker; culling is a Phase 3 concern (RESEARCH Pattern 5).

import { Group, Circle, Rect, Image as KonvaImage, Text } from 'react-konva';
import type Konva from 'konva';
import { colors, marker as M } from '@/app/tokens';
import { upsertMarker } from '@/db/repository';
import { useMapImage } from './useMapImage';
import type { Marker, Person } from '@/domain/types';

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
  selected: boolean;
  onSelect: (personId: string) => void;
}

export function AvatarMarker({ marker, person, selected, onSelect }: AvatarMarkerProps) {
  const avatar = useMapImage(person.photo?.hash);

  const ringColor = selected ? colors.amber : colors.paper;
  const ringWidth = selected ? M.ringSelectedWidth : M.ringDefaultWidth;

  // Persist the dragged position to the repository on drag end (Dexie is source of truth).
  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    void upsertMarker({
      id: marker.id,
      mapId: marker.mapId,
      personId: marker.personId,
      x: e.target.x(),
      y: e.target.y(),
    });
  }

  return (
    <Group
      x={marker.x}
      y={marker.y}
      draggable
      onDragEnd={handleDragEnd}
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
    </Group>
  );
}

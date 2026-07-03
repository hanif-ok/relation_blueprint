// ConnectorLayer — the Konva render of the data-driven relationship connectors (REL-03, Pattern 2).
//
// This component renders the PURE geometry from `buildConnectors` as Konva `Arrow` shapes. It is
// mounted inside a dedicated `<Layer listening={false}>` in MapView (the SECOND physical layer,
// between L0 background and L1 content) so connectors paint BENEATH the markers and never intercept
// a drag/click (D-08/D-10). It holds NO state and persists nothing — connectors are a viewer-only
// projection recomputed from links + marker positions on every render.
//
// Visuals (UI-SPEC R4 / B1/B2): on the dark slate canvas a default connector is a warm TRANSLUCENT
// hairline (never solid ink — ink vanishes on slate), turning amber `#C8742B` only when its
// relationship is selected. Direction is an arrowhead (a shape, D-01), never a color, so a directed
// link never spends the amber budget. Labels are OFF by default (D-09) and, when the LayersPanel
// toggle is ON, draw as a paper-shade pill (Konva Label/Tag/Text — canvas text, never injected HTML,
// T-04-01) at the segment midpoint.

import { useEffect, useRef, useState } from 'react';
import { Group, Arrow, Label, Tag, Text } from 'react-konva';
import type Konva from 'konva';
import { colors } from '@/app/tokens';
import { hexToRgba } from '@/features/common/color';
import type { BackgroundTransform, Marker, RelationshipLink } from '@/domain/types';
import { buildConnectors, type DragOverride } from '../connectors';

/**
 * Default connector stroke/fill: the warm hairline token at 55% opacity (UI-SPEC B1). Derived from
 * `colors.hairline` via the shared `hexToRgba` (the same helper the graph edge stylesheet uses) so
 * the translucent tint can never drift from the palette or from the graph edges; amber selection
 * reads from `colors.amber` directly.
 */
const CONNECTOR_HAIRLINE = hexToRgba(colors.hairline, 0.55);

/**
 * A relationship-label pill TRULY centered on the segment midpoint (WR-03). Konva's `Label` anchors
 * at its top-left, so the previous fixed `offsetX={0}` applied no offset and rendered the pill
 * down-and-right of the connector instead of centered. We measure the rendered pill (the `Tag`
 * auto-sizes to the `Text`) via `getClientRect({ skipTransform: true })` after mount and offset the
 * `Label` by half its width/height, recentering it on (`x`, `y`). Re-measures when the label text
 * (and thus the pill width) changes.
 */
function ConnectorLabel({ x, y, label }: { x: number; y: number; label: string }) {
  const ref = useRef<Konva.Label>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getClientRect({ skipTransform: true });
    setOffset({ x: rect.width / 2, y: rect.height / 2 });
  }, [label]);
  return (
    <Label ref={ref} x={x} y={y} offsetX={offset.x} offsetY={offset.y} listening={false}>
      <Tag fill={colors.paperShade} stroke={colors.hairline} strokeWidth={1} cornerRadius={6} />
      <Text
        text={label}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={13}
        fill={colors.ink}
        padding={4}
        listening={false}
      />
    </Label>
  );
}

export interface ConnectorLayerProps {
  /** All relationship-links (live query of db.relationshipLinks). */
  links: RelationshipLink[];
  /** Markers on the active map (person + portal; portals are ignored by buildConnectors). */
  markers: Marker[];
  /** The active map's background transform — endpoints compose THROUGH it (shared with markers). */
  transform: BackgroundTransform;
  /** Transient live drag position for the one dragging marker (live-follow-on-drag). */
  dragOverride?: DragOverride | null;
  /** The selected relationship id (turns its connector amber). */
  selectedRelationshipId?: string | null;
  /** D-09: whether connector labels are shown (default OFF, owned by MapView). */
  showConnectorLabels?: boolean;
}

export function ConnectorLayer({
  links,
  markers,
  transform,
  dragOverride = null,
  selectedRelationshipId = null,
  showConnectorLabels = false,
}: ConnectorLayerProps) {
  const connectors = buildConnectors(links, markers, transform, {
    selectedRelationshipId,
    dragOverride,
  });

  return (
    <>
      {connectors.map(({ id, a, b, directed, selected, label }) => {
        const color = selected ? colors.amber : CONNECTOR_HAIRLINE;
        return (
          <Group key={id} listening={false} name={`connector-group-${id}`}>
            <Arrow
              name={`connector-${id}`}
              points={[a.x, a.y, b.x, b.y]}
              stroke={color}
              fill={color}
              strokeWidth={selected ? 2.5 : 1.75}
              // Arrowhead ONLY when the link is directed (D-01); mutual links draw a plain line.
              pointerLength={directed ? 10 : 0}
              pointerWidth={directed ? 8 : 0}
              perfectDrawEnabled={false}
              listening={false}
            />
            {/* Label pill centered on the segment midpoint — rendered ONLY when the toggle is ON
                (D-09) and the link carries a non-empty label. Konva Label/Tag/Text = canvas text
                (XSS-safe). ConnectorLabel measures itself to center the pill (WR-03). */}
            {showConnectorLabels && label.trim().length > 0 && (
              <ConnectorLabel x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} label={label} />
            )}
          </Group>
        );
      })}
    </>
  );
}

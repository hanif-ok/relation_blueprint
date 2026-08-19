// ConnectorLayer — the Konva render of the data-driven relationship connectors (REL-03, Pattern 2).
//
// This component renders the PURE geometry from `buildConnectors` as Konva `Arrow` shapes. It is
// mounted inside a dedicated `<Layer listening={false}>` in MapView (the SECOND physical layer,
// between L0 background and L1 content) so connectors paint BENEATH the markers and never intercept
// a drag/click (D-08/D-10). It holds NO state and persists nothing — connectors are a viewer-only
// projection recomputed from links + marker positions on every render.
//
// Visuals (UI-SPEC R4 / B1/B2): on the dark slate canvas a default connector is a warm TRANSLUCENT
// hairline (never solid ink — ink vanishes on slate); a per-map custom colour renders at the SAME
// 0.55 resting alpha (WR-02) so it never paints heavier than the default aesthetic. Direction is an
// arrowhead (a shape, D-01), never a color. Labels are OFF by default (D-09) and, when the
// LayersPanel toggle is ON, draw as a paper-shade pill (Konva Label/Tag/Text — canvas text, never
// injected HTML, T-04-01) at the segment midpoint. This layer is non-interactive (rendered inside
// `<Layer listening={false}>` in MapView), so there is no connector-selection affordance here.

import { useEffect, useRef, useState } from 'react';
import { Group, Arrow, Label, Tag, Text } from 'react-konva';
import type Konva from 'konva';
import { colors } from '@/app/tokens';
import { hexToRgba, outlineColorFor } from '@/features/common/color';
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
  /** D-09: whether connector labels are shown (default OFF, owned by MapView). */
  showConnectorLabels?: boolean;
  /**
   * POL-01 (D-04/D-06): the per-map RESTING connector-line colour. `null` (default) keeps the
   * `CONNECTOR_HAIRLINE` so an un-customised map renders identically. A custom colour renders at the
   * same 0.55 resting alpha as the default hairline (WR-02); the cased underlay reads on any
   * background image.
   */
  connectorColor?: string | null;
}

export function ConnectorLayer({
  links,
  markers,
  transform,
  dragOverride = null,
  showConnectorLabels = false,
  connectorColor = null,
}: ConnectorLayerProps) {
  const connectors = buildConnectors(links, markers, transform, { dragOverride });

  return (
    <>
      {connectors.map(({ id, a, b, directed, label }) => {
        // The visible TOP line: the per-map connectorColor at the default 0.55 resting alpha (WR-02),
        // else the D-06 default hairline. The casing luminance is derived from a SOLID hex basis (the
        // hairline/custom stroke is an rgba() string that outlineColorFor cannot parse), so we resolve
        // the opposite-neutral from `lineHex` and keep the rgba stroke only for the actual line.
        const lineHex = connectorColor ?? colors.hairline;
        const lineStroke = connectorColor ? hexToRgba(connectorColor, 0.55) : CONNECTOR_HAIRLINE;
        const topWidth = 1.75;
        // POL-01 (D-04): a luminance-opposite casing at 60% alpha, +2px wider, painted BENEATH the
        // colored line so any chosen colour (and the amber-selected line) reads on any background.
        const casing = hexToRgba(outlineColorFor(lineHex), 0.6);
        return (
          <Group key={id} listening={false} name={`connector-group-${id}`}>
            {/* Casing underlay — same geometry/arrowhead, wider + luminance-opposite (D-04). */}
            <Arrow
              name={`connector-casing-${id}`}
              points={[a.x, a.y, b.x, b.y]}
              stroke={casing}
              fill={casing}
              strokeWidth={topWidth + 2}
              pointerLength={directed ? 10 : 0}
              pointerWidth={directed ? 8 : 0}
              perfectDrawEnabled={false}
              listening={false}
            />
            <Arrow
              name={`connector-${id}`}
              points={[a.x, a.y, b.x, b.y]}
              stroke={lineStroke}
              fill={lineStroke}
              strokeWidth={topWidth}
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

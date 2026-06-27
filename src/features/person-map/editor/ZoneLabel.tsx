// ZoneLabel — the paper-shade label chip for a shape that has been promoted to a ZONE (D-02). A
// shape carrying a non-empty `label` IS a zone (there is no separate Zone entity); this renders
// that label as a small pill (a Konva `Rect` behind a Konva `Text`) centered on the shape.
//
// SECURITY (threat T-03-01): the user's label text is UNTRUSTED and crosses into a rendered
// canvas object. It passes straight into the Konva `Text` `text` prop — Konva paints it onto the
// canvas via the 2D context; it is NEVER assigned to innerHTML / `dangerouslySetInnerHTML`, so a
// `<script>`/`<img onerror>` label can never execute (and never reach the Drive token). This
// mirrors the AvatarMarker initials Text block. The CONTEXT.md mandate: ALL user text on the
// canvas is a Konva Text / React child, never raw HTML.

import { Group, Rect, Text } from 'react-konva';
import { colors } from '@/app/tokens';

/** Chip geometry — kept compact so it reads as a tag, not a banner. */
const PADDING_X = 8;
const HEIGHT = 22;
const FONT_SIZE = 13;
/** Rough glyph-width factor for Inter 600 at 13px — enough to size the pill without measuring. */
const CHAR_WIDTH = 7.2;

export interface ZoneLabelProps {
  /** The shape's user label. Rendered ONLY when non-empty (D-02). */
  label: string;
  /** Stage-space center the chip is anchored at (the composed shape center). */
  x: number;
  y: number;
}

export function ZoneLabel({ label, x, y }: ZoneLabelProps) {
  // Defensive: never render an empty/whitespace-only chip (a blank label is not a zone).
  const text = label.trim();
  if (text.length === 0) return null;

  const width = text.length * CHAR_WIDTH + PADDING_X * 2;

  return (
    // Center the pill on the shape center: offset back by half its size.
    <Group x={x - width / 2} y={y - HEIGHT / 2} listening={false} name="zone-label">
      <Rect
        width={width}
        height={HEIGHT}
        fill={colors.paperShade}
        cornerRadius={HEIGHT / 2}
        shadowColor="#000000"
        shadowBlur={2}
        shadowOpacity={0.25}
        shadowOffsetY={1}
      />
      <Text
        // UNTRUSTED user text — Konva paints it on the canvas; never innerHTML (T-03-01).
        text={text}
        width={width}
        height={HEIGHT}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="600"
        fontSize={FONT_SIZE}
        fill={colors.ink}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
}

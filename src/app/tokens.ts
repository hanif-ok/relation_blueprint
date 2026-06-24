// Shared design tokens — the SINGLE source of truth for the palette and scale.
//
// These named constants are imported by the Konva canvas (AvatarMarker, MapView) so the
// hand-drawn marker reads the EXACT same hex values as the CSS custom properties in
// `tokens.css`. Canvas and DOM can never drift because they reference one file. (UI-SPEC A5)
//
// Discipline: amber (#C8742B) is reserved for create-action + marker placement/selection
// only — never for secondary controls (UI-SPEC A8). The Konva selected-ring is the one
// place amber lives on the canvas.

/** UI-SPEC color palette. Hex values mirror the `:root` custom properties in tokens.css. */
export const colors = {
  /** Warm paper — all DOM chrome backgrounds. */
  paper: '#F4F1EA',
  /** Paper-shade — cards, gallery tiles, inset wells, hover fills, initials-fallback fill. */
  paperShade: '#E7E2D6',
  /** Deep slate — the permanently-dark Konva Stage background (content, not chrome). */
  slate: '#1B2230',
  /** The single reserved accent — create action + marker placement/selection ONLY. */
  amber: '#C8742B',
  /** Brick red — the delete-person action + its confirmation only. */
  brick: '#B23A2E',
  /** Primary ink text on paper. */
  ink: '#26211A',
  /** Muted ink text on paper. */
  inkMuted: '#6B6358',
  /** Warm hairline border (never pure grey). */
  hairline: '#D8D2C4',
} as const;

/** 8-point spacing scale (px), matching the tokens.css custom properties. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

/** Corner radii (px). */
export const radius = {
  sm: 6,
  md: 10,
  pill: 999,
} as const;

/**
 * Round photo-avatar marker geometry (UI-SPEC ## Round Photo-Avatar Marker).
 * The marker is drawn in canvas coordinates; R is the avatar radius (diameter = 48px).
 */
export const marker = {
  /** Avatar radius — diameter is R * 2 = 48px at 1.0 zoom. */
  R: 24,
  /** Default ring stroke (paper) keeps the avatar legible on the dark canvas. */
  ringDefaultWidth: 2,
  /** Selected ring stroke (amber) — the one place amber lives on the canvas. */
  ringSelectedWidth: 3,
  /** Pin-stem height below the circle; the tip touches the geographic point. */
  stemHeight: 8,
  /** Pin-stem width. */
  stemWidth: 3,
} as const;

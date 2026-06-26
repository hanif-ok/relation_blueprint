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
  /**
   * Portal-glyph fill ONLY (UI-SPEC, Phase 3) — a calm cool slate-blue reading as
   * "doorway/elsewhere", orthogonal to amber selection. Reserved for portal markers; a selected
   * portal keeps this fill but gains the amber selection outline.
   */
  portal: '#3E6B8C',
} as const;

/**
 * The five zone/shape presets (D-03, UI-SPEC). Keyed by lowercased preset id. Each carries a
 * solid `stroke` hex (full opacity) and a translucent `fill` (20% opacity) of the same hue. The
 * five presets + a fill on/off toggle are the WHOLE shape-styling surface — no color picker /
 * stroke-width / opacity slider. These hexes also seed tokens.css by a later UI plan; keep them
 * named here, never inline.
 */
export const zonePresets = {
  /** Generic rooms / unlabeled areas (the default). */
  stone: { stroke: '#8A8170', fill: 'rgba(138,129,112,0.20)' },
  /** Outdoor / green areas. */
  sage: { stroke: '#6E8E6A', fill: 'rgba(110,142,106,0.20)' },
  /** Warm / living spaces. */
  clay: { stroke: '#A8745A', fill: 'rgba(168,116,90,0.20)' },
  /** Cool / utility spaces. */
  dusk: { stroke: '#6E7A9E', fill: 'rgba(110,122,158,0.20)' },
  /** Restricted / special zones. */
  plum: { stroke: '#8A6E8E', fill: 'rgba(138,110,142,0.20)' },
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

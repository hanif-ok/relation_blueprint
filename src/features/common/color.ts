// Shared color helper — compose an `rgba()` string from a token hex so translucent tints stay tied
// to the single palette in `@/app/tokens` and can never drift to an inline literal (UI-SPEC A5).
// Used by both the graph edge stylesheet and the on-canvas connector layer, which render the same
// relationship data and must share the exact same hairline tint.

import { colors } from '@/app/tokens';

/** Compose an `rgba()` string from a `#rrggbb` token hex at the given alpha (0–1). */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Apply the WCAG sRGB→linear transfer to a single 0–1 channel. */
function toLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG relative luminance of a `#rrggbb` hex in [0, 1] — pure, no I/O. Each channel is normalised
 * to 0–1, passed through the sRGB→linear transfer, then weighted 0.2126·R + 0.7152·G + 0.0722·B.
 * This is the POL-01 (D-04) legibility signal: the higher the fill's luminance, the darker the
 * halo it needs, and vice-versa. Reuses the same `hexToRgba` parse shape.
 */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = toLinear(parseInt(h.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(h.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two luminances: (Lmax + 0.05) / (Lmin + 0.05), always ≥ 1. */
function contrastRatio(l1: number, l2: number): number {
  const lmax = Math.max(l1, l2);
  const lmin = Math.min(l1, l2);
  return (lmax + 0.05) / (lmin + 0.05);
}

/**
 * The luminance-OPPOSITE neutral halo for a fill colour (POL-01, D-04) — pure, no I/O. Returns
 * whichever of the two neutral tokens (`colors.slate` / `colors.paper`) yields the HIGHER WCAG
 * contrast against the fill (tie → `colors.slate`). Using the contrast-ratio variant rather than a
 * 0.5-luminance threshold is strictly safer (research A1): a mid-luminance fill deterministically
 * gets the neutral that reads best, never a same-luminance halo.
 */
export function outlineColorFor(hex: string): string {
  const fill = relativeLuminance(hex);
  const slateContrast = contrastRatio(fill, relativeLuminance(colors.slate));
  const paperContrast = contrastRatio(fill, relativeLuminance(colors.paper));
  return paperContrast > slateContrast ? colors.paper : colors.slate;
}

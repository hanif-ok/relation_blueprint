// Shared color helper — compose an `rgba()` string from a token hex so translucent tints stay tied
// to the single palette in `@/app/tokens` and can never drift to an inline literal (UI-SPEC A5).
// Used by both the graph edge stylesheet and the on-canvas connector layer, which render the same
// relationship data and must share the exact same hairline tint.

/** Compose an `rgba()` string from a `#rrggbb` token hex at the given alpha (0–1). */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

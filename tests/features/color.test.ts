// POL-01 (D-04) — the legibility "brain": relativeLuminance + outlineColorFor.
//
// These pure helpers are the load-bearing legibility mechanism: a curator can pick ANY
// marker-label / connector colour, and outlineColorFor derives the luminance-OPPOSITE neutral
// halo (dark slate behind a light label, light paper behind a dark one) so the label stays
// readable on any map background. The rendered-pixel contrast is manual UAT in Plan 02; here we
// prove the derivation itself in Vitest. relativeLuminance follows the WCAG sRGB→linear formula;
// outlineColorFor uses the strictly-safer WCAG contrast-ratio variant (research A1), picking the
// neutral with the higher (Lmax+0.05)/(Lmin+0.05) contrast against the fill (tie → slate).

import { describe, expect, it } from 'vitest';
import { relativeLuminance, outlineColorFor } from '@/features/common/color';
import { colors } from '@/app/tokens';

describe('POL-01 (D-04) — relativeLuminance (WCAG sRGB→linear)', () => {
  it('is ~1.0 for pure white', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1.0, 3);
  });

  it('is exactly 0 for pure black', () => {
    expect(relativeLuminance('#000000')).toBe(0);
  });

  it('is high (> 0.8) for the paper token and low (< 0.05) for the slate token', () => {
    expect(relativeLuminance(colors.paper)).toBeGreaterThan(0.8);
    expect(relativeLuminance(colors.slate)).toBeLessThan(0.05);
  });

  it('is monotonic — a lighter grey has higher luminance than a darker grey', () => {
    expect(relativeLuminance('#AAAAAA')).toBeGreaterThan(relativeLuminance('#555555'));
  });
});

describe('POL-01 (D-04) — outlineColorFor (luminance-opposite halo)', () => {
  it('returns the dark slate halo for a light fill (white)', () => {
    expect(outlineColorFor('#FFFFFF')).toBe(colors.slate);
  });

  it('returns the light paper halo for a dark fill (black)', () => {
    expect(outlineColorFor('#000000')).toBe(colors.paper);
  });

  it('returns slate for the paper token and paper for the slate token (exact opposites)', () => {
    expect(outlineColorFor(colors.paper)).toBe(colors.slate);
    expect(outlineColorFor(colors.slate)).toBe(colors.paper);
  });

  it('picks the higher-WCAG-contrast neutral for a mid-luminance colour (deterministic)', () => {
    // #7A7A7A sits between the two neutrals; the contrast-ratio variant deterministically
    // returns paper (its contrast against this mid-grey is higher than slate's), never a
    // same-luminance halo.
    expect(outlineColorFor('#7A7A7A')).toBe(colors.paper);
  });

  it('always returns one of the two neutral tokens (never an arbitrary colour)', () => {
    for (const fill of ['#123456', '#ABCDEF', '#C8742B', '#B23A2E', '#3E6B8C']) {
      expect([colors.slate, colors.paper]).toContain(outlineColorFor(fill));
    }
  });
});

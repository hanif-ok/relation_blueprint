// Task 1 (RED→GREEN) — the two genuinely-new geometry pieces of Phase 3 (RESEARCH "No Analog
// Found"): image-space↔stage-space composition (coords.ts, Pattern 7) and viewport culling
// (useViewportCulling.ts, Pattern 5). The composition arithmetic was asserted INLINE in
// 03-01's migration/anchor tests; this centralizes it into coords.ts and pins:
//   (1) identity transform is the identity function (no marker moves on upgrade),
//   (2) stageToImage ∘ imageToStage round-trips (drag-end converts back to image space),
//   (3) intersects culls a far box and keeps a near one,
//   (4) a marker at image-space (10,10) lands DIFFERENTLY under a scaled+rotated transform
//       than under identity (the anchoring property),
//   (5) a corrupt scale:0 transform does not divide-by-zero (threat T-03-08).

import { describe, expect, it } from 'vitest';
import type { BackgroundTransform } from '@/domain/types';
import { imageToStage, stageToImage } from '@/features/person-map/coords';
import { getVisibleRect, intersects } from '@/features/person-map/editor/useViewportCulling';

const identity: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const moved: BackgroundTransform = { offsetX: 100, offsetY: 50, scale: 2, rotation: Math.PI / 4 };

describe('coords — image-space ↔ stage-space composition (Pattern 7)', () => {
  it('imageToStage / stageToImage are the identity function at the identity transform', () => {
    const p = { x: 123, y: 456 };
    expect(imageToStage(p, identity)).toEqual(p);
    expect(stageToImage(p, identity)).toEqual(p);
  });

  it('stageToImage ∘ imageToStage round-trips a point under a non-identity transform', () => {
    const p = { x: 37, y: -12 };
    const stage = imageToStage(p, moved);
    const back = stageToImage(stage, moved);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('anchoring: an image-space point lands at a DIFFERENT stage point under transform vs identity', () => {
    const p = { x: 10, y: 10 };
    const underIdentity = imageToStage(p, identity);
    const underMoved = imageToStage(p, moved);
    expect(underIdentity).toEqual({ x: 10, y: 10 });
    expect(underMoved).not.toEqual(underIdentity);
  });

  it('guards a corrupt scale:0 transform so stageToImage never divides by zero (T-03-08)', () => {
    const corrupt: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 0, rotation: 0 };
    const out = stageToImage({ x: 5, y: 9 }, corrupt);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
  });
});

describe('useViewportCulling geometry — getVisibleRect + intersects (Pattern 5)', () => {
  it('getVisibleRect maps stage pan/scale to a world-space visible rect', () => {
    // A stage panned to (-200,-100) at scale 2, sized 800x600, sees world rect
    // x=100, y=50, w=400, h=300 (RESEARCH visibleStageRect: -x/scale, -y/scale, w/scale, h/scale).
    const rect = getVisibleRect({ x: -200, y: -100, scaleX: 2, width: 800, height: 600 });
    expect(rect).toEqual({ x: 100, y: 50, width: 400, height: 300 });
  });

  it('intersects keeps a box inside the view and culls one well outside (with default margin)', () => {
    const view = { x: 0, y: 0, width: 1000, height: 1000 };
    const inside = { x: 500, y: 500, width: 48, height: 48 };
    const farOutside = { x: 5000, y: 5000, width: 48, height: 48 };
    expect(intersects(inside, view)).toBe(true);
    expect(intersects(farOutside, view)).toBe(false);
  });

  it('intersects keeps a box just outside the view but within the 200px margin', () => {
    const view = { x: 0, y: 0, width: 1000, height: 1000 };
    // 100px past the right edge — outside the view proper, inside the default 200px margin.
    const justOutside = { x: 1100, y: 500, width: 10, height: 10 };
    expect(intersects(justOutside, view)).toBe(true);
  });
});

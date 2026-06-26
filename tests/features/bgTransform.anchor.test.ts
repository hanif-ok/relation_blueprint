// Criterion 7 — the MapDoc.backgroundTransform survives an export -> clear -> import round-trip,
// and a marker's image-space (x,y) composes to a DIFFERENT stage point under a non-identity
// transform than under identity. This proves the anchoring model is transform-driven (the marker
// coordinate is stored once in image-space; where it lands on the Stage is a function of the
// background transform, RESEARCH Pattern 7). coords.ts ships in a later plan, so the composition
// math is asserted inline here.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, updateMap } from '@/db/repository';
import { exportDb } from '@/features/backup/exportDb';
import { importDb } from '@/features/backup/importDb';
import type { BackgroundTransform } from '@/domain/types';

const bg = { hash: 'bg', mime: 'image/png' };

/** Compose an image-space point onto a background transform (offset + rotate + uniform scale). */
function compose(t: BackgroundTransform, x: number, y: number) {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    x: t.offsetX + (x * cos - y * sin) * t.scale,
    y: t.offsetY + (x * sin + y * cos) * t.scale,
  };
}

beforeEach(async () => {
  await Promise.all([db.maps.clear(), db.markers.clear(), db.media.clear(), db.meta.clear()]);
});

describe('background transform anchoring (criterion 7)', () => {
  it('round-trips MapDoc.backgroundTransform through export -> clear -> import', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 100, height: 100 });
    const transform: BackgroundTransform = { offsetX: 50, offsetY: 30, scale: 2, rotation: 0.2 };
    await updateMap(map.id, { backgroundTransform: transform });

    const backup = await exportDb();
    await db.maps.clear();
    expect(await db.maps.count()).toBe(0);

    await importDb(backup);

    const restored = await db.maps.get(map.id);
    expect(restored?.backgroundTransform).toEqual(transform);
  });

  it('composes an image-space point differently under non-identity vs identity transform', async () => {
    const identity: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
    const moved: BackgroundTransform = { offsetX: 50, offsetY: 30, scale: 2, rotation: 0.2 };

    const underIdentity = compose(identity, 10, 10);
    const underMoved = compose(moved, 10, 10);

    // Under identity, image-space === stage-space.
    expect(underIdentity).toEqual({ x: 10, y: 10 });
    // Under a non-identity transform, the SAME stored coordinate lands elsewhere — anchoring is
    // a function of the transform, not baked into the marker.
    expect(underMoved).not.toEqual(underIdentity);
  });
});

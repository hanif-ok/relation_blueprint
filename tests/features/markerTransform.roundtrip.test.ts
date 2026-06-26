// Criterion 6 — Marker transform fields survive an export -> clear -> import round-trip. The
// cloud/backup is the only durable copy, so a restore that silently dropped width/height/rotation
// would lose user resize/rotate work. This extends the EXPT-02 round-trip harness (roundtrip.test.ts)
// to the new Phase-3 transform fields.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, upsertMarker } from '@/db/repository';
import { exportDb } from '@/features/backup/exportDb';
import { importDb } from '@/features/backup/importDb';

const bg = { hash: 'bg', mime: 'image/png' };

beforeEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.maps.clear(),
    db.markers.clear(),
    db.media.clear(),
    db.meta.clear(),
  ]);
});

describe('marker transform round-trip (criterion 6)', () => {
  it('persists width/height/rotation on upsertMarker and read-back', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 100, height: 100 });
    const marker = await upsertMarker({
      mapId: map.id,
      personId: 'p1',
      x: 10,
      y: 20,
      width: 64,
      height: 48,
      rotation: 0.75,
    });

    const readBack = await db.markers.get(marker.id);
    expect(readBack?.width).toBe(64);
    expect(readBack?.height).toBe(48);
    expect(readBack?.rotation).toBe(0.75);
  });

  it('survives export -> clear -> import byte-faithful on the transform fields', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 100, height: 100 });
    const marker = await upsertMarker({
      mapId: map.id,
      personId: 'p1',
      x: 10,
      y: 20,
      width: 64,
      height: 48,
      rotation: 0.75,
    });

    const backup = await exportDb();
    await Promise.all([db.maps.clear(), db.markers.clear()]);
    expect(await db.markers.count()).toBe(0);

    await importDb(backup);

    const restored = await db.markers.get(marker.id);
    expect(restored).toBeDefined();
    expect(restored?.width).toBe(64);
    expect(restored?.height).toBe(48);
    expect(restored?.rotation).toBe(0.75);
    expect(restored?.x).toBe(10);
    expect(restored?.y).toBe(20);
    expect(restored?.kind).toBe('person');
  });
});

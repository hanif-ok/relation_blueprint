// MAP-02 — drawn shapes persist on MapDoc.shapes through the SAME `updateMap` path the editor UI
// uses (ShapeNode/MapView write the whole shapes array; never straight to Dexie). This pins the
// persistence contract the draw wiring depends on:
//   (1) a committed rect shape persists on MapDoc.shapes and survives a re-read (reload-equivalent),
//   (2) a shape carrying a non-empty `label` IS a zone (D-02) — there is no separate zones array,
//   (3) shape geometry is stored in IMAGE space and composes through `imageToStage` exactly like a
//       marker (so a re-fit of the background keeps the room where it was drawn),
//   (4) restyling a shape's preset/fill via `updateMap` round-trips.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, updateMap } from '@/db/repository';
import { imageToStage } from '@/features/person-map/coords';
import type { BackgroundTransform, Shape } from '@/domain/types';

const bg = { hash: 'bg', mime: 'image/png' };

/** A default editor layer, mirroring what MapView.ensureDefaultLayer creates for a new map. */
const LAYER = { id: 'layer-0', name: 'Markers', visible: true, locked: false, order: 0 };

/** Build a rect shape descriptor in image space (the shape the rect tool commits). */
function rectShape(over: Partial<Shape> = {}): Shape {
  return {
    id: 'shape-1',
    layerId: LAYER.id,
    kind: 'rect',
    x: 40,
    y: 60,
    width: 120,
    height: 80,
    rotation: 0,
    preset: 'stone',
    fill: true,
    ...over,
  };
}

beforeEach(async () => {
  await Promise.all([db.maps.clear(), db.markers.clear()]);
});

describe('MAP-02 — shapes persist on MapDoc.shapes via updateMap', () => {
  it('commits a rect shape that persists and survives a re-read', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });
    const shape = rectShape();

    // The SAME write path the editor uses: rewrite the whole shapes array (+ ensure a layer).
    await updateMap(map.id, { shapes: [shape], layers: [LAYER] });

    const reread = await db.maps.get(map.id);
    expect(reread?.shapes).toHaveLength(1);
    expect(reread?.shapes[0]).toMatchObject({
      kind: 'rect',
      x: 40,
      y: 60,
      width: 120,
      height: 80,
      preset: 'stone',
      fill: true,
    });
    // The shape references a real layer (D-04) — never a dangling layerId.
    expect(reread?.layers.some((l) => l.id === reread.shapes[0].layerId)).toBe(true);
  });

  it('a shape with a non-empty label is a zone (D-02) — no separate zones array', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });
    await updateMap(map.id, { shapes: [rectShape({ label: 'Lobby' })], layers: [LAYER] });

    const reread = await db.maps.get(map.id);
    const zones = (reread?.shapes ?? []).filter((s) => (s.label ?? '').trim().length > 0);
    expect(zones).toHaveLength(1);
    expect(zones[0].label).toBe('Lobby');
    // The MapDoc has no separate `zones` field — a labeled shape is the whole zone model.
    expect('zones' in (reread ?? {})).toBe(false);
  });

  it('stores geometry in IMAGE space and composes through imageToStage (anchoring)', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });
    await updateMap(map.id, { shapes: [rectShape()], layers: [LAYER] });

    const reread = await db.maps.get(map.id);
    const s = reread!.shapes[0];

    // Under a moved/scaled/rotated transform the stored image-space origin lands at a DIFFERENT
    // stage point than at identity — proving the coordinate is image-space, not stage-space.
    const identity: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
    const moved: BackgroundTransform = { offsetX: 100, offsetY: 50, scale: 2, rotation: Math.PI / 6 };
    const atIdentity = imageToStage({ x: s.x!, y: s.y! }, identity);
    const atMoved = imageToStage({ x: s.x!, y: s.y! }, moved);
    expect(atIdentity).toEqual({ x: 40, y: 60 });
    expect(atMoved).not.toEqual(atIdentity);
  });

  it('restyling a shape preset + fill via updateMap round-trips', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });
    await updateMap(map.id, { shapes: [rectShape()], layers: [LAYER] });

    // Restyle: change the preset to sage and turn the fill off (the StylePopover write path).
    const current = await db.maps.get(map.id);
    const restyled = current!.shapes.map((s) => ({ ...s, preset: 'sage', fill: false }));
    await updateMap(map.id, { shapes: restyled });

    const reread = await db.maps.get(map.id);
    expect(reread?.shapes[0].preset).toBe('sage');
    expect(reread?.shapes[0].fill).toBe(false);
  });
});

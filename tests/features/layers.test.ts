// MAP-03 — the logical-layer model (D-04). Layers are a LOGICAL organization stored on
// `MapDoc.layers`; objects (shapes + markers) reference one by `layerId` and the editor renders
// every object into ONE physical Konva content layer in logical order (RESEARCH Pattern 3 —
// never one Konva Layer per user layer). This pins the pure model + its repository round-trip:
//   (1) objects render sorted by their layer's `order` (bottom→top), then array order within a layer
//   (2) a hidden layer's objects are EXCLUDED from the render set
//   (3) a locked layer's objects are marked non-interactive (locked=true, opacity 0.6)
//   (4) an object with no `layerId` (or a dangling one — T-03-14) resolves to the default layer
//   (5) layer create/rename/reorder/show/hide/lock all round-trip through updateMap(mapId,{layers})
//   (6) the last remaining layer cannot be deleted (deleteLayer returns the layers unchanged)
//   (7) markers carry a layerId through upsertMarker (markers live on layers like shapes)

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, updateMap, upsertMarker } from '@/db/repository';
import {
  LOCKED_LAYER_OPACITY,
  createLayer,
  deleteLayer,
  moveLayer,
  orderObjectsForRender,
  renameLayer,
  reorderLayers,
  resolveLayer,
  setLayerLocked,
  setLayerVisible,
} from '@/features/person-map/editor/layers';
import type { Layer } from '@/domain/types';

const bg = { hash: 'bg', mime: 'image/png' };

/** Two layers: "Base" (order 0, bottom) and "Top" (order 1, top). */
function twoLayers(): Layer[] {
  return [
    { id: 'base', name: 'Base', visible: true, locked: false, order: 0 },
    { id: 'top', name: 'Top', visible: true, locked: false, order: 1 },
  ];
}

/** A minimal layered object (a shape or marker stand-in). */
function obj(id: string, layerId?: string) {
  return { id, layerId };
}

beforeEach(async () => {
  await Promise.all([db.maps.clear(), db.markers.clear()]);
});

describe('MAP-03 — logical-layer render ordering', () => {
  it('renders objects sorted by their layer order (bottom→top)', () => {
    const layers = twoLayers();
    // An object on the TOP layer is declared FIRST in the array; it must still render LAST (on top).
    const objects = [obj('a', 'top'), obj('b', 'base')];
    const rendered = orderObjectsForRender(objects, layers).map((r) => r.object.id);
    expect(rendered).toEqual(['b', 'a']);
  });

  it('preserves array order WITHIN a layer', () => {
    const layers = twoLayers();
    const objects = [obj('a', 'base'), obj('b', 'base'), obj('c', 'base')];
    const rendered = orderObjectsForRender(objects, layers).map((r) => r.object.id);
    expect(rendered).toEqual(['a', 'b', 'c']);
  });

  it('excludes objects on a hidden layer from the render set', () => {
    const layers = setLayerVisible(twoLayers(), 'top', false);
    const objects = [obj('a', 'top'), obj('b', 'base')];
    const rendered = orderObjectsForRender(objects, layers).map((r) => r.object.id);
    expect(rendered).toEqual(['b']);
  });

  it('marks a locked layer non-interactive (locked=true, opacity 0.6)', () => {
    const layers = setLayerLocked(twoLayers(), 'base', true);
    const objects = [obj('a', 'base'), obj('b', 'top')];
    const rendered = orderObjectsForRender(objects, layers);
    const a = rendered.find((r) => r.object.id === 'a')!;
    const b = rendered.find((r) => r.object.id === 'b')!;
    expect(a.locked).toBe(true);
    expect(a.opacity).toBe(LOCKED_LAYER_OPACITY);
    expect(b.locked).toBe(false);
    expect(b.opacity).toBe(1);
  });

  it('resolves an object with no layerId to the default (lowest-order) layer', () => {
    const layers = twoLayers();
    const layer = resolveLayer(obj('x'), layers);
    expect(layer?.id).toBe('base');
    // It is still rendered (on the default layer), not dropped.
    const rendered = orderObjectsForRender([obj('x')], layers).map((r) => r.object.id);
    expect(rendered).toEqual(['x']);
  });

  it('resolves a DANGLING layerId (points at a deleted layer) to the default layer (T-03-14)', () => {
    const layers = twoLayers();
    const layer = resolveLayer(obj('x', 'deleted-layer-id'), layers);
    expect(layer?.id).toBe('base');
    const rendered = orderObjectsForRender([obj('x', 'deleted-layer-id')], layers).map(
      (r) => r.object.id,
    );
    expect(rendered).toEqual(['x']);
  });
});

describe('MAP-03 — pure layer CRUD transforms', () => {
  it('createLayer appends a new layer on top (highest order)', () => {
    const { layers, layerId } = createLayer(twoLayers());
    expect(layers).toHaveLength(3);
    const created = layers.find((l) => l.id === layerId)!;
    expect(created.order).toBe(2); // above the two seeded layers
    expect(created.visible).toBe(true);
    expect(created.locked).toBe(false);
  });

  it('renameLayer renames one layer and rejects an empty name', () => {
    const renamed = renameLayer(twoLayers(), 'base', 'Rooms');
    expect(renamed.find((l) => l.id === 'base')!.name).toBe('Rooms');
    // Empty/whitespace name is rejected — the layers are returned unchanged.
    const unchanged = renameLayer(twoLayers(), 'base', '   ');
    expect(unchanged.find((l) => l.id === 'base')!.name).toBe('Base');
  });

  it('reorderLayers recomputes order from a top→bottom id list', () => {
    // Put "base" on top, "top" on bottom.
    const reordered = reorderLayers(twoLayers(), ['base', 'top']);
    expect(reordered.find((l) => l.id === 'base')!.order).toBe(1); // now top
    expect(reordered.find((l) => l.id === 'top')!.order).toBe(0); // now bottom
  });

  it('moveLayer swaps a layer up/down by one step', () => {
    const moved = moveLayer(twoLayers(), 'base', 'up'); // base was bottom → now top
    expect(moved.find((l) => l.id === 'base')!.order).toBe(1);
    // No-op at the edge.
    const edge = moveLayer(twoLayers(), 'top', 'up'); // already top
    expect(edge.find((l) => l.id === 'top')!.order).toBe(1);
  });

  it('deleteLayer removes a layer but REFUSES the last remaining one (always ≥1)', () => {
    const afterDelete = deleteLayer(twoLayers(), 'top');
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe('base');
    expect(afterDelete[0].order).toBe(0); // orders recompacted

    // The last layer is undeletable — returned unchanged.
    const refused = deleteLayer(afterDelete, 'base');
    expect(refused).toHaveLength(1);
    expect(refused).toEqual(afterDelete);
  });
});

describe('MAP-03 — layer CRUD round-trips through updateMap', () => {
  it('persists create/rename/reorder/show-hide/lock via updateMap(mapId, { layers })', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });

    // Start with the default single layer, then create a second.
    const { layers: created, layerId } = createLayer([
      { id: 'base', name: 'Markers', visible: true, locked: false, order: 0 },
    ]);
    await updateMap(map.id, { layers: created });
    let reread = await db.maps.get(map.id);
    expect(reread?.layers).toHaveLength(2);

    // Rename, hide, lock the created layer; reorder it below "base".
    let next = renameLayer(reread!.layers, layerId, 'Rooms');
    next = setLayerVisible(next, layerId, false);
    next = setLayerLocked(next, layerId, true);
    next = reorderLayers(next, [layerId, 'base']); // created on top, base bottom
    await updateMap(map.id, { layers: next });

    reread = await db.maps.get(map.id);
    const rooms = reread!.layers.find((l) => l.id === layerId)!;
    expect(rooms.name).toBe('Rooms');
    expect(rooms.visible).toBe(false);
    expect(rooms.locked).toBe(true);
    expect(rooms.order).toBe(1); // on top
    expect(reread!.layers.find((l) => l.id === 'base')!.order).toBe(0);
  });
});

describe('MAP-03 — markers carry a layerId', () => {
  it('upsertMarker persists a layerId on the marker (markers live on layers like shapes)', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });
    const marker = await upsertMarker({
      mapId: map.id,
      personId: 'p1',
      x: 10,
      y: 20,
      layerId: 'base',
    });
    expect(marker.layerId).toBe('base');
    const reread = await db.markers.get(marker.id);
    expect(reread?.layerId).toBe('base');
  });

  it('a marker with no layerId resolves to the default layer at render time', async () => {
    const map = await createMap({ name: 'M', background: bg, width: 800, height: 600 });
    const marker = await upsertMarker({ mapId: map.id, personId: 'p1', x: 0, y: 0 });
    expect(marker.layerId).toBeUndefined();
    const layer = resolveLayer({ id: marker.id, layerId: marker.layerId }, twoLayers());
    expect(layer?.id).toBe('base');
  });
});

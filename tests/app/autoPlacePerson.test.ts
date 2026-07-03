// D-05 auto-place (App.handleSaved). A Person created while a map is active is auto-placed as a
// marker at map center. This pins the LATENT bug fixed in `autoPlaceNewPerson`: a fresh map starts
// with an EMPTY `layers` array, and MapView renders person markers via
// `orderObjectsForRender(persons, map.layers)` — which CULLS any marker whose layer can't resolve
// (resolveLayer → undefined when there are no layers). So an auto-placed marker with no layerId on a
// layer-less map was placed in the DB but never rendered. The fix mirrors
// MapView.placePerson/placePortal: materialize a default layer on the map + stamp the marker layerId
// so the marker always survives the render set.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, createPerson, updateMap, upsertMarker } from '@/db/repository';
import { autoPlaceNewPerson } from '@/app/autoPlacePerson';
import { createLayer, orderObjectsForRender } from '@/features/person-map/editor/layers';

const bg = { hash: 'bg', mime: 'image/png' };

beforeEach(async () => {
  await Promise.all([db.people.clear(), db.maps.clear(), db.markers.clear()]);
});

describe('autoPlaceNewPerson (D-05) — layer materialization on a fresh map', () => {
  it('documents the pre-fix bug: a layer-less marker on a layer-less map is dropped by the renderer', () => {
    // A fresh map has layers: []; the old auto-place stored a marker with NO layerId. Rendering that
    // marker against the empty layer set yields NOTHING — the marker is invisible. This is the exact
    // mechanism autoPlaceNewPerson now avoids.
    const layerlessMarker = { id: 'm1', layerId: undefined };
    const rendered = orderObjectsForRender([layerlessMarker], []);
    expect(rendered).toHaveLength(0);
  });

  it('materializes a default layer on a fresh (layer-less) map and stamps the marker layerId', async () => {
    const person = await createPerson({ name: 'Ada' });
    const map = await createMap({ name: 'Fresh', background: bg, width: 200, height: 100 });
    expect(map.layers).toEqual([]); // precondition: fresh map has no layers

    const marker = await autoPlaceNewPerson(map, person.id);

    expect(marker).not.toBeNull();
    expect(marker?.layerId).toBeTruthy();

    // The map now carries a real layer, and the marker references it.
    const reloaded = await db.maps.get(map.id);
    expect(reloaded?.layers.length).toBeGreaterThanOrEqual(1);
    expect(reloaded?.layers.some((l) => l.id === marker?.layerId)).toBe(true);
  });

  it('the auto-placed marker SURVIVES orderObjectsForRender on the fresh map (the fix)', async () => {
    const person = await createPerson({ name: 'Ada' });
    const map = await createMap({ name: 'Fresh', background: bg, width: 200, height: 100 });

    await autoPlaceNewPerson(map, person.id);

    // Render exactly as MapView does: the persisted markers against the persisted map.layers.
    const reloaded = await db.maps.get(map.id);
    const markers = await db.markers.where('personId').equals(person.id).toArray();
    const rendered = orderObjectsForRender(markers, reloaded?.layers ?? []);

    expect(rendered).toHaveLength(1);
    expect(rendered[0].object.id).toBe(markers[0].id);
  });

  it('places the marker at map center', async () => {
    const person = await createPerson({ name: 'Ada' });
    const map = await createMap({ name: 'Fresh', background: bg, width: 200, height: 100 });

    const marker = await autoPlaceNewPerson(map, person.id);

    expect(marker?.x).toBe(100); // width / 2
    expect(marker?.y).toBe(50); // height / 2
  });

  it('is a no-op when the person is already placed (returns null, no second marker)', async () => {
    const person = await createPerson({ name: 'Ada' });
    const map = await createMap({ name: 'Fresh', background: bg, width: 200, height: 100 });
    await upsertMarker({ mapId: map.id, personId: person.id, x: 10, y: 10 });

    const second = await autoPlaceNewPerson(map, person.id);

    expect(second).toBeNull();
    expect(await db.markers.where('personId').equals(person.id).count()).toBe(1);
  });

  it('lands on an EXISTING layer without materializing a new one when the map already has layers', async () => {
    const person = await createPerson({ name: 'Ada' });
    const base = await createMap({ name: 'HasLayer', background: bg, width: 200, height: 100 });
    // Give the map a single explicit layer, mirroring a map that already went through the editor.
    const withLayer = await updateMap(base.id, { layers: createLayer([], 'Base').layers });
    const layerId = withLayer.layers[0].id;

    const marker = await autoPlaceNewPerson(withLayer, person.id);

    expect(marker?.layerId).toBe(layerId);
    // No redundant layer was appended.
    const reloaded = await db.maps.get(base.id);
    expect(reloaded?.layers).toHaveLength(1);
    // And it still renders.
    const markers = await db.markers.where('personId').equals(person.id).toArray();
    expect(orderObjectsForRender(markers, reloaded?.layers ?? [])).toHaveLength(1);
  });
});

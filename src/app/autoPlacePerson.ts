// D-05 auto-place: a Person created while a map is active is dropped as a marker at that map's
// center so the create→place→profile thread is unbroken. This is the App-level (create-from-form)
// counterpart of the in-canvas MapView.placePerson/placePortal tools — and it MUST mirror their
// active-layer materialization, or the marker is placed but never rendered.
//
// Why the materialization matters (the bug this module fixes): a fresh map starts with an EMPTY
// `layers` array (MapDocSchema defaults `layers` to []). MapView renders person markers via
// `orderObjectsForRender(persons, map.layers)`, and `resolveLayer` returns `undefined` when the map
// has NO layers — so `orderObjectsForRender` silently CULLS any marker on a layer-less map. Placing
// a marker with no `layerId` on such a map therefore makes it invisible. Materializing a default
// layer on the map first (and stamping its id on the marker) guarantees the marker always resolves
// to a real layer and renders. Mirrors MapView.placePerson/placePortal exactly.

import { db } from '@/db/schema';
import { updateMap, upsertMarker } from '@/db/repository';
import { ensureLayers } from '@/features/person-map/editor/layers';
import type { MapDoc, Marker } from '@/domain/types';

/**
 * Auto-place a newly-created Person on `map` at its center (D-05). No-op (returns `null`) when the
 * person already has a marker anywhere — a create-only convenience, never a re-placement.
 *
 * Mirrors MapView.placePerson/placePortal: when `map` has no layers yet, materialize the default
 * "Markers" layer on the map (persist via `updateMap`) BEFORE placing, and stamp the marker with a
 * valid `layerId`. This keeps the auto-placed marker inside the logical-layer model so
 * `orderObjectsForRender` never drops it (the layer-less-map cull that made fresh-map placements
 * invisible).
 *
 * Returns the created marker, or `null` when the person was already placed.
 */
export async function autoPlaceNewPerson(map: MapDoc, personId: string): Promise<Marker | null> {
  const existing = await db.markers.where('personId').equals(personId).count();
  if (existing > 0) return null;

  // Materialize a default layer on the map when it has none, so the marker's layerId references a
  // real layer (mirrors MapView.placePerson/placePortal). When the map already has layers, this is
  // the existing set and no write occurs.
  const layers = ensureLayers(map.layers);
  if (map.layers.length === 0) {
    await updateMap(map.id, { layers });
  }
  // Land on the default layer — the lowest-`order` layer, which is exactly the one an absent
  // `layerId` resolves to (resolveLayer's fallback). Stamping it explicitly keeps the marker valid
  // even on a layer-less map that just got its first layer materialized above.
  const layerId = layers.slice().sort((a, b) => a.order - b.order)[0].id;

  return upsertMarker({
    mapId: map.id,
    personId,
    x: map.width / 2,
    y: map.height / 2,
    layerId,
  });
}

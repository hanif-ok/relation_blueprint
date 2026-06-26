// Synthetic marker generator for the Phase-3 perf spike (consumed by a later plan). Produces
// `count` VALID Marker rows spread across an image-space grid for one map, each validated
// through `MarkerSchema.parse` so the fixture stays in lockstep with the schema (a schema
// change that the fixture violates fails here, not deep in the spike).

import { MarkerSchema } from '@/domain/schemas';
import type { Marker } from '@/domain/types';

/**
 * Build `count` valid person markers for `mapId`, laid out on a square-ish image-space grid
 * (~32px spacing). Each is parsed through `MarkerSchema` so the returned rows are guaranteed
 * schema-valid (kind defaulted to 'person', image-space x/y).
 */
export function makeSyntheticMarkers(mapId: string, count = 1000): Marker[] {
  const cols = Math.ceil(Math.sqrt(count));
  const markers: Marker[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    markers.push(
      MarkerSchema.parse({
        id: `synthetic-${i}`,
        mapId,
        kind: 'person',
        personId: `person-${i}`,
        x: col * 32,
        y: row * 32,
        updatedAt: 1_700_000_000_000 + i,
        dirty: false,
      }),
    );
  }
  return markers;
}

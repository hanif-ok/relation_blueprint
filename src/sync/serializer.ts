// Sharded serializer — turns the entity tables into immutable per-type shard files and
// back. In Phase 1 there is exactly ONE shard per type (`people-000.json`, `maps-000.json`,
// `markers-000.json`); the `-000` suffix and the bucketing shape are reserved so later
// phases can split a type into 200–500-record buckets without changing the manifest layout
// (RESEARCH ## Pattern 3). Each shard is a plain JSON array of its entity type.
//
// Shards are written as NEW immutable provider files by the sync engine — they are never
// overwritten in place. The serializer only concerns itself with the bytes <-> entities
// mapping; the atomic commit lives in syncEngine.ts.

import type { MapDoc, Marker, Person } from '@/domain/types';

/** The in-memory entity set the serializer reads from / reconstructs. */
export interface EntitySet {
  people: Person[];
  maps: MapDoc[];
  markers: Marker[];
}

/** Canonical shard file names — one bucket (000) per type for the skeleton. */
export const SHARD_NAMES = {
  people: 'people-000.json',
  maps: 'maps-000.json',
  markers: 'markers-000.json',
} as const;

const JSON_TYPE = 'application/json';

/**
 * Serialize an entity set into one JSON shard Blob per type, keyed by shard file name.
 * The body of each shard is a JSON array of the entities of that type, in input order.
 */
export function serializeShards(entities: EntitySet): Record<string, Blob> {
  return {
    [SHARD_NAMES.people]: toBlob(entities.people),
    [SHARD_NAMES.maps]: toBlob(entities.maps),
    [SHARD_NAMES.markers]: toBlob(entities.markers),
  };
}

/**
 * Inverse of {@link serializeShards}: parse the shard Blobs back into entity arrays. A
 * missing shard name yields an empty array (a brand-new database before its first push of
 * that type). Reads each Blob's text, so it is async and works for both in-process Blobs
 * and raw provider Blobs.
 */
export async function deserializeShards(shards: Record<string, Blob>): Promise<EntitySet> {
  return {
    people: await parseShard<Person>(shards[SHARD_NAMES.people]),
    maps: await parseShard<MapDoc>(shards[SHARD_NAMES.maps]),
    markers: await parseShard<Marker>(shards[SHARD_NAMES.markers]),
  };
}

function toBlob(entities: unknown[]): Blob {
  return new Blob([JSON.stringify(entities)], { type: JSON_TYPE });
}

async function parseShard<T>(blob: Blob | undefined): Promise<T[]> {
  if (!blob) return [];
  return JSON.parse(await blob.text()) as T[];
}

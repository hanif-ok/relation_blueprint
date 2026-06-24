// The offline-first repository: typed CRUD over the Dexie tables. This is the ONLY way
// the app mutates data, and it does so with three invariants on every write:
//   1. validate against the zod schema before persisting (threat T-02-01)
//   2. stamp `updatedAt = Date.now()` and `dirty = true` (so Plan 05 sync finds changes)
//   3. emit a change event (the sync engine subscribes to flush dirty records)
//
// It NEVER touches the network — IndexedDB is the source of truth and works fully offline.

import { nanoid } from 'nanoid';
import { db } from './schema';
import { MapDocSchema, MarkerSchema, PersonSchema } from '@/domain/schemas';
import type { MapDoc, Marker, MediaRef, Person } from '@/domain/types';

/** What changed, for sync-engine subscribers. */
export interface ChangeEvent {
  entityType: 'people' | 'maps' | 'markers' | 'media';
  entityId: string;
  op: 'create' | 'update' | 'delete';
}

type ChangeListener = (event: ChangeEvent) => void;

const listeners = new Set<ChangeListener>();

/** Subscribe to repository writes; returns an unsubscribe function. */
export function onChange(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: ChangeEvent): void {
  for (const listener of listeners) listener(event);
}

// ---- People -------------------------------------------------------------------------

/** Fields a caller supplies when creating a Person; identity + sync metadata are stamped here. */
export type CreatePersonInput = {
  name: string;
  photo?: MediaRef;
  phone?: string;
  description?: string;
  tags?: string[];
  notes?: string;
  gallery?: MediaRef[];
};

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const person: Person = PersonSchema.parse({
    id: nanoid(),
    name: input.name,
    photo: input.photo,
    phone: input.phone,
    description: input.description,
    tags: input.tags ?? [],
    notes: input.notes,
    gallery: input.gallery ?? [],
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.people.put(person);
  emit({ entityType: 'people', entityId: person.id, op: 'create' });
  return person;
}

/** Patchable Person fields (id/updatedAt/dirty are managed by the repository). */
export type UpdatePersonPatch = Partial<Omit<Person, 'id' | 'updatedAt' | 'dirty'>>;

export async function updatePerson(id: string, patch: UpdatePersonPatch): Promise<Person> {
  const existing = await db.people.get(id);
  if (!existing) throw new Error(`updatePerson: no person with id ${id}`);
  const updated: Person = PersonSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.people.put(updated);
  emit({ entityType: 'people', entityId: id, op: 'update' });
  return updated;
}

export async function deletePerson(id: string): Promise<void> {
  // Cascade: removing a person removes every marker that placed them on a map.
  await db.transaction('rw', db.people, db.markers, async () => {
    await db.people.delete(id);
    await db.markers.where('personId').equals(id).delete();
  });
  emit({ entityType: 'people', entityId: id, op: 'delete' });
}

export async function getPerson(id: string): Promise<Person | undefined> {
  return db.people.get(id);
}

export async function listPeople(): Promise<Person[]> {
  return db.people.toArray();
}

// ---- Maps & markers -----------------------------------------------------------------

export type CreateMapInput = {
  name: string;
  background: MediaRef;
  width: number;
  height: number;
};

export async function createMap(input: CreateMapInput): Promise<MapDoc> {
  const map: MapDoc = MapDocSchema.parse({
    id: nanoid(),
    name: input.name,
    background: input.background,
    width: input.width,
    height: input.height,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.maps.put(map);
  emit({ entityType: 'maps', entityId: map.id, op: 'create' });
  return map;
}

/** Fields a caller supplies for a marker; `id` is generated when absent. */
export type UpsertMarkerInput = {
  id?: string;
  mapId: string;
  personId: string;
  x: number;
  y: number;
};

export async function upsertMarker(input: UpsertMarkerInput): Promise<Marker> {
  const id = input.id ?? nanoid();
  const existed = input.id ? (await db.markers.get(input.id)) !== undefined : false;
  const marker: Marker = MarkerSchema.parse({
    id,
    mapId: input.mapId,
    personId: input.personId,
    x: input.x,
    y: input.y,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.markers.put(marker);
  emit({ entityType: 'markers', entityId: id, op: existed ? 'update' : 'create' });
  return marker;
}

// ---- Media --------------------------------------------------------------------------

/**
 * Store a media blob keyed by its content hash (idempotent, content-addressed). The blob
 * is persisted as an ArrayBuffer (see MediaRecord) so it round-trips through structured
 * clone in every environment; `mime` is kept so `getMedia` can rebuild a faithful Blob.
 */
export async function putMedia(mediaRef: MediaRef, blob: Blob): Promise<void> {
  const bytes = await blob.arrayBuffer();
  await db.media.put({ hash: mediaRef.hash, bytes, mime: mediaRef.mime });
  emit({ entityType: 'media', entityId: mediaRef.hash, op: 'create' });
}

export async function getMedia(hash: string): Promise<Blob | undefined> {
  const record = await db.media.get(hash);
  if (!record) return undefined;
  return new Blob([record.bytes], { type: record.mime });
}

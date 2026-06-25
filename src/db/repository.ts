// The offline-first repository: typed CRUD over the Dexie tables. This is the ONLY way
// the app mutates data, and it does so with three invariants on every write:
//   1. validate against the zod schema before persisting (threat T-02-01)
//   2. stamp `updatedAt = Date.now()` and `dirty = true` (so Plan 05 sync finds changes)
//   3. emit a change event (the sync engine subscribes to flush dirty records)
//
// It NEVER touches the network — IndexedDB is the source of truth and works fully offline.

import { nanoid } from 'nanoid';
import { db } from './schema';
import {
  FieldDefSchema,
  GroupSchema,
  MapDocSchema,
  MarkerSchema,
  PersonSchema,
  RelationshipLinkSchema,
} from '@/domain/schemas';
import type {
  CustomValues,
  EntityType,
  FieldDef,
  FieldType,
  Group,
  MapDoc,
  Marker,
  MediaRef,
  Person,
  RelationshipLink,
} from '@/domain/types';

/** What changed, for sync-engine subscribers. */
export interface ChangeEvent {
  entityType: 'people' | 'maps' | 'markers' | 'groups' | 'relationship-links' | 'fieldDefs' | 'media';
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
  custom?: CustomValues;
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
    custom: input.custom ?? {},
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
  // Cascade: removing a person removes every marker that placed them on a map, and
  // refcount-sweeps the media blobs the person referenced so they don't accumulate forever
  // (WR-02). Media is content-addressed and may be SHARED across entities, so a blob is deleted
  // only when NO surviving entity (any person's photo/gallery, any map background) still
  // references its hash. The whole sweep is one rw transaction so a failure rolls back cleanly.
  await db.transaction('rw', db.people, db.markers, db.maps, db.media, async () => {
    const victim = await db.people.get(id);
    await db.people.delete(id);
    await db.markers.where('personId').equals(id).delete();

    if (victim) {
      // Hashes the deleted person referenced — candidates for GC.
      const candidates = new Set<string>();
      if (victim.photo) candidates.add(victim.photo.hash);
      for (const g of victim.gallery) candidates.add(g.hash);

      if (candidates.size > 0) {
        // Build the set of hashes STILL referenced by any surviving entity.
        const stillReferenced = new Set<string>();
        const ref = (r?: MediaRef) => {
          if (r) stillReferenced.add(r.hash);
        };
        for (const p of await db.people.toArray()) {
          ref(p.photo);
          for (const g of p.gallery) ref(g);
        }
        for (const m of await db.maps.toArray()) ref(m.background);

        for (const hash of candidates) {
          if (!stillReferenced.has(hash)) await db.media.delete(hash);
        }
      }
    }
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
  photo?: MediaRef;
  gallery?: MediaRef[];
  notes?: string;
  custom?: CustomValues;
};

export async function createMap(input: CreateMapInput): Promise<MapDoc> {
  const map: MapDoc = MapDocSchema.parse({
    id: nanoid(),
    name: input.name,
    background: input.background,
    width: input.width,
    height: input.height,
    photo: input.photo,
    gallery: input.gallery ?? [],
    notes: input.notes,
    custom: input.custom ?? {},
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.maps.put(map);
  emit({ entityType: 'maps', entityId: map.id, op: 'create' });
  return map;
}

/** Patchable Location (map) fields; identity + sync metadata are managed by the repository. */
export type UpdateMapPatch = Partial<Omit<MapDoc, 'id' | 'updatedAt' | 'dirty'>>;

/** The Location edit path (D-07): enrich an existing map in place (photo/notes/custom/gallery)
 * without losing its background/width/height spine. Mirrors `updatePerson`. */
export async function updateMap(id: string, patch: UpdateMapPatch): Promise<MapDoc> {
  const existing = await db.maps.get(id);
  if (!existing) throw new Error(`updateMap: no map with id ${id}`);
  const updated: MapDoc = MapDocSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.maps.put(updated);
  emit({ entityType: 'maps', entityId: id, op: 'update' });
  return updated;
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

// ---- Groups (D-09) ------------------------------------------------------------------

/** Fields a caller supplies for a Group; identity + sync metadata are stamped here. */
export type CreateGroupInput = {
  name: string;
  photo?: MediaRef;
  gallery?: MediaRef[];
  notes?: string;
  custom?: CustomValues;
};

export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const group: Group = GroupSchema.parse({
    id: nanoid(),
    name: input.name,
    photo: input.photo,
    gallery: input.gallery ?? [],
    notes: input.notes,
    custom: input.custom ?? {},
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.groups.put(group);
  emit({ entityType: 'groups', entityId: group.id, op: 'create' });
  return group;
}

export type UpdateGroupPatch = Partial<Omit<Group, 'id' | 'updatedAt' | 'dirty'>>;

export async function updateGroup(id: string, patch: UpdateGroupPatch): Promise<Group> {
  const existing = await db.groups.get(id);
  if (!existing) throw new Error(`updateGroup: no group with id ${id}`);
  const updated: Group = GroupSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.groups.put(updated);
  emit({ entityType: 'groups', entityId: id, op: 'update' });
  return updated;
}

export async function getGroup(id: string): Promise<Group | undefined> {
  return db.groups.get(id);
}

export async function listGroups(): Promise<Group[]> {
  return db.groups.toArray();
}

// ---- Relationship-links (D-08, data-bearing shell — NO endpoints this phase) ---------

/** Fields a caller supplies for a Relationship-link; identity + sync metadata are stamped here. */
export type CreateRelationshipLinkInput = {
  name: string;
  photo?: MediaRef;
  gallery?: MediaRef[];
  notes?: string;
  label?: string;
  date?: string;
  custom?: CustomValues;
};

export async function createRelationshipLink(
  input: CreateRelationshipLinkInput,
): Promise<RelationshipLink> {
  const link: RelationshipLink = RelationshipLinkSchema.parse({
    id: nanoid(),
    name: input.name,
    photo: input.photo,
    gallery: input.gallery ?? [],
    notes: input.notes,
    label: input.label,
    date: input.date,
    custom: input.custom ?? {},
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.relationshipLinks.put(link);
  emit({ entityType: 'relationship-links', entityId: link.id, op: 'create' });
  return link;
}

export type UpdateRelationshipLinkPatch = Partial<
  Omit<RelationshipLink, 'id' | 'updatedAt' | 'dirty'>
>;

export async function updateRelationshipLink(
  id: string,
  patch: UpdateRelationshipLinkPatch,
): Promise<RelationshipLink> {
  const existing = await db.relationshipLinks.get(id);
  if (!existing) throw new Error(`updateRelationshipLink: no relationship-link with id ${id}`);
  const updated: RelationshipLink = RelationshipLinkSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.relationshipLinks.put(updated);
  emit({ entityType: 'relationship-links', entityId: id, op: 'update' });
  return updated;
}

export async function getRelationshipLink(id: string): Promise<RelationshipLink | undefined> {
  return db.relationshipLinks.get(id);
}

export async function listRelationshipLinks(): Promise<RelationshipLink[]> {
  return db.relationshipLinks.toArray();
}

// ---- Field definitions (the per-type custom-field schema store, D-02/D-05) -----------

/** Fields a caller supplies when defining a custom field; id/order/deleted/sync are stamped here. */
export type CreateFieldDefInput = {
  entityType: EntityType;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  targetType?: EntityType;
};

/** Highest existing `order` among a type's definitions (-1 when none), so a new field appends. */
async function maxFieldOrder(entityType: EntityType): Promise<number> {
  const defs = await db.fieldDefs.where('entityType').equals(entityType).toArray();
  return defs.reduce((max, d) => Math.max(max, d.order), -1);
}

export async function createFieldDef(input: CreateFieldDefInput): Promise<FieldDef> {
  const order = (await maxFieldOrder(input.entityType)) + 1;
  const def: FieldDef = FieldDefSchema.parse({
    id: nanoid(),
    entityType: input.entityType,
    label: input.label,
    type: input.type,
    required: input.required ?? false,
    order,
    options: input.options,
    targetType: input.targetType,
    deleted: false,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.fieldDefs.put(def);
  emit({ entityType: 'fieldDefs', entityId: def.id, op: 'create' });
  return def;
}

export type UpdateFieldDefPatch = Partial<Omit<FieldDef, 'id' | 'updatedAt' | 'dirty'>>;

export async function updateFieldDef(id: string, patch: UpdateFieldDefPatch): Promise<FieldDef> {
  const existing = await db.fieldDefs.get(id);
  if (!existing) throw new Error(`updateFieldDef: no field definition with id ${id}`);
  const updated: FieldDef = FieldDefSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.fieldDefs.put(updated);
  emit({ entityType: 'fieldDefs', entityId: id, op: 'update' });
  return updated;
}

/**
 * Rewrite each definition's `order` to its index in `orderedIds` (D-02 reorder), in one rw
 * transaction so a partial reorder can't persist. Ids not belonging to `entityType` are ignored.
 */
export async function reorderFieldDefs(entityType: EntityType, orderedIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.fieldDefs, async () => {
    for (let index = 0; index < orderedIds.length; index++) {
      const def = await db.fieldDefs.get(orderedIds[index]);
      if (!def || def.entityType !== entityType) continue;
      await db.fieldDefs.put({ ...def, order: index, updatedAt: now, dirty: true });
    }
  });
  emit({ entityType: 'fieldDefs', entityId: entityType, op: 'update' });
}

/**
 * Soft-delete a field definition (D-05): set `deleted: true` via update — NOT a row delete.
 * Stored custom values on entities are RETAINED and hidden, so re-adding restores them.
 */
export async function softDeleteFieldDef(id: string): Promise<FieldDef> {
  return updateFieldDef(id, { deleted: true });
}

/** List a type's field definitions ordered by `order`, excluding soft-deleted ones by default. */
export async function listFieldDefs(
  entityType: EntityType,
  opts?: { includeDeleted?: boolean },
): Promise<FieldDef[]> {
  const defs = await db.fieldDefs.where('entityType').equals(entityType).toArray();
  const filtered = opts?.includeDeleted ? defs : defs.filter((d) => !d.deleted);
  return filtered.sort((a, b) => a.order - b.order);
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

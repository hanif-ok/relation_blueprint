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
import { coerceOnTypeChange } from '@/features/fields/customValue';
import type {
  CustomValue,
  CustomValues,
  EntityType,
  FieldDef,
  FieldType,
  Group,
  MapDoc,
  Marker,
  MarkerKind,
  MediaRef,
  Person,
  RelationshipLink,
  Shape,
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

/** The entity families `deleteEntity` can cascade. Markers are deleted via `deleteMarker`. */
export type DeletableEntityType = 'people' | 'maps' | 'groups' | 'relationship-links';

/** True when a value looks like a content-addressed MediaRef (carries a string `hash`). */
function isMediaRef(value: unknown): value is MediaRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { hash?: unknown }).hash === 'string'
  );
}

/**
 * Every media hash an entity references — across the universal spine (`photo`/`gallery`/the
 * map `background`) AND any Photo-typed custom-field VALUE (a MediaRef stored in `custom`).
 * One source of truth used by BOTH the GC-candidate pass and the still-referenced sweep, so
 * the two can never drift and wrongly collect a shared blob (02-PATTERNS media-GC generalization).
 */
function collectEntityMediaHashes(entity: {
  photo?: MediaRef;
  gallery?: MediaRef[];
  background?: MediaRef;
  custom?: CustomValues;
}): string[] {
  const hashes: string[] = [];
  if (entity.photo) hashes.push(entity.photo.hash);
  if (entity.gallery) for (const g of entity.gallery) hashes.push(g.hash);
  if (entity.background) hashes.push(entity.background.hash);
  if (entity.custom) {
    for (const value of Object.values(entity.custom)) {
      if (isMediaRef(value)) hashes.push(value.hash);
    }
  }
  return hashes;
}

/**
 * Marker-only delete — the map-level "Remove from map" action (D-12). Removes ONLY that marker
 * row; the referenced entity and any OTHER markers survive, and NO media is collected. This is
 * the user-flagged correctness fix: removing someone from a map must not delete them from the DB.
 *
 * Phase-3 (MAP-06): a PORTAL is a Marker (`kind:'portal'`), so removing a portal — including the
 * picker's "cancel removes the just-dropped target-less portal" path — is just this `deleteMarker`.
 * There is intentionally no portal-specific delete and no cascade: a portal owns no entity (it has
 * a `targetMapId`, not a `personId`), and deleting it never touches the target map.
 */
export async function deleteMarker(id: string): Promise<void> {
  await db.markers.delete(id);
  emit({ entityType: 'markers', entityId: id, op: 'delete' });
}

const DELETABLE_TABLES: Record<DeletableEntityType, EntityTableHandle> = {
  people: () => db.people,
  maps: () => db.maps,
  groups: () => db.groups,
  'relationship-links': () => db.relationshipLinks,
};

type EntityTableHandle = () =>
  | typeof db.people
  | typeof db.maps
  | typeof db.groups
  | typeof db.relationshipLinks;

/**
 * Generalized cascade delete — the list-level "Delete {entity}" action (D-12). In ONE rw
 * transaction over every entity table + markers + media: remove the entity, cascade-delete its
 * markers (people: by `personId`; maps: by `mapId`; groups/relationship-links have none), then
 * refcount-sweep media. A candidate hash is GC'd ONLY when NO surviving entity of ANY type still
 * references it via photo/gallery/background OR a custom Photo-field value — so a blob shared
 * across types is never wrongly collected (threat T-02-03). The single rw transaction rolls back
 * cleanly on failure. `deletePerson` delegates here for back-compat.
 */
export async function deleteEntity(entityType: DeletableEntityType, id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.people, db.maps, db.markers, db.groups, db.relationshipLinks, db.media],
    async () => {
      const victim = await DELETABLE_TABLES[entityType]().get(id);
      await DELETABLE_TABLES[entityType]().delete(id);

      // Cascade markers for the spatial types only.
      if (entityType === 'people') await db.markers.where('personId').equals(id).delete();
      else if (entityType === 'maps') await db.markers.where('mapId').equals(id).delete();

      if (!victim) return;

      const candidates = new Set<string>(collectEntityMediaHashes(victim));
      if (candidates.size === 0) return;

      // Hashes STILL referenced by any surviving entity of ANY type (all five families' spine
      // media + custom Photo values). markers carry no media, so they are not scanned.
      const stillReferenced = new Set<string>();
      const add = (hashes: string[]) => {
        for (const h of hashes) stillReferenced.add(h);
      };
      for (const p of await db.people.toArray()) add(collectEntityMediaHashes(p));
      for (const m of await db.maps.toArray()) add(collectEntityMediaHashes(m));
      for (const g of await db.groups.toArray()) add(collectEntityMediaHashes(g));
      for (const l of await db.relationshipLinks.toArray()) add(collectEntityMediaHashes(l));

      for (const hash of candidates) {
        if (!stillReferenced.has(hash)) await db.media.delete(hash);
      }
    },
  );
  emit({ entityType, entityId: id, op: 'delete' });
}

/**
 * Delete a person + cascade (DATA-04). Retained as a thin delegate to the generalized
 * `deleteEntity('people', ...)` so existing callers/tests keep working unchanged.
 */
export async function deletePerson(id: string): Promise<void> {
  return deleteEntity('people', id);
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

/**
 * Patchable Location (map) fields; identity + sync metadata are managed by the repository.
 * Phase-3: because this is `Partial<Omit<MapDoc, ...>>`, it AUTOMATICALLY covers the new MapDoc
 * sub-objects (`shapes`/`layers`/`parentId`/`backgroundTransform`) — they write through the
 * existing `updateMap` with NO new repository function (RESEARCH Don't-Hand-Roll; PATTERNS).
 */
export type UpdateMapPatch = Partial<Omit<MapDoc, 'id' | 'updatedAt' | 'dirty'>>;

/** The Location edit path (D-07): enrich an existing map in place (photo/notes/custom/gallery)
 * without losing its background/width/height spine. Mirrors `updatePerson`.
 *
 * Phase-3 (MAP-07): this is ALSO how the portal descend-hierarchy is set — the PortalTargetPicker's
 * inline create-a-child flow calls `updateMap(childId, { parentId: currentMapId })` so the new child
 * sits under the current map (the breadcrumb from 03-02 then shows parent ▸ child). `parentId` is a
 * plain MapDoc field, so it patches through here with no new repository function. */
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

/**
 * Read-modify-write a map from its CURRENT persisted row (WR-01). The `mutate` callback receives the
 * freshly-read row — read inside a SINGLE rw transaction — and returns the patch to apply. This
 * closes the lost-update window that `updateMap` has when a caller rebuilds a whole sub-array (e.g.
 * `MapDoc.shapes`) from a `useLiveQuery` render snapshot: because that snapshot refreshes
 * asynchronously, two shape writes issued before it updated both read the same stale array and the
 * second silently overwrote the first. Computing the next value from `existing` INSIDE the
 * transaction means each write sees the prior write's result. Re-validates + stamps exactly like
 * `updateMap`; emits AFTER the transaction commits so subscribers only ever see persisted state.
 */
export async function updateMapFrom(
  id: string,
  mutate: (existing: MapDoc) => UpdateMapPatch,
): Promise<MapDoc> {
  const updated = await db.transaction('rw', db.maps, async () => {
    const existing = await db.maps.get(id);
    if (!existing) throw new Error(`updateMapFrom: no map with id ${id}`);
    const next: MapDoc = MapDocSchema.parse({
      ...existing,
      ...mutate(existing),
      id: existing.id,
      updatedAt: Date.now(),
      dirty: true,
    });
    await db.maps.put(next);
    return next;
  });
  emit({ entityType: 'maps', entityId: id, op: 'update' });
  return updated;
}

/**
 * Convenience over `updateMapFrom` for the common case of rewriting ONLY the `shapes` array from the
 * freshly-read row (WR-01). `updater` receives the current persisted shapes and returns the next
 * array — used by the draw-commit append and the per-shape drag/style patches so concurrent edits
 * no longer drop one another.
 */
export async function updateMapShapes(
  id: string,
  updater: (shapes: Shape[]) => Shape[],
): Promise<MapDoc> {
  return updateMapFrom(id, (existing) => ({ shapes: updater(existing.shapes) }));
}

/**
 * Fields a caller supplies for a marker; `id` is generated when absent. Phase-3 widens this with
 * the marker `kind` discriminant (defaults to `'person'`), the portal `targetMapId`, the Transformer
 * `width`/`height`/`rotation`, and the editor `layerId`. `personId` is now OPTIONAL — a portal
 * carries none.
 *
 * Note on layers (D-04, MAP-03): a marker carries a `layerId` exactly like a Shape, but layer CRUD
 * itself (create/rename/reorder/show/hide/lock/delete) is NOT a marker operation — layers are
 * MapDoc sub-objects written through `updateMap(mapId, { layers })` (RESEARCH Don't-Hand-Roll), so
 * there is no new repository function for it. An absent `layerId` resolves to the map's default
 * layer at render time, so this field is optional.
 *
 * Note on portals (D-06, MAP-06): a PORTAL is placed through THIS same `upsertMarker` — pass
 * `{ kind:'portal', targetMapId, x, y, layerId }` and NO `personId`. There is no portal-specific
 * placement function: a portal is a Marker variant (RESEARCH Pattern 5a), so it rides the markers
 * shard and reuses upsert (validate→stamp→emit) + `deleteMarker` like any other marker.
 */
export type UpsertMarkerInput = {
  id?: string;
  mapId: string;
  kind?: MarkerKind;
  personId?: string;
  targetMapId?: string;
  layerId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
};

export async function upsertMarker(input: UpsertMarkerInput): Promise<Marker> {
  const id = input.id ?? nanoid();
  const existed = input.id ? (await db.markers.get(input.id)) !== undefined : false;
  const marker: Marker = MarkerSchema.parse({
    id,
    mapId: input.mapId,
    // The schema defaults `kind` to 'person'; pass it through explicitly for clarity.
    kind: input.kind ?? 'person',
    personId: input.personId,
    targetMapId: input.targetMapId,
    layerId: input.layerId,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation,
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
 * Reserved-key namespace for a quarantined custom-field original (D-05). When a field's type
 * changes and a stored value cannot be coerced to the new type, the ORIGINAL is set aside under
 * this namespaced key inside the SAME `custom` map (a valid `CustomValue`, so it round-trips
 * through `CustomValuesSchema` / the serializer / backup with ZERO schema change). The separator
 * (`:`) can never appear in a nanoid `FieldDef.id`, so a reserved key can never collide with a
 * live field id — and a future Phase-5 search indexer can skip every key beginning with this
 * prefix. Single-sourced here; never hand-roll the prefix at a call site.
 */
export const QUARANTINE_KEY_PREFIX = '__quarantine:';

/**
 * Build the reserved quarantine key for `fieldId` set aside FROM `sourceType` (single source of
 * truth, D-05 / CR-01). Keying by the source field-type means at most one original can exist per
 * (field, sourceType) pair, so two successive quarantining type changes from DIFFERENT source
 * types never collide — closing the data-loss BLOCKER where one reserved slot per field let a
 * later quarantine clobber an earlier original. A nanoid `FieldDef.id` and every `FieldType` value
 * are colon-free, so the `:<sourceType>` suffix parses unambiguously and the key still begins with
 * `QUARANTINE_KEY_PREFIX` (the prefix-skip contract holds). Never hand-roll the key at a call site.
 */
export function quarantineKey(fieldId: string, sourceType: FieldType): string {
  return `${QUARANTINE_KEY_PREFIX}${fieldId}:${sourceType}`;
}

/** One set-aside original recovered from an entity's custom map: the value + the field type it
 *  belonged to (switch the field's type back to `sourceType` to restore it). */
export interface QuarantinedEntry {
  sourceType: FieldType;
  value: CustomValue;
}

/**
 * The inverse of `quarantineKey`: read the set-aside (quarantined) originals for ONE field from an
 * entity's `custom` map. Parses keys of the form `__quarantine:<fieldId>:<sourceType>` back into
 * `{ sourceType, value }` entries — ignoring the live value and other fields' quarantine keys, and
 * skipping empty (null) slots. The UI uses this to reassure the curator that a value which vanished
 * on a type change is set aside (recoverable), not deleted (F-2). Key parsing lives ONLY here and in
 * `quarantineKey` — never hand-roll the prefix/suffix at a call site.
 */
export function quarantinedEntriesFor(custom: CustomValues, fieldId: string): QuarantinedEntry[] {
  const prefix = `${QUARANTINE_KEY_PREFIX}${fieldId}:`;
  const entries: QuarantinedEntry[] = [];
  for (const [key, value] of Object.entries(custom)) {
    if (!key.startsWith(prefix)) continue;
    if (value === undefined || value === null) continue;
    entries.push({ sourceType: key.slice(prefix.length) as FieldType, value });
  }
  return entries;
}

/** An entity family that carries a `custom` map (everything except markers). */
type CustomBearingEntity = Person | MapDoc | Group | RelationshipLink;

/**
 * Rewrite one entity's `custom` map for a field type change: coerce the live value (keep, maybe
 * reshaped, or set the original aside under the FROM-type's reserved key), then restore the
 * original that was previously set aside FROM the new (target) type. Originals are keyed by their
 * SOURCE field-type (`quarantineKey(fieldId, fromType)`), so a quarantine from one source type can
 * never overwrite an original set aside from a different source type — the CR-01 preserve-all
 * guarantee. Restore resolves from `quarantineKey(fieldId, toType)`: that original was set aside
 * when the field last WAS `toType`, so it fits `toType` by construction (no in-flight from->to
 * fitness guess — the WARNING fix). Returns the new `custom` map plus whether it changed.
 */
function coerceEntityCustom(
  custom: CustomValues,
  fieldId: string,
  fromType: FieldType,
  toType: FieldType,
): { custom: CustomValues; changed: boolean } {
  const next: CustomValues = { ...custom };
  const liveValue = next[fieldId];
  let changed = false;

  // STORE: a non-convertible live original is set aside under its SOURCE type's reserved key. This
  // key is unique per (field, fromType), so it can never clobber an original quarantined from a
  // different source type — the data-loss BLOCKER fix.
  if (liveValue !== undefined && liveValue !== null) {
    const result = coerceOnTypeChange(fromType, toType, liveValue);
    if ('kept' in result) {
      // IN-01: dirty-flag accounting hinges on `coerceOnTypeChange` returning the SAME reference
      // for an unchanged value (it does today), so reference identity is a correct "changed" test.
      // Do not change `coerceOnTypeChange` to return a fresh object for unchanged values without
      // revisiting this check.
      if (result.kept !== next[fieldId]) {
        next[fieldId] = result.kept;
        changed = true;
      }
    } else {
      next[quarantineKey(fieldId, fromType)] = result.quarantined;
      next[fieldId] = null;
      changed = true;
    }
  }

  // RESTORE: bring back the original set aside FROM the target type (keyed by toType). It fits
  // toType by construction, so it becomes the live value verbatim and its reserved key is removed.
  const restoreKey = quarantineKey(fieldId, toType);
  const quarantined = next[restoreKey];
  if (quarantined !== undefined && quarantined !== null) {
    next[fieldId] = quarantined;
    delete next[restoreKey];
    changed = true;
  }

  return { custom: next, changed };
}

/**
 * Apply a custom-field DEFINITION change that includes a TYPE change (D-05 / CR-01), running
 * `coerceOnTypeChange` over every existing entity value of the field so the FieldEditor caution
 * copy is TRUE: convertible values are kept (possibly reshaped), non-convertible originals are
 * QUARANTINED (set aside under `quarantineKey`, never deleted), and a value quarantined by an
 * earlier change is RESTORED when the type changes back to one it fits. The def patch AND every
 * coerced/quarantined entity value are written in ONE rw transaction so a mid-change failure
 * cannot leave the def changed but values un-coerced (or vice-versa). Each touched entity is
 * re-validated through its zod schema and stamped `updatedAt`/`dirty` (so the coerced rows sync
 * to the cloud); change events are emitted AFTER the transaction commits. Use this INSTEAD OF
 * `updateFieldDef` when (and only when) the field's `type` changes.
 */
export async function applyFieldTypeChange(
  entityType: DeletableEntityType,
  fieldId: string,
  patch: UpdateFieldDefPatch,
): Promise<FieldDef> {
  const table = DELETABLE_TABLES[entityType]();
  const touchedEntityIds: string[] = [];
  let updatedDef: FieldDef | undefined;

  await db.transaction('rw', [table, db.fieldDefs], async () => {
    const def = await db.fieldDefs.get(fieldId);
    if (!def) throw new Error(`applyFieldTypeChange: no field definition with id ${fieldId}`);
    const fromType = def.type;
    const toType = patch.type ?? def.type;

    // (b) Persist the validated patched def in the SAME transaction as the value rewrite.
    updatedDef = FieldDefSchema.parse({
      ...def,
      ...patch,
      id: def.id,
      updatedAt: Date.now(),
      dirty: true,
    });
    await db.fieldDefs.put(updatedDef);

    // (c) Coerce / quarantine / restore every entity's value for this field. Each touched row is
    // re-validated through its own schema + stamped before the typed put (no raw un-stamped put).
    const rows = (await table.toArray()) as CustomBearingEntity[];
    for (const row of rows) {
      const { custom, changed } = coerceEntityCustom(row.custom, fieldId, fromType, toType);
      if (!changed) continue;
      const stamped = { ...row, custom, updatedAt: Date.now(), dirty: true };
      switch (entityType) {
        case 'people':
          await db.people.put(PersonSchema.parse(stamped));
          break;
        case 'maps':
          await db.maps.put(MapDocSchema.parse(stamped));
          break;
        case 'groups':
          await db.groups.put(GroupSchema.parse(stamped));
          break;
        case 'relationship-links':
          await db.relationshipLinks.put(RelationshipLinkSchema.parse(stamped));
          break;
      }
      touchedEntityIds.push(row.id);
    }
  });

  // Emit AFTER commit so subscribers see only persisted state (mirrors deleteEntity/reorder).
  emit({ entityType: 'fieldDefs', entityId: fieldId, op: 'update' });
  for (const id of touchedEntityIds) {
    emit({ entityType, entityId: id, op: 'update' });
  }

  return updatedDef!;
}

/**
 * Rewrite each definition's `order` to its index in `orderedIds` (D-02 reorder), in one rw
 * transaction so a partial reorder can't persist. Ids not belonging to `entityType` are ignored.
 */
export async function reorderFieldDefs(entityType: EntityType, orderedIds: string[]): Promise<void> {
  const now = Date.now();
  const reorderedIds: string[] = [];
  await db.transaction('rw', db.fieldDefs, async () => {
    for (let index = 0; index < orderedIds.length; index++) {
      const def = await db.fieldDefs.get(orderedIds[index]);
      if (!def || def.entityType !== entityType) continue;
      await db.fieldDefs.put({ ...def, order: index, updatedAt: now, dirty: true });
      reorderedIds.push(def.id);
    }
  });
  // Emit one fieldDefs update per reordered field id (a real FieldDef.id as entityId) — NEVER the
  // entityType string, which would violate the ChangeEvent record-id contract (WR-06).
  for (const id of reorderedIds) {
    emit({ entityType: 'fieldDefs', entityId: id, op: 'update' });
  }
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

// Runtime validation for the domain model (zod 4). Data read back from the cloud or
// an import bundle is untrusted-at-rest (threat T-02-01) and MUST be validated through
// these schemas before it enters the database.
//
// The schemas mirror src/domain/types.ts exactly. `z.infer` of each schema is assignable
// to its hand-written interface; the `satisfies` checks at the bottom of this file lock
// that correspondence at compile time.

import { z } from 'zod';
import type {
  BackgroundTransform,
  Backup,
  CustomValue,
  CustomValues,
  FieldDef,
  Group,
  Layer,
  Manifest,
  MapDoc,
  Marker,
  MediaRef,
  Person,
  RelationshipLink,
  ShardPointer,
  Shape,
} from './types';

export const MediaRefSchema = z.object({
  hash: z.string(),
  mime: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * The closed union of allowed custom-field VALUE shapes (threat T-02-02): a string
 * (text/date/phone/link-to-entity id), a number, a string[] (tags), a MediaRef (photo), or
 * `null` (empty). An out-of-band value fails validation rather than persisting. The MediaRef
 * branch is listed BEFORE `z.null()`/scalars so a photo object is matched as a MediaRef.
 */
export const CustomValueSchema: z.ZodType<CustomValue> = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  MediaRefSchema,
  z.null(),
]);

/** The per-entity custom value map (D-01): `fieldId -> value`; tolerates missing keys. */
export const CustomValuesSchema: z.ZodType<CustomValues> = z.record(z.string(), CustomValueSchema);

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  photo: MediaRefSchema.optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  notes: z.string().optional(),
  gallery: z.array(MediaRefSchema),
  custom: CustomValuesSchema,
  updatedAt: z.number(),
  dirty: z.boolean(),
});

/** Phase-3 (D-16): background placement descriptor. All four fields required (rotation in radians). */
export const BackgroundTransformSchema = z.object({
  offsetX: z.number(),
  offsetY: z.number(),
  scale: z.number(),
  rotation: z.number(),
});

/** Phase-3 (D-04): one editor layer. */
export const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number(),
});

/**
 * Phase-3 (D-01/D-02/D-03): a drawing primitive. `kind` is the closed rect|ellipse|line|polygon
 * union; rect/ellipse carry the x/y/width/height box, line/polygon carry `points`. A non-empty
 * `label` makes the shape a zone (D-02) — no separate Zone schema.
 */
export const ShapeSchema = z.object({
  id: z.string(),
  layerId: z.string(),
  kind: z.enum(['rect', 'ellipse', 'line', 'polygon']),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  points: z.array(z.number()).optional(),
  rotation: z.number(),
  preset: z.string(),
  fill: z.boolean(),
  label: z.string().optional(),
});

export const MapDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  background: MediaRefSchema,
  width: z.number(),
  height: z.number(),
  photo: MediaRefSchema.optional(),
  gallery: z.array(MediaRefSchema),
  notes: z.string().optional(),
  custom: CustomValuesSchema,
  // Phase-3 sub-objects — ALL optional-with-default so a pre-Phase-3 cloud shard/backup still
  // validates (RESEARCH Pitfall 7; mirrors the `'field-defs'` optional precedent). parentId +
  // backgroundTransform are plain-optional (absent = top-level / identity).
  parentId: z.string().optional(),
  backgroundTransform: BackgroundTransformSchema.optional(),
  shapes: z.array(ShapeSchema).default([]),
  layers: z.array(LayerSchema).default([]),
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  photo: MediaRefSchema.optional(),
  gallery: z.array(MediaRefSchema),
  notes: z.string().optional(),
  custom: CustomValuesSchema,
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const RelationshipLinkSchema = z.object({
  id: z.string(),
  name: z.string(),
  photo: MediaRefSchema.optional(),
  gallery: z.array(MediaRefSchema),
  notes: z.string().optional(),
  label: z.string().optional(),
  date: z.string().optional(),
  custom: CustomValuesSchema,
  updatedAt: z.number(),
  dirty: z.boolean(),
});

/** Phase-3 (RESEARCH Pattern 5a): the closed person|portal marker discriminant. */
export const MarkerKindSchema = z.enum(['person', 'portal']);

export const MarkerSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  // Phase-3: `kind` defaults to 'person' so a pre-Phase-3 marker (no kind) parses as a person
  // marker (RESEARCH Pitfall 7). `personId` is now optional (a portal has none); targetMapId +
  // width/height/rotation are the portal target + Transformer state.
  kind: MarkerKindSchema.default('person'),
  personId: z.string().optional(),
  targetMapId: z.string().optional(),
  // Phase-3 (D-04): the editor layer this marker belongs to. OPTIONAL — an absent layerId resolves
  // to the map's default layer at render time, so no migration is required for pre-Phase-3 markers.
  layerId: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const EntityTypeSchema = z.enum(['people', 'maps', 'markers', 'groups', 'relationship-links']);

/** Closed enum of the 7 DATA-03 field types (threat T-02-02). */
export const FieldTypeSchema = z.enum(['text', 'number', 'date', 'phone', 'tags', 'link-to-entity', 'photo']);

export const FieldDefSchema = z.object({
  id: z.string(),
  entityType: EntityTypeSchema,
  label: z.string(),
  type: FieldTypeSchema,
  required: z.boolean(),
  order: z.number().int(),
  options: z.array(z.string()).optional(),
  targetType: EntityTypeSchema.optional(),
  deleted: z.boolean(),
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const ShardPointerSchema = z.object({
  fileId: z.string(),
  hash: z.string(),
  updatedAt: z.number(),
});

export const ManifestSchema = z.object({
  version: z.number(),
  updatedAt: z.number(),
  // The Phase-1 CORE shards (present in every manifest ever written) stay required. Shards for
  // entity types added in LATER phases are OPTIONAL: a manifest written before an entity type
  // existed has no such key, and a required key would crash `readManifest` on that pre-existing
  // cloud manifest — breaking sync for any DB created before the type was added (DEBUG
  // oauth-prompt-every-refresh: a Phase-1 Drive manifest has no groups/relationship-links). A
  // PRESENT pointer is still fully validated by `ShardPointerSchema`, so the untrusted-at-rest
  // gate (threats T-02.1-01 / T-05-02) stays strict for whatever the manifest DOES declare.
  shards: z.object({
    people: ShardPointerSchema,
    maps: ShardPointerSchema,
    markers: ShardPointerSchema,
    // First-class entity types added after Phase 1 (plan 02-03) — optional for older manifests.
    groups: ShardPointerSchema.optional(),
    'relationship-links': ShardPointerSchema.optional(),
    // Custom-field DEFINITIONS shard (DATA-03) — optional for the same backward-compat reason.
    'field-defs': ShardPointerSchema.optional(),
  }),
  // No `backups` field: rolling backups are discovered by listing the `backups/` folder, the
  // single source of truth. Zod ignores unknown keys, so older on-disk manifests that still
  // carry `backups` continue to validate (WR-03).
});

export const BackupSchema = z.object({
  schemaVersion: z.number(),
  manifest: ManifestSchema,
  entities: z.object({
    people: z.array(PersonSchema),
    maps: z.array(MapDocSchema),
    markers: z.array(MarkerSchema),
    groups: z.array(GroupSchema),
    'relationship-links': z.array(RelationshipLinkSchema),
  }),
  // Custom-field DEFINITIONS travel in their own slot so a restored DB renders custom fields
  // (values live on each entity's `custom` map; definitions describe them — D-02).
  fieldDefs: z.array(FieldDefSchema),
  media: z.record(z.string(), z.string()),
});

// Compile-time locks: each schema's inferred output must match the hand-written type.
// `verbatimModuleSyntax` keeps these as type-only assertions with no runtime cost.
export type MediaRefInput = z.infer<typeof MediaRefSchema>;
export type PersonInput = z.infer<typeof PersonSchema>;
export type MapDocInput = z.infer<typeof MapDocSchema>;
export type MarkerInput = z.infer<typeof MarkerSchema>;
export type BackgroundTransformInput = z.infer<typeof BackgroundTransformSchema>;
export type LayerInput = z.infer<typeof LayerSchema>;
export type ShapeInput = z.infer<typeof ShapeSchema>;
export type GroupInput = z.infer<typeof GroupSchema>;
export type RelationshipLinkInput = z.infer<typeof RelationshipLinkSchema>;
export type FieldDefInput = z.infer<typeof FieldDefSchema>;
export type CustomValueInput = z.infer<typeof CustomValueSchema>;
export type CustomValuesInput = z.infer<typeof CustomValuesSchema>;
export type ShardPointerInput = z.infer<typeof ShardPointerSchema>;
export type ManifestInput = z.infer<typeof ManifestSchema>;
export type BackupInput = z.infer<typeof BackupSchema>;

const _mediaRefCheck = {} as MediaRefInput satisfies MediaRef;
const _personCheck = {} as PersonInput satisfies Person;
const _mapDocCheck = {} as MapDocInput satisfies MapDoc;
const _markerCheck = {} as MarkerInput satisfies Marker;
const _backgroundTransformCheck = {} as BackgroundTransformInput satisfies BackgroundTransform;
const _layerCheck = {} as LayerInput satisfies Layer;
const _shapeCheck = {} as ShapeInput satisfies Shape;
const _groupCheck = {} as GroupInput satisfies Group;
const _relationshipLinkCheck = {} as RelationshipLinkInput satisfies RelationshipLink;
const _fieldDefCheck = {} as FieldDefInput satisfies FieldDef;
const _customValueCheck = {} as CustomValueInput satisfies CustomValue;
const _customValuesCheck = {} as CustomValuesInput satisfies CustomValues;
const _shardPointerCheck = {} as ShardPointerInput satisfies ShardPointer;
const _manifestCheck = {} as ManifestInput satisfies Manifest;
const _backupCheck = {} as BackupInput satisfies Backup;
void _mediaRefCheck;
void _personCheck;
void _mapDocCheck;
void _markerCheck;
void _backgroundTransformCheck;
void _layerCheck;
void _shapeCheck;
void _groupCheck;
void _relationshipLinkCheck;
void _fieldDefCheck;
void _customValueCheck;
void _customValuesCheck;
void _shardPointerCheck;
void _manifestCheck;
void _backupCheck;

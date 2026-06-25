// Domain model for Relation Blueprint — the non-retrofittable data backbone.
//
// Phase 2 expansion (full entity model): the model now describes FIVE first-class entity
// families. Person is enriched with a custom-value map; MapDoc is promoted in place to a
// rich Location (photo/gallery/notes/custom, D-07); Group (D-09) and RelationshipLink
// (D-08, a data-bearing shell with NO endpoints yet — that is Phase 4) join as new types.
// A per-entity `custom: CustomValues` map carries DATA-03 custom-field VALUES (D-01), and a
// `FieldDef` describes the per-type custom-field SCHEMA stored in the `fieldDefs` table
// (stable nanoid id, soft-delete flag — D-02/D-05).
//
// Sync convention: every persisted entity carries `updatedAt` (epoch ms) and a `dirty`
// flag so the Plan 05 sync engine can find changed records and do last-write-wins.

/**
 * Content-addressed reference to a media blob. Photos are NEVER base64-embedded in
 * entity JSON — they live as separate blobs in the `media` table keyed by content hash.
 */
export interface MediaRef {
  /** Content hash of the blob bytes — the media table key and the dedupe identity. */
  hash: string;
  /** MIME type of the stored blob (e.g. `image/webp`). */
  mime: string;
  /** Intrinsic pixel width, when known. */
  width?: number;
  /** Intrinsic pixel height, when known. */
  height?: number;
}

/**
 * The 7 DATA-03 custom-field types. Closed set — a `FieldDef.type` outside this union is
 * rejected by `FieldTypeSchema` (threat T-02-02). `tags` carries an `options` list;
 * `link-to-entity` carries a `targetType` (a one-way pointer, D-10); `photo` stores a MediaRef.
 */
export type FieldType = 'text' | 'number' | 'date' | 'phone' | 'tags' | 'link-to-entity' | 'photo';

/**
 * A single custom-field VALUE. The shape depends on the field's `FieldType`:
 * string (text/date/phone/link-to-entity id), number, string[] (tags), MediaRef (photo),
 * or `null`/absent for an empty value. Validated by `CustomValueSchema` (closed union).
 */
export type CustomValue = string | number | string[] | MediaRef | null;

/**
 * The per-entity custom-field value map (D-01): `fieldId -> value`. Keyed by the stable
 * `FieldDef.id` (NOT the label) so values survive a label/type change and soft-delete/re-add.
 * Stored on every entity record and round-trips automatically through the single put path.
 */
export type CustomValues = Record<string, CustomValue>;

/**
 * A custom-field DEFINITION (D-02): the per-type schema for one custom field. Lives in the
 * `fieldDefs` table keyed by a stable nanoid `id` (D-05 soft-delete/re-add + Phase 5 search
 * depend on id stability — never key by label). `options` is meaningful only for `tags`;
 * `targetType` only for `link-to-entity` (D-10 one-way pointer); `deleted` is the soft-delete
 * flag (D-05) — a deleted definition is hidden but its stored values are RETAINED.
 */
export interface FieldDef {
  id: string;
  /** The entity family this field belongs to (D-03: a People field ≠ a Groups field). */
  entityType: EntityType;
  label: string;
  type: FieldType;
  /** D-06: optional per-field required toggle (the only validation rule in v1). */
  required: boolean;
  /** Position within its entity type's field list (D-02 reorder). */
  order: number;
  /** Allowed values for `tags`/select fields. */
  options?: string[];
  /** Target entity family for a `link-to-entity` pointer (D-10). */
  targetType?: EntityType;
  /** Soft-delete flag (D-05): hidden from forms/profiles, stored values retained. */
  deleted: boolean;
  updatedAt: number;
  dirty: boolean;
}

/**
 * A Person — enriched in Phase 2 with the DATA-03 custom-value map. Carries the fixed DATA-02
 * built-ins (D-04: name + photo mandatory in the UI, the rest always exist) plus `custom`.
 */
export interface Person {
  id: string;
  /** DATA-02: display name (required). */
  name: string;
  /** DATA-02: primary avatar photo (optional). */
  photo?: MediaRef;
  /** DATA-02: phone number (optional, free text). */
  phone?: string;
  /** DATA-02: free-text description (optional). */
  description?: string;
  /** DATA-02: tag list (always an array; may be empty). */
  tags: string[];
  /** DATA-02: free-text notes (optional). */
  notes?: string;
  /** PROF-02: multi-photo gallery (always an array; may be empty). */
  gallery: MediaRef[];
  /** DATA-03/D-01: custom-field value map (always present; may be empty). */
  custom: CustomValues;
  /** Epoch ms of the last write. */
  updatedAt: number;
  /** True when the record has local changes not yet synced to the cloud. */
  dirty: boolean;
}

/**
 * A map document — promoted in Phase 2 to a rich Location entity (D-07/D-18). It KEEPS the
 * Phase-1 `background`/`width`/`height` spine (and the `maps` table + `markers.mapId` FK are
 * NOT renamed — a Location *is* the enriched `maps` row) and gains the universal entity spine:
 * optional thumbnail photo, a gallery, free-text notes, and the custom-value map.
 */
export interface MapDoc {
  id: string;
  name: string;
  /** The uploaded background image, content-addressed. */
  background: MediaRef;
  width: number;
  height: number;
  /** D-18: optional thumbnail/avatar photo. */
  photo?: MediaRef;
  /** D-18: multi-photo gallery (always an array; may be empty). */
  gallery: MediaRef[];
  /** D-18: free-text notes (optional). */
  notes?: string;
  /** DATA-03/D-01: custom-field value map (always present; may be empty). */
  custom: CustomValues;
  updatedAt: number;
  dirty: boolean;
}

/**
 * A social Group (D-09) — a profile shell in Phase 2: name + the universal entity spine
 * (photo/gallery/notes) + a custom-value map. Members and group relations are wired through
 * the Phase 4 relationship system; there is NO members-list field here.
 */
export interface Group {
  id: string;
  name: string;
  photo?: MediaRef;
  gallery: MediaRef[];
  notes?: string;
  custom: CustomValues;
  updatedAt: number;
  dirty: boolean;
}

/**
 * A Relationship-link (D-08) — a data-bearing shell in Phase 2. It is a real entity record
 * with its own data (REL-02: optional `label`/`date`/`notes`) + the universal spine + custom
 * values, but it carries NO endpoints yet — attaching person↔person / person↔group /
 * group↔group wiring (and the connectors/graph) is Phase 4.
 */
export interface RelationshipLink {
  id: string;
  name: string;
  photo?: MediaRef;
  gallery: MediaRef[];
  notes?: string;
  /** REL-02: the relationship label (e.g. "mentor"). */
  label?: string;
  /** REL-02: an associated date (ISO string). */
  date?: string;
  custom: CustomValues;
  updatedAt: number;
  dirty: boolean;
}

/**
 * A marker placing a Person at (x, y) on a MapDoc. Skeleton-minimal: distinctive
 * portal markers, connectors, and per-marker styling are later phases.
 */
export interface Marker {
  id: string;
  mapId: string;
  personId: string;
  x: number;
  y: number;
  updatedAt: number;
  dirty: boolean;
}

/**
 * The entity families that shard out to the cloud, one shard file per type. Phase 2 widens
 * the union with `groups` and `relationship-links`; `maps` stays the Location family (D-07).
 */
export type EntityType = 'people' | 'maps' | 'markers' | 'groups' | 'relationship-links';

/**
 * A pointer from the manifest to a single cloud shard file. The manifest swap over
 * these pointers is the atomic commit point of the Plan 05 sync engine.
 */
export interface ShardPointer {
  fileId: string;
  /** Content hash of the shard bytes, for change detection. */
  hash: string;
  updatedAt: number;
}

/**
 * The single always-loaded file describing the cloud database. Swapping its shard
 * pointers is the only commit point — everything else is additive and discardable.
 *
 * Rolling manifest backups are NOT tracked here: they are discovered by listing the
 * `backups/` folder (`rollBackups`), which is the single source of truth. A manifest field
 * could never be kept consistent within the one-write commit point, so it was removed rather
 * than left permanently empty and misleading (WR-03).
 */
export interface Manifest {
  version: number;
  updatedAt: number;
  shards: Record<EntityType, ShardPointer>;
}

/**
 * The portable export bundle. Media blobs are base64-encoded so photos survive the
 * round trip. Validated by `BackupSchema` on import (untrusted-at-rest data).
 */
export interface Backup {
  schemaVersion: number;
  manifest: Manifest;
  entities: {
    people: Person[];
    maps: MapDoc[];
    markers: Marker[];
    groups: Group[];
    'relationship-links': RelationshipLink[];
  };
  /** The per-type custom-field SCHEMA — definitions ride alongside the entity values so a
   * restored DB renders its custom fields (D-02). Distinct from values, which live on each
   * entity's `custom` map. */
  fieldDefs: FieldDef[];
  /** Map of media content hash -> base64-encoded blob bytes. */
  media: Record<string, string>;
}

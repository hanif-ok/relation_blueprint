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
  /**
   * Phase-3 (D-09): optional parent map for nested-space navigation (a portal target chain).
   * A map with no `parentId` is a top-level space.
   */
  parentId?: string;
  /**
   * Phase-3 (D-16): how the background image is positioned/scaled/rotated within the Stage.
   * Marker/shape `x`/`y` are stored in the background image's intrinsic IMAGE space and
   * composed onto THIS transform at render time. Absent = identity (offset 0, scale 1, rot 0).
   */
  backgroundTransform?: BackgroundTransform;
  /**
   * Phase-3 (D-01/D-02): drawing primitives placed on the map. A shape carrying a non-empty
   * `label` IS a zone (D-02) — there is no separate `zones` array. Always present; may be empty.
   */
  shapes: Shape[];
  /**
   * Phase-3 (D-04): the editor layer stack. New maps backfill a single default "Markers" layer
   * (order 0). Always present; may be empty for pre-Phase-3 data not yet upgraded.
   */
  layers: Layer[];
  updatedAt: number;
  dirty: boolean;
}

/**
 * Phase-3 (D-16): the background image's placement within the Konva Stage. Marker/shape
 * coordinates live in the image's intrinsic pixel space and are composed onto this transform
 * at render time. The identity transform (`offsetX:0, offsetY:0, scale:1, rotation:0`) means
 * image space === stage space — so a Phase-1/2 marker's stage-space x/y is already valid as
 * image-space at the identity, requiring NO per-marker coordinate rewrite on upgrade (RESEARCH
 * Pattern 7 / A1).
 */
export interface BackgroundTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  /** Rotation in radians. */
  rotation: number;
}

/**
 * Phase-3 (D-04): one editor layer. Markers/shapes reference a layer by `layerId`. A locked
 * layer renders dimmed + non-interactive; a hidden layer is not rendered (UI-SPEC). `order`
 * is the bottom-to-top stacking index.
 */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

/**
 * Phase-3 (D-01/D-02/D-03): a drawing primitive placed on a map. Rect/ellipse use the
 * `x`/`y`/`width`/`height` bounding box (image-space); line/polygon use `points` (a flat
 * `[x0,y0,x1,y1,…]` array in image-space). `preset` is one of the five lowercased zone-preset
 * ids (stone/sage/clay/dusk/plum); `fill` toggles the translucent fill on/off (D-03). A
 * non-empty `label` promotes the shape to a ZONE (D-02) — there is intentionally no separate
 * Zone entity/array.
 */
export interface Shape {
  id: string;
  layerId: string;
  kind: 'rect' | 'ellipse' | 'line' | 'polygon';
  /** Bounding-box origin (image-space) — for rect/ellipse. */
  x?: number;
  y?: number;
  /** Bounding-box size (image-space) — for rect/ellipse. */
  width?: number;
  height?: number;
  /** Flat `[x0,y0,x1,y1,…]` vertices (image-space) — for line/polygon. */
  points?: number[];
  /** Rotation in radians. */
  rotation: number;
  /** One of the five lowercased zone-preset ids (stone/sage/clay/dusk/plum). */
  preset: string;
  /** D-03: translucent fill on/off (always off for Line). */
  fill: boolean;
  /** D-02: a non-empty label makes this shape a zone. */
  label?: string;
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
 * The two entity families a relationship endpoint may point at (D-07): a Person or a social
 * Group. A Location (`maps`) is deliberately excluded — relationships connect people and groups,
 * never places. The closed set is the runtime validation gate at both the write path and the
 * backup-import boundary (T-04-02).
 */
export type RelationshipEndpointType = 'people' | 'groups';

/**
 * A Relationship-link (D-08). Phase 2 shipped this as a data-bearing SHELL (spine + custom + the
 * REL-02 `label`/`date`/`notes`) with no endpoints. Phase 4 attaches the ordered endpoint pair
 * (`fromType`/`fromId` → `toType`/`toId`) plus a `directed` flag (D-01 per-link direction), so
 * one canonical link is queried from BOTH ends (D-04) and the connectors/graph project from it.
 *
 * The endpoint fields are OPTIONAL, mirroring the `Marker.kind`/`personId` optional precedent: a
 * pre-Phase-4 shell record (and any older backup) still validates with no data migration. An
 * absent `directed` is treated as `false` at every read site (normalize at read, not a required
 * schema default).
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
  /** D-07: the `from` endpoint's entity family (people|groups only). OPTIONAL for old shells. */
  fromType?: RelationshipEndpointType;
  /** The `from` endpoint entity id. OPTIONAL for old shells. */
  fromId?: string;
  /** D-07: the `to` endpoint's entity family (people|groups only). OPTIONAL for old shells. */
  toType?: RelationshipEndpointType;
  /** The `to` endpoint entity id. OPTIONAL for old shells. */
  toId?: string;
  /** D-01: `true` = directed from→to; absent/`false` = symmetric. Normalized to false at read. */
  directed?: boolean;
  custom: CustomValues;
  updatedAt: number;
  dirty: boolean;
}

/**
 * Phase-3 (RESEARCH Pattern 5a): a marker is either a PERSON marker (placing a Person on the
 * map) or a PORTAL marker (a doorway to `targetMapId`). The discriminant is `kind`.
 */
export type MarkerKind = 'person' | 'portal';

/**
 * A marker placed on a MapDoc. Phase-3 widens the Phase-1/2 skeleton:
 *  - `kind` discriminates person vs portal (RESEARCH Pattern 5a). Defaults to `'person'`.
 *  - `personId` is now OPTIONAL — a portal carries no person; `targetMapId` is the portal's
 *    destination map.
 *  - `width`/`height`/`rotation` are the optional Transformer state (D-14/D-15).
 *  - `x`/`y` are REINTERPRETED as IMAGE-space coordinates (relative to the background image's
 *    intrinsic pixel space), composed onto the live `MapDoc.backgroundTransform` at render
 *    time (D-13/D-16, RESEARCH Pattern 7). The fields are NOT renamed and are NOT rewritten on
 *    the version(4) upgrade — at the identity transform, old stage-space coords are already
 *    valid image-space.
 */
export interface Marker {
  id: string;
  mapId: string;
  /** Person marker discriminant (RESEARCH Pattern 5a); defaults to `'person'`. */
  kind: MarkerKind;
  /** The placed Person — present for `kind:'person'`, absent for a portal. */
  personId?: string;
  /** Portal destination map — present for `kind:'portal'`. */
  targetMapId?: string;
  /**
   * Phase-3 (D-04): the editor layer this marker belongs to (markers carry a `layerId` like
   * shapes). OPTIONAL — an absent layerId resolves to the map's default/first layer at render
   * time, so a pre-Phase-3 marker needs NO migration (RESEARCH Pitfall 7; mirrors the
   * optional-with-default precedent for the other Phase-3 sub-objects).
   */
  layerId?: string;
  /** IMAGE-space x (see interface doc — composed onto backgroundTransform at render). */
  x: number;
  /** IMAGE-space y. */
  y: number;
  /** Optional Transformer width (D-14). */
  width?: number;
  /** Optional Transformer height (D-14). */
  height?: number;
  /** Optional Transformer rotation in radians (D-15). */
  rotation?: number;
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
  /**
   * Shard pointers, keyed by entity type, PLUS an optional `'field-defs'` pointer (DATA-03).
   * Only the Phase-1 CORE types (people/maps/markers) are guaranteed present; shards for types
   * added later (groups, relationship-links) and field-defs are OPTIONAL, so a manifest written
   * before a given type existed still validates and reconciles as a safe no-op (the engine guards
   * every pointer access with `if (!pointer) continue` and self-heals the manifest on next push).
   * The core `EntityType` union is intentionally NOT widened with `'field-defs'` (a sync-local
   * concern only — `SyncShardType` in syncEngine.ts).
   */
  shards: Record<'people' | 'maps' | 'markers', ShardPointer> &
    Partial<Record<EntityType, ShardPointer>> & { 'field-defs'?: ShardPointer };
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

// Domain model for Relation Blueprint — the non-retrofittable data backbone.
//
// Scope discipline (Phase 1 walking skeleton): Person is the only RICH entity and
// ships exactly the DATA-02 out-of-box fields. MapDoc and Marker are skeleton-minimal.
// Custom-field types, Locations-as-entities, Groups, and Relationship-links are Phase 2+
// and MUST NOT appear here.
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
 * A Person — the single rich entity in Phase 1. Carries exactly the DATA-02 default
 * fields plus identity (`id`) and sync metadata (`updatedAt`, `dirty`).
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
  /** Epoch ms of the last write. */
  updatedAt: number;
  /** True when the record has local changes not yet synced to the cloud. */
  dirty: boolean;
}

/**
 * A map document — an uploaded background image with intrinsic dimensions.
 * Skeleton-minimal: drawn shapes, layers, and map-groups are Phase 3+.
 */
export interface MapDoc {
  id: string;
  name: string;
  /** The uploaded background image, content-addressed. */
  background: MediaRef;
  width: number;
  height: number;
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

/** The entity families that shard out to the cloud, one shard file per type in Phase 1. */
export type EntityType = 'people' | 'maps' | 'markers';

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
 */
export interface Manifest {
  version: number;
  updatedAt: number;
  shards: Record<EntityType, ShardPointer>;
  /** File ids of rolling manifest backups (newest last). */
  backups: string[];
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
  };
  /** Map of media content hash -> base64-encoded blob bytes. */
  media: Record<string, string>;
}

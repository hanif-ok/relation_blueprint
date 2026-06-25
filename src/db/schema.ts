// The Dexie database — IndexedDB is the runtime SOURCE OF TRUTH (offline-first). The
// cloud is a replica synced later (Plan 05). Every read/write the app does hits this DB.
//
// Index discipline (RESEARCH Anti-Pattern): the `media` table is keyed ONLY by `hash` —
// the Blob column is NOT indexed (indexing blobs bloats the DB for zero query benefit).
// Photos are stored as separate blobs referenced by content hash, never base64-embedded.
//
// Phase 2 adds three tables via a `version(2)` upgrade: `groups`, `relationshipLinks`, and
// `fieldDefs` (the per-type custom-field schema, also indexed by `entityType` + `order` so the
// field manager can list/sort one type's fields). Dexie auto-upgrades the open DB in the
// browser — this is a Dexie schema, NOT a Drizzle/Prisma migration, so there is no push step.

import Dexie, { type EntityTable } from 'dexie';
import type { FieldDef, Group, MapDoc, Marker, Person, RelationshipLink } from '@/domain/types';

/**
 * A media blob stored content-addressed by `hash`. The bytes column is intentionally
 * unindexed.
 *
 * Bytes are stored as an `ArrayBuffer`, not a `Blob`: IndexedDB persists media via the
 * structured-clone algorithm, and ArrayBuffer is universally clonable (real browsers AND
 * the fake-indexeddb test environment, whose structured clone does NOT preserve `Blob`).
 * The repository converts Blob <-> ArrayBuffer at the boundary so callers still speak Blob.
 */
export interface MediaRecord {
  hash: string;
  bytes: ArrayBuffer;
  /** MIME type, so the boundary can reconstruct a faithful Blob on read. */
  mime: string;
}

/** A key/value meta row — holds the local manifest and per-shard `updatedAt` for sync. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

/** A queued sync operation the Plan 05 engine drains; `seq` auto-increments. */
export interface SyncQueueRecord {
  seq?: number;
  entityType: string;
  entityId: string;
}

export class RelationBlueprintDB extends Dexie {
  people!: EntityTable<Person, 'id'>;
  maps!: EntityTable<MapDoc, 'id'>;
  markers!: EntityTable<Marker, 'id'>;
  groups!: EntityTable<Group, 'id'>;
  relationshipLinks!: EntityTable<RelationshipLink, 'id'>;
  fieldDefs!: EntityTable<FieldDef, 'id'>;
  media!: EntityTable<MediaRecord, 'hash'>;
  meta!: EntityTable<MetaRecord, 'key'>;
  syncQueue!: EntityTable<SyncQueueRecord, 'seq'>;

  constructor() {
    super('relation-blueprint');
    this.version(1).stores({
      people: 'id, name, updatedAt, dirty',
      maps: 'id, name, updatedAt, dirty',
      markers: 'id, mapId, personId, updatedAt, dirty',
      // Only `hash` is indexed — the blob column is NOT in the index string.
      media: 'hash',
      meta: 'key',
      syncQueue: '++seq, entityType, entityId',
    });
    // Phase 2 (D-07/D-08/D-09): add the new entity tables + the field-definition store. Dexie
    // auto-upgrades the open DB; existing version(1) tables are carried forward unchanged.
    // `fieldDefs` is additionally indexed by `entityType` and `order` so the field manager can
    // query one type's definitions and list them in display order.
    this.version(2).stores({
      groups: 'id, name, updatedAt, dirty',
      relationshipLinks: 'id, name, updatedAt, dirty',
      fieldDefs: 'id, entityType, order, updatedAt, dirty',
    });
  }
}

/** Process-wide singleton database handle. */
export const db = new RelationBlueprintDB();

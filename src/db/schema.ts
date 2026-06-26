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
import { nanoid } from 'nanoid';
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
    // Phase 2 hardening (02-08): legacy version(1) `people`/`maps` records pre-date the custom-value
    // map (introduced with the version-2 type model). Backfill `custom = {}` where it is absent so
    // the "custom always present" invariant holds for OLD data too. Without it, the profile read
    // path dereferences `entity.custom[def.id]` on an `undefined` map and white-screens the instant
    // the first custom field is added (02-UAT test 2). `stores({})` = no schema change, upgrade only.
    // Idempotent: it only fills records that are missing the key.
    this.version(3).stores({}).upgrade(async (tx) => {
      for (const table of [tx.table('people'), tx.table('maps')]) {
        await table.toCollection().modify((record: { custom?: unknown }) => {
          if (record.custom === undefined || record.custom === null) record.custom = {};
        });
      }
    });
    // Phase 3 (MAP-02/03/06/07): the map-editor data foundation. Backfill DEFAULTS for the new
    // Marker + MapDoc fields on legacy rows. `stores({})` = no index change — a Dexie auto-upgrade,
    // NOT a Drizzle/Prisma migration, so there is NO push step (see the file header + the
    // schema-gate-dexie-false-positive memory note). Idempotent: only missing keys are filled.
    //
    // CRITICAL (RESEARCH Pattern 7 / A1): marker `x`/`y` are NOT rewritten. At the identity
    // background transform that we backfill here, an old stage-space coordinate is already a valid
    // image-space coordinate — composing the identity transform onto it yields the same point. A
    // per-marker coordinate rewrite would visibly jump every existing marker on first open.
    this.version(4).stores({}).upgrade(async (tx) => {
      // (a) Existing markers are person markers; set `kind = 'person'` where absent. x/y untouched.
      await tx
        .table('markers')
        .toCollection()
        .modify((record: { kind?: unknown }) => {
          if (record.kind === undefined || record.kind === null) record.kind = 'person';
        });
      // (b) Maps gain an identity backgroundTransform, an empty shapes array, and a default
      //     "Markers" layer (UI-SPEC S11) — each filled only when absent.
      await tx
        .table('maps')
        .toCollection()
        .modify((record: { backgroundTransform?: unknown; shapes?: unknown; layers?: unknown }) => {
          if (record.backgroundTransform === undefined || record.backgroundTransform === null) {
            record.backgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
          }
          if (record.shapes === undefined || record.shapes === null) record.shapes = [];
          if (record.layers === undefined || record.layers === null) {
            record.layers = [{ id: nanoid(), name: 'Markers', visible: true, locked: false, order: 0 }];
          }
        });
    });
  }
}

/** Process-wide singleton database handle. */
export const db = new RelationBlueprintDB();

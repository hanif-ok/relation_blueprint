// The atomic manifest-swap sync engine — the corruption-proof heart of the storage spine.
//
// It targets the `StorageProvider` interface ONLY (never Drive/GIS directly), so it is built
// and proven against the InMemoryProvider + FaultInjectingProvider before Plan 06 drops in the
// live Drive adapter behind the same seam. The single safety property it guarantees (STOR-05):
// an interrupted commit can never corrupt the durable database, because the only true commit
// point is a single small-manifest overwrite, and everything written before it is new,
// immutable, and discardable.
//
// COMMIT SEQUENCE (RESEARCH ## Pattern 2 — order is load-bearing):
//   1. For each dirty shard: writeFile a NEW immutable shard file  -> newShardFileId
//   2. For each new media blob: writeFile media/<hash> (content-addressed = idempotent)
//   3. Build manifest' = clone(current) with swapped shard pointers + version++ + updatedAt=now
//   4. COMMIT: copy current manifest to backups/manifest-<prev>.json, THEN overwriteFile the
//      canonical manifest with manifest' — this single write is the ONLY commit point.
//   5. On success: mark local records dirty=false. THEN GC orphaned old shard files.
//
// If any step 1–4-before-overwrite throws, the canonical manifest still points at the PREVIOUS
// shards: the durable DB is the last good state, untouched; locals stay dirty; nothing is GC'd.
//
// WriteStatus contract (Plan 08): every commit is wrapped in beginWrite()/endWrite() (try/
// finally) so the PWA service-worker update guard never activates a new worker mid-write.

import { serializeShards, deserializeShards, SHARD_NAMES, type EntitySet } from './serializer';
import { readManifest, writeManifestWithBackup, rollBackups } from './manifest';
import { beginWrite, endWrite } from './writeStatus';
import type { StorageProvider } from '@/storage/StorageProvider';
import type { EntityType, Manifest, ShardPointer } from '@/domain/types';
import type { RelationBlueprintDB } from '@/db/schema';

const JSON_TYPE = 'application/json';
const MANIFEST_NAME = 'manifest.json';
const MEDIA_FOLDER = 'media';
const BACKUP_KEEP = 5;

/**
 * The repository surface the engine reads dirty entities from and upserts pulled shards into.
 * Abstracted so the engine can be driven by the real Dexie store (production / reconcile test)
 * or a plain in-memory snapshot (the atomicity property test).
 */
export interface RepositoryPort {
  /** The full current entity set (one shard per type holds ALL entities of that type). */
  getEntities(): Promise<EntitySet>;
  /** Which entity types currently have at least one dirty record. */
  getDirtyTypes(): Promise<EntityType[]>;
  /** New media blobs to upload this commit, keyed by content hash. */
  getNewMedia(): Promise<Record<string, Blob>>;
  /** Clear the dirty flag on all records after a successful commit. */
  markSynced(): Promise<void>;
  /** Upsert pulled entities (reconcile-on-open). Only provided types are touched. */
  upsert(entities: Partial<EntitySet>): Promise<void>;
  /** The local `updatedAt` watermark for a shard type (0 if never reconciled). */
  getShardMeta(type: EntityType): Promise<number>;
  /** Persist the local `updatedAt` watermark for a shard type. */
  setShardMeta(type: EntityType, updatedAt: number): Promise<void>;
}

export interface SyncEngineOptions {
  provider: StorageProvider;
  /** Id of the app folder (where manifest + shards + media + backups live). */
  folderId: string;
  repo: RepositoryPort;
  /** Existing canonical manifest file id; omit to bootstrap a fresh database. */
  manifestFileId?: string;
}

const ENTITY_TYPES: EntityType[] = ['people', 'maps', 'markers'];

export class SyncEngine {
  private readonly provider: StorageProvider;
  private readonly folderId: string;
  private readonly repo: RepositoryPort;
  private _manifestFileId: string | null;

  constructor(opts: SyncEngineOptions) {
    this.provider = opts.provider;
    this.folderId = opts.folderId;
    this.repo = opts.repo;
    this._manifestFileId = opts.manifestFileId ?? null;
  }

  /** The canonical manifest file id (throws if the engine hasn't bootstrapped yet). */
  manifestFileId(): string {
    if (!this._manifestFileId) throw new Error('SyncEngine: manifest not initialized — call bootstrap() first');
    return this._manifestFileId;
  }

  /**
   * Ensure a canonical manifest exists. If none was provided, write an empty v0 manifest +
   * three empty shard files so the first `push` has a previous state to swap from. Idempotent
   * against a provided manifestFileId.
   */
  async bootstrap(): Promise<void> {
    if (this._manifestFileId) return;

    // Write three empty shard files so the manifest can point at them.
    const empty = serializeShards({ people: [], maps: [], markers: [] });
    const shards = {} as Record<EntityType, ShardPointer>;
    for (const type of ENTITY_TYPES) {
      const blob = empty[SHARD_NAMES[type]];
      const fileId = await this.provider.writeFile(SHARD_NAMES[type], this.folderId, blob, JSON_TYPE);
      shards[type] = { fileId, hash: '', updatedAt: 0 };
    }

    const manifest: Manifest = { version: 0, updatedAt: 0, shards, backups: [] };
    this._manifestFileId = await this.provider.writeFile(
      MANIFEST_NAME,
      this.folderId,
      new Blob([JSON.stringify(manifest)], { type: JSON_TYPE }),
      JSON_TYPE,
    );
  }

  /**
   * Collect dirty entities and run the atomic commit (RESEARCH ## Pattern 2). On any failure
   * before the manifest overwrite, throws and leaves the durable DB at its last good state.
   */
  async push(): Promise<void> {
    await this.bootstrap();
    const dirtyTypes = await this.repo.getDirtyTypes();
    const newMedia = await this.repo.getNewMedia();
    if (dirtyTypes.length === 0 && Object.keys(newMedia).length === 0) return;
    await this.commit(dirtyTypes, newMedia);
  }

  /**
   * The atomic commit. `beginWrite`/`endWrite` wrap the whole sequence so the PWA SW update
   * guard sees an active write. The manifest overwrite is the SOLE commit point; everything
   * before it is additive (new immutable files) and discardable on failure.
   */
  async commit(dirtyTypes: EntityType[], newMedia: Record<string, Blob>): Promise<void> {
    const manifestFileId = this.manifestFileId();
    beginWrite();
    try {
      const current = await readManifest(this.provider, manifestFileId);
      const entities = await this.repo.getEntities();
      const now = Date.now();

      // Step 1: write NEW immutable shard files for every dirty type.
      const shards: Record<EntityType, ShardPointer> = { ...current.shards };
      const shardBlobs = serializeShards(entities);
      const orphans: string[] = [];
      for (const type of dirtyTypes) {
        const blob = shardBlobs[SHARD_NAMES[type]];
        const newFileId = await this.provider.writeFile(SHARD_NAMES[type], this.folderId, blob, JSON_TYPE);
        const hash = await sha256Hex(await blob.arrayBuffer());
        // The previous shard file becomes an orphan only once the commit succeeds.
        orphans.push(current.shards[type].fileId);
        shards[type] = { fileId: newFileId, hash, updatedAt: now };
      }

      // Step 2: write NEW media files (content-addressed under media/<hash> = idempotent).
      const mediaFolder = await this.provider.ensureFolder(MEDIA_FOLDER, this.folderId);
      for (const [hash, blob] of Object.entries(newMedia)) {
        await this.provider.writeFile(`media/${hash}`, mediaFolder, blob, blob.type || 'application/octet-stream');
      }

      // Step 3: build manifest' (swapped pointers + version++ + updatedAt).
      const next: Manifest = {
        version: current.version + 1,
        updatedAt: now,
        shards,
        backups: current.backups,
      };

      // Step 4: THE COMMIT — rolling backup of the current manifest, then overwrite in place.
      // writeManifestWithBackup performs the only `overwriteFile` of the sequence.
      await writeManifestWithBackup(this.provider, this.folderId, manifestFileId, next);

      // --- Past the commit point: the durable DB is now `next`. Failures below are recoverable. ---

      // Step 5: mark local records synced, advance shard watermarks, then GC orphans + backups.
      await this.repo.markSynced();
      for (const type of dirtyTypes) {
        await this.repo.setShardMeta(type, now);
      }
      await rollBackups(this.provider, this.folderId, BACKUP_KEEP);
      for (const orphanId of orphans) {
        await this.provider.delete(orphanId);
      }
    } finally {
      endWrite();
    }
  }

  /**
   * Pull-on-open reconcile (RESEARCH ## Pattern 3). For each shard whose manifest.updatedAt is
   * newer than the local watermark, pull + upsert into the repository (LWW: cloud wins). A
   * shard that is not newer is left alone — the local copy is newer and will be pushed.
   */
  async reconcileOnOpen(): Promise<void> {
    const manifest = await readManifest(this.provider, this.manifestFileId());
    const pulled: Partial<EntitySet> = {};

    for (const type of ENTITY_TYPES) {
      const pointer = manifest.shards[type];
      const localWatermark = await this.repo.getShardMeta(type);
      if (pointer.updatedAt <= localWatermark) continue; // local is newer-or-equal → keep local.

      const blob = await this.provider.readFile(pointer.fileId);
      const set = await deserializeShards({ [SHARD_NAMES[type]]: blob });
      // Per-type assignment keeps the discriminated EntitySet fields type-sound (a single
      // `pulled[type] = set[type]` would collapse the arrays to their union and fail tsc).
      if (type === 'people') pulled.people = set.people;
      else if (type === 'maps') pulled.maps = set.maps;
      else pulled.markers = set.markers;
    }

    if (Object.keys(pulled).length > 0) {
      await this.repo.upsert(pulled);
      for (const type of ENTITY_TYPES) {
        if (pulled[type]) await this.repo.setShardMeta(type, manifest.shards[type].updatedAt);
      }
    }
  }
}

/** Hex SHA-256 of a byte buffer (shard change-detection hash). */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---- Dexie-backed RepositoryPort ------------------------------------------------------------

/**
 * The production RepositoryPort over the Dexie store. Reads full entity sets / dirty types from
 * the tables, clears dirty flags on `markSynced`, and stores per-shard watermarks in `meta`.
 *
 * LWW on upsert: a pulled record overwrites the local one only when its `updatedAt` is newer,
 * so a locally-newer unpushed edit survives reconcile (single curator, newest wins).
 */
export function createDexieRepoPort(db: RelationBlueprintDB): RepositoryPort {
  const metaKey = (type: EntityType) => `shardMeta:${type}`;
  // Tracks which content-addressed media hashes have already been pushed to the cloud, so
  // `getNewMedia` only returns blobs the provider hasn't seen. Content addressing means the
  // upload is idempotent regardless, but skipping already-synced hashes avoids re-uploading
  // the entire media library on every push (matters as the gallery grows — STOR-04 / scale).
  const SYNCED_MEDIA_KEY = 'syncedMediaHashes';

  async function getSyncedMediaHashes(): Promise<Set<string>> {
    const row = await db.meta.get(SYNCED_MEDIA_KEY);
    return new Set(Array.isArray(row?.value) ? (row.value as string[]) : []);
  }

  return {
    async getEntities(): Promise<EntitySet> {
      const [people, maps, markers] = await Promise.all([
        db.people.toArray(),
        db.maps.toArray(),
        db.markers.toArray(),
      ]);
      return { people, maps, markers };
    },

    async getDirtyTypes(): Promise<EntityType[]> {
      const types: EntityType[] = [];
      // `dirty` is a boolean index column; IndexedDB can't key on booleans, so filter in JS.
      if ((await db.people.filter((p) => p.dirty).count()) > 0) types.push('people');
      if ((await db.maps.filter((m) => m.dirty).count()) > 0) types.push('maps');
      if ((await db.markers.filter((m) => m.dirty).count()) > 0) types.push('markers');
      return types;
    },

    async getNewMedia(): Promise<Record<string, Blob>> {
      // Return every stored media blob whose content hash has NOT yet been pushed to the
      // cloud. Media is content-addressed (Plan 04: the hash IS the cloud filename `media/<hash>`),
      // so the upload is idempotent; the synced-hash watermark just avoids re-sending blobs the
      // provider already has. After a successful commit `markSynced` records these hashes.
      const synced = await getSyncedMediaHashes();
      const records = await db.media.toArray();
      const out: Record<string, Blob> = {};
      for (const record of records) {
        if (synced.has(record.hash)) continue;
        out[record.hash] = new Blob([record.bytes], { type: record.mime });
      }
      return out;
    },

    async markSynced(): Promise<void> {
      // Snapshot the media hashes BEFORE the entity transaction so the synced-media watermark
      // reflects exactly what this commit pushed (getNewMedia ran against the same set).
      const allHashes = (await db.media.toArray()).map((m) => m.hash);
      await db.transaction('rw', db.people, db.maps, db.markers, db.meta, async () => {
        await db.people.filter((p) => p.dirty).modify({ dirty: false });
        await db.maps.filter((m) => m.dirty).modify({ dirty: false });
        await db.markers.filter((m) => m.dirty).modify({ dirty: false });
        // Union the previously-synced hashes with everything currently stored (this commit
        // uploaded any that were new). Content addressing makes the union safe and stable.
        const prior = await db.meta.get(SYNCED_MEDIA_KEY);
        const merged = new Set<string>(Array.isArray(prior?.value) ? (prior.value as string[]) : []);
        for (const hash of allHashes) merged.add(hash);
        await db.meta.put({ key: SYNCED_MEDIA_KEY, value: [...merged] });
      });
    },

    async upsert(entities: Partial<EntitySet>): Promise<void> {
      await db.transaction('rw', db.people, db.maps, db.markers, async () => {
        if (entities.people) {
          for (const incoming of entities.people) {
            const local = await db.people.get(incoming.id);
            if (!local || incoming.updatedAt > local.updatedAt) {
              await db.people.put({ ...incoming, dirty: false });
            }
          }
        }
        if (entities.maps) {
          for (const incoming of entities.maps) {
            const local = await db.maps.get(incoming.id);
            if (!local || incoming.updatedAt > local.updatedAt) {
              await db.maps.put({ ...incoming, dirty: false });
            }
          }
        }
        if (entities.markers) {
          for (const incoming of entities.markers) {
            const local = await db.markers.get(incoming.id);
            if (!local || incoming.updatedAt > local.updatedAt) {
              await db.markers.put({ ...incoming, dirty: false });
            }
          }
        }
      });
    },

    async getShardMeta(type: EntityType): Promise<number> {
      const row = await db.meta.get(metaKey(type));
      return typeof row?.value === 'number' ? row.value : 0;
    },

    async setShardMeta(type: EntityType, updatedAt: number): Promise<void> {
      await db.meta.put({ key: metaKey(type), value: updatedAt });
    },
  };
}

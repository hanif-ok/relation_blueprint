// A lightweight in-memory RepositoryPort for the atomicity property test. It lets the
// atomicity test assert "the reconstructed DB deep-equals the last committed set" against a
// plain object snapshot, without dragging Dexie/fake-indexeddb into the failure-injection
// loop. The reconcile test exercises the REAL Dexie-backed port (`createDexieRepoPort`).

import type { RepositoryPort } from '@/sync/syncEngine';
import type { EntitySet } from '@/sync/serializer';
import type { EntityType } from '@/domain/types';

export interface MemoryRepo extends RepositoryPort {
  /** Mark every entity dirty so the next push writes all shards. */
  markAllDirty(): void;
  /** True when no entity is dirty. */
  allClean(): boolean;
}

/** Build an in-memory port over a fixed entity set (clones so the test's seed is untouched). */
export function makeMemoryPort(seed: EntitySet): MemoryRepo {
  const set: EntitySet = structuredClone(seed);
  const shardMeta = new Map<EntityType, number>();

  return {
    async getEntities(): Promise<EntitySet> {
      return structuredClone(set);
    },
    async getDirtyTypes(): Promise<EntityType[]> {
      const types: EntityType[] = [];
      if (set.people.some((e) => e.dirty)) types.push('people');
      if (set.maps.some((e) => e.dirty)) types.push('maps');
      if (set.markers.some((e) => e.dirty)) types.push('markers');
      if (set.groups.some((e) => e.dirty)) types.push('groups');
      if (set.relationshipLinks.some((e) => e.dirty)) types.push('relationship-links');
      return types;
    },
    async getNewMedia(): Promise<Record<string, Blob>> {
      return {};
    },
    async markSynced(synced: EntitySet): Promise<void> {
      // Mirror the production port (CR-01): clear `dirty` only where the live record still
      // matches the serialized snapshot by (id, updatedAt). A record edited after the snapshot
      // has a newer updatedAt, so it stays dirty and is pushed on the next commit.
      const clearMatching = <T extends { id: string; updatedAt: number; dirty: boolean }>(
        live: T[],
        snap: T[],
      ) => {
        const snapBy = new Map(snap.map((e) => [e.id, e.updatedAt]));
        for (const e of live) {
          if (e.dirty && snapBy.get(e.id) === e.updatedAt) e.dirty = false;
        }
      };
      clearMatching(set.people, synced.people);
      clearMatching(set.maps, synced.maps);
      clearMatching(set.markers, synced.markers);
      clearMatching(set.groups, synced.groups);
      clearMatching(set.relationshipLinks, synced.relationshipLinks);
    },
    async upsert(incoming: Partial<EntitySet>): Promise<void> {
      if (incoming.people) set.people = structuredClone(incoming.people);
      if (incoming.maps) set.maps = structuredClone(incoming.maps);
      if (incoming.markers) set.markers = structuredClone(incoming.markers);
      if (incoming.groups) set.groups = structuredClone(incoming.groups);
      if (incoming.relationshipLinks) {
        set.relationshipLinks = structuredClone(incoming.relationshipLinks);
      }
    },
    async getShardMeta(type: EntityType): Promise<number> {
      return shardMeta.get(type) ?? 0;
    },
    async setShardMeta(type: EntityType, updatedAt: number): Promise<void> {
      shardMeta.set(type, updatedAt);
    },

    markAllDirty(): void {
      for (const e of set.people) e.dirty = true;
      for (const e of set.maps) e.dirty = true;
      for (const e of set.markers) e.dirty = true;
      for (const e of set.groups) e.dirty = true;
      for (const e of set.relationshipLinks) e.dirty = true;
    },
    allClean(): boolean {
      return (
        set.people.every((e) => !e.dirty) &&
        set.maps.every((e) => !e.dirty) &&
        set.markers.every((e) => !e.dirty) &&
        set.groups.every((e) => !e.dirty) &&
        set.relationshipLinks.every((e) => !e.dirty)
      );
    },
  };
}

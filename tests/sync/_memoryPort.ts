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
      return types;
    },
    async getNewMedia(): Promise<Record<string, Blob>> {
      return {};
    },
    async markSynced(): Promise<void> {
      for (const e of set.people) e.dirty = false;
      for (const e of set.maps) e.dirty = false;
      for (const e of set.markers) e.dirty = false;
    },
    async upsert(incoming: Partial<EntitySet>): Promise<void> {
      if (incoming.people) set.people = structuredClone(incoming.people);
      if (incoming.maps) set.maps = structuredClone(incoming.maps);
      if (incoming.markers) set.markers = structuredClone(incoming.markers);
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
    },
    allClean(): boolean {
      return (
        set.people.every((e) => !e.dirty) &&
        set.maps.every((e) => !e.dirty) &&
        set.markers.every((e) => !e.dirty)
      );
    },
  };
}

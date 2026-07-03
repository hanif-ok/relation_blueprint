// STOR-05 — the single highest-value test in the phase.
//
// The serverless model has exactly ONE durable copy of the database (the user's Drive). A
// commit interrupted by a crash / 401 / quota error / dropped network must NEVER corrupt it.
// This is the failure-injection property test: drive the real `SyncEngine` against an
// `InMemoryProvider` wrapped by `FaultInjectingProvider`, inject a fault at EVERY commit-step
// boundary in turn, and after each one assert:
//   1. the canonical manifest still points at the PREVIOUS shard file ids, AND
//   2. deserializing what the manifest points at deep-equals the last committed entity set.
// No partial commit, ever.

import { describe, expect, it } from 'vitest';
import { SyncEngine } from '@/sync/syncEngine';
import { deserializeShards, SHARD_NAMES } from '@/sync/serializer';
import { readManifest } from '@/sync/manifest';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import {
  FaultInjectingProvider,
  InjectedFailure,
  type StepLabel,
} from '../_fakes/faultInjectingProvider';
import type { EntitySet } from '@/sync/serializer';
import type { FieldDef, MapDoc, Manifest, Marker, Person } from '@/domain/types';
import { makeMemoryPort, type MemoryRepo } from './_memoryPort';

function person(id: string, name: string, updatedAt = 100): Person {
  return { id, name, tags: [], gallery: [], custom: {}, updatedAt, dirty: false };
}
function fieldDef(id: string, updatedAt = 100): FieldDef {
  return {
    id,
    entityType: 'people',
    label: `field-${id}`,
    type: 'text',
    required: false,
    order: 0,
    deleted: false,
    updatedAt,
    dirty: false,
  };
}
function map(id: string, updatedAt = 100): MapDoc {
  return {
    id,
    name: `map-${id}`,
    background: { hash: `bg-${id}`, mime: 'image/webp' },
    width: 100,
    height: 100,
    gallery: [],
    custom: {},
    shapes: [],
    layers: [],
    updatedAt,
    dirty: false,
  };
}
function marker(id: string, updatedAt = 100): Marker {
  return { id, mapId: 'm1', kind: 'person', personId: 'p1', x: 1, y: 2, updatedAt, dirty: false };
}

/**
 * Seed a provider with a committed v1 database (manifest + 3 shards) and return the engine,
 * the committed entity set, and helpers to inspect the canonical manifest.
 */
async function seedCommittedDatabase(provider: InMemoryProvider) {
  const folderId = await provider.ensureFolder('Relation Blueprint');
  const committed: EntitySet = {
    people: [person('p1', 'Alice')],
    maps: [map('m1')],
    markers: [marker('k1')],
    groups: [],
    relationshipLinks: [],
    // A custom-field DEFINITION participates in the committed set: STOR-05 atomicity must hold
    // for the field-defs shard exactly as it does for the entity shards.
    fieldDefs: [fieldDef('fd1')],
  };

  const port: MemoryRepo = makeMemoryPort(committed);
  const engine = new SyncEngine({ provider, folderId, repo: port });

  // First commit establishes the v1 manifest + shards. No fault here.
  await engine.bootstrap();
  port.markAllDirty(); // mark everything dirty so the first push writes all shards
  await engine.push();

  const manifestFileId = engine.manifestFileId();
  const v1 = await readManifest(provider, manifestFileId);
  return { folderId, committed, port, manifestFileId, v1Manifest: v1 };
}

describe('SyncEngine atomicity under failure injection (STOR-05)', () => {
  const STEPS: StepLabel[] = [
    'writeFile:shard',
    'writeFile:backup',
    'readFile:manifest',
    'overwriteFile:manifest',
  ];

  for (const step of STEPS) {
    it(`an injected failure at "${step}" leaves the last-good DB intact`, async () => {
      const inner = new InMemoryProvider();
      const { folderId, committed, manifestFileId, v1Manifest } = await seedCommittedDatabase(inner);

      // Wrap with a fault injector that throws at this step.
      const faulty = new FaultInjectingProvider(inner, { throwAt: new Set([step]) });

      // A fresh port carrying a MUTATED, dirty entity set we attempt (and fail) to commit.
      const mutated: EntitySet = {
        people: [person('p1', 'Alice RENAMED', 200), person('p2', 'Carol', 200)],
        maps: [map('m1', 200)],
        markers: [marker('k1', 200)],
        groups: [],
        relationshipLinks: [],
        fieldDefs: [fieldDef('fd1', 200), fieldDef('fd2', 200)],
      };
      const port = makeMemoryPort(mutated);
      port.markAllDirty();

      const engine = new SyncEngine({ provider: faulty, folderId, repo: port, manifestFileId });

      await expect(engine.push()).rejects.toBeInstanceOf(InjectedFailure);

      // 1. The canonical manifest still points at the PREVIOUS (v1) shard file ids.
      const after = await readManifest(inner, manifestFileId);
      expect(after.version).toBe(v1Manifest.version);
      expect(after.shards).toEqual(v1Manifest.shards);

      // 2. Deserializing what the manifest points at deep-equals the LAST COMMITTED set.
      const restored = await reconstructFromManifest(inner, after);
      expect(restored).toEqual(committed);

      // 3. Local dirty flags are NOT cleared — the push did not "succeed".
      expect(port.allClean()).toBe(false);
    });
  }

  it('a clean commit (no fault) advances the manifest and clears dirty', async () => {
    const inner = new InMemoryProvider();
    const { folderId, manifestFileId, v1Manifest } = await seedCommittedDatabase(inner);

    const mutated: EntitySet = {
      people: [person('p1', 'Alice v2', 300)],
      maps: [map('m1', 300)],
      markers: [marker('k1', 300)],
      groups: [],
      relationshipLinks: [],
      fieldDefs: [fieldDef('fd1', 300)],
    };
    const port = makeMemoryPort(mutated);
    port.markAllDirty();

    const engine = new SyncEngine({ provider: inner, folderId, repo: port, manifestFileId });
    await engine.push();

    const after = await readManifest(inner, manifestFileId);
    expect(after.version).toBe(v1Manifest.version + 1);
    expect(after.shards.people.fileId).not.toBe(v1Manifest.shards.people.fileId);

    const restored = await reconstructFromManifest(inner, after);
    expect(restored).toEqual(mutated);
    expect(port.allClean()).toBe(true);
  });
});

/** Reconstruct the entity set the manifest currently points at, via the provider. Reads the
 * field-defs shard too so the deep-equal covers the custom-field DEFINITIONS (STOR-05 with a
 * dirty FieldDef in the set). */
async function reconstructFromManifest(provider: InMemoryProvider, manifest: Manifest): Promise<EntitySet> {
  const shards: Record<string, Blob> = {
    [SHARD_NAMES.people]: await provider.readFile(manifest.shards.people.fileId),
    [SHARD_NAMES.maps]: await provider.readFile(manifest.shards.maps.fileId),
    [SHARD_NAMES.markers]: await provider.readFile(manifest.shards.markers.fileId),
  };
  // Post-Phase-1 shard pointers are OPTIONAL in the manifest type (older manifests omit them),
  // so read each only when present — mirroring the field-defs guard. Present in these tests.
  const groupsPointer = manifest.shards.groups;
  if (groupsPointer) shards[SHARD_NAMES.groups] = await provider.readFile(groupsPointer.fileId);
  const relPointer = manifest.shards['relationship-links'];
  if (relPointer) {
    shards[SHARD_NAMES['relationship-links']] = await provider.readFile(relPointer.fileId);
  }
  const fieldDefsPointer = manifest.shards['field-defs'];
  if (fieldDefsPointer) {
    shards[SHARD_NAMES.fieldDefs] = await provider.readFile(fieldDefsPointer.fileId);
  }
  return deserializeShards(shards);
}

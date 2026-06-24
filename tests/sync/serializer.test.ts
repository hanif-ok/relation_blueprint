// STOR-02 (Task 1): the sharded serializer round-trips entities losslessly into one shard
// file per type, and the manifest read path validates with zod (a malformed manifest is
// rejected so the engine can fall back to a backup). These are the two invariants the whole
// atomic-commit spine builds on: shards are immutable JSON, the manifest is the trusted index.

import { describe, expect, it } from 'vitest';
import { serializeShards, deserializeShards } from '@/sync/serializer';
import { readManifest, writeManifestWithBackup, rollBackups } from '@/sync/manifest';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import type { MapDoc, Manifest, Marker, Person } from '@/domain/types';

function person(id: string, name: string): Person {
  return { id, name, tags: ['a', 'b'], gallery: [], updatedAt: 100, dirty: false };
}
function map(id: string): MapDoc {
  return {
    id,
    name: `map-${id}`,
    background: { hash: `h-${id}`, mime: 'image/webp' },
    width: 800,
    height: 600,
    updatedAt: 100,
    dirty: false,
  };
}
function marker(id: string, mapId: string, personId: string): Marker {
  return { id, mapId, personId, x: 1, y: 2, updatedAt: 100, dirty: false };
}

async function textOf(blob: Blob): Promise<string> {
  return blob.text();
}

describe('serializeShards / deserializeShards (STOR-02)', () => {
  it('round-trips people/maps/markers exactly', async () => {
    const entities = {
      people: [person('p1', 'Alice'), person('p2', 'Bob')],
      maps: [map('m1')],
      markers: [marker('k1', 'm1', 'p1'), marker('k2', 'm1', 'p2')],
    };

    const shards = serializeShards(entities);
    const restored = await deserializeShards(shards);

    expect(restored).toEqual(entities);
  });

  it('names shards `people-000.json`, `maps-000.json`, `markers-000.json`', () => {
    const shards = serializeShards({ people: [person('p1', 'Alice')], maps: [], markers: [] });
    expect(Object.keys(shards).sort()).toEqual([
      'maps-000.json',
      'markers-000.json',
      'people-000.json',
    ]);
    for (const blob of Object.values(shards)) {
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toContain('json');
    }
  });

  it('serializes shard bodies as JSON arrays of the entity type', async () => {
    const shards = serializeShards({ people: [person('p1', 'Alice')], maps: [], markers: [] });
    const parsed = JSON.parse(await textOf(shards['people-000.json']));
    expect(parsed).toEqual([person('p1', 'Alice')]);
  });

  it('deserializes empty shards to empty arrays', async () => {
    const shards = serializeShards({ people: [], maps: [], markers: [] });
    expect(await deserializeShards(shards)).toEqual({ people: [], maps: [], markers: [] });
  });
});

describe('readManifest (zod-validated, STOR-02 / T-05-02)', () => {
  async function seedManifest(provider: InMemoryProvider, folderId: string, body: unknown): Promise<string> {
    return provider.writeFile(
      'manifest.json',
      folderId,
      new Blob([JSON.stringify(body)], { type: 'application/json' }),
      'application/json',
    );
  }

  function goodManifest(): Manifest {
    return {
      version: 1,
      updatedAt: 100,
      shards: {
        people: { fileId: 'f-people', hash: 'hp', updatedAt: 100 },
        maps: { fileId: 'f-maps', hash: 'hm', updatedAt: 100 },
        markers: { fileId: 'f-markers', hash: 'hk', updatedAt: 100 },
      },
      backups: [],
    };
  }

  it('parses and returns a valid manifest', async () => {
    const provider = new InMemoryProvider();
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await seedManifest(provider, folder, goodManifest());
    const manifest = await readManifest(provider, id);
    expect(manifest).toEqual(goodManifest());
  });

  it('rejects a manifest missing a shard pointer', async () => {
    const provider = new InMemoryProvider();
    const folder = await provider.ensureFolder('Relation Blueprint');
    const broken = goodManifest() as unknown as Record<string, unknown>;
    delete (broken.shards as Record<string, unknown>).markers;
    const id = await seedManifest(provider, folder, broken);
    await expect(readManifest(provider, id)).rejects.toThrow();
  });

  it('rejects a syntactically invalid manifest', async () => {
    const provider = new InMemoryProvider();
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile(
      'manifest.json',
      folder,
      new Blob(['not json{'], { type: 'application/json' }),
      'application/json',
    );
    await expect(readManifest(provider, id)).rejects.toThrow();
  });
});

describe('writeManifestWithBackup + rollBackups (rolling backup before commit)', () => {
  function manifestAt(version: number): Manifest {
    return {
      version,
      updatedAt: version,
      shards: {
        people: { fileId: 'f-people', hash: 'hp', updatedAt: version },
        maps: { fileId: 'f-maps', hash: 'hm', updatedAt: version },
        markers: { fileId: 'f-markers', hash: 'hk', updatedAt: version },
      },
      backups: [],
    };
  }

  it('copies the current manifest to backups/manifest-<prevVersion>.json before overwriting', async () => {
    const provider = new InMemoryProvider();
    const folder = await provider.ensureFolder('Relation Blueprint');
    const manifestId = await provider.writeFile(
      'manifest.json',
      folder,
      new Blob([JSON.stringify(manifestAt(1))], { type: 'application/json' }),
      'application/json',
    );

    await writeManifestWithBackup(provider, folder, manifestId, manifestAt(2));

    // The canonical manifest now holds version 2.
    expect((await readManifest(provider, manifestId)).version).toBe(2);

    // A backup file for the previous version exists in backups/.
    const backupsFolder = await provider.ensureFolder('backups', folder);
    const backupEntries = await provider.list(backupsFolder);
    const names = backupEntries.map((e) => e.name);
    expect(names).toContain('manifest-1.json');
  });

  it('rollBackups keeps only the last N backups (newest by version)', async () => {
    const provider = new InMemoryProvider();
    const folder = await provider.ensureFolder('Relation Blueprint');
    const manifestId = await provider.writeFile(
      'manifest.json',
      folder,
      new Blob([JSON.stringify(manifestAt(1))], { type: 'application/json' }),
      'application/json',
    );

    // Commit versions 2..8 — that produces backups manifest-1 .. manifest-7.
    for (let v = 2; v <= 8; v++) {
      await writeManifestWithBackup(provider, folder, manifestId, manifestAt(v));
      await rollBackups(provider, folder, 5);
    }

    const backupsFolder = await provider.ensureFolder('backups', folder);
    const names = (await provider.list(backupsFolder)).map((e) => e.name).sort();
    expect(names.length).toBe(5);
    // Oldest (manifest-1, manifest-2) GC'd; newest 5 retained.
    expect(names).toContain('manifest-7.json');
    expect(names).not.toContain('manifest-1.json');
    expect(names).not.toContain('manifest-2.json');
  });
});

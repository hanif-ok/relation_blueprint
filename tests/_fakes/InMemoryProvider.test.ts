// Conformance test that LOCKS the StorageProvider interface against the InMemoryProvider
// fake. Plan 05's sync engine and Plan 06's Drive adapter rely on exactly these semantics:
//   - ensureFolder is idempotent (same name+parent -> same id)
//   - writeFile creates a NEW id each call (immutable-new-file)
//   - overwriteFile replaces content at a FIXED id (the manifest commit point)
//   - readFile round-trips the written bytes
//   - list returns written entries; delete removes them; stat reports size/modifiedAt

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';
import type { StorageProvider } from '@/storage/StorageProvider';

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('InMemoryProvider conformance (StorageProvider interface lock)', () => {
  let provider: StorageProvider;

  beforeEach(() => {
    provider = new InMemoryProvider();
  });

  it('ensureFolder is idempotent — same name+parent returns the same id', async () => {
    const a = await provider.ensureFolder('Relation Blueprint');
    const b = await provider.ensureFolder('Relation Blueprint');
    expect(a).toBe(b);
  });

  it('ensureFolder distinguishes folders by name and parent', async () => {
    const root = await provider.ensureFolder('Relation Blueprint');
    const childA = await provider.ensureFolder('entities', root);
    const childB = await provider.ensureFolder('media', root);
    expect(childA).not.toBe(childB);
    expect(childA).not.toBe(root);
  });

  it('writeFile returns a NEW distinct id on every call (immutable-new-file)', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id1 = await provider.writeFile('people-000.json', folder, new Blob(['v1']), 'application/json');
    const id2 = await provider.writeFile('people-000.json', folder, new Blob(['v2']), 'application/json');
    expect(id1).not.toBe(id2);
  });

  it('readFile round-trips the exact bytes written', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const payload = new Uint8Array([1, 2, 3, 250, 255]);
    const id = await provider.writeFile('blob', folder, new Blob([payload]), 'application/octet-stream');
    expect(await bytesOf(await provider.readFile(id))).toEqual(payload);
  });

  it('overwriteFile replaces content in place at a fixed id', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile('manifest.json', folder, new Blob(['v1']), 'application/json');
    await provider.overwriteFile(id, new Blob(['v2']), 'application/json');
    expect(await (await provider.readFile(id)).text()).toBe('v2');
  });

  it('list returns the files written into a folder', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    await provider.writeFile('a.json', folder, new Blob(['a']), 'application/json');
    await provider.writeFile('b.json', folder, new Blob(['bb']), 'application/json');
    const names = (await provider.list(folder)).map((e) => e.name).sort();
    expect(names).toEqual(['a.json', 'b.json']);
  });

  it('delete removes a file so it no longer lists', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile('gone.json', folder, new Blob(['x']), 'application/json');
    await provider.delete(id);
    expect((await provider.list(folder)).some((e) => e.id === id)).toBe(false);
  });

  it('stat reports the size and a modifiedAt for a file', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile('sized', folder, new Blob(['abcde']), 'text/plain');
    const entry = await provider.stat(id);
    expect(entry.size).toBe(5);
    expect(typeof entry.modifiedAt).toBe('number');
  });
});

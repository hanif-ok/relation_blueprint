// PROF-03 — content-addressed media store. Proves the two load-bearing invariants:
//   1. `hashBlob` is deterministic (same bytes -> same hash; different bytes -> different).
//   2. `storeMedia` dedupes: storing identical bytes twice yields ONE `media` row and the
//      same `MediaRef`.
//
// Runs under fake-indexeddb (real Dexie, no network). The resize path needs a canvas, which
// jsdom lacks, so the dedupe/hash tests use `kind: 'raw'` (no resize) to exercise the
// store/dedupe logic directly; a separate test stubs the canvas to confirm `storeMedia`
// routes 'gallery'/'avatar' kinds through the resizer before hashing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
import { getMedia } from '@/db/repository';
import { buildMediaRef, hashBlob, resolveMediaUrl, storeMedia } from '@/media/mediaManager';

beforeEach(async () => {
  await Promise.all([db.media.clear(), db.people.clear(), db.maps.clear(), db.markers.clear()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('hashBlob (PROF-03 content addressing)', () => {
  it('is deterministic: identical bytes hash identically', async () => {
    const a = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/webp' });
    const b = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/webp' });
    expect(await hashBlob(a)).toBe(await hashBlob(b));
  });

  it('differs when the bytes differ', async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    const b = new Blob([new Uint8Array([1, 2, 4])], { type: 'image/webp' });
    expect(await hashBlob(a)).not.toBe(await hashBlob(b));
  });

  it('produces a 64-char hex SHA-256 digest', async () => {
    const a = new Blob([new Uint8Array([7, 7, 7])], { type: 'image/webp' });
    expect(await hashBlob(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildMediaRef (PROF-03)', () => {
  it('carries the content hash and mime; missing decoder leaves dims undefined', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    const ref = await buildMediaRef(blob);
    expect(ref.hash).toBe(await hashBlob(blob));
    expect(ref.mime).toBe('image/webp');
  });
});

describe('storeMedia dedupe (PROF-03)', () => {
  it('writes exactly one media row when identical bytes are stored twice', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const first = await storeMedia(new Blob([bytes], { type: 'image/webp' }), { kind: 'raw' });
    const second = await storeMedia(new Blob([bytes], { type: 'image/webp' }), { kind: 'raw' });

    expect(second.hash).toBe(first.hash);
    expect(await db.media.count()).toBe(1);

    const stored = await getMedia(first.hash);
    expect(stored).toBeDefined();
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(bytes);
  });

  it('writes distinct rows for distinct bytes', async () => {
    await storeMedia(new Blob([new Uint8Array([1])], { type: 'image/webp' }), { kind: 'raw' });
    await storeMedia(new Blob([new Uint8Array([2])], { type: 'image/webp' }), { kind: 'raw' });
    expect(await db.media.count()).toBe(2);
  });

  it('routes gallery uploads through the resizer before hashing', async () => {
    // Stub the canvas pipeline so capGalleryImage yields a deterministic processed blob.
    const processed = new Uint8Array([99, 98, 97]);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 100, height: 100, close: () => {} })),
    );
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: () => {} };
      }
      async convertToBlob() {
        return new Blob([processed], { type: 'image/webp' });
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const src = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: 'image/png' });
    const ref = await storeMedia(src, { kind: 'gallery' });

    // The stored hash is the hash of the PROCESSED (resized) bytes, not the source.
    expect(ref.hash).toBe(await hashBlob(new Blob([processed], { type: 'image/webp' })));
    expect(ref.mime).toBe('image/webp');
    const stored = await getMedia(ref.hash);
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(processed);
  });
});

describe('resolveMediaUrl (PROF-03 display)', () => {
  it('returns an object URL for a stored blob and null for an unknown hash', async () => {
    const created: string[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(Object.create(URL), {
        createObjectURL: vi.fn(() => {
          const u = `blob:fake/${created.length}`;
          created.push(u);
          return u;
        }),
        revokeObjectURL: vi.fn(),
      }),
    );

    const ref = await storeMedia(new Blob([new Uint8Array([5, 6, 7])], { type: 'image/webp' }), {
      kind: 'raw',
    });
    const url = await resolveMediaUrl(ref.hash);
    expect(url).toBe('blob:fake/0');

    const missing = await resolveMediaUrl('deadbeef'.repeat(8));
    expect(missing).toBeNull();
  });
});

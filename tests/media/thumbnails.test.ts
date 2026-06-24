// PROF-02 — client-side thumbnailing. `makeThumbnail` must return a square WebP Blob at the
// requested size, and `capGalleryImage` must downscale oversized images (preserving aspect)
// while leaving small images within the cap.
//
// jsdom has no `OffscreenCanvas` / `createImageBitmap` / `convertToBlob`, so this suite
// installs a minimal deterministic polyfill that records the canvas dimensions it was asked
// to produce. We assert on those recorded dimensions + the encoded MIME type — that is
// exactly the behaviour the module is responsible for (decode -> size a canvas -> encode webp).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capGalleryImage, makeThumbnail } from '@/media/thumbnails';

interface FakeBitmap {
  width: number;
  height: number;
  close: () => void;
}

/** Last canvas the polyfill created, so tests can read back its requested dimensions. */
let lastCanvas: { width: number; height: number } | null = null;

function installCanvasPolyfill(srcWidth: number, srcHeight: number): void {
  lastCanvas = null;

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      async (): Promise<FakeBitmap> => ({
        width: srcWidth,
        height: srcHeight,
        close: () => {},
      }),
    ),
  );

  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      lastCanvas = { width: w, height: h };
    }
    getContext() {
      return { drawImage: () => {} };
    }
    async convertToBlob(opts?: { type?: string }): Promise<Blob> {
      // Encode a tiny non-empty payload tagged with the requested MIME type.
      return new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: opts?.type ?? 'image/png',
      });
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
}

beforeEach(() => {
  // A non-empty source blob; the polyfill ignores its bytes and uses the stubbed dimensions.
  installCanvasPolyfill(800, 600);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('makeThumbnail (PROF-02 avatar)', () => {
  it('returns a square WebP Blob at the requested size', async () => {
    const src = new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' });
    const thumb = await makeThumbnail(src, 96);

    expect(thumb).toBeInstanceOf(Blob);
    expect(thumb.type).toBe('image/webp');
    expect(lastCanvas).toEqual({ width: 96, height: 96 });
  });

  it('honours a custom size and stays square', async () => {
    const src = new Blob([new Uint8Array([9])], { type: 'image/png' });
    await makeThumbnail(src, 48);
    expect(lastCanvas).toEqual({ width: 48, height: 48 });
  });
});

describe('capGalleryImage (PROF-02 gallery cap)', () => {
  it('downscales an oversized image so the longest edge equals the cap, preserving aspect', async () => {
    installCanvasPolyfill(3200, 2400); // 4:3, longest edge 3200
    const src = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const out = await capGalleryImage(src, 1600);

    expect(out.type).toBe('image/webp');
    // 3200 -> 1600 (scale 0.5); 2400 -> 1200. Aspect preserved.
    expect(lastCanvas).toEqual({ width: 1600, height: 1200 });
  });

  it('does not upscale an image already within the cap', async () => {
    installCanvasPolyfill(800, 600);
    const src = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await capGalleryImage(src, 1600);
    expect(lastCanvas).toEqual({ width: 800, height: 600 });
  });
});

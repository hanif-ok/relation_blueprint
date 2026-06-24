// Client-side image resizing — turns an uploaded photo into the two sizes the app stores:
// a small square avatar thumbnail (round-cropped at render time) and a gallery-size cap.
//
// All work happens IN THE BROWSER (no server, no paid service): `createImageBitmap` decodes
// the bytes, an `OffscreenCanvas` resizes them, and `convertToBlob` re-encodes to WebP.
// WebP keeps the avatar tiny (bounds IndexedDB + Drive quota — threat T-04-01) while staying
// lossless-enough at quality 0.8 for a 96px avatar.

/** WebP quality used for both the avatar thumbnail and the gallery cap. */
const WEBP_QUALITY = 0.8;

/**
 * Decode a Blob to an ImageBitmap. Centralised so the (rare) decode-failure path — a
 * corrupt or non-image upload — surfaces one clear error instead of a canvas exception.
 */
async function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/** Encode an OffscreenCanvas to a WebP Blob at the shared quality. */
async function encodeWebp(canvas: OffscreenCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
}

/**
 * Produce a square WebP avatar thumbnail of `size`x`size` from `file`, centre-cropping the
 * source to a square first so the subject stays centred (the marker + profile header crop
 * this to a circle at render time). Default 96px covers the 48px @2x marker avatar.
 */
export async function makeThumbnail(file: Blob, size = 96): Promise<Blob> {
  const bmp = await decode(file);
  try {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('makeThumbnail: 2D canvas context unavailable');
    // Centre-crop the source to its largest inscribed square, then scale to `size`.
    const edge = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width - edge) / 2;
    const sy = (bmp.height - edge) / 2;
    ctx.drawImage(bmp, sx, sy, edge, edge, 0, 0, size, size);
    return await encodeWebp(canvas);
  } finally {
    bmp.close();
  }
}

/**
 * Downscale `file` so its longest edge is at most `maxEdge`, preserving aspect ratio, and
 * re-encode to WebP. Images already within the cap are still re-encoded to WebP so the
 * gallery stores one consistent, quota-friendly format. Bounds memory/quota growth from
 * oversized uploads (threat T-04-01).
 */
export async function capGalleryImage(file: Blob, maxEdge = 1600): Promise<Blob> {
  const bmp = await decode(file);
  try {
    const longest = Math.max(bmp.width, bmp.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const width = Math.max(1, Math.round(bmp.width * scale));
    const height = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('capGalleryImage: 2D canvas context unavailable');
    ctx.drawImage(bmp, 0, 0, width, height);
    return await encodeWebp(canvas);
  } finally {
    bmp.close();
  }
}

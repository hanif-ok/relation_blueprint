// mediaManager — the content-addressed media pipeline that sits between an uploaded photo
// and the Dexie `media` table. It is the ONLY path the UI uses to persist a photo.
//
// What it guarantees:
//   1. CONTENT ADDRESSING — a blob's storage identity is the SHA-256 of its bytes
//      (`hashBlob`). Identical bytes always hash identically, so re-uploading the same
//      image is idempotent and never creates a second row (dedupe). This hash is the
//      filename the Plan 05 sync engine writes to Drive as `media/<hash>` — it is a
//      cross-plan contract.
//   2. CLIENT-SIDE RESIZE — `storeMedia` caps gallery images and (optionally) thumbnails
//      before hashing, so what we hash + store is already quota-friendly (threat T-04-01).
//   3. NO BASE64 IN ENTITY JSON — blobs live unindexed in the `media` table keyed by hash;
//      entities carry only a `MediaRef` (hash + mime + dims) (RESEARCH Anti-Pattern).
//
// Algorithm note: hashing happens AFTER any resize/re-encode, so the stored bytes and the
// hash always match. `storeMedia` checks `getMedia(hash)` first and skips the write when the
// blob already exists — that is the dedupe.

import { getMedia, putMedia } from '@/db/repository';
import { capGalleryImage, makeThumbnail } from './thumbnails';
import type { MediaRef } from '@/domain/types';

/** Hex-encode the SHA-256 digest of a byte buffer via the platform WebCrypto. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stable content hash of a Blob's bytes. Identical bytes -> identical hash; any difference
 * in the bytes -> a different hash. This is the dedupe identity and the cloud filename.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}

/**
 * Best-effort intrinsic dimensions for a Blob. Uses `createImageBitmap` when available
 * (browsers) and degrades to `undefined` dimensions when the environment lacks it
 * (e.g. a bare node test runner) — dimensions are an optimisation, never a correctness
 * requirement, so a missing decoder must not break storage.
 */
async function decodeDimensions(
  blob: Blob,
): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap !== 'function') return {};
  try {
    const bmp = await createImageBitmap(blob);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return {};
  }
}

/**
 * Build the `MediaRef` an entity stores for a blob: its content hash, MIME type, and
 * (when decodable) intrinsic pixel dimensions. Does NOT persist — see `storeMedia`.
 */
export async function buildMediaRef(blob: Blob): Promise<MediaRef> {
  const [hash, dims] = await Promise.all([hashBlob(blob), decodeDimensions(blob)]);
  return {
    hash,
    mime: blob.type || 'application/octet-stream',
    width: dims.width,
    height: dims.height,
  };
}

/** Longest-edge cap (px) for a map background — larger than a gallery image so floor plans /
 * site photos stay legible, while still bounding IndexedDB + Drive quota (WR-06 / T-04-01). */
const MAP_MAX_EDGE = 4096;

/** How `storeMedia` should pre-process the bytes before hashing + storing. */
export interface StoreMediaOptions {
  /**
   * `'gallery'` (default) caps the longest edge for a full gallery image; `'map'` caps at a
   * larger edge for a map background (keeps detail, still quota-bounded); `'avatar'` produces a
   * small square thumbnail; `'raw'` stores the bytes as-is (already-processed/non-photo asset).
   */
  kind?: 'gallery' | 'map' | 'avatar' | 'raw';
}

/**
 * Resize per `kind`, hash the resulting bytes, and persist via the repository — but only
 * if the content hash is not already present (dedupe). Returns the `MediaRef` the caller
 * stores on the entity. Storing identical source bytes twice yields the same ref and
 * exactly one `media` row.
 */
export async function storeMedia(
  blob: Blob,
  options: StoreMediaOptions = {},
): Promise<MediaRef> {
  const kind = options.kind ?? 'gallery';
  let processed: Blob;
  if (kind === 'avatar') {
    processed = await makeThumbnail(blob);
  } else if (kind === 'gallery') {
    processed = await capGalleryImage(blob);
  } else if (kind === 'map') {
    processed = await capGalleryImage(blob, MAP_MAX_EDGE);
  } else {
    processed = blob;
  }

  const ref = await buildMediaRef(processed);
  // Dedupe: content addressing means an identical blob is already the same row.
  const existing = await getMedia(ref.hash);
  if (!existing) {
    await putMedia(ref, processed);
  }
  return ref;
}

/**
 * Resolve a stored media hash to an object URL for display, or `null` when the hash is
 * unknown. Callers OWN the returned URL and MUST `URL.revokeObjectURL` it on unmount to
 * avoid leaking (prohibition: no object-URL leaks).
 */
export async function resolveMediaUrl(hash: string): Promise<string | null> {
  const blob = await getMedia(hash);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

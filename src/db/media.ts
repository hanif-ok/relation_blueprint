// Content-addressed media helper — turns an uploaded Blob into a stored MediaRef.
//
// Photos and map backgrounds are NEVER base64-embedded in entity JSON (ARCHITECTURE
// Anti-Pattern 2). They live as separate blobs in the `media` table keyed by the
// SHA-256 of their bytes, which makes storage idempotent and auto-deduped: the same
// image uploaded twice produces the same hash and is written once.

import { putMedia } from './repository';
import type { MediaRef } from '@/domain/types';

/** Hex-encode the SHA-256 digest of a byte buffer using the platform WebCrypto. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash a Blob, persist it via the repository, and return the MediaRef that entities
 * (Person.photo, MapDoc.background) store. Optional intrinsic dimensions are kept on
 * the ref so consumers can size the image without re-decoding.
 */
export async function storeMedia(
  blob: Blob,
  dimensions?: { width?: number; height?: number },
): Promise<MediaRef> {
  const bytes = await blob.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const ref: MediaRef = {
    hash,
    mime: blob.type || 'application/octet-stream',
    width: dimensions?.width,
    height: dimensions?.height,
  };
  await putMedia(ref, blob);
  return ref;
}

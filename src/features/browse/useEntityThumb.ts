// useEntityThumb — resolve a browse row's thumbnail to an object URL, leak-safe.
//
// Given an entity's primary `photo` ref OR its first `gallery` photo (D-21: the first gallery
// photo acts as a thumbnail when there's no avatar), resolve a displayable object URL via
// `resolveMediaUrl` and revoke it on hash-change/unmount. This mirrors PhotoGallery's
// `useMediaUrl` exactly — we do NOT roll a third object-URL lifecycle (02-PATTERNS prohibition).

import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '@/media/mediaManager';
import type { MediaRef } from '@/domain/types';

/**
 * Pick the hash a row should show: the avatar `photo` first, else the first `gallery` photo
 * (D-21), else `undefined` (the caller renders initials/glyph).
 */
function pickThumbHash(photo: MediaRef | undefined, gallery: MediaRef[]): string | undefined {
  if (photo) return photo.hash;
  if (gallery.length > 0) return gallery[0].hash;
  return undefined;
}

/**
 * Resolve a row thumbnail object URL (or `null` while loading / when there is no media).
 * Revokes the URL on hash-change and on unmount so a long, scrolled list never leaks
 * object URLs (threat T-03-04).
 */
export function useEntityThumb(
  photo: MediaRef | undefined,
  gallery: MediaRef[],
): string | null {
  const hash = pickThumbHash(photo, gallery);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    void Promise.resolve(hash ? resolveMediaUrl(hash) : null).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      current = u;
      setUrl(u);
    });
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [hash]);

  return url;
}

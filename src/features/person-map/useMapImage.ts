// useMapImage — decodes a stored media Blob (the map background or an avatar photo) into
// an HTMLImageElement that Konva's <Image> can paint. Konva needs a real, fully-decoded
// HTMLImageElement; this hook owns the object-URL lifecycle so callers never leak.

import { useEffect, useState } from 'react';
import { getMedia } from '@/db/repository';

/**
 * Decode a Blob to an HTMLImageElement for Konva. Returns `null` until the image has
 * loaded. The object URL is revoked on cleanup / when the blob changes.
 */
export function useBlobImage(blob: Blob | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!blob) {
      setImage(null);
      return;
    }
    let revoked = false;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      if (!revoked) setImage(img);
    };
    img.onerror = () => {
      if (!revoked) setImage(null);
    };
    img.src = url;
    return () => {
      revoked = true;
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return image;
}

/**
 * Load a media blob by content hash and decode it to an HTMLImageElement for Konva.
 * Returns `null` while loading or when the hash is absent.
 */
export function useMapImage(hash: string | undefined): HTMLImageElement | null {
  const [blob, setBlob] = useState<Blob | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!hash) {
      setBlob(undefined);
      return;
    }
    void getMedia(hash).then((b) => {
      if (!cancelled) setBlob(b);
    });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  return useBlobImage(blob);
}

// PhotoUpload — the Photo control inside PersonForm (UI-SPEC S3). Two upload affordances:
//   * Avatar: a single round preview that sets `Person.photo` (thumbnailed to a square webp).
//   * Gallery: a multi-photo "Add photos" control that appends to `Person.gallery`.
//
// Every selected file goes through `mediaManager.storeMedia`, which thumbnails/caps, hashes,
// and dedupes before persisting — so identical bytes never create a duplicate media row.
// While a thumbnail generates we show the UI-SPEC processing shimmer; the form stays
// submittable throughout (photo is optional). Object URLs for previews are revoked on
// change/unmount so nothing leaks.

import { useEffect, useState } from 'react';
import { resolveMediaUrl, storeMedia } from '@/media/mediaManager';
import type { MediaRef } from '@/domain/types';
import styles from './PhotoUpload.module.css';

export interface PhotoUploadProps {
  /** Current avatar ref (Person.photo), or undefined. */
  photo?: MediaRef;
  /** Current gallery refs (Person.gallery). */
  gallery: MediaRef[];
  onPhotoChange: (photo: MediaRef | undefined) => void;
  onGalleryChange: (gallery: MediaRef[]) => void;
}

/** Resolve a media hash to an object URL, revoking it on change/unmount (no leaks). */
function useMediaUrl(hash: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    // Resolve (or clear, for an absent hash) asynchronously so the effect never calls
    // setState synchronously in its body. The resolver yields null for an unknown/absent hash.
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

/** A single gallery thumbnail tile with a remove button. */
function GalleryTile({ photo, onRemove }: { photo: MediaRef; onRemove: () => void }) {
  const url = useMediaUrl(photo.hash);
  return (
    <span className={styles.tile}>
      {url ? (
        <img src={url} alt="" className={styles.tileImg} />
      ) : (
        <span className={styles.tileShimmer} aria-hidden="true" />
      )}
      <button
        type="button"
        className={styles.tileRemove}
        aria-label="Remove photo"
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
}

export function PhotoUpload({
  photo,
  gallery,
  onPhotoChange,
  onGalleryChange,
}: PhotoUploadProps) {
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const avatarUrl = useMediaUrl(photo?.hash);

  async function handleAvatar(file: File) {
    setAvatarBusy(true);
    try {
      const ref = await storeMedia(file, { kind: 'avatar' });
      onPhotoChange(ref);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleGallery(files: FileList) {
    setGalleryBusy(true);
    try {
      const refs = await Promise.all(
        Array.from(files).map((f) => storeMedia(f, { kind: 'gallery' })),
      );
      // Dedupe by hash against what's already on the person's gallery.
      const seen = new Set(gallery.map((r) => r.hash));
      const additions = refs.filter((r) => !seen.has(r.hash) && (seen.add(r.hash), true));
      onGalleryChange([...gallery, ...additions]);
    } finally {
      setGalleryBusy(false);
    }
  }

  function removeGalleryAt(hash: string) {
    onGalleryChange(gallery.filter((r) => r.hash !== hash));
  }

  return (
    <div className={styles.root}>
      <div className={styles.avatarRow}>
        <span className={styles.avatarPreview} data-busy={avatarBusy || undefined}>
          {avatarBusy ? (
            <span className={styles.avatarShimmer} aria-hidden="true" />
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="" className={styles.avatarImg} />
          ) : (
            <span className={styles.avatarPlaceholder} aria-hidden="true" />
          )}
        </span>
        <label className={styles.uploadLabel}>
          {photo ? 'Change avatar' : 'Upload avatar'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.hiddenInput}
            data-testid="person-photo-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatar(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className={styles.galleryBlock}>
        <div className={styles.galleryGrid} data-testid="form-gallery">
          {gallery.map((item) => (
            <GalleryTile
              key={item.hash}
              photo={item}
              onRemove={() => removeGalleryAt(item.hash)}
            />
          ))}
          {galleryBusy && <span className={styles.tile} aria-hidden="true">
            <span className={styles.tileShimmer} />
          </span>}
        </div>
        <label className={styles.uploadLabel}>
          Add photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className={styles.hiddenInput}
            data-testid="person-gallery-input"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) void handleGallery(files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}

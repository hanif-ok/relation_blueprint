// PhotoUpload — the Photo control inside PersonForm (UI-SPEC S3). Two upload affordances:
//   * Avatar: a single round preview that sets `Person.photo` (thumbnailed to a square webp).
//   * Gallery: a multi-photo "Add photos" control that appends to `Person.gallery`.
//
// Every selected file goes through `mediaManager.storeMedia`, which thumbnails/caps, hashes,
// and dedupes before persisting — so identical bytes never create a duplicate media row.
// While a thumbnail generates we show the UI-SPEC processing shimmer; the form stays
// submittable throughout (photo is optional). Object URLs for previews are revoked on
// change/unmount so nothing leaks.
//
// Gallery reorder (S19, D-21): tiles can be reordered by drag (HTML5 drag events — no heavy DnD
// library) OR by keyboard (Space pick up / arrow move / Space drop / Esc cancel), with each move
// announced via an aria-live region. Reorder mutates the `gallery: MediaRef[]` ORDER and calls
// onGalleryChange — the order IS the data and persists through the entity update path. The FIRST
// tile is badged "Thumbnail" since the first gallery photo acts as the entity thumbnail.

import { useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';
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

/** Move the item at `from` to `to`, returning a new array (immutably). */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface GalleryTileProps {
  photo: MediaRef;
  index: number;
  total: number;
  isFirst: boolean;
  /** True while THIS tile is the keyboard-picked-up tile (grabbed). */
  grabbed: boolean;
  /** True while THIS tile is the drag-in-flight source (lifted). */
  dragging: boolean;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  /** Keyboard reorder on the handle: Space pick/drop, arrows move, Esc cancel. */
  onHandleKeyDown: (e: React.KeyboardEvent) => void;
}

/** A single gallery thumbnail tile with a drag handle, remove button, and (first) Thumbnail badge. */
function GalleryTile({
  photo,
  index,
  total,
  isFirst,
  grabbed,
  dragging,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHandleKeyDown,
}: GalleryTileProps) {
  const url = useMediaUrl(photo.hash);
  // Only multi-photo galleries get a reorder affordance (S19: single photo = no reorder).
  const reorderable = total > 1;
  return (
    <span
      className={styles.tile}
      data-dragging={dragging || undefined}
      data-grabbed={grabbed || undefined}
      draggable={reorderable}
      onDragStart={(e) => {
        if (!reorderable) return;
        // A payload is required for a drag to start in some browsers.
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!reorderable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver();
      }}
      onDrop={(e) => {
        if (!reorderable) return;
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      {url ? (
        <img src={url} alt="" className={styles.tileImg} />
      ) : (
        <span className={styles.tileShimmer} aria-hidden="true" />
      )}

      {isFirst && (
        <span className={styles.thumbnailBadge} data-testid="gallery-thumbnail-badge">
          Thumbnail
        </span>
      )}

      {reorderable && (
        <button
          type="button"
          className={styles.tileHandle}
          aria-label={
            grabbed
              ? `Photo ${index + 1} of ${total}, picked up. Use arrow keys to move, Space to drop, Escape to cancel.`
              : `Reorder photo ${index + 1} of ${total}. Press Space to pick up.`
          }
          aria-pressed={grabbed}
          data-testid="gallery-handle"
          onKeyDown={onHandleKeyDown}
        >
          <GripVertical size={16} strokeWidth={2} aria-hidden="true" />
        </button>
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
  // Drag-in-flight source index (HTML5 drag), or null when not dragging.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Keyboard-grabbed tile index (Space-pickup), or null when nothing is grabbed.
  const [grabbedIndex, setGrabbedIndex] = useState<number | null>(null);
  // Live announcement for keyboard reorder moves (aria-live, U10).
  const [announce, setAnnounce] = useState('');

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

  /** Commit a reorder: move `from` → `to`, persist the new order, and announce it (S19). */
  function commitMove(from: number, to: number) {
    if (from === to || to < 0 || to >= gallery.length) return;
    onGalleryChange(moveItem(gallery, from, to));
    setAnnounce(`Moved photo to position ${to + 1} of ${gallery.length}.`);
  }

  /** Keyboard reorder on a tile's handle (Space pick/drop, arrows move, Esc cancel) — U10. */
  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (grabbedIndex === null) {
        setGrabbedIndex(index);
        setAnnounce(`Picked up photo ${index + 1} of ${gallery.length}. Use arrow keys to move.`);
      } else {
        setGrabbedIndex(null);
        setAnnounce(`Dropped photo at position ${index + 1} of ${gallery.length}.`);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (grabbedIndex !== null) {
        e.preventDefault();
        setGrabbedIndex(null);
        setAnnounce('Reorder cancelled.');
      }
      return;
    }
    // Arrow moves only apply to a picked-up tile.
    if (grabbedIndex === null) return;
    let target: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = grabbedIndex - 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = grabbedIndex + 1;
    if (target === null) return;
    e.preventDefault();
    if (target < 0 || target >= gallery.length) return;
    commitMove(grabbedIndex, target);
    setGrabbedIndex(target); // the grabbed tile travels with its content
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
          {gallery.map((item, i) => (
            <GalleryTile
              key={item.hash}
              photo={item}
              index={i}
              total={gallery.length}
              isFirst={i === 0}
              grabbed={grabbedIndex === i}
              dragging={dragIndex === i}
              onRemove={() => removeGalleryAt(item.hash)}
              onDragStart={() => setDragIndex(i)}
              onDragOver={() => {
                if (dragIndex !== null && dragIndex !== i) {
                  commitMove(dragIndex, i);
                  setDragIndex(i);
                }
              }}
              onDrop={() => setDragIndex(null)}
              onDragEnd={() => setDragIndex(null)}
              onHandleKeyDown={(e) => handleKeyDown(i, e)}
            />
          ))}
          {galleryBusy && (
            <span className={styles.tile} aria-hidden="true">
              <span className={styles.tileShimmer} />
            </span>
          )}
        </div>

        {/* aria-live region announcing keyboard-reorder moves (U10). */}
        <div className={styles.srOnly} aria-live="polite" role="status" data-testid="gallery-reorder-live">
          {announce}
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

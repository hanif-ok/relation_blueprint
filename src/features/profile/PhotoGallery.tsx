// PhotoGallery — the lazy-loaded multi-photo gallery grid in the profile sidebar (PROF-02,
// UI-SPEC S4). Renders `Person.gallery` as paper-shade `radius-md` tiles; each tile resolves
// its blob to an object URL via `mediaManager.resolveMediaUrl` and shimmers while loading.
//
// Leak discipline (prohibition): every object URL created here is revoked on unmount or when
// its source hash changes — see `useMediaUrl`.
// Empty state (UI-SPEC Copywriting Contract): a single muted line, "No photos yet."

import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '@/media/mediaManager';
import type { MediaRef, Person } from '@/domain/types';
import styles from './PhotoGallery.module.css';

export interface PhotoGalleryProps {
  person: Person;
  /** Open the lightbox at a tile's index over `person.gallery` (S18). Optional: when absent the
   *  tiles render as plain (non-interactive) thumbnails. */
  onOpen?: (index: number) => void;
}

/** Resolve a media hash to an object URL, revoking it on change/unmount (no leaks). */
function useMediaUrl(hash: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    void resolveMediaUrl(hash).then((u) => {
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

function GalleryTile({ photo, onOpen }: { photo: MediaRef; onOpen?: () => void }) {
  const url = useMediaUrl(photo.hash);
  const inner = url ? (
    <img src={url} alt="" className={styles.tileImg} />
  ) : (
    <span className={styles.tileShimmer} aria-hidden="true" />
  );

  // When openable, the tile is a real button (click/Enter open the lightbox at this index);
  // Radix returns focus here on dismiss. Without a handler it stays a plain thumbnail.
  if (onOpen) {
    return (
      <button
        type="button"
        className={styles.tileButton}
        onClick={onOpen}
        aria-label="View photo"
        data-testid="gallery-tile"
      >
        {inner}
      </button>
    );
  }
  return <span className={styles.tile}>{inner}</span>;
}

export function PhotoGallery({ person, onOpen }: PhotoGalleryProps) {
  if (person.gallery.length === 0) {
    return <p className={styles.empty}>No photos yet.</p>;
  }
  return (
    <div className={styles.grid} data-testid="profile-gallery">
      {person.gallery.map((photo, i) => (
        <GalleryTile key={photo.hash} photo={photo} onOpen={onOpen && (() => onOpen(i))} />
      ))}
    </div>
  );
}

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

function GalleryTile({ photo }: { photo: MediaRef }) {
  const url = useMediaUrl(photo.hash);
  return (
    <span className={styles.tile}>
      {url ? (
        <img src={url} alt="" className={styles.tileImg} />
      ) : (
        <span className={styles.tileShimmer} aria-hidden="true" />
      )}
    </span>
  );
}

export function PhotoGallery({ person }: PhotoGalleryProps) {
  if (person.gallery.length === 0) {
    return <p className={styles.empty}>No photos yet.</p>;
  }
  return (
    <div className={styles.grid} data-testid="profile-gallery">
      {person.gallery.map((photo) => (
        <GalleryTile key={photo.hash} photo={photo} />
      ))}
    </div>
  );
}

// PhotoGallery — the multi-photo gallery grid for a Person (PROF-02).
//
// This is the Plan 03 MOUNT POINT only: the ProfileSidebar imports and renders it now so
// the gallery slot exists, but the real lazy-loaded tile grid (thumbnail decode, full-res
// on demand) lands in Plan 04. Until then it renders the empty-state line from the
// copywriting contract. Do NOT build the gallery grid here — that is Plan 04's scope.

import type { Person } from '@/domain/types';
import styles from './PhotoGallery.module.css';

export interface PhotoGalleryProps {
  person: Person;
}

export function PhotoGallery({ person }: PhotoGalleryProps) {
  // Plan 04 will render person.gallery as a lazy-loaded tile grid. For now the slot is
  // present with the contract empty-state copy.
  if (person.gallery.length === 0) {
    return <p className={styles.empty}>No photos yet.</p>;
  }
  // Placeholder count line until Plan 04 wires the real tiles.
  return (
    <p className={styles.empty}>
      {person.gallery.length} photo{person.gallery.length === 1 ? '' : 's'} (gallery view coming
      in Plan 04).
    </p>
  );
}

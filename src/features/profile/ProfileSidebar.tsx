// ProfileSidebar — the right-docked dossier panel that opens on marker selection.
//
// Reads the selected person reactively via useLiveQuery (Dexie is source of truth). Shows
// the round thumbnail (avatar or initials), the entity name (Fraunces display), and all
// DATA-02 fields read-only (empty rows omitted), plus the PhotoGallery mount point and
// Edit / Delete actions.
//
// Canvas->AT bridge (UI-SPEC): the canvas is opaque to screen readers, so opening the
// sidebar moves focus into it AND announces "Selected {Name}" via a visually-hidden
// aria-live region — that is how a marker click reaches keyboard/AT users in Phase 1.
//
// Security: all user text (name, phone, description, tags, notes) is rendered as React
// children — never dangerouslySetInnerHTML (T-03-01: an XSS could exfiltrate the Drive token).

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { deleteEntity, deleteMarker, getMedia } from '@/db/repository';
import { useBlobImage } from '@/features/person-map/useMapImage';
import { PhotoGallery } from './PhotoGallery';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import type { Person } from '@/domain/types';
import styles from './ProfileSidebar.module.css';

export interface ProfileSidebarProps {
  personId: string | null;
  /**
   * Which context opened the sidebar (D-11/D-12, S21). Decides the single destructive action:
   * `'marker'` shows neutral "Remove from map" (marker-only, non-destructive to the entity);
   * `'list'` shows brick "Delete {entity}" (full cascade). Defaults to `'marker'` until the
   * browse/list surface (plan 02-03) passes `'list'`.
   */
  openedFrom?: 'marker' | 'list';
  /** The marker to remove when `openedFrom === 'marker'`. Required for "Remove from map". */
  markerId?: string;
  onClose: () => void;
  onEdit: (personId: string) => void;
  /** Raised after a successful delete so the host can clear selection. */
  onDeleted: (personId: string) => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileSidebar({
  personId,
  openedFrom = 'marker',
  markerId,
  onClose,
  onEdit,
  onDeleted,
}: ProfileSidebarProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | undefined>(undefined);

  const isMarkerContext = openedFrom === 'marker';

  const person = useLiveQuery<Person | undefined>(
    async () => (personId ? db.people.get(personId) : undefined),
    [personId],
  );

  // Load the avatar thumbnail blob for the header.
  useEffect(() => {
    let cancelled = false;
    if (person?.photo) {
      void getMedia(person.photo.hash).then((b) => {
        if (!cancelled) setPhotoBlob(b);
      });
    } else {
      setPhotoBlob(undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [person?.photo?.hash, person?.id]);

  const avatar = useBlobImage(photoBlob);

  // Move focus into the panel when it opens (canvas->AT bridge).
  useEffect(() => {
    if (person) panelRef.current?.focus();
  }, [person?.id]);

  // Esc closes (returns focus to a stable anchor handled by the host).
  useEffect(() => {
    if (!person) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirmOpen) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [person?.id, confirmOpen, onClose]);

  if (!personId || !person) return null;

  return (
    <>
      {/* Visually-hidden live region: announces selection to screen readers. */}
      <div className={styles.srOnly} aria-live="polite" role="status">
        Selected {person.name}
      </div>

      <aside
        ref={panelRef}
        className={styles.panel}
        tabIndex={-1}
        aria-label={`Profile: ${person.name}`}
        data-testid="profile-sidebar"
      >
        <div className={styles.header}>
          <span className={styles.thumb}>
            {avatar ? (
              <img src={avatar.src} alt="" className={styles.thumbImg} />
            ) : (
              <span className={styles.thumbInitials}>{initialsOf(person.name)}</span>
            )}
          </span>
          <h2 className={styles.name} data-testid="profile-name">
            {person.name}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.body}>
          {person.phone && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Phone</span>
              <span className={styles.rowValue} data-testid="profile-phone">
                {person.phone}
              </span>
            </div>
          )}
          {person.description && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Description</span>
              <span className={styles.rowValue} data-testid="profile-description">
                {person.description}
              </span>
            </div>
          )}
          {person.tags.length > 0 && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Tags</span>
              <span className={styles.chips} data-testid="profile-tags">
                {person.tags.map((tag) => (
                  <span key={tag} className={styles.chip}>
                    {tag}
                  </span>
                ))}
              </span>
            </div>
          )}
          {person.notes && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Notes</span>
              <span className={styles.rowValue} data-testid="profile-notes">
                {person.notes}
              </span>
            </div>
          )}

          <div className={styles.row}>
            <span className={styles.rowLabel}>Photos</span>
            <PhotoGallery person={person} />
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.edit}
            onClick={() => onEdit(person.id)}
            data-testid="profile-edit"
          >
            Edit
          </button>
          {/* Exactly ONE destructive action, by context (S21): neutral "Remove from map"
              (marker-only) OR brick "Delete {entity}" (full cascade). Never both. */}
          {isMarkerContext ? (
            <button
              type="button"
              className={styles.remove}
              onClick={() => setConfirmOpen(true)}
              data-testid="profile-remove"
            >
              Remove from map
            </button>
          ) : (
            <button
              type="button"
              className={styles.delete}
              onClick={() => setConfirmOpen(true)}
              data-testid="profile-delete"
            >
              Delete person
            </button>
          )}
        </div>
      </aside>

      {isMarkerContext ? (
        // Marker context: neutral, non-destructive to the entity — deletes only the marker.
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Remove from this map?"
          body={`${person.name} stays in your database and lists — only the marker on this map is removed.`}
          confirmLabel="Remove from map"
          cancelLabel="Cancel"
          onConfirm={() => {
            if (markerId) void deleteMarker(markerId).then(() => onClose());
            else onClose();
          }}
        />
      ) : (
        // List context: brick, full cascade — entity + all markers + media GC.
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete this person?"
          body={`${person.name} will be removed from your database and every map it appears on. This can't be undone unless you restore a backup.`}
          confirmLabel="Delete person"
          cancelLabel="Cancel"
          onConfirm={() => {
            const id = person.id;
            void deleteEntity('people', id).then(() => onDeleted(id));
          }}
        />
      )}
    </>
  );
}

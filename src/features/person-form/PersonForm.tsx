// PersonForm — create/edit a Person with the six DATA-02 fields ONLY (Name, Photo, Phone,
// Description, Tags, Notes). No custom fields (Phase 2). Built on Radix Dialog for a
// correct focus trap + Esc-to-cancel; first focus lands on Name.
//
// Discipline: Save is amber on CREATE (the one creative act) and neutral-ink on EDIT so
// amber stays reserved for creation/placement (UI-SPEC A8). All user text is rendered as
// React children — never dangerouslySetInnerHTML (T-03-01).

import { useEffect, useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { createPerson, updatePerson } from '@/db/repository';
import { storeMedia } from '@/db/media';
import { useBlobImage } from '@/features/person-map/useMapImage';
import { getMedia } from '@/db/repository';
import type { MediaRef, Person } from '@/domain/types';
import styles from './PersonForm.module.css';

export interface PersonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form edits this person; otherwise it creates a new one. */
  person?: Person | null;
  /** Raised with the saved person id (created or updated). */
  onSaved?: (personId: string) => void;
}

interface FormState {
  name: string;
  phone: string;
  description: string;
  notes: string;
  tags: string[];
  photo?: MediaRef;
}

function initialState(person?: Person | null): FormState {
  return {
    name: person?.name ?? '',
    phone: person?.phone ?? '',
    description: person?.description ?? '',
    notes: person?.notes ?? '',
    tags: person?.tags ?? [],
    photo: person?.photo,
  };
}

export function PersonForm({ open, onOpenChange, person, onSaved }: PersonFormProps) {
  const isEdit = !!person;
  const [state, setState] = useState<FormState>(() => initialState(person));
  const [tagDraft, setTagDraft] = useState('');
  const [photoBlob, setPhotoBlob] = useState<Blob | undefined>(undefined);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  // Reset the form whenever it opens (or the target person changes).
  useEffect(() => {
    if (open) {
      setState(initialState(person));
      setTagDraft('');
      setPhotoBlob(undefined);
      if (person?.photo) void getMedia(person.photo.hash).then(setPhotoBlob);
    }
  }, [open, person]);

  const photoPreview = useBlobImage(photoBlob);
  const nameEmpty = state.name.trim().length === 0;

  async function handlePhoto(file: File) {
    setPhotoBlob(file);
    const ref = await storeMedia(file);
    setState((s) => ({ ...s, photo: ref }));
  }

  function addTag() {
    const t = tagDraft.trim();
    if (t && !state.tags.includes(t)) {
      setState((s) => ({ ...s, tags: [...s.tags, t] }));
    }
    setTagDraft('');
  }

  function removeTag(tag: string) {
    setState((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
  }

  async function handleSave() {
    if (nameEmpty) return;
    const payload = {
      name: state.name.trim(),
      photo: state.photo,
      phone: state.phone.trim() || undefined,
      description: state.description.trim() || undefined,
      tags: state.tags,
      notes: state.notes.trim() || undefined,
    };
    let savedId: string;
    if (isEdit && person) {
      const updated = await updatePerson(person.id, payload);
      savedId = updated.id;
    } else {
      const created = await createPerson(payload);
      savedId = created.id;
    }
    onSaved?.(savedId);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.panel}
          aria-labelledby={titleId}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            nameRef.current?.focus();
          }}
        >
          <div className={styles.header}>
            <Dialog.Title id={titleId} className={styles.title}>
              {isEdit ? 'Edit person' : 'New person'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={styles.close} aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                ref={nameRef}
                className={styles.input}
                data-testid="field-name"
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                aria-invalid={nameEmpty}
                aria-describedby={nameEmpty ? `${titleId}-name-err` : undefined}
              />
              {nameEmpty && (
                <span id={`${titleId}-name-err`} className={styles.error} role="alert">
                  Add a name so you can find this person.
                </span>
              )}
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Photo</span>
              <div className={styles.photoRow}>
                <span className={styles.photoPreview}>
                  {photoPreview ? (
                    <img src={photoPreview.src} alt="" className={styles.photoImg} />
                  ) : (
                    <span className={styles.photoPlaceholder} aria-hidden="true" />
                  )}
                </span>
                <label className={styles.uploadLabel}>
                  Upload photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.hiddenInput}
                    data-testid="person-photo-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePhoto(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Phone</span>
              <input
                className={styles.input}
                data-testid="field-phone"
                value={state.phone}
                onChange={(e) => setState((s) => ({ ...s, phone: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Description</span>
              <input
                className={styles.input}
                data-testid="field-description"
                value={state.description}
                onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              />
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Tags</span>
              <div className={styles.chips}>
                {state.tags.map((tag) => (
                  <span key={tag} className={styles.chip}>
                    {tag}
                    <button
                      type="button"
                      className={styles.chipRemove}
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeTag(tag)}
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                className={styles.input}
                placeholder="Add a tag, press Enter"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Notes</span>
              <textarea
                className={styles.textarea}
                data-testid="field-notes"
                rows={3}
                value={state.notes}
                onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
              />
            </label>
          </div>

          <div className={styles.footer}>
            <Dialog.Close asChild>
              <button type="button" className={styles.cancel}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={isEdit ? styles.saveNeutral : styles.saveCreate}
              disabled={nameEmpty}
              onClick={() => void handleSave()}
            >
              Save person
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

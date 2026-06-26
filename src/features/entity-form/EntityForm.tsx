// EntityForm — the generalized create/edit dialog for all four first-class entity types
// (Person / Location / Group / Relationship-link). Built by generalizing PersonForm: same
// Radix Dialog focus-trap, the same amber-on-CREATE / neutral-ink-on-EDIT save discipline
// (amber stays reserved for creation — UI-SPEC A8), and the same tag-chip + PhotoUpload
// affordances.
//
// SCOPE (plan 02-03): this renders the entity SPINE fields only (D-18) — Name (required),
// Photo+Gallery, Notes, plus the per-type extras (People: phone/description/tags; Locations:
// background image + width/height; Relationship-links: label + date). Custom-field INPUTS are
// plan 02-04 and mount at the clearly-marked extension point below — none are rendered here.
//
// Security: all user text renders as React children — never dangerouslySetInnerHTML (T-03-01).

import { useEffect, useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  createGroup,
  createMap,
  createPerson,
  createRelationshipLink,
  updateGroup,
  updateMap,
  updatePerson,
  updateRelationshipLink,
} from '@/db/repository';
import { storeMedia } from '@/media/mediaManager';
import { PhotoUpload } from '@/features/person-form/PhotoUpload';
import type { Group, MapDoc, MediaRef, Person, RelationshipLink } from '@/domain/types';
import styles from './EntityForm.module.css';

/** The four entity families this form can create/edit. */
export type EntityFormType = 'people' | 'maps' | 'groups' | 'relationship-links';

/** The entity record being edited, narrowed per type. */
type EntityFor<T extends EntityFormType> = T extends 'people'
  ? Person
  : T extends 'maps'
    ? MapDoc
    : T extends 'groups'
      ? Group
      : RelationshipLink;

export interface EntityFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which entity family this form creates/edits. */
  entityType: EntityFormType;
  /** When set, the form edits this entity; otherwise it creates a new one. */
  entity?: Person | MapDoc | Group | RelationshipLink | null;
  /** Raised with the saved entity id (created or updated). */
  onSaved?: (entityId: string) => void;
}

/** Human singular per type, for titles + the empty-name error. */
const SINGULAR: Record<EntityFormType, string> = {
  people: 'person',
  maps: 'location',
  groups: 'group',
  'relationship-links': 'relationship-link',
};

interface FormState {
  name: string;
  notes: string;
  photo?: MediaRef;
  gallery: MediaRef[];
  // People-only:
  phone: string;
  description: string;
  tags: string[];
  // Location-only (the promoted MapDoc spine):
  background?: MediaRef;
  width?: number;
  height?: number;
  // Relationship-link-only (REL-02 shell):
  label: string;
  date: string;
}

function initialState(
  entityType: EntityFormType,
  entity?: Person | MapDoc | Group | RelationshipLink | null,
): FormState {
  const person = entityType === 'people' ? (entity as Person | null | undefined) : undefined;
  const map = entityType === 'maps' ? (entity as MapDoc | null | undefined) : undefined;
  const link =
    entityType === 'relationship-links'
      ? (entity as RelationshipLink | null | undefined)
      : undefined;
  return {
    name: entity?.name ?? '',
    notes: entity?.notes ?? '',
    photo: entity?.photo,
    gallery: entity?.gallery ?? [],
    phone: person?.phone ?? '',
    description: person?.description ?? '',
    tags: person?.tags ?? [],
    background: map?.background,
    width: map?.width,
    height: map?.height,
    label: link?.label ?? '',
    date: link?.date ?? '',
  };
}

export function EntityForm({ open, onOpenChange, entityType, entity, onSaved }: EntityFormProps) {
  const isEdit = !!entity;
  const [state, setState] = useState<FormState>(() => initialState(entityType, entity));
  const [tagDraft, setTagDraft] = useState('');
  const [bgBusy, setBgBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const singular = SINGULAR[entityType];

  // Reset the form whenever it opens (or the target entity/type changes).
  useEffect(() => {
    if (open) {
      setState(initialState(entityType, entity));
      setTagDraft('');
    }
  }, [open, entity, entityType]);

  const nameEmpty = state.name.trim().length === 0;
  // A NEW Location needs a background image before it can be created (a Location is a map).
  const needsBackground = entityType === 'maps' && !isEdit && !state.background;
  const saveDisabled = nameEmpty || needsBackground || bgBusy;

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

  async function handleBackground(file: File) {
    setBgBusy(true);
    try {
      const ref = await storeMedia(file, { kind: 'map' });
      setState((s) => ({
        ...s,
        background: ref,
        width: ref.width ?? s.width,
        height: ref.height ?? s.height,
      }));
    } finally {
      setBgBusy(false);
    }
  }

  async function handleSave() {
    if (saveDisabled) return;
    const name = state.name.trim();
    const notes = state.notes.trim() || undefined;
    let savedId: string;

    if (entityType === 'people') {
      const payload = {
        name,
        photo: state.photo,
        phone: state.phone.trim() || undefined,
        description: state.description.trim() || undefined,
        tags: state.tags,
        notes,
        gallery: state.gallery,
      };
      savedId = isEdit
        ? (await updatePerson((entity as Person).id, payload)).id
        : (await createPerson(payload)).id;
    } else if (entityType === 'maps') {
      if (isEdit) {
        savedId = (
          await updateMap((entity as MapDoc).id, {
            name,
            photo: state.photo,
            gallery: state.gallery,
            notes,
          })
        ).id;
      } else {
        // A new Location requires a background; guarded by `needsBackground` above.
        savedId = (
          await createMap({
            name,
            background: state.background!,
            width: state.width ?? state.background!.width ?? 0,
            height: state.height ?? state.background!.height ?? 0,
            photo: state.photo,
            gallery: state.gallery,
            notes,
          })
        ).id;
      }
    } else if (entityType === 'groups') {
      const payload = { name, photo: state.photo, gallery: state.gallery, notes };
      savedId = isEdit
        ? (await updateGroup((entity as Group).id, payload)).id
        : (await createGroup(payload)).id;
    } else {
      const payload = {
        name,
        photo: state.photo,
        gallery: state.gallery,
        notes,
        label: state.label.trim() || undefined,
        date: state.date.trim() || undefined,
      };
      savedId = isEdit
        ? (await updateRelationshipLink((entity as RelationshipLink).id, payload)).id
        : (await createRelationshipLink(payload)).id;
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
            <Dialog.Title id={titleId} className={styles.title} data-testid="entity-form-title">
              {isEdit ? `Edit ${singular}` : `New ${singular}`}
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
                  Add a name so you can find this {singular}.
                </span>
              )}
            </label>

            {/* Location-only: background image + intrinsic dimensions (the promoted MapDoc, D-07). */}
            {entityType === 'maps' && (
              <div className={styles.field}>
                <span className={styles.label}>Background image</span>
                <label className={styles.uploadLabel}>
                  {state.background ? 'Change background' : 'Upload background'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.hiddenInput}
                    data-testid="field-background"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleBackground(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {needsBackground && (
                  <span className={styles.error} role="alert">
                    Upload a background image to create this location.
                  </span>
                )}
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.label}>Photo</span>
              <PhotoUpload
                photo={state.photo}
                gallery={state.gallery}
                onPhotoChange={(photo) => setState((s) => ({ ...s, photo }))}
                onGalleryChange={(gallery) => setState((s) => ({ ...s, gallery }))}
              />
            </div>

            {/* People-only DATA-02 fields. */}
            {entityType === 'people' && (
              <>
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
              </>
            )}

            {/* Relationship-link-only: optional label + date (REL-02 shell). */}
            {entityType === 'relationship-links' && (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Label</span>
                  <input
                    className={styles.input}
                    data-testid="field-label"
                    value={state.label}
                    onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Date</span>
                  <input
                    type="date"
                    className={styles.input}
                    data-testid="field-date"
                    value={state.date}
                    onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
                  />
                </label>
              </>
            )}

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

            {/* CUSTOM-FIELD INPUTS EXTENSION POINT (plan 02-04 — S16):
                Custom-field inputs for this entity type render here, after the spine fields,
                in schema order. Intentionally empty this plan. */}
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
              disabled={saveDisabled}
              onClick={() => void handleSave()}
              data-testid="entity-form-save"
            >
              {isEdit ? 'Save changes' : `Create ${singular}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// `EntityFor` is exported as a type helper for hosts that narrow the editing entity.
export type { EntityFor };

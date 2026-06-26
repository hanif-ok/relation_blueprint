// FieldManager (S13) — the per-type custom-field schema editor (D-02/D-03). A Radix Dialog opened
// from the nav "Fields" item for the CURRENTLY-ACTIVE entity type. It shows the locked built-in
// spine (non-deletable, D-04), then the ordered custom-field list read live from listFieldDefs,
// then a neutral "+ Add field" footer. Every add / edit / remove / reorder is its OWN repository
// mutation (U9 — no batch "save schema" step); the list re-renders reactively via useLiveQuery.
//
// Reorder is operable by both pointer drag AND keyboard (U10, mandatory): focus a row's grip
// handle, press ↑/↓ to move the field, and an aria-live region announces the new position.
// Remove is a NEUTRAL ConfirmDialog (reversible soft-delete, D-05) — never the brick cascade.
//
// Security: all field labels render as React children — never dangerouslySetInnerHTML (T-03-01).

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { GripVertical, Lock, Plus, X } from 'lucide-react';
import { listFieldDefs, reorderFieldDefs, softDeleteFieldDef } from '@/db/repository';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import { FieldEditor } from './FieldEditor';
import type { EntityType, FieldDef, FieldType } from '@/domain/types';
import styles from './FieldManager.module.css';

/** The four field-manageable entity families and their human singular (for titles/copy). */
const SINGULAR: Record<EntityType, string> = {
  people: 'person',
  maps: 'location',
  groups: 'group',
  markers: 'marker',
  'relationship-links': 'relationship-link',
};

/** Human plural shown in the dialog title ("{Type} fields"). */
const PLURAL_TITLE: Partial<Record<EntityType, string>> = {
  people: 'People',
  maps: 'Location',
  groups: 'Group',
  'relationship-links': 'Relationship-link',
};

/** Short human label for each field type, shown in the per-row type badge. */
const TYPE_BADGE: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  phone: 'Phone',
  tags: 'Tags',
  'link-to-entity': 'Link',
  photo: 'Photo',
};

/** The locked built-in spine per entity type (D-04 — non-deletable, non-renamable). */
const BUILTINS: Record<EntityType, string[]> = {
  people: ['Name', 'Photo', 'Phone', 'Description', 'Tags', 'Notes'],
  maps: ['Name', 'Background image', 'Photo', 'Notes'],
  groups: ['Name', 'Photo', 'Notes'],
  'relationship-links': ['Name', 'Photo', 'Label', 'Date', 'Notes'],
  markers: [],
};

export interface FieldManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entity type whose schema is being edited (the currently-active view). */
  entityType: EntityType;
}

export function FieldManager({ open, onOpenChange, entityType }: FieldManagerProps) {
  // Live, ordered, non-deleted custom defs for this type (re-renders on every mutation, U9).
  const fields = useLiveQuery<FieldDef[]>(() => listFieldDefs(entityType), [entityType]);

  // The editor target: 'new' to add, a FieldDef to edit, or null when the editor is closed.
  const [editing, setEditing] = useState<FieldDef | 'new' | null>(null);
  // The field pending a remove-confirm (soft-delete).
  const [removing, setRemoving] = useState<FieldDef | null>(null);
  // aria-live announcement for keyboard reorder (U10).
  const [announce, setAnnounce] = useState('');

  /** Close the dialog AND reset transient UI (no reset-in-effect — handled at the close edge). */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setEditing(null);
      setRemoving(null);
      setAnnounce('');
    }
    onOpenChange(next);
  }

  const singular = SINGULAR[entityType];
  const title = `${PLURAL_TITLE[entityType] ?? 'Custom'} fields`;
  const builtins = BUILTINS[entityType] ?? [];
  const list = fields ?? [];

  /** Move the field at `index` by `delta` (-1 up / +1 down), persisting via reorderFieldDefs. */
  async function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= list.length) return;
    // Capture the moved field (and its label) from the freshest snapshot BEFORE the await, so the
    // reorder ids and the aria-live announcement never read a list value captured in an earlier
    // render after `reorderFieldDefs` resolves (WR-04 stale-closure fix).
    const movedField = list[index];
    const movedLabel = movedField.label;
    const ids = list.map((f) => f.id);
    ids.splice(index, 1);
    ids.splice(next, 0, movedField.id);
    await reorderFieldDefs(entityType, ids);
    setAnnounce(`Moved ${movedLabel} to position ${next + 1} of ${list.length}.`);
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.panel} aria-label={title} data-testid="field-manager">
            <div className={styles.header}>
              <Dialog.Title className={styles.title} data-testid="field-manager-title">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className={styles.close} aria-label="Close">
                  <X size={18} strokeWidth={1.75} />
                </button>
              </Dialog.Close>
            </div>

            <div className={styles.body}>
              <p className={styles.note}>
                These fields apply to every {singular}. Built-in fields can&rsquo;t be removed.
              </p>

              {/* Locked built-in spine (D-04). */}
              <ul className={styles.spine} role="list">
                {builtins.map((name) => (
                  <li key={name} className={styles.builtinRow} role="listitem">
                    <Lock size={14} strokeWidth={1.75} className={styles.lockGlyph} aria-hidden="true" />
                    <span className={styles.fieldName}>{name}</span>
                    <span className={styles.builtinBadge}>Built-in</span>
                  </li>
                ))}
              </ul>

              {/* Ordered custom-field list. */}
              {list.length === 0 ? (
                <p className={styles.empty} data-testid="field-manager-empty">
                  No custom fields yet. Add one to capture more about each {singular}.
                </p>
              ) : (
                <ul className={styles.customList} role="list" data-testid="field-list">
                  {list.map((field, index) => (
                    <li key={field.id} className={styles.customRow} role="listitem" data-testid="field-row">
                      <button
                        type="button"
                        className={styles.grip}
                        aria-label={`Reorder ${field.label}. Use arrow up and down to move.`}
                        data-testid="field-grip"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            void move(index, -1);
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            void move(index, 1);
                          }
                        }}
                      >
                        <GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <span className={styles.fieldName} data-testid="field-row-name">
                        {field.label}
                      </span>
                      <span className={styles.typeBadge}>{TYPE_BADGE[field.type]}</span>
                      <button
                        type="button"
                        className={styles.rowAction}
                        data-testid="field-edit"
                        onClick={() => setEditing(field)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.rowAction}
                        data-testid="field-remove"
                        onClick={() => setRemoving(field)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* The editor (inline expanding panel) for add OR edit. */}
              {editing && (
                <FieldEditor
                  entityType={entityType}
                  field={editing === 'new' ? null : editing}
                  onSaved={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>

            <div className={styles.footer}>
              {/* "+ Add field" is NEUTRAL (adding a field def is not creating an entity, S13). */}
              <button
                type="button"
                className={styles.addField}
                data-testid="field-add"
                onClick={() => setEditing('new')}
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Add field
              </button>
              <Dialog.Close asChild>
                <button type="button" className={styles.done} data-testid="field-manager-done">
                  Done
                </button>
              </Dialog.Close>
            </div>

            {/* aria-live region for keyboard reorder announcements (U10). */}
            <div className={styles.srOnly} aria-live="polite" role="status">
              {announce}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Remove a field — NEUTRAL confirm (reversible soft-delete, D-05). NOT the brick cascade. */}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        title="Remove this field?"
        body={
          removing
            ? `'${removing.label}' disappears from forms and profiles, but its saved values are kept. Re-add the field to bring them back.`
            : ''
        }
        confirmLabel="Remove field"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (removing) void softDeleteFieldDef(removing.id);
        }}
      />
    </>
  );
}

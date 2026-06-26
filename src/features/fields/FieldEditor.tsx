// FieldEditor (S14) — add or edit ONE custom-field definition inside the FieldManager.
//
// Renders as an inline expanding panel below the manager's field list. Fields: name (required),
// type (the 7 DATA-03 types), a Required toggle (the ONLY validation knob, D-06), an option-list
// chip editor for Tags/Select, and a target-type select for Link-to-entity (D-10 one-way pointer).
// On editing an existing field's TYPE it surfaces the D-05 type-change caution. Save calls the
// repository create/update; there is no batch step (U9 — each edit is its own mutation).
//
// Security: all labels/options render as React children — never dangerouslySetInnerHTML (T-03-01).

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { applyFieldTypeChange, createFieldDef, updateFieldDef } from '@/db/repository';
import type { DeletableEntityType } from '@/db/repository';
import type { EntityType, FieldDef, FieldType } from '@/domain/types';
import styles from './FieldManager.module.css';

/** The 7 DATA-03 field types, with human labels for the type select. */
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'phone', label: 'Phone' },
  { value: 'tags', label: 'Tags / Select' },
  { value: 'link-to-entity', label: 'Link to entity' },
  { value: 'photo', label: 'Photo' },
];

/** The entity families a link-to-entity field can point at (D-10). */
const TARGET_TYPES: { value: EntityType; label: string }[] = [
  { value: 'people', label: 'People' },
  { value: 'maps', label: 'Locations' },
  { value: 'groups', label: 'Groups' },
  { value: 'relationship-links', label: 'Relationship-links' },
];

export interface FieldEditorProps {
  /** The entity type whose schema this field belongs to. */
  entityType: EntityType;
  /** When set, the editor edits this definition; otherwise it creates a new one. */
  field?: FieldDef | null;
  /** Raised after a successful create/update so the manager can close the editor. */
  onSaved: () => void;
  /** Raised when the user cancels without saving. */
  onCancel: () => void;
}

export function FieldEditor({ entityType, field, onSaved, onCancel }: FieldEditorProps) {
  const isEdit = !!field;
  const [label, setLabel] = useState(field?.label ?? '');
  const [type, setType] = useState<FieldType>(field?.type ?? 'text');
  const [required, setRequired] = useState(field?.required ?? false);
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [optionDraft, setOptionDraft] = useState('');
  const [targetType, setTargetType] = useState<EntityType>(field?.targetType ?? 'people');
  const nameRef = useRef<HTMLInputElement>(null);
  const errId = useId();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const nameEmpty = label.trim().length === 0;
  // The caution shows only when EDITING an existing field to a DIFFERENT type (D-05).
  const typeChanged = isEdit && field!.type !== type;

  function addOption() {
    const o = optionDraft.trim();
    if (o && !options.includes(o)) setOptions((prev) => [...prev, o]);
    setOptionDraft('');
  }

  function removeOption(option: string) {
    setOptions((prev) => prev.filter((o) => o !== option));
  }

  async function handleSave() {
    if (nameEmpty) return;
    const trimmed = label.trim();
    const patch = {
      label: trimmed,
      type,
      required,
      options: type === 'tags' ? options : undefined,
      targetType: type === 'link-to-entity' ? targetType : undefined,
    };
    if (isEdit) {
      if (typeChanged) {
        // A TYPE change coerces every existing value (keep / quarantine / restore) in the SAME
        // unit as the def patch, making the caution copy below true (D-05 / CR-01). `entityType`
        // is the wider `EntityType`; `applyFieldTypeChange` takes the narrower `DeletableEntityType`
        // (no `markers` — markers carry no custom map), and FieldEditor is never rendered for
        // markers, so the cast is safe.
        await applyFieldTypeChange(entityType as DeletableEntityType, field!.id, patch);
      } else {
        await updateFieldDef(field!.id, patch);
      }
    } else {
      await createFieldDef({ entityType, ...patch });
    }
    onSaved();
  }

  return (
    <div className={styles.editor} data-testid="field-editor">
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Field name</span>
        <input
          ref={nameRef}
          className={styles.input}
          data-testid="field-editor-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-invalid={nameEmpty}
          aria-describedby={nameEmpty ? errId : undefined}
        />
        {nameEmpty && (
          <span id={errId} className={styles.error} role="alert">
            Give the field a name.
          </span>
        )}
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Type</span>
        <select
          className={styles.input}
          data-testid="field-editor-type"
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {typeChanged && (
        <p className={styles.caution} data-testid="field-editor-caution">
          Changing the type keeps values that still fit; others are set aside, not deleted.
        </p>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Required</span>
        <button
          type="button"
          role="switch"
          aria-checked={required}
          className={required ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
          data-testid="field-editor-required"
          onClick={() => setRequired((r) => !r)}
        >
          {required ? 'Required' : 'Optional'}
        </button>
      </div>

      {/* Tags/Select: an option-list chip editor (reuses the tag-chip pattern). */}
      {type === 'tags' && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Options</span>
          <div className={styles.chips}>
            {options.map((option) => (
              <span key={option} className={styles.chip}>
                {option}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${option}`}
                  onClick={() => removeOption(option)}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
          <input
            className={styles.input}
            data-testid="field-editor-option"
            placeholder="Add an option, press Enter"
            value={optionDraft}
            onChange={(e) => setOptionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOption();
              }
            }}
          />
        </div>
      )}

      {/* Link-to-entity: which entity type this points at (D-10 one-way pointer). */}
      {type === 'link-to-entity' && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Links to</span>
          <select
            className={styles.input}
            data-testid="field-editor-target"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as EntityType)}
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={styles.editorActions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.save}
          disabled={nameEmpty}
          data-testid="field-editor-save"
          onClick={() => void handleSave()}
        >
          {isEdit ? 'Save field' : 'Add field'}
        </button>
      </div>
    </div>
  );
}

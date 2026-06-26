// CustomFieldInputs (S16) — typed inputs for an entity type's custom fields, rendered in the
// EntityForm AFTER the built-in spine, in schema order. Reads the non-deleted field defs live via
// listFieldDefs(entityType). Each input writes the draft `custom[def.id]` map keyed by the STABLE
// field id (NEVER the label) so values survive rename / soft-delete / re-add. On save the parent
// runs validateCustomValue per field; this component renders the per-field error beneath its input.
//
// Validation is type-check + the field's `required` toggle ONLY (D-06) — no min/max/length/regex.
// link-to-entity is a one-way pointer (D-10): a select over the target type's entities storing the
// chosen id. Photo reuses PhotoUpload (single photo).
//
// Security: all labels/values render as React children — never dangerouslySetInnerHTML (T-03-01).

import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '@/db/schema';
import { listFieldDefs } from '@/db/repository';
import { PhotoUpload } from '@/features/person-form/PhotoUpload';
import type { CustomValue, CustomValues, EntityType, FieldDef, MediaRef } from '@/domain/types';
import styles from './EntityForm.module.css';

/** Per-field error map keyed by field id (set by the parent's save-time validation). */
export type CustomFieldErrors = Record<string, string>;

export interface CustomFieldInputsProps {
  entityType: EntityType;
  /** The current draft custom-value map (keyed by field id). */
  custom: CustomValues;
  /** Update one field's value (keyed by stable field id). */
  onChange: (fieldId: string, value: CustomValue) => void;
  /** Per-field validation errors to surface beneath the matching input. */
  errors?: CustomFieldErrors;
}

/** Live list of entities of a given type, for the link-to-entity select (id + name). */
function useTargetEntities(targetType: EntityType | undefined): { id: string; name: string }[] {
  return (
    useLiveQuery(async () => {
      if (!targetType) return [];
      const table =
        targetType === 'people'
          ? db.people
          : targetType === 'maps'
            ? db.maps
            : targetType === 'groups'
              ? db.groups
              : targetType === 'relationship-links'
                ? db.relationshipLinks
                : null;
      if (!table) return [];
      const rows = await table.toArray();
      return rows.map((r) => ({ id: r.id, name: r.name }));
    }, [targetType]) ?? []
  );
}

/** One custom-field input row, switched on the field type. */
function FieldInput({
  def,
  value,
  onChange,
  error,
}: {
  def: FieldDef;
  value: CustomValue;
  onChange: (value: CustomValue) => void;
  error?: string;
}) {
  const errId = useId();
  const [tagDraft, setTagDraft] = useState('');
  const targets = useTargetEntities(def.type === 'link-to-entity' ? def.targetType : undefined);
  const tags = Array.isArray(value) ? (value as string[]) : [];

  const describedBy = error ? errId : undefined;

  function renderInput() {
    switch (def.type) {
      case 'text':
        return (
          <input
            className={styles.input}
            data-testid={`custom-input-${def.id}`}
            value={typeof value === 'string' ? value : ''}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'phone':
        return (
          <input
            type="tel"
            className={styles.input}
            data-testid={`custom-input-${def.id}`}
            value={typeof value === 'string' ? value : ''}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            className={styles.input}
            data-testid={`custom-input-${def.id}`}
            value={typeof value === 'number' ? value : ''}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => {
              const raw = e.target.value;
              // A partial/non-numeric entry (a lone '-' or trailing 'e') yields NaN, which
              // serializes to null silently on JSON round-trip — store null explicitly (WR-01).
              const n = Number(raw);
              onChange(raw === '' || Number.isNaN(n) ? null : n);
            }}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            className={styles.input}
            data-testid={`custom-input-${def.id}`}
            value={typeof value === 'string' ? value : ''}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );
      case 'tags': {
        // Option-constrained select when the field defines options; otherwise a free tag editor.
        if (def.options && def.options.length > 0) {
          return (
            <select
              className={styles.input}
              data-testid={`custom-input-${def.id}`}
              value={typeof tags[0] === 'string' ? tags[0] : ''}
              aria-invalid={!!error}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
            >
              <option value="">—</option>
              {def.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          );
        }
        return (
          <>
            <div className={styles.chips}>
              {tags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  {tag}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Remove ${tag}`}
                    onClick={() => onChange(tags.filter((t) => t !== tag))}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
            <input
              className={styles.input}
              data-testid={`custom-input-${def.id}`}
              placeholder="Add a tag, press Enter"
              value={tagDraft}
              aria-invalid={!!error}
              aria-describedby={describedBy}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const t = tagDraft.trim();
                  if (t && !tags.includes(t)) onChange([...tags, t]);
                  setTagDraft('');
                }
              }}
            />
          </>
        );
      }
      case 'link-to-entity':
        return (
          <select
            className={styles.input}
            data-testid={`custom-input-${def.id}`}
            value={typeof value === 'string' ? value : ''}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">—</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        );
      case 'photo':
        return (
          <PhotoUpload
            photo={value && typeof value === 'object' ? (value as MediaRef) : undefined}
            gallery={[]}
            onPhotoChange={(photo) => onChange(photo ?? null)}
            onGalleryChange={() => {
              /* single-photo custom field — no gallery. */
            }}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className={styles.field} data-testid={`custom-field-${def.id}`}>
      <span className={styles.label}>
        {def.label}
        {def.required ? ' *' : ''}
      </span>
      {renderInput()}
      {error && (
        <span id={errId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function CustomFieldInputs({ entityType, custom, onChange, errors }: CustomFieldInputsProps) {
  const defs = useLiveQuery<FieldDef[]>(() => listFieldDefs(entityType), [entityType]);
  const list = defs ?? [];
  if (list.length === 0) return null;

  return (
    <div className={styles.customFields} data-testid="custom-field-inputs">
      {list.map((def) => (
        <FieldInput
          key={def.id}
          def={def}
          value={custom[def.id] ?? null}
          onChange={(v) => onChange(def.id, v)}
          error={errors?.[def.id]}
        />
      ))}
    </div>
  );
}

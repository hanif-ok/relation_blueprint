// SetAsideNote (F-2) — a muted, reassuring note shown under a custom field when the current entity
// has a quarantined ("set aside") original for it. A type change moves a non-convertible value into
// `__quarantine:<id>:<sourceType>` and clears the live value, so the field looks blank; without a cue
// that reads as DATA LOSS. This note names the value and the field type to switch back to in order to
// recover it (D-05 is reversible). Renders nothing when there is nothing set aside, so it is safe to
// drop under every field in both the edit form and the read profile.
//
// Security: the set-aside value renders as a React child — never dangerouslySetInnerHTML (T-03-01).

import { quarantinedEntriesFor } from '@/db/repository';
import type { CustomValue, CustomValues, FieldType } from '@/domain/types';
import styles from './SetAsideNote.module.css';

/** Human label per field type, for the "switch back to {Type}" copy. */
const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  phone: 'Phone',
  tags: 'Tags',
  'link-to-entity': 'Link',
  photo: 'Photo',
};

/** A short, human preview of a set-aside value for the reassurance copy. */
function previewValue(value: CustomValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object' && typeof (value as { hash?: unknown }).hash === 'string') {
    return 'a photo';
  }
  return '';
}

export interface SetAsideNoteProps {
  /** The entity's custom-value map (may carry quarantine keys for this field). */
  custom: CustomValues;
  /** The field whose set-aside originals to surface. */
  fieldId: string;
}

export function SetAsideNote({ custom, fieldId }: SetAsideNoteProps) {
  const entries = quarantinedEntriesFor(custom, fieldId);
  if (entries.length === 0) return null;

  return (
    <span className={styles.note} data-testid="set-aside-note">
      {entries.map((entry) => (
        <span key={entry.sourceType} className={styles.line}>
          ↩ A previous value was set aside (&ldquo;{previewValue(entry.value)}&rdquo;) — switch the
          type back to {TYPE_LABEL[entry.sourceType]} to recover it.
        </span>
      ))}
    </span>
  );
}

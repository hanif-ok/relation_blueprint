// ScopePanel (S2) — the signature field-scope control (SRCH-02, D-03). A native <fieldset> of
// native checkboxes: the five fixed built-in People attributes, then EVERY non-deleted custom
// People field derived LIVE from the FieldDef schema (useLiveQuery → listFieldDefs('people')), so
// adding/renaming/soft-deleting a field re-derives the list with no reload. Built-ins are keyed by
// their stable `builtin:*` id, custom rows by the stable `FieldDef.id` (D-05 — a rename never
// resets the persisted selection). Each checkbox's checked state comes from the subtractive scope
// selection (absent/true = ON, D-04); toggling calls back to persist a single un-check.
//
// Checked styling is the INK accent (accent-color: var(--ink), B3) — amber is reserved for focus +
// the plan-03 match highlight. All labels render as React children (never innerHTML, T-05-01).

import { useLiveQuery } from 'dexie-react-hooks';
import { listFieldDefs } from '@/db/repository';
import type { FieldDef } from '@/domain/types';
import { BUILTIN_FIELD_KEYS, BUILTIN_FIELD_LABELS, type BuiltinFieldKey } from './searchIndex';
import { isFieldChecked, type ScopeSelection } from './useScopeSelection';
import styles from './SearchView.module.css';

export interface ScopePanelProps {
  /** The live subtractive scope map (absent/true = checked). */
  stored: ScopeSelection | undefined;
  /** Persist one field's checked state (subtractive write lives in useScopeSelection). */
  onToggle: (fieldKey: string, checked: boolean) => void;
}

/** One checkbox row: the whole <label> is the click target (≥24px), wrapping the native input. */
function ScopeRow({
  fieldKey,
  label,
  stored,
  onToggle,
}: {
  fieldKey: string;
  label: string;
  stored: ScopeSelection | undefined;
  onToggle: (fieldKey: string, checked: boolean) => void;
}) {
  return (
    <label className={styles.scopeRow}>
      <input
        type="checkbox"
        className={styles.scopeCheckbox}
        data-testid={`scope-checkbox-${fieldKey}`}
        checked={isFieldChecked(fieldKey, stored)}
        onChange={(e) => onToggle(fieldKey, e.currentTarget.checked)}
      />
      <span className={styles.scopeLabel}>{label}</span>
    </label>
  );
}

export function ScopePanel({ stored, onToggle }: ScopePanelProps) {
  // Live custom People fields — soft-deleted defs are already excluded and the list is order-sorted
  // by listFieldDefs, so the panel re-derives on any field add/rename/soft-delete (D-03).
  const customDefs = useLiveQuery<FieldDef[]>(() => listFieldDefs('people'), []) ?? [];

  return (
    <fieldset className={styles.scopePanel} data-testid="scope-panel">
      <legend className={styles.scopeLegend}>Search in fields</legend>
      <span className={styles.scopeEyebrow} aria-hidden="true">
        Search in:
      </span>

      {BUILTIN_FIELD_KEYS.map((key: BuiltinFieldKey) => (
        <ScopeRow
          key={key}
          fieldKey={key}
          label={BUILTIN_FIELD_LABELS[key]}
          stored={stored}
          onToggle={onToggle}
        />
      ))}

      {customDefs.map((def) => (
        <ScopeRow
          key={def.id}
          fieldKey={def.id}
          label={def.label}
          stored={stored}
          onToggle={onToggle}
        />
      ))}
    </fieldset>
  );
}

// AddRelationshipDialog — the "+ Add relationship" authoring flow (REL-01/REL-02, UI-SPEC R2).
//
// Opened from the ProfileSidebar Relationships section on a Person or Group. Reuses the installed
// Radix Dialog + the PersonPicker surface shape (paper dialog, searchable list). The author:
//   1. picks the OTHER endpoint — People OR Groups only, never Locations (D-03/D-07); the current
//      entity is excluded (no self-links),
//   2. sets direction — a two-option control defaulting to Mutual (B5); Directed shows a
//      "{This} → {Other}" preview,
//   3. fills label / date / notes (the link's own data, REL-02 — all optional).
// On save it writes ONE canonical `RelationshipLink` through `createRelationshipLink`
// (validate→stamp→emit, NEVER straight to Dexie) with the current entity as `from` and the picked
// entity as `to`; it auto-appears on both endpoints (D-04).
//
// Security: every user string (candidate names, the preview, the label) renders as a React child —
// never dangerouslySetInnerHTML (T-04-01: an XSS could exfiltrate the Drive token).

import { useEffect, useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, ArrowLeftRight, Plus } from 'lucide-react';
import { db } from '@/db/schema';
import { createRelationshipLink } from '@/db/repository';
import type { Group, Person, RelationshipEndpointType } from '@/domain/types';
import styles from './AddRelationshipDialog.module.css';

export interface AddRelationshipDialogProps {
  open: boolean;
  /** Radix open-change. Closing (Cancel / Esc / overlay) abandons the pending relationship. */
  onOpenChange: (open: boolean) => void;
  /** The entity authoring the relationship — becomes the `from` endpoint (D-01). */
  fromType: RelationshipEndpointType;
  fromId: string;
  /** The author's display name — used in the directed preview + the derived link name. */
  fromName: string;
  /** Raised with the new link id after a successful write. */
  onCreated?: (linkId: string) => void;
}

/** One candidate endpoint (a Person or a Group) with its family tag. */
interface Candidate {
  id: string;
  name: string;
  type: RelationshipEndpointType;
}

export function AddRelationshipDialog({
  open,
  onOpenChange,
  fromType,
  fromId,
  fromName,
  onCreated,
}: AddRelationshipDialogProps) {
  const titleId = useId();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [directed, setDirected] = useState(false); // Mutual is the default (B5)
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset all fields each time the dialog (re)opens for a fresh authoring pass.
  useEffect(() => {
    if (open) {
      setSearch('');
      setPicked(null);
      setDirected(false);
      setLabel('');
      setDate('');
      setNotes('');
      setSaving(false);
      setError(null);
    }
  }, [open]);

  // Reactive candidate pool: People + Groups only (Locations are never valid endpoints, D-03/D-07),
  // with the author excluded (no self-links). Dexie is the source of truth.
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [], [] as Person[]);
  const groups = useLiveQuery(() => db.groups.orderBy('name').toArray(), [], [] as Group[]);

  const candidates = useMemo<Candidate[]>(() => {
    const all: Candidate[] = [
      ...(people ?? []).map((p) => ({ id: p.id, name: p.name, type: 'people' as const })),
      ...(groups ?? []).map((g) => ({ id: g.id, name: g.name, type: 'groups' as const })),
    ].filter((c) => !(c.type === fromType && c.id === fromId)); // never relate to self
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
  }, [people, groups, search, fromType, fromId]);

  const noCandidates = (people ?? []).length + (groups ?? []).length <= 1; // only the author exists

  async function save() {
    if (!picked || saving) return;
    setSaving(true);
    setError(null);
    const trimmedLabel = label.trim();
    // Derived name: the label if given, else "{from} → {other}" (a human-readable record name).
    const name = trimmedLabel || `${fromName} → ${picked.name}`;
    // `createRelationshipLink` can throw (zod validation, QuotaExceededError, aborted Dexie txn).
    // Without this guard a rejection left the dialog open with `saving` stuck true — permanently
    // disabling the "Add relationship" button — and surfaced an unhandled promise rejection (WR-06).
    // Reset `saving` in `finally` and surface an inline error so the author can retry.
    try {
      const link = await createRelationshipLink({
        name,
        label: trimmedLabel || undefined,
        date: date || undefined,
        notes: notes.trim() || undefined,
        fromType,
        fromId,
        toType: picked.type,
        toId: picked.id,
        directed,
      });
      onCreated?.(link.id);
      onOpenChange(false);
    } catch {
      setError("Couldn't save this relationship. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-labelledby={titleId}
          data-testid="add-relationship-dialog"
        >
          <Dialog.Title id={titleId} className={styles.title}>
            Add relationship
          </Dialog.Title>

          {noCandidates ? (
            <p className={styles.emptyBody} data-testid="add-relationship-no-candidates">
              Add another person or group first, then you can relate them.
            </p>
          ) : (
            <>
              {/* 1 — pick the other endpoint (People or Groups only). */}
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={searchId}>
                  Relate to
                </label>
                <input
                  id={searchId}
                  type="text"
                  className={styles.input}
                  placeholder="Search people and groups…"
                  value={search}
                  data-testid="add-relationship-search"
                  onChange={(e) => setSearch(e.target.value)}
                />
                <ul className={styles.list} role="listbox" aria-label="People and groups">
                  {candidates.map((c) => {
                    const selected = picked?.id === c.id && picked?.type === c.type;
                    return (
                      <li key={`${c.type}:${c.id}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={selected ? styles.itemSelected : styles.item}
                          data-testid={`add-relationship-candidate-${c.id}`}
                          onClick={() => setPicked(c)}
                        >
                          {/* User text as a React child — never raw HTML (T-04-01). */}
                          <span className={styles.itemName}>{c.name}</span>
                          <span className={styles.itemType}>
                            {c.type === 'people' ? 'Person' : 'Group'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {candidates.length === 0 && (
                    <li className={styles.emptyHint} data-testid="add-relationship-no-match">
                      No people or groups match.
                    </li>
                  )}
                </ul>
              </div>

              {/* 2 — direction (Mutual default, B5). */}
              <div className={styles.section}>
                <span className={styles.sectionLabel}>Direction</span>
                <div className={styles.directionRow} role="group" aria-label="Direction">
                  <button
                    type="button"
                    className={!directed ? styles.dirOptionOn : styles.dirOption}
                    aria-pressed={!directed}
                    data-testid="add-relationship-direction-mutual"
                    onClick={() => setDirected(false)}
                  >
                    <ArrowLeftRight size={16} strokeWidth={1.75} aria-hidden="true" />
                    Mutual
                  </button>
                  <button
                    type="button"
                    className={directed ? styles.dirOptionOn : styles.dirOption}
                    aria-pressed={directed}
                    data-testid="add-relationship-direction-directed"
                    onClick={() => setDirected(true)}
                  >
                    <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                    Directed
                  </button>
                </div>
                {directed && picked && (
                  <span className={styles.preview} data-testid="add-relationship-preview">
                    {fromName} → {picked.name}
                  </span>
                )}
              </div>

              {/* 3 — the link's own data (REL-02, all optional). */}
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={`${titleId}-label`}>
                  Label
                </label>
                <input
                  id={`${titleId}-label`}
                  type="text"
                  className={styles.input}
                  placeholder="e.g. mentor of, friends, member of"
                  value={label}
                  data-testid="add-relationship-label"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={`${titleId}-date`}>
                  Date
                </label>
                <input
                  id={`${titleId}-date`}
                  type="date"
                  className={styles.input}
                  value={date}
                  data-testid="add-relationship-date"
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={`${titleId}-notes`}>
                  Notes
                </label>
                <textarea
                  id={`${titleId}-notes`}
                  className={styles.textarea}
                  rows={3}
                  value={notes}
                  data-testid="add-relationship-notes"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          )}

          {error && (
            <p className={styles.error} role="alert" data-testid="add-relationship-error">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              data-testid="add-relationship-cancel"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            {!noCandidates && (
              <button
                type="button"
                className={styles.primary}
                data-testid="add-relationship-save"
                disabled={!picked || saving}
                onClick={() => void save()}
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Add relationship
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

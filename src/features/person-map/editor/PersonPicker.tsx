// PersonPicker — the map-side searchable list of existing people, opened by the Person tool
// (D-11, UI-SPEC S16). Built on the INSTALLED Radix Dialog (we prefer @radix-ui/react-dialog over
// adding @radix-ui/react-popover — threat T-03-SC, mirroring PortalTargetPicker/StylePopover).
//
// Flow: arming the Person tool and clicking the canvas records a drop point in MapView and opens
// this picker. Picking a person fires `onPick(personId)` — the CONSUMER (MapView) owns the drop
// coordinate and calls `upsertMarker({ kind:'person', mapId, personId, x, y, layerId })` with NO
// `id`, so each pick is a NEW Marker row (multi-placement, D-13). With zero people the picker shows
// a muted empty state with a shortcut into the existing create-person flow rather than an empty list.
//
// Scale (T-03-04): the people list is read reactively + live-filtered by a case-insensitive name
// substring so the rendered set stays bounded (people lists are v1-modest; UI-SPEC S16).
//
// Security: every person name renders as a React child — never dangerouslySetInnerHTML (T-03-01:
// an XSS could exfiltrate the Drive token), consistent with BrowseList / ProfileSidebar.

import { useEffect, useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { initialsOf } from '@/features/profile/ProfileSidebar';
import { useMapImage } from '@/features/person-map/useMapImage';
import type { Person } from '@/domain/types';
import styles from './PersonPicker.module.css';

export interface PersonPickerProps {
  open: boolean;
  /** Radix open-change. Closing (Cancel / Esc / overlay) abandons the pending placement. */
  onOpenChange: (open: boolean) => void;
  /** Raised with the picked person id — the consumer owns the drop coordinate + placement (D-11). */
  onPick: (personId: string) => void;
  /** Empty-state shortcut into the existing create-person flow. */
  onCreateNew?: () => void;
}

/** One picker row: an avatar thumb (or initials fallback) + the person's name. */
function PersonPickerRow({
  person,
  onPick,
}: {
  person: Person;
  onPick: (id: string) => void;
}) {
  const avatar = useMapImage(person.photo?.hash);
  return (
    <li>
      <button
        type="button"
        className={styles.listItem}
        role="option"
        aria-selected={false}
        data-testid={`person-picker-item-${person.id}`}
        onClick={() => onPick(person.id)}
      >
        <span className={styles.thumb} aria-hidden="true">
          {avatar ? (
            <img src={avatar.src} alt="" className={styles.thumbImg} />
          ) : (
            <span className={styles.thumbInitials}>{initialsOf(person.name)}</span>
          )}
        </span>
        {/* User text flows in as a React child — never as raw HTML (T-03-01). */}
        <span className={styles.itemName}>{person.name}</span>
      </button>
    </li>
  );
}

export function PersonPicker({ open, onOpenChange, onPick, onCreateNew }: PersonPickerProps) {
  const titleId = useId();
  const searchId = useId();
  const [search, setSearch] = useState('');

  // Reset the search each time the picker (re)opens for a fresh drop.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  // Reactive people list (Dexie is source of truth), ordered by name (UI-SPEC S16).
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [], []);
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (people ?? []).filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [people, search]);

  const noPeople = (people ?? []).length === 0;
  const emptySearch = !noPeople && candidates.length === 0;

  /** Pick a person, then close — the consumer (MapView) places the marker at the drop point. */
  function pick(personId: string) {
    onPick(personId);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-labelledby={titleId}
          data-testid="person-picker"
        >
          <Dialog.Title id={titleId} className={styles.title}>
            Place person
          </Dialog.Title>

          {noPeople ? (
            // Empty state: no people yet — a muted line + a shortcut into the create-person flow.
            <div className={styles.empty} data-testid="person-picker-empty">
              <p className={styles.emptyBody}>No people yet. Create one with + New.</p>
              {onCreateNew && (
                <button
                  type="button"
                  className={styles.createCta}
                  data-testid="person-picker-create"
                  onClick={() => {
                    onCreateNew();
                    onOpenChange(false);
                  }}
                >
                  Create a person…
                </button>
              )}
            </div>
          ) : (
            <div className={styles.section}>
              <label className={styles.sectionLabel} htmlFor={searchId}>
                Pick a person
              </label>
              <input
                id={searchId}
                type="text"
                className={styles.input}
                placeholder="Search people…"
                value={search}
                data-testid="person-picker-search"
                onChange={(e) => setSearch(e.target.value)}
              />
              <ul className={styles.list} role="listbox" aria-label="People">
                {candidates.map((p) => (
                  <PersonPickerRow key={p.id} person={p} onPick={pick} />
                ))}
                {emptySearch && (
                  <li className={styles.emptyHint} data-testid="person-picker-no-match">
                    No people match.
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              data-testid="person-picker-cancel"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

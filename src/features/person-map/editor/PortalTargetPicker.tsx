// PortalTargetPicker — the create-or-pick target dialog opened when a portal is dropped (S15,
// D-08/D-18). Built on the INSTALLED Radix Dialog (we prefer @radix-ui/react-dialog over adding
// @radix-ui/react-popover — threat T-03-SC, mirroring StylePopover's choice).
//
// Flow (RESEARCH Pattern 5 — create-or-pick inline):
//   • PICK an existing map  → `upsertMarker({ id: portalId, …, targetMapId: picked.id })` sets the
//     just-dropped portal's target. The current map is EXCLUDED from the list (no trivial
//     self-portal / self-cycle — reduces T-03-09).
//   • CREATE a new map      → reuse `createMap` (name + a background image), then set it as the
//     portal's target AND set the NEW (child) map's `parentId` to the CURRENT map via
//     `updateMap(childId, { parentId: currentMapId })`. THIS is the descend hierarchy (D-09/D-10):
//     the current map contains the new child reachable through the portal, so the breadcrumb from
//     03-02 will show parent ▸ child.
//   • CANCEL (Esc / Cancel) → `deleteMarker(portalId)` removes the just-dropped portal (don't leave
//     a target-less portal on the map — RESEARCH Pattern 5).
//
// Security: every map name renders as a React child / a plain-text <input value> — never
// dangerouslySetInnerHTML (T-03-01).

import { useEffect, useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { createMap, updateMap, upsertMarker, deleteMarker } from '@/db/repository';
import { storeMedia } from '@/media/mediaManager';
import styles from './PortalTargetPicker.module.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface PortalTargetPickerProps {
  open: boolean;
  /** The just-dropped portal marker id whose `targetMapId` this dialog sets (null = closed). */
  portalId: string | null;
  /** The map the portal lives on — excluded from the target list + becomes the child's parentId. */
  currentMapId: string;
  /** Radix open-change. Closing without a Done/Cancel action (e.g. overlay) is treated as cancel. */
  onOpenChange: (open: boolean) => void;
  /** Raised after a target was set OR the portal removed, so the parent can clear `pendingPortalId`. */
  onDone: () => void;
}

export function PortalTargetPicker({
  open,
  portalId,
  currentMapId,
  onOpenChange,
  onDone,
}: PortalTargetPickerProps) {
  const titleId = useId();
  const searchId = useId();
  const nameId = useId();

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBackground, setNewBackground] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether a Done/Cancel action already resolved the portal, so the Radix close handler
  // doesn't ALSO delete it (a double-resolve would error on the already-deleted row).
  const [resolved, setResolved] = useState(false);

  // Reset the transient form each time the dialog (re)opens for a fresh portal.
  useEffect(() => {
    if (open) {
      setSearch('');
      setCreating(false);
      setNewName('');
      setNewBackground(null);
      setBusy(false);
      setError(null);
      setResolved(false);
    }
  }, [open, portalId]);

  // Existing maps, excluding the current one (no self-portal). Reactive via useLiveQuery.
  const maps = useLiveQuery(() => db.maps.toArray(), [], []);
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (maps ?? [])
      .filter((m) => m.id !== currentMapId)
      .filter((m) => (q ? m.name.toLowerCase().includes(q) : true));
  }, [maps, currentMapId, search]);

  /** PICK: set the dropped portal's target to an existing map. */
  async function pickTarget(targetMapId: string) {
    if (!portalId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const existing = await db.markers.get(portalId);
      if (existing) {
        await upsertMarker({
          id: existing.id,
          mapId: existing.mapId,
          kind: 'portal',
          targetMapId,
          layerId: existing.layerId,
          x: existing.x,
          y: existing.y,
          width: existing.width,
          height: existing.height,
          rotation: existing.rotation,
        });
      }
      setResolved(true);
      onDone();
      onOpenChange(false);
    } catch {
      // A failed write must not wedge the controls (all disabled={busy}) — surface an error and
      // release busy in finally so the list/create/back buttons re-enable (mirrors handleFile).
      setError('Could not set the portal target. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  /** CREATE: make a child map (name + background), point the portal at it, and set the descend
   *  hierarchy (child.parentId = currentMapId). Reuses createMap + updateMap (D-09/D-10). */
  async function createTarget() {
    if (!portalId || busy) return;
    const name = newName.trim();
    if (!name || !newBackground) return;
    if (!ACCEPTED_TYPES.includes(newBackground.type) || newBackground.size > MAX_UPLOAD_BYTES) return;
    setBusy(true);
    setError(null);
    try {
      const ref = await storeMedia(newBackground, { kind: 'map' });
      const child = await createMap({
        name,
        background: ref,
        width: ref.width ?? 800,
        height: ref.height ?? 600,
      });
      // The descend hierarchy: the new child sits UNDER the current map (breadcrumb parent ▸ child).
      await updateMap(child.id, { parentId: currentMapId });
      const existing = await db.markers.get(portalId);
      if (existing) {
        await upsertMarker({
          id: existing.id,
          mapId: existing.mapId,
          kind: 'portal',
          targetMapId: child.id,
          layerId: existing.layerId,
          x: existing.x,
          y: existing.y,
          width: existing.width,
          height: existing.height,
          rotation: existing.rotation,
        });
      }
      setResolved(true);
      onDone();
      onOpenChange(false);
    } catch {
      // A failed decode/quota/write must not wedge the create controls — surface an error and release
      // busy in finally so "Create map"/"Back" re-enable (mirrors handleFile's UPLOAD_ERROR path).
      setError('Could not create the map. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  /** CANCEL: remove the target-less portal so the map never carries a dangling doorway. */
  async function cancel() {
    if (portalId && !resolved) {
      await deleteMarker(portalId);
    }
    setResolved(true);
    onDone();
    onOpenChange(false);
  }

  const emptySearch = search.trim().length > 0 && candidates.length === 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Closing via Esc / overlay click (without an explicit pick/create) cancels = remove portal.
        if (!next && !resolved) {
          void cancel();
        } else if (!next) {
          onOpenChange(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-labelledby={titleId}
          data-testid="portal-target-picker"
        >
          <Dialog.Title id={titleId} className={styles.title}>
            Where does this portal go?
          </Dialog.Title>

          {error && (
            <p role="alert" className={styles.error} data-testid="portal-target-error">
              {error}
            </p>
          )}

          {!creating ? (
            <>
              {/* Searchable list of existing maps (current map excluded — no self-portal). */}
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={searchId}>
                  Pick an existing map
                </label>
                <input
                  id={searchId}
                  type="text"
                  className={styles.input}
                  placeholder="Search maps…"
                  value={search}
                  data-testid="portal-target-search"
                  onChange={(e) => setSearch(e.target.value)}
                />
                <ul className={styles.list} role="listbox" aria-label="Existing maps">
                  {candidates.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={styles.listItem}
                        role="option"
                        aria-selected={false}
                        data-testid={`portal-target-item-${m.id}`}
                        disabled={busy}
                        onClick={() => void pickTarget(m.id)}
                      >
                        {m.name}
                      </button>
                    </li>
                  ))}
                  {emptySearch && (
                    <li className={styles.emptyHint} data-testid="portal-target-empty">
                      No maps match. Create a new one?
                    </li>
                  )}
                </ul>
              </div>

              {/* The prominent create-a-new-map affordance (D-08 inline create). */}
              <button
                type="button"
                className={styles.createCta}
                data-testid="portal-create-new"
                disabled={busy}
                onClick={() => {
                  setCreating(true);
                  // Carry any in-progress search text into the new-map name as a convenience.
                  setNewName(search.trim());
                }}
              >
                Create a new map…
              </button>
            </>
          ) : (
            <>
              {/* Inline create: name + a background image (reuses createMap). On save we set the
                  portal's target AND the child's parentId (the descend hierarchy). */}
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor={nameId}>
                  New map name
                </label>
                <input
                  id={nameId}
                  type="text"
                  className={styles.input}
                  placeholder="e.g. Floor 2"
                  value={newName}
                  data-testid="portal-new-name"
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className={styles.section}>
                <span className={styles.sectionLabel}>Background image</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  data-testid="portal-new-background"
                  onChange={(e) => setNewBackground(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setCreating(false)}
                  disabled={busy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  data-testid="portal-create-confirm"
                  disabled={busy || !newName.trim() || !newBackground}
                  onClick={() => void createTarget()}
                >
                  Create map
                </button>
              </div>
            </>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              data-testid="portal-target-cancel"
              onClick={() => void cancel()}
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

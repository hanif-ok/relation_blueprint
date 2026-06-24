import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { upsertMarker } from '@/db/repository';
import type { Person } from '@/domain/types';
import styles from './App.module.css';
import { MapView } from '@/features/person-map/MapView';
import { PersonForm } from '@/features/person-form/PersonForm';
import { ProfileSidebar } from '@/features/profile/ProfileSidebar';
import { UpdateToast } from '@/features/pwa/UpdateToast';
import { InstallPrompt } from '@/features/pwa/InstallPrompt';
import { ConnectDrive, useConnectDrive } from '@/features/connect/ConnectDrive';
import { ReconnectBanner } from '@/features/connect/ReconnectBanner';

/**
 * Walking-skeleton app shell — full Task 2 wiring.
 *
 * Top bar (wordmark + `+ Person` + overflow placeholder) over the hero Konva MapView, with
 * the right-docked profile sidebar opening on marker selection and the create/edit form.
 * `+ Person` is gated until a map exists (UI-SPEC A12): a person with nowhere to go is a
 * dead end this phase. On create, the new person is placed as a marker at the map's center
 * so the create→place→profile thread is unbroken.
 */
export function App() {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);

  // Drive connect/reconnect/status chrome (Plan 06). The SyncEngine boot on connect is wired
  // here via onConnected once the live OAuth credential is configured (SETUP.md); until then
  // the chrome surfaces the "not configured" state and the app stays fully usable offline.
  const drive = useConnectDrive();

  const map = useLiveQuery(() => db.maps.toArray().then((m) => m[0] ?? null), [], null);
  const editingPerson = useLiveQuery<Person | undefined>(
    async () => (editingPersonId ? db.people.get(editingPersonId) : undefined),
    [editingPersonId],
  );

  const hasMap = !!map;

  function openCreate() {
    setEditingPersonId(null);
    setFormOpen(true);
  }

  function openEdit(personId: string) {
    setEditingPersonId(personId);
    setFormOpen(true);
  }

  async function handleSaved(personId: string) {
    // On CREATE (no marker yet for this person), place the person at the map center so
    // they appear immediately. Edits leave the existing marker untouched.
    if (map) {
      const existing = await db.markers.where('personId').equals(personId).count();
      if (existing === 0) {
        await upsertMarker({
          mapId: map.id,
          personId,
          x: map.width / 2,
          y: map.height / 2,
        });
      }
    }
    setSelectedPersonId(personId);
  }

  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.wordmark}>Relation Blueprint</span>
        <div className={styles.actions}>
          <ConnectDrive status={drive.status} onAction={drive.connect} />
          <button
            type="button"
            className={styles.addPerson}
            disabled={!hasMap}
            title={hasMap ? undefined : 'Upload a map first'}
            onClick={openCreate}
            data-testid="add-person"
          >
            + Person
          </button>
          <button
            type="button"
            className={styles.overflow}
            aria-label="More actions"
            data-testid="overflow-menu"
          >
            ⋯
          </button>
        </div>
      </header>

      <ReconnectBanner visible={drive.status.phase === 'reconnect'} onReconnect={drive.connect} />

      <main className={styles.surface}>
        <MapView
          selectedPersonId={selectedPersonId}
          onSelect={(personId) => setSelectedPersonId(personId || null)}
        />
      </main>

      <ProfileSidebar
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
        onEdit={openEdit}
        onDeleted={(deletedId) => {
          if (deletedId === selectedPersonId) setSelectedPersonId(null);
        }}
      />

      <PersonForm
        open={formOpen}
        onOpenChange={setFormOpen}
        person={editingPersonId ? editingPerson : null}
        onSaved={(personId) => void handleSaved(personId)}
      />

      <UpdateToast />
      <InstallPrompt />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { upsertMarker } from '@/db/repository';
import type { Group, MapDoc, Person, RelationshipLink } from '@/domain/types';
import styles from './App.module.css';
import { MapView } from '@/features/person-map/MapView';
import { ViewSwitcher, type ViewKey } from '@/features/nav/ViewSwitcher';
import { NewEntityMenu } from '@/features/nav/NewEntityMenu';
import { EntityForm, type EntityFormType } from '@/features/entity-form/EntityForm';
import { ProfileSidebar, type ProfileEntityType } from '@/features/profile/ProfileSidebar';
import { UpdateToast } from '@/features/pwa/UpdateToast';
import { InstallPrompt } from '@/features/pwa/InstallPrompt';
import { ConnectDrive, useConnectDrive } from '@/features/connect/ConnectDrive';
import { useSyncEngine } from '@/features/connect/useSyncEngine';
import { ReconnectBanner } from '@/features/connect/ReconnectBanner';
import { BackupMenu } from '@/features/backup/BackupMenu';

/** A view key narrowed to the four entity tables (everything except 'map'). */
type EntityView = Exclude<ViewKey, 'map'>;

/**
 * Multi-surface app shell (plan 02-03). A left-nav ViewSwitcher swaps the main surface between
 * the Phase-1 Konva MapView and the four browse lists; a `+ New ▾` menu + generalized EntityForm
 * create all four first-class types; the profile sidebar opens from a marker (map context) or a
 * browse row (list context). Amber stays reserved for creation/placement only.
 */
export function App() {
  const [activeView, setActiveView] = useState<ViewKey>('map');

  // The open profile: which entity family + id, and whether it was opened from a marker or a list.
  const [profile, setProfile] = useState<{
    type: ProfileEntityType;
    id: string;
    openedFrom: 'marker' | 'list';
  } | null>(null);

  // The open entity form: which type, and the id being edited (null = create).
  const [form, setForm] = useState<{ type: EntityFormType; editingId: string | null } | null>(null);

  // Drive connect/reconnect/status chrome wired to the atomic SyncEngine.
  const sync = useSyncEngine();
  const drive = useConnectDrive({
    onConnected: sync.onConnected,
    onDisconnected: sync.onDisconnected,
  });

  useEffect(() => {
    drive.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const map = useLiveQuery(() => db.maps.toArray().then((m) => m[0] ?? null), [], null);

  // The entity currently being edited, loaded from the right table for the form.
  const editingEntity = useLiveQuery<Person | MapDoc | Group | RelationshipLink | undefined>(
    async () => {
      if (!form?.editingId) return undefined;
      if (form.type === 'people') return db.people.get(form.editingId);
      if (form.type === 'maps') return db.maps.get(form.editingId);
      if (form.type === 'groups') return db.groups.get(form.editingId);
      return db.relationshipLinks.get(form.editingId);
    },
    [form?.editingId, form?.type],
  );

  // The marker backing a person profile opened from the map (drives "Remove from map").
  const selectedMarkerId = useLiveQuery<string | undefined>(
    async () =>
      profile?.openedFrom === 'marker' && profile.type === 'people'
        ? (await db.markers.where('personId').equals(profile.id).first())?.id
        : undefined,
    [profile?.id, profile?.openedFrom, profile?.type],
  );

  function openCreate(type: EntityFormType) {
    setForm({ type, editingId: null });
  }

  function openEdit(type: ProfileEntityType, id: string) {
    setForm({ type, editingId: id });
  }

  async function handleSaved(savedId: string) {
    if (!form) return;
    // Creating a Person while a map exists auto-places them so the create→place→profile thread
    // is unbroken (Phase-1 behavior preserved). Edits leave any existing marker untouched.
    if (form.type === 'people' && map) {
      const existing = await db.markers.where('personId').equals(savedId).count();
      if (existing === 0) {
        await upsertMarker({
          mapId: map.id,
          personId: savedId,
          x: map.width / 2,
          y: map.height / 2,
        });
      }
      // Open the new person's profile in marker context (they're now on the map).
      setProfile({ type: 'people', id: savedId, openedFrom: 'marker' });
    } else {
      // Non-spatial create/edit (or a Person created with no map yet): show the entity in its
      // list and open its profile in list context.
      if (form.type !== 'people') setActiveView(form.type as EntityView);
      setProfile({ type: form.type, id: savedId, openedFrom: 'list' });
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.wordmark}>Relation Blueprint</span>
        <div className={styles.actions}>
          <ConnectDrive status={drive.status} onAction={drive.connect} />
          <NewEntityMenu onCreate={openCreate} />
          <BackupMenu />
        </div>
      </header>

      <ReconnectBanner visible={drive.status.phase === 'reconnect'} onReconnect={drive.connect} />

      <div className={styles.shell}>
        <ViewSwitcher
          active={activeView}
          onSelectView={setActiveView}
          onOpenFields={() => {
            /* Field manager is plan 02-04. */
          }}
          onOpenPrivacy={() => {
            /* Privacy notice re-view is wired in Task 3. */
          }}
        />

        <main className={styles.surface}>
          {activeView === 'map' ? (
            <MapView
              selectedPersonId={profile?.type === 'people' ? profile.id : null}
              onSelect={(personId) =>
                setProfile(
                  personId ? { type: 'people', id: personId, openedFrom: 'marker' } : null,
                )
              }
            />
          ) : (
            <section className={styles.placeholder} data-testid={`browse-${activeView}`}>
              <p>Browse list for {activeView} (wired in Task 2).</p>
            </section>
          )}
        </main>
      </div>

      <ProfileSidebar
        entityType={profile?.type}
        entityId={profile?.id ?? null}
        openedFrom={profile?.openedFrom ?? 'marker'}
        markerId={selectedMarkerId}
        onClose={() => setProfile(null)}
        onEdit={(id) => {
          if (profile) openEdit(profile.type, id);
        }}
        onDeleted={(deletedId) => {
          if (profile?.id === deletedId) setProfile(null);
        }}
      />

      {form && (
        <EntityForm
          open={!!form}
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          entityType={form.type}
          entity={form.editingId ? editingEntity : null}
          onSaved={(id) => void handleSaved(id)}
        />
      )}

      <UpdateToast />
      <InstallPrompt />
    </div>
  );
}

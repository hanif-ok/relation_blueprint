import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { deleteEntity, upsertMarker } from '@/db/repository';
import type { Group, MapDoc, Person, RelationshipLink } from '@/domain/types';
import styles from './App.module.css';
import { MapView } from '@/features/person-map/MapView';
import { BrowseList } from '@/features/browse/BrowseList';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import { PrivacyNotice } from '@/features/onboarding/PrivacyNotice';
import { ViewSwitcher, type ViewKey } from '@/features/nav/ViewSwitcher';
import { NewEntityMenu } from '@/features/nav/NewEntityMenu';
import { EntityForm, type EntityFormType } from '@/features/entity-form/EntityForm';
import { FieldManager } from '@/features/fields/FieldManager';
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

  // Phase-3 (D-05): the active map shown on the canvas. Lifted next to `activeView` so the
  // MapSwitcher, the breadcrumb, "show on map", and person auto-placement all target the SAME map.
  // Seeded to the first map on first load (below) so the single-map skeleton behavior is preserved.
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  // The open profile: which entity family + id, and whether it was opened from a marker or a list.
  const [profile, setProfile] = useState<{
    type: ProfileEntityType;
    id: string;
    openedFrom: 'marker' | 'list';
  } | null>(null);

  // The open entity form: which type, and the id being edited (null = create).
  const [form, setForm] = useState<{ type: EntityFormType; editingId: string | null } | null>(null);

  // Pending delete from a browse-row overflow menu: which entity, with its display name for copy.
  const [confirmDelete, setConfirmDelete] = useState<{
    type: ProfileEntityType;
    id: string;
    name: string;
  } | null>(null);

  // aria-live announcement for "Show on map" (the DOM-accessible path to a canvas action).
  const [announce, setAnnounce] = useState('');

  // Jump-to-placement target (D-12): the marker id MapView should select + center after a profile
  // "Appears on" row is clicked. Cleared by MapView (onFocusHandled) once applied, so re-jumping to
  // the same placement works again.
  const [focusMarkerId, setFocusMarkerId] = useState<string | null>(null);

  // The per-type field manager (S13, plan 02-04). When open, it edits the field-managed entity
  // type below (the active view, or People when the Map view is active — Map has no custom fields).
  const [fieldsOpen, setFieldsOpen] = useState(false);

  // Privacy notice (S20, D-19). The one-time dismissal persists in the Dexie `meta` table so it
  // round-trips with the DB; `reviewPrivacy` is a transient re-view that never rewrites the flag.
  const [reviewPrivacy, setReviewPrivacy] = useState(false);
  const privacyDismissed = useLiveQuery(
    async () => (await db.meta.get('privacyNoticeDismissed'))?.value === true,
    [],
  );

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

  // The first map (by insertion order) — used ONLY to SEED `activeMapId` when it is still null, so
  // an existing single-map DB renders its map on first open without an explicit selection.
  const firstMap = useLiveQuery(() => db.maps.toArray().then((m) => m[0] ?? null), [], null);

  // Seed the active map to the first map once, when none is selected yet (and one exists).
  useEffect(() => {
    if (activeMapId === null && firstMap) setActiveMapId(firstMap.id);
  }, [activeMapId, firstMap]);

  // The currently-active map (drives person auto-placement onto the RIGHT map, not always maps[0]).
  const activeMap = useLiveQuery(
    async () => (activeMapId ? await db.maps.get(activeMapId) : undefined),
    [activeMapId],
    undefined,
  );

  // Does the user have any first-class entity yet? Gates the one-time privacy notice's auto-show
  // (criterion 4: show at first entity creation OR first provider connect, whichever comes first).
  const hasAnyEntity = useLiveQuery(async () => {
    const counts = await Promise.all([
      db.people.count(),
      db.maps.count(),
      db.groups.count(),
      db.relationshipLinks.count(),
    ]);
    return counts.some((c) => c > 0);
  }, []);

  // Auto-show once on first run: the flag is loaded-and-absent AND there's a first entity OR a
  // live Drive connection. `privacyDismissed === false` (not undefined) ensures the flag finished
  // loading, so we never flash the notice before the meta read resolves.
  const privacyOpen =
    reviewPrivacy ||
    (privacyDismissed === false && (drive.status.connected || hasAnyEntity === true));

  /** Persist the one-time dismissal to the Dexie meta table (round-trips with the DB). */
  async function dismissPrivacy() {
    setReviewPrivacy(false);
    await db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  }

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
    // Creating a Person while a map exists auto-places them on the ACTIVE map (D-05) so the
    // create→place→profile thread is unbroken (Phase-1 behavior preserved, now multi-map aware).
    // Edits leave any existing marker untouched.
    if (form.type === 'people' && activeMap) {
      const existing = await db.markers.where('personId').equals(savedId).count();
      if (existing === 0) {
        await upsertMarker({
          mapId: activeMap.id,
          personId: savedId,
          x: activeMap.width / 2,
          y: activeMap.height / 2,
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

  // --- Browse-list handlers (Task 2) ---------------------------------------------------

  /** A browse row opens the profile in LIST context (D-16). */
  function openFromList(type: ProfileEntityType, id: string) {
    setProfile({ type, id, openedFrom: 'list' });
  }

  /** Jump to the Map view and select a person's marker, announced for AT (Show on map). Opens the
   *  SPECIFIC map the person is placed on (D-05) — not always the first map — by resolving the
   *  person's marker's `mapId` and setting it active. */
  async function showOnMap(id: string) {
    const person = await db.people.get(id);
    const marker = await db.markers.where('personId').equals(id).first();
    if (marker) setActiveMapId(marker.mapId);
    setActiveView('map');
    setProfile({ type: 'people', id, openedFrom: 'marker' });
    setAnnounce(person ? `Showing ${person.name} on the map.` : 'Showing on the map.');
  }

  /** Resolve an entity's display name for the delete-confirm copy, then open the confirm. */
  async function requestDelete(type: ProfileEntityType, id: string) {
    const table =
      type === 'people'
        ? db.people
        : type === 'maps'
          ? db.maps
          : type === 'groups'
            ? db.groups
            : db.relationshipLinks;
    const entity = await table.get(id);
    setConfirmDelete({ type, id, name: entity?.name ?? '' });
  }

  const deleteSingular = confirmDelete
    ? ({
        people: 'person',
        maps: 'location',
        groups: 'group',
        'relationship-links': 'relationship-link',
      } as const)[confirmDelete.type]
    : '';

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
          onOpenFields={() => setFieldsOpen(true)}
          onOpenPrivacy={() => setReviewPrivacy(true)}
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
              activeMapId={activeMapId}
              onActiveMapChange={setActiveMapId}
              onCreateMap={() => openCreate('maps')}
              onCreatePerson={() => openCreate('people')}
              focusMarkerId={focusMarkerId}
              onFocusHandled={() => setFocusMarkerId(null)}
            />
          ) : (
            <BrowseList
              key={activeView}
              type={activeView as EntityView}
              onOpen={(id) => openFromList(activeView as EntityView, id)}
              onEdit={(id) => openEdit(activeView as EntityView, id)}
              onDelete={(id) => void requestDelete(activeView as EntityView, id)}
              onShowOnMap={(id) => void showOnMap(id)}
              onCreate={() => openCreate(activeView as EntityView)}
            />
          )}
        </main>
      </div>

      {/* Visually-hidden live region for the Show-on-map DOM→canvas bridge (Accessibility). */}
      <div className={styles.srOnly} aria-live="polite" role="status">
        {announce}
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
        onOpenEntity={(type, id) => {
          // link-to-entity navigation (D-10): markers/relationship-links aren't profile types,
          // so only the four first-class families open a profile (list context).
          if (type !== 'markers') {
            setProfile({ type: type as ProfileEntityType, id, openedFrom: 'list' });
          }
        }}
      />

      {/* Always-mounted so Radix can animate/clean up its overlay on close (restoring body
          pointer-events). `open` is the single source of visibility; `form` carries the args. */}
      <EntityForm
        open={!!form}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
        entityType={form?.type ?? 'people'}
        entity={form?.editingId ? editingEntity : null}
        onSaved={(id) => void handleSaved(id)}
      />

      {/* Per-type field manager (S13) — edits the active view's schema; Map → People (no custom
          fields on the Map surface itself). Opened from the nav "Fields" item. */}
      <FieldManager
        open={fieldsOpen}
        onOpenChange={setFieldsOpen}
        entityType={activeView === 'map' ? 'people' : (activeView as EntityView)}
      />

      {/* Browse-row "Delete {entity}" — brick, full cascade (S21). */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={`Delete this ${deleteSingular}?`}
        body={
          confirmDelete
            ? `${confirmDelete.name} will be removed from your database and every map it appears on. This can't be undone unless you restore a backup.`
            : ''
        }
        confirmLabel={`Delete ${deleteSingular}`}
        cancelLabel="Cancel"
        onConfirm={() => {
          if (!confirmDelete) return;
          const { type, id } = confirmDelete;
          void deleteEntity(type, id).then(() => {
            if (profile?.id === id) setProfile(null);
          });
        }}
      />

      {/* One-time privacy/sensitivity notice (S20, D-19) — re-viewable from the nav. */}
      <PrivacyNotice open={privacyOpen} onDismiss={() => void dismissPrivacy()} />

      <UpdateToast />
      <InstallPrompt />
    </div>
  );
}

// ProfileSidebar — the right-docked dossier panel that opens on marker selection (map
// context) OR on a browse-row click (list context, plan 02-03).
//
// Reads the selected entity reactively via useLiveQuery (Dexie is source of truth). It is
// entity-generic over the four first-class types: People keep their full DATA-02 rendering
// (phone/description/tags), while Locations/Groups/Relationship-links render the shared spine
// (name + notes + gallery) plus their type-specific spine fields. The round thumbnail shows
// the avatar, the People initials fallback, or — for non-People — a paper-shade square with
// the type's Lucide glyph (U2). The entity name uses the Fraunces display face.
//
// Canvas->AT bridge (UI-SPEC): the canvas is opaque to screen readers, so opening the
// sidebar moves focus into it AND announces "Selected {Name}" via a visually-hidden
// aria-live region — that is how a marker click reaches keyboard/AT users.
//
// Security: all user text (name, phone, description, tags, notes, label, date) is rendered as
// React children — never dangerouslySetInnerHTML (T-03-01: an XSS could exfiltrate the Drive token).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  UsersRound,
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Map as MapIcon,
} from 'lucide-react';
import { db } from '@/db/schema';
import { deleteEntity, deleteMarker, getMedia, listRelationshipsFor } from '@/db/repository';
import { useBlobImage } from '@/features/person-map/useMapImage';
import { PhotoGallery } from './PhotoGallery';
import { PhotoLightbox } from './PhotoLightbox';
import { CustomFieldRows } from './CustomFieldRows';
import { AddRelationshipDialog } from './AddRelationshipDialog';
import { buildRelationshipRows, type DirectionGlyph } from './relationships';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import { initialsOf } from '@/features/common/initials';
import type {
  EntityType,
  Group,
  MapDoc,
  Marker,
  MediaRef,
  Person,
  RelationshipEndpointType,
  RelationshipLink,
} from '@/domain/types';
import styles from './ProfileSidebar.module.css';

/** Map a direction glyph to its Lucide icon (a shape, never a color — B2). */
function DirectionIcon({ glyph }: { glyph: DirectionGlyph }) {
  if (glyph === '→') return <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />;
  if (glyph === '←') return <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />;
  return <ArrowLeftRight size={14} strokeWidth={1.75} aria-hidden="true" />;
}

/** The deletable entity families a profile can render (markers are a separate concern). */
export type ProfileEntityType = 'people' | 'maps' | 'groups' | 'relationship-links';

/** One "Appears on" group: a map a person is placed on + the marker ids of every placement there. */
export interface PlacementGroup {
  mapId: string;
  markerIds: string[];
}

/**
 * Group a person's Marker rows by `mapId` (D-12) — the pure core of the "Appears on" list, extracted
 * so it is unit-testable without rendering. Only person-kind markers count (a portal carries a
 * `targetMapId`, not a `personId`); multiple placements on the SAME map collapse into one group whose
 * `markerIds` holds every placement (the first is the jump target). The caller resolves map names and
 * skips/marks any group whose map was deleted (T-03-10).
 */
export function groupPlacementsByMap(markers: Marker[]): PlacementGroup[] {
  const byMap = new Map<string, string[]>();
  for (const m of markers) {
    if (m.kind !== 'person') continue;
    const ids = byMap.get(m.mapId) ?? [];
    ids.push(m.id);
    byMap.set(m.mapId, ids);
  }
  return Array.from(byMap.entries()).map(([mapId, markerIds]) => ({ mapId, markerIds }));
}

/** Any entity record this sidebar can render — they share the spine fields it reads. */
type AnyEntity = Person | MapDoc | Group | RelationshipLink;

/** Human singular for an entity type, used in titles + the "Delete {entity}" copy. */
const SINGULAR: Record<ProfileEntityType, string> = {
  people: 'person',
  maps: 'location',
  groups: 'group',
  'relationship-links': 'relationship-link',
};

export interface ProfileSidebarProps {
  /** Legacy/marker path: the selected person id. Sugar for entityType='people'. */
  personId?: string | null;
  /** List path (plan 02-03): the entity family being shown. Defaults to 'people'. */
  entityType?: ProfileEntityType;
  /** List path: the entity id being shown. Falls back to `personId` when absent. */
  entityId?: string | null;
  /**
   * Which context opened the sidebar (D-11/D-12, S21). Decides the single destructive action:
   * `'marker'` shows neutral "Remove from map" (marker-only, non-destructive to the entity);
   * `'list'` shows brick "Delete {entity}" (full cascade). Defaults to `'marker'`.
   */
  openedFrom?: 'marker' | 'list';
  /** The marker to remove when `openedFrom === 'marker'`. Required for "Remove from map". */
  markerId?: string;
  onClose: () => void;
  onEdit: (entityId: string) => void;
  /** Raised after a successful delete so the host can clear selection. */
  onDeleted: (entityId: string) => void;
  /** Open another entity's profile — drives link-to-entity navigation (D-10, one-way). */
  onOpenEntity?: (type: EntityType, id: string) => void;
  /**
   * Jump-to-placement (D-12): an "Appears on" row sets the target map active and centers/selects the
   * placement. Fired with the map and the first marker id placed there.
   */
  onJumpToPlacement?: (mapId: string, markerId: string) => void;
  /**
   * Open this entity's map on the canvas — parity with the Locations-list "Open map ↗" action.
   * Only rendered for `type === 'maps'` (a Location IS a map): sets the map active + switches to the
   * Map view via the host's `openMap`. A neutral navigation control (no destructive semantics).
   */
  onOpenMap?: (id: string) => void;
}

/** Narrowers for spine fields that only exist on some entities (the type decides the table). */
function asPerson(entity: AnyEntity, type: ProfileEntityType): Person | null {
  return type === 'people' ? (entity as Person) : null;
}
function asLink(entity: AnyEntity, type: ProfileEntityType): RelationshipLink | null {
  return type === 'relationship-links' ? (entity as RelationshipLink) : null;
}

/** The non-People type glyph for the header thumbnail (U2). */
function TypeGlyph({ type }: { type: ProfileEntityType }) {
  if (type === 'maps') return <Building2 size={22} strokeWidth={1.75} aria-hidden="true" />;
  if (type === 'groups') return <UsersRound size={22} strokeWidth={1.75} aria-hidden="true" />;
  return <ArrowLeftRight size={22} strokeWidth={1.75} aria-hidden="true" />;
}

export function ProfileSidebar({
  personId,
  entityType,
  entityId,
  openedFrom = 'marker',
  markerId,
  onClose,
  onEdit,
  onDeleted,
  onOpenEntity,
  onJumpToPlacement,
  onOpenMap,
}: ProfileSidebarProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Whether the "+ Add relationship" authoring dialog is open (People/Group profiles).
  const [addRelOpen, setAddRelOpen] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | undefined>(undefined);
  // Lightbox host (S18): which ordered photo set is open and at what index. `null` = closed.
  // The gallery passes `entity.gallery`; a custom Photo field passes a single-photo array.
  const [lightbox, setLightbox] = useState<{ photos: MediaRef[]; index: number } | null>(null);
  // Mirror the lightbox-open state in a ref so the sidebar's window-level Esc handler reads the
  // value at the MOMENT of the keypress — Radix dismisses the lightbox on the same Escape and may
  // null the state before our bubble listener runs, which would otherwise let one Esc close both.
  const lightboxOpenRef = useRef(false);
  lightboxOpenRef.current = lightbox !== null;
  // The thumbnail that opened the lightbox, captured so focus returns there on dismiss (S18).
  // (The trigger is a plain button, not a Radix Dialog.Trigger, so we restore focus ourselves.)
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);

  /** Open the lightbox over `photos` at `index`, remembering the focused trigger for focus-return. */
  function openLightbox(photos: MediaRef[], index: number) {
    lightboxTriggerRef.current = (document.activeElement as HTMLElement) ?? null;
    setLightbox({ photos, index });
  }

  /** Close the lightbox and return focus to the originating thumbnail (S18). */
  function closeLightbox() {
    const trigger = lightboxTriggerRef.current;
    setLightbox(null);
    lightboxTriggerRef.current = null;
    // Restore focus after the overlay unmounts so Radix's own focus handling doesn't override it.
    if (trigger) requestAnimationFrame(() => trigger.focus());
  }

  const isMarkerContext = openedFrom === 'marker';
  const requestedType: ProfileEntityType = entityType ?? 'people';
  const id = entityId ?? personId ?? null;

  // Read the entity reactively from its table (Dexie is source of truth). The resolved record is
  // returned TOGETHER WITH the type it was read for: useLiveQuery yields the PREVIOUS result while
  // re-running after a [id,type] change, so pairing them keeps the rendered record and the type it
  // is narrowed against consistent — otherwise a profile switching across families (e.g. group ->
  // person) would briefly narrow the stale group as a Person and crash on `person.tags` (Rule 1).
  const resolved = useLiveQuery<{ type: ProfileEntityType; entity: AnyEntity } | undefined>(
    async () => {
      if (!id) return undefined;
      const record =
        requestedType === 'people'
          ? await db.people.get(id)
          : requestedType === 'maps'
            ? await db.maps.get(id)
            : requestedType === 'groups'
              ? await db.groups.get(id)
              : await db.relationshipLinks.get(id);
      return record ? { type: requestedType, entity: record } : undefined;
    },
    [id, requestedType],
  );
  const type = resolved?.type ?? requestedType;
  const entity = resolved?.entity;

  // ── "Appears on" placements (D-12, People only) ─────────────────────────────────────────────
  // Read this person's placements reactively (Dexie is source of truth) — every person-kind Marker
  // referencing this id — then group by mapId. A second reactive read of `db.maps` resolves each
  // map's NAME; a placement whose map was deleted is shown as a muted "(deleted map)" row rather
  // than crashing the sidebar (T-03-10), mirroring the portal deleted-target handling in 03-06.
  const placements = useLiveQuery(
    () =>
      id && requestedType === 'people'
        ? db.markers.where('personId').equals(id).filter((m) => m.kind === 'person').toArray()
        : Promise.resolve<Marker[]>([]),
    [id, requestedType],
    [] as Marker[],
  );
  const allMaps = useLiveQuery(() => db.maps.toArray(), [], [] as MapDoc[]);
  const placementGroups = useMemo(() => groupPlacementsByMap(placements ?? []), [placements]);
  const mapNameById = useMemo(() => {
    const by = new Map<string, string>();
    for (const m of allMaps ?? []) by.set(m.id, m.name);
    return by;
  }, [allMaps]);

  // ── Relationships (REL-01/REL-02, People + Groups only) ─────────────────────────────────────
  // Read every canonical RelationshipLink where THIS entity is an endpoint (D-04, single source of
  // truth — the same link shows on both ends), gated to people|groups so Locations never get the
  // section (D-03). A second reactive read of people + groups resolves the OTHER endpoint's name; a
  // link to a deleted entity renders a muted "(deleted person/group)" row rather than crashing
  // (T-04-10), mirroring the "(deleted map)" orphan guard above. The pure `buildRelationshipRows`
  // helper drops any legacy endpoint-less shell so it never renders as a broken row.
  const isRelationshipHost = requestedType === 'people' || requestedType === 'groups';
  const relationshipLinks = useLiveQuery(
    () =>
      id && isRelationshipHost ? listRelationshipsFor(id) : Promise.resolve<RelationshipLink[]>([]),
    [id, requestedType],
    [] as RelationshipLink[],
  );
  const allPeople = useLiveQuery(
    () => (isRelationshipHost ? db.people.toArray() : Promise.resolve<Person[]>([])),
    [requestedType],
    [] as Person[],
  );
  const allGroups = useLiveQuery(
    () => (isRelationshipHost ? db.groups.toArray() : Promise.resolve<Group[]>([])),
    [requestedType],
    [] as Group[],
  );
  const relationshipRows = useMemo(() => {
    if (!id) return [];
    const peopleById = new Map((allPeople ?? []).map((p) => [p.id, p.name]));
    const groupsById = new Map((allGroups ?? []).map((g) => [g.id, g.name]));
    const resolveName = (t: RelationshipEndpointType, eid: string): string | undefined =>
      t === 'people' ? peopleById.get(eid) : groupsById.get(eid);
    return buildRelationshipRows(id, relationshipLinks ?? [], resolveName);
  }, [id, relationshipLinks, allPeople, allGroups]);

  // Load the avatar thumbnail blob for the header.
  useEffect(() => {
    let cancelled = false;
    if (entity?.photo) {
      void getMedia(entity.photo.hash).then((b) => {
        if (!cancelled) setPhotoBlob(b);
      });
    } else {
      setPhotoBlob(undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [entity?.photo?.hash, entity?.id]);

  const avatar = useBlobImage(photoBlob);

  // Move focus into the panel when it opens (canvas->AT bridge).
  useEffect(() => {
    if (entity) panelRef.current?.focus();
  }, [entity?.id]);

  // Esc closes (returns focus to a stable anchor handled by the host).
  useEffect(() => {
    if (!entity) return;
    function onKey(e: KeyboardEvent) {
      // While a modal overlay (confirm dialog OR lightbox) is open, Esc belongs to it — the
      // sidebar must not steal it, or one Esc would close both. The lightbox check reads a ref
      // so it is correct even if Radix has already begun closing on this same keypress.
      if (e.key === 'Escape' && !confirmOpen && !lightboxOpenRef.current) onClose();
    }
    // Capture phase so this guard runs before Radix's dismiss layer can null the state.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [entity?.id, confirmOpen, onClose]);

  if (!id || !entity) return null;

  const singular = SINGULAR[type];
  const person = asPerson(entity, type);
  const link = asLink(entity, type);
  // The gallery component expects a `{ gallery: MediaRef[] }` shape — every entity has it.
  const galleryHost = { gallery: entity.gallery as MediaRef[] } as Person;

  return (
    <>
      {/* Visually-hidden live region: announces selection to screen readers. */}
      <div className={styles.srOnly} aria-live="polite" role="status">
        Selected {entity.name}
      </div>

      <aside
        ref={panelRef}
        className={styles.panel}
        tabIndex={-1}
        aria-label={`Profile: ${entity.name}`}
        data-testid="profile-sidebar"
      >
        <div className={styles.header}>
          <span className={styles.thumb}>
            {avatar ? (
              <img src={avatar.src} alt="" className={styles.thumbImg} />
            ) : type === 'people' ? (
              <span className={styles.thumbInitials}>{initialsOf(entity.name)}</span>
            ) : (
              <span className={styles.thumbInitials} aria-hidden="true">
                <TypeGlyph type={type} />
              </span>
            )}
          </span>
          <h2 className={styles.name} data-testid="profile-name">
            {entity.name}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.body}>
          {/* Person-only DATA-02 fields. */}
          {person?.phone && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Phone</span>
              <span className={styles.rowValue} data-testid="profile-phone">
                {person.phone}
              </span>
            </div>
          )}
          {person?.description && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Description</span>
              <span className={styles.rowValue} data-testid="profile-description">
                {person.description}
              </span>
            </div>
          )}
          {person && person.tags.length > 0 && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Tags</span>
              <span className={styles.chips} data-testid="profile-tags">
                {person.tags.map((tag) => (
                  <span key={tag} className={styles.chip}>
                    {tag}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Appears on (D-12) — People only: every map this person is placed on, grouped by map,
              each row a jump-to-placement button (sets the map active + centers/selects the
              placement). Map names render as React children (XSS-safe, T-03-01). A placement whose
              map was deleted shows a muted "(deleted map)" row instead of crashing (T-03-10). */}
          {person && (
            <div className={styles.row}>
              <span className={styles.appearsOnEyebrow} data-testid="profile-appears-on">
                Appears on
              </span>
              {placementGroups.length === 0 ? (
                <span className={styles.appearsOnEmpty} data-testid="profile-appears-on-empty">
                  Not placed on any map yet.
                </span>
              ) : (
                <span className={styles.appearsOnList}>
                  {placementGroups.map((group) => {
                    const name = mapNameById.get(group.mapId);
                    if (name === undefined) {
                      return (
                        <span
                          key={group.mapId}
                          className={styles.appearsOnDeleted}
                          data-testid="profile-appears-on-deleted"
                        >
                          (deleted map)
                        </span>
                      );
                    }
                    return (
                      <button
                        key={group.mapId}
                        type="button"
                        className={styles.appearsOnRow}
                        data-testid={`profile-appears-on-${group.mapId}`}
                        onClick={() => onJumpToPlacement?.(group.mapId, group.markerIds[0])}
                      >
                        {name}
                      </button>
                    );
                  })}
                </span>
              )}
            </div>
          )}

          {/* Relationships (REL-01/REL-02) — People + Groups only (D-03): every canonical link this
              entity is an endpoint of, each row [direction glyph] [label] · [other endpoint], with
              the other-endpoint name a nested button opening that entity (D-10). A deleted endpoint
              shows a muted "(deleted person/group)" row (T-04-10). The "+ Add relationship" button
              is neutral paper (B3 — amber stays reserved). All user text is a React child (T-04-01). */}
          {isRelationshipHost && (
            <div className={styles.row}>
              <span className={styles.appearsOnEyebrow} data-testid="profile-relationships">
                Relationships
              </span>
              {relationshipRows.length === 0 ? (
                <span className={styles.appearsOnEmpty} data-testid="profile-relationships-empty">
                  No relationships yet.
                </span>
              ) : (
                <span className={styles.relationshipsList} data-testid="profile-relationships-list">
                  {relationshipRows.map((r) => (
                    <span key={r.link.id} className={styles.relationshipRow}>
                      <button
                        type="button"
                        className={styles.relationshipRecord}
                        data-testid={`profile-relationship-${r.link.id}`}
                        onClick={() => onOpenEntity?.('relationship-links', r.link.id)}
                      >
                        <span className={styles.relationshipGlyph} aria-hidden="true">
                          <DirectionIcon glyph={r.glyph} />
                        </span>
                        {r.link.label && (
                          <span className={styles.relationshipLabel}>{r.link.label}</span>
                        )}
                      </button>
                      <span className={styles.relationshipSep} aria-hidden="true">
                        ·
                      </span>
                      {r.otherName === undefined ? (
                        <span
                          className={styles.appearsOnDeleted}
                          data-testid={`profile-relationship-deleted-${r.link.id}`}
                        >
                          (deleted {r.otherType === 'people' ? 'person' : 'group'})
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.relationshipEndpoint}
                          data-testid={`profile-relationship-endpoint-${r.otherId}`}
                          onClick={() => onOpenEntity?.(r.otherType, r.otherId)}
                        >
                          {r.otherName}
                        </button>
                      )}
                    </span>
                  ))}
                </span>
              )}
              <button
                type="button"
                className={styles.addRelationship}
                data-testid="profile-relationships-add"
                onClick={() => setAddRelOpen(true)}
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Add relationship
              </button>
            </div>
          )}

          {/* Relationship-link spine fields (REL-02). */}
          {link?.label && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Label</span>
              <span className={styles.rowValue} data-testid="profile-label">
                {link.label}
              </span>
            </div>
          )}
          {link?.date && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Date</span>
              <span className={styles.rowValue} data-testid="profile-date">
                {link.date}
              </span>
            </div>
          )}

          {/* Shared spine: notes (all types). */}
          {entity.notes && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Notes</span>
              <span className={styles.rowValue} data-testid="profile-notes">
                {entity.notes}
              </span>
            </div>
          )}

          {/* Custom-field read rows (S15) — appended after built-ins, before the gallery (U8). */}
          <CustomFieldRows
            entityType={type}
            custom={entity.custom}
            onOpenEntity={onOpenEntity}
            onOpenPhoto={(photo) => openLightbox([photo], 0)}
          />

          <div className={styles.row}>
            <span className={styles.rowLabel}>Photos</span>
            <PhotoGallery
              person={galleryHost}
              onOpen={(i) => openLightbox(galleryHost.gallery, i)}
            />
          </div>
        </div>

        <div className={styles.footer}>
          {/* Locations only: a neutral "Open map ↗" that navigates to this map on the canvas
              (parity with the browse-list action). Reuses the neutral paper `edit` button style —
              amber stays reserved. */}
          {type === 'maps' && (
            <button
              type="button"
              className={styles.edit}
              onClick={() => onOpenMap?.(entity.id)}
              data-testid="profile-open-map"
            >
              <MapIcon size={16} strokeWidth={1.75} aria-hidden="true" />
              Open map
            </button>
          )}
          <button
            type="button"
            className={styles.edit}
            onClick={() => onEdit(entity.id)}
            data-testid="profile-edit"
          >
            Edit
          </button>
          {/* Exactly ONE destructive action, by context (S21): neutral "Remove from map"
              (marker-only) OR brick "Delete {entity}" (full cascade). Never both. */}
          {isMarkerContext ? (
            <button
              type="button"
              className={styles.remove}
              onClick={() => setConfirmOpen(true)}
              data-testid="profile-remove"
            >
              Remove from map
            </button>
          ) : (
            <button
              type="button"
              className={styles.delete}
              onClick={() => setConfirmOpen(true)}
              data-testid="profile-delete"
            >
              Delete {singular}
            </button>
          )}
        </div>
      </aside>

      {isMarkerContext ? (
        // Marker context: neutral, non-destructive to the entity — deletes only the marker.
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Remove from this map?"
          body={`${entity.name} stays in your database and lists — only the marker on this map is removed.`}
          confirmLabel="Remove from map"
          cancelLabel="Cancel"
          onConfirm={() => {
            if (markerId) void deleteMarker(markerId).then(() => onClose());
            else onClose();
          }}
        />
      ) : (
        // List context: brick, full cascade — entity + all markers + media GC.
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete this ${singular}?`}
          body={`${entity.name} will be removed from your database and every map it appears on. This can't be undone unless you restore a backup.`}
          confirmLabel={`Delete ${singular}`}
          cancelLabel="Cancel"
          onConfirm={() => {
            const victimId = entity.id;
            void deleteEntity(type, victimId).then(() => onDeleted(victimId));
          }}
        />
      )}

      {/* Photo lightbox (S18) — opens from a gallery tile or a custom Photo thumbnail. Radix
          returns focus to the originating thumbnail on dismiss. */}
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          index={lightbox.index}
          open
          onOpenChange={(o) => {
            if (!o) closeLightbox();
          }}
          onIndexChange={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
        />
      )}

      {/* Add-relationship authoring flow (REL-01/REL-02) — People/Group profiles only. Writes ONE
          canonical link with THIS entity as `from`; it auto-appears on both endpoints (D-04). */}
      {isRelationshipHost && (
        <AddRelationshipDialog
          open={addRelOpen}
          onOpenChange={setAddRelOpen}
          fromType={type as RelationshipEndpointType}
          fromId={entity.id}
          fromName={entity.name}
        />
      )}
    </>
  );
}

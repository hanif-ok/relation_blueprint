// BrowseRow — a single 64px browse-list row (S12). The whole row is a `role="button"` that
// opens the entity's profile in LIST context (D-16); nested controls (Show-on-map, the overflow
// menu) use stopPropagation and are separately tabbable.
//
// Left: a 48px thumbnail — People = round avatar/initials (via the shared `initialsOf`);
// Locations/Groups/Relationship-links = a radius-md paper-shade square with the type's Lucide
// glyph in ink-muted, OR the entity's first gallery photo if present (D-21, U2).
// Center: name (Body-16 ink) + a secondary line (Label-13 ink-muted): tags chips, else "updated Nd ago".
// Right: a neutral "Show on map ↗" icon button (disabled-with-tooltip for non-spatial types) and
// a Radix DropdownMenu overflow "⋯" offering Edit + the type's "Delete {entity}".
//
// Security: name + secondary line render as React children — never dangerouslySetInnerHTML (T-03-01).

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Building2,
  UsersRound,
  ArrowLeftRight,
  ExternalLink,
  Map as MapIcon,
  MoreHorizontal,
} from 'lucide-react';
import { initialsOf } from '@/features/profile/ProfileSidebar';
import { useEntityThumb } from './useEntityThumb';
import {
  type BrowseEntity,
  type BrowseEntityType,
  SINGULAR,
  isSpatial,
  isOpenableMap,
  showOnMapDisabledReason,
  entityTags,
  entityMedia,
} from './browseTypes';
import styles from './BrowseList.module.css';

export interface BrowseRowProps {
  entity: BrowseEntity;
  type: BrowseEntityType;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onShowOnMap: (id: string) => void;
  onOpenMap: (id: string) => void;
}

/** The non-People type glyph for the default thumbnail (U2). */
function TypeGlyph({ type }: { type: BrowseEntityType }) {
  if (type === 'maps') return <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />;
  if (type === 'groups') return <UsersRound size={20} strokeWidth={1.75} aria-hidden="true" />;
  return <ArrowLeftRight size={20} strokeWidth={1.75} aria-hidden="true" />;
}

/** A coarse "updated Nd ago" fallback for the secondary line (mono). */
function updatedAgo(updatedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - updatedAt) / 86_400_000));
  if (days === 0) return 'updated today';
  return `updated ${days}d ago`;
}

export function BrowseRow({
  entity,
  type,
  onOpen,
  onEdit,
  onDelete,
  onShowOnMap,
  onOpenMap,
}: BrowseRowProps) {
  const { photo, gallery } = entityMedia(entity);
  const thumbUrl = useEntityThumb(photo, gallery);
  const tags = entityTags(entity, type);
  const spatial = isSpatial(type);
  const singular = SINGULAR[type];

  return (
    <div
      className={styles.row}
      role="button"
      tabIndex={0}
      data-testid="browse-row"
      onClick={() => onOpen(entity.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(entity.id);
        }
      }}
    >
      <span
        className={type === 'people' ? styles.thumbRound : styles.thumbSquare}
        aria-hidden="true"
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className={styles.thumbImg} />
        ) : type === 'people' ? (
          <span className={styles.thumbInitials}>{initialsOf(entity.name)}</span>
        ) : (
          <TypeGlyph type={type} />
        )}
      </span>

      <span className={styles.rowMain}>
        <span className={styles.rowName} data-testid="browse-row-name">
          {entity.name}
        </span>
        <span className={styles.rowSecondary}>
          {tags.length > 0 ? (
            <span className={styles.rowTags}>
              {tags.slice(0, 4).map((tag) => (
                <span key={tag} className={styles.rowTag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : (
            <span className={styles.rowMeta}>{updatedAgo(entity.updatedAt)}</span>
          )}
        </span>
      </span>

      {isOpenableMap(type) ? (
        // Locations ARE maps: an enabled "Open map ↗" that navigates to this map on the canvas.
        // Distinct from People's "Show on map" (placement) — a separate testid + branch.
        <button
          type="button"
          className={styles.showOnMap}
          aria-label="Open map"
          title="Open map"
          data-testid="browse-open-map"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMap(entity.id);
          }}
        >
          <MapIcon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className={styles.showOnMap}
          aria-label={spatial ? 'Show on map' : showOnMapDisabledReason(type)}
          title={spatial ? 'Show on map' : showOnMapDisabledReason(type)}
          disabled={!spatial}
          data-testid="browse-show-on-map"
          onClick={(e) => {
            e.stopPropagation();
            if (spatial) onShowOnMap(entity.id);
          }}
        >
          <ExternalLink size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={styles.overflow}
            aria-label="More actions"
            data-testid="browse-overflow"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={styles.menu}
            sideOffset={4}
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu.Item
              className={styles.menuItem}
              data-testid="browse-edit"
              onSelect={() => onEdit(entity.id)}
            >
              Edit
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              data-testid="browse-delete"
              onSelect={() => onDelete(entity.id)}
            >
              Delete {singular}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

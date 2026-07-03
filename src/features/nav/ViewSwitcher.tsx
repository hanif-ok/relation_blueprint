// ViewSwitcher — the left-nav rail (S10) that swaps the main surface between the Map view and
// the four browse lists (D-13). It is a single tab-stop group with roving arrow-key focus:
// ↑/↓ move focus between items, Enter/Space activate the focused view, Tab leaves to the main
// surface. The active item gets `aria-current="page"`, a 3px ink-muted left-edge bar, and ink
// (not amber) text — amber is reserved for creation/placement only (U1, A8).
//
// Each entity view shows a trailing mono count pill from a live per-type count
// (`useLiveQuery(db.<table>.count())`), "—" while loading. A hairline divider separates the
// Views section from the Tools section (Fields, About/Privacy). On narrow viewports the rail
// collapses to icon-only — every item keeps an `aria-label` so it stays labelled (FLAG 1).

import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Map as MapIcon,
  Users,
  Building2,
  UsersRound,
  ArrowLeftRight,
  Share2,
  Settings2,
  Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '@/db/schema';
import styles from './ViewSwitcher.module.css';

/**
 * The selectable main-surface views. 'map' is the Phase-1 Konva surface; 'graph' is the Phase-4
 * viewer-only Cytoscape relationship graph (D-11); the rest are browse lists.
 */
export type ViewKey = 'map' | 'people' | 'maps' | 'groups' | 'relationship-links' | 'graph';

/** Entity view keys that carry a live count pill (everything except the Map and Graph views). */
type EntityViewKey = Exclude<ViewKey, 'map' | 'graph'>;

export interface ViewSwitcherProps {
  active: ViewKey;
  onSelectView: (view: ViewKey) => void;
  onOpenFields: () => void;
  onOpenPrivacy: () => void;
}

interface ViewItem {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
}

const VIEW_ITEMS: ViewItem[] = [
  { key: 'map', label: 'Map', icon: MapIcon },
  { key: 'people', label: 'People', icon: Users },
  { key: 'maps', label: 'Locations', icon: Building2 },
  { key: 'groups', label: 'Groups', icon: UsersRound },
  { key: 'relationship-links', label: 'Relationship-links', icon: ArrowLeftRight },
  { key: 'graph', label: 'Graph', icon: Share2 },
];

/** Views with no trailing count pill (spatial surfaces, not entity lists). */
const NO_PILL: ReadonlySet<ViewKey> = new Set<ViewKey>(['map', 'graph']);

/** Format a live count, or "—" while the query is still resolving. */
function pill(count: number | undefined): string {
  return count === undefined ? '—' : String(count);
}

export function ViewSwitcher({
  active,
  onSelectView,
  onOpenFields,
  onOpenPrivacy,
}: ViewSwitcherProps) {
  // Live per-type counts for the trailing pills (U1/S10).
  const peopleCount = useLiveQuery(() => db.people.count(), []);
  const locationCount = useLiveQuery(() => db.maps.count(), []);
  const groupCount = useLiveQuery(() => db.groups.count(), []);
  const linkCount = useLiveQuery(() => db.relationshipLinks.count(), []);

  const counts: Record<EntityViewKey, number | undefined> = {
    people: peopleCount,
    maps: locationCount,
    groups: groupCount,
    'relationship-links': linkCount,
  };

  // Roving focus: one tab stop for the whole nav; ↑/↓ move focus, Enter/Space activate.
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The ordered list of focusable items = view items + the two tools items.
  const order: ViewKey[] = VIEW_ITEMS.map((v) => v.key);
  const TOOLS_FIELDS = order.length; // index of "Fields"
  const TOOLS_PRIVACY = order.length + 1; // index of "About / Privacy"
  const total = order.length + 2;

  function focusItem(index: number) {
    const clamped = (index + total) % total;
    itemRefs.current[clamped]?.focus();
  }

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(total - 1);
    }
  }

  // Roving tabindex: only the active view (or first item) is in the tab order.
  const activeIndex = Math.max(
    0,
    order.findIndex((k) => k === active),
  );

  return (
    <nav className={styles.rail} aria-label="Views" data-testid="view-switcher">
      <ul className={styles.section} role="list">
        {VIEW_ITEMS.map((item, index) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          const countLabel = NO_PILL.has(item.key)
            ? undefined
            : pill(counts[item.key as EntityViewKey]);
          return (
            <li key={item.key} role="listitem">
              <button
                type="button"
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={isActive ? `${styles.item} ${styles.itemActive}` : styles.item}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                // Hover tooltip so the icon-only narrow rail is discoverable for mouse users (F-3);
                // complements the always-present aria-label (which feeds AT, not hover).
                title={item.label}
                tabIndex={index === activeIndex ? 0 : -1}
                data-testid={`view-${item.key}`}
                onClick={() => onSelectView(item.key)}
                onKeyDown={(e) => onItemKeyDown(e, index)}
              >
                <Icon size={20} strokeWidth={1.75} className={styles.glyph} aria-hidden="true" />
                <span className={styles.label}>{item.label}</span>
                {countLabel !== undefined && (
                  <span className={styles.count} data-testid={`count-${item.key}`}>
                    {countLabel}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <hr className={styles.divider} />

      <ul className={styles.section} role="list">
        <li role="listitem">
          <button
            type="button"
            ref={(el) => {
              itemRefs.current[TOOLS_FIELDS] = el;
            }}
            className={styles.item}
            aria-label="Fields"
            title="Fields"
            tabIndex={-1}
            data-testid="view-fields"
            onClick={onOpenFields}
            onKeyDown={(e) => onItemKeyDown(e, TOOLS_FIELDS)}
          >
            <Settings2 size={20} strokeWidth={1.75} className={styles.glyph} aria-hidden="true" />
            <span className={styles.label}>Fields</span>
          </button>
        </li>
        <li role="listitem">
          <button
            type="button"
            ref={(el) => {
              itemRefs.current[TOOLS_PRIVACY] = el;
            }}
            className={styles.item}
            aria-label="About and Privacy"
            title="About / Privacy"
            tabIndex={-1}
            data-testid="view-privacy"
            onClick={onOpenPrivacy}
            onKeyDown={(e) => onItemKeyDown(e, TOOLS_PRIVACY)}
          >
            <Info size={20} strokeWidth={1.75} className={styles.glyph} aria-hidden="true" />
            <span className={styles.label}>About / Privacy</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

// MapSwitcher (D-05 / UI-SPEC S13) — the in-editor toolbar control that switches the active map
// and offers a "+ New map" quick-create (D-18). It is the Phase-3 in-canvas counterpart to the
// Phase-2 Locations browse list "show on map" path: both set the active map, this one without
// leaving the Map view.
//
// Structure mirrors NewEntityMenu exactly (Radix DropdownMenu: Root → Trigger asChild → Portal →
// Content → Item) so the accessibility (focus trap, Esc, roving focus, return-to-trigger) is the
// installed primitive's, not hand-rolled. The trigger shows the active map name + a chevron; each
// map is an item that calls `onActiveMapChange(id)`; a separated bottom item runs `onCreateMap`
// (which routes through App's existing create-map flow — the same EntityForm the Locations "+ New"
// uses). Paper chrome from tokens; amber stays reserved (it appears only on the focus ring, never
// as a fill here).

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Plus } from 'lucide-react';
import { db } from '@/db/schema';
import styles from './MapSwitcher.module.css';

export interface MapSwitcherProps {
  /** The id of the map currently shown on the canvas (drives the active checkmark + fallback). */
  activeMapId: string | null;
  /** The active map's display name, shown on the trigger (passed in so the trigger never flickers
   *  while the maps list loads). */
  activeMapName: string;
  /** Raised with a map id when the user selects a different map. */
  onActiveMapChange: (id: string) => void;
  /** Raised when the user picks "+ New map" — host opens the create-Location flow (D-18). */
  onCreateMap: () => void;
}

export function MapSwitcher({
  activeMapId,
  activeMapName,
  onActiveMapChange,
  onCreateMap,
}: MapSwitcherProps) {
  // Live list of all maps so a newly-created map appears in the switcher immediately.
  const maps = useLiveQuery(() => db.maps.orderBy('name').toArray(), [], []);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.trigger} data-testid="map-switcher-trigger">
          <span className={styles.triggerLabel}>{activeMapName || 'Select a map'}</span>
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={6} align="start">
          {(maps ?? []).map((m) => (
            <DropdownMenu.Item
              key={m.id}
              className={styles.item}
              data-testid={`map-switcher-item-${m.id}`}
              data-active={m.id === activeMapId ? '' : undefined}
              onSelect={() => onActiveMapChange(m.id)}
            >
              {m.id === activeMapId ? '✓ ' : ''}
              {m.name}
            </DropdownMenu.Item>
          ))}
          {(maps ?? []).length > 0 && <DropdownMenu.Separator className={styles.separator} />}
          <DropdownMenu.Item
            className={styles.item}
            data-testid="map-switcher-new"
            onSelect={onCreateMap}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" className={styles.newIcon} />
            New map
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

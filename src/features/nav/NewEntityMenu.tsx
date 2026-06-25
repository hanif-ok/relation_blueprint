// NewEntityMenu — the top-bar "+ New ▾" create menu (U5). A Radix DropdownMenu triggered by
// the single amber create button (amber stays reserved for creation — UI-SPEC A8). Selecting
// an item raises `onCreate(entityType)` so the host opens the generalized EntityForm.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { EntityFormType } from '@/features/entity-form/EntityForm';
import styles from './NewEntityMenu.module.css';

export interface NewEntityMenuProps {
  /** Raised with the chosen entity family when a menu item is selected. */
  onCreate: (entityType: EntityFormType) => void;
  /** Optional disabled state (e.g. while the DB is unavailable). */
  disabled?: boolean;
}

const ITEMS: { type: EntityFormType; label: string }[] = [
  { type: 'people', label: '+ Person' },
  { type: 'maps', label: '+ Location' },
  { type: 'groups', label: '+ Group' },
  { type: 'relationship-links', label: '+ Relationship-link' },
];

export function NewEntityMenu({ onCreate, disabled }: NewEntityMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.trigger}
          disabled={disabled}
          data-testid="new-entity-trigger"
        >
          + New
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={6} align="end">
          {ITEMS.map((item) => (
            <DropdownMenu.Item
              key={item.type}
              className={styles.item}
              data-testid={`new-entity-${item.type}`}
              onSelect={() => onCreate(item.type)}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

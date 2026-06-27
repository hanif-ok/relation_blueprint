// ToolPalette — the editor tool strip (D-17, UI-SPEC S10). Seven icon buttons, left→right, with
// Select first and default. The active tool gets a 2px amber bar + paper-shade fill (amber is the
// reserved active-tool accent, UI-SPEC A8); the rest are ink glyphs, paper-shade on hover. Each
// button is a 44px hit (48px on `pointer: coarse`) with an always-present `aria-label` and a
// tooltip carrying its single-key shortcut (V/R/O/L/P/T/M). The whole strip is ONE tab stop with
// arrow-key roving focus (mirrors ViewSwitcher). When no map is active every button is disabled
// with a "Open or create a map first" reason.
//
// State-free: the active `tool` + `setTool` are owned by the MapView's `useToolMode` instance and
// passed in as props, so the palette is a pure presentational control.

import { useRef } from 'react';
import {
  MousePointer2,
  Square,
  Circle,
  Slash,
  Pentagon,
  DoorOpen,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Tool } from './useToolMode';
import styles from './ToolPalette.module.css';

export interface ToolPaletteProps {
  /** The active tool (from the MapView's useToolMode). */
  tool: Tool;
  /** Arm a tool. */
  onSelectTool: (tool: Tool) => void;
  /** Disable the whole palette with a reason when no map is active (UI-SPEC S10). */
  disabled?: boolean;
}

interface ToolItem {
  key: Tool;
  label: string;
  /** Single-key shortcut shown in the tooltip (UI-SPEC S10). */
  shortcut: string;
  icon: LucideIcon;
}

/** Left→right order; Select first/default (UI-SPEC S10). Shortcuts: V/R/O/L/P/T/M. */
const TOOLS: ToolItem[] = [
  { key: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { key: 'rect', label: 'Rectangle', shortcut: 'R', icon: Square },
  { key: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { key: 'line', label: 'Line', shortcut: 'L', icon: Slash },
  { key: 'polygon', label: 'Polygon', shortcut: 'P', icon: Pentagon },
  { key: 'portal', label: 'Portal', shortcut: 'T', icon: DoorOpen },
  { key: 'person', label: 'Place person', shortcut: 'M', icon: UserPlus },
];

const DISABLED_REASON = 'Open or create a map first';

export function ToolPalette({ tool, onSelectTool, disabled }: ToolPaletteProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusItem(index: number) {
    const clamped = (index + TOOLS.length) % TOOLS.length;
    itemRefs.current[clamped]?.focus();
  }

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(TOOLS.length - 1);
    }
  }

  // Roving tabindex: only the active tool (or the first item) is in the tab order.
  const activeIndex = Math.max(
    0,
    TOOLS.findIndex((t) => t.key === tool),
  );

  return (
    <div
      className={styles.palette}
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="horizontal"
      data-testid="tool-palette"
    >
      {TOOLS.map((item, index) => {
        const isActive = item.key === tool;
        const Icon = item.icon;
        const title = disabled ? DISABLED_REASON : `${item.label} (${item.shortcut})`;
        return (
          <button
            key={item.key}
            type="button"
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={isActive ? `${styles.tool} ${styles.toolActive}` : styles.tool}
            aria-label={item.label}
            aria-pressed={isActive}
            title={title}
            disabled={disabled}
            tabIndex={index === activeIndex ? 0 : -1}
            data-testid={`tool-${item.key}`}
            onClick={() => onSelectTool(item.key)}
            onKeyDown={(e) => onItemKeyDown(e, index)}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

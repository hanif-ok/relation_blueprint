// StylePopover — the minimal shape-styling surface (D-02/D-03, UI-SPEC S17). Opened when a shape
// is selected. Built on the INSTALLED Radix Dialog (RESEARCH says Popover is optional; we prefer
// the already-present @radix-ui/react-dialog over adding a new dependency — threat T-03-SC). The
// whole styling surface is exactly three controls:
//   1. a 5-swatch preset palette (Stone/Sage/Clay/Dusk/Plum), single-select, amber ring on current
//   2. a Fill on/off toggle (forced off + disabled for `line` shapes, UI-SPEC l.160)
//   3. a zone Label text input (a non-empty label promotes the shape to a zone, D-02)
// There is intentionally NO color picker / stroke-width / opacity / dashes (D-03 deferred).
//
// Every change writes through `updateMap` (MapDoc.shapes), never straight to Dexie. A fourth
// control — a move-to-layer dropdown (D-04) — sets the shape's `layerId` so it re-orders/filters
// against the layers panel immediately.

import { useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { zonePresets } from '@/app/tokens';
import { updateMapShapes } from '@/db/repository';
import type { MapDoc, Shape } from '@/domain/types';
import styles from './StylePopover.module.css';

/** The five presets, in palette order (D-03). Keys are the lowercased preset ids stored on Shape. */
const PRESETS = [
  { id: 'stone', label: 'Stone' },
  { id: 'sage', label: 'Sage' },
  { id: 'clay', label: 'Clay' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'plum', label: 'Plum' },
] as const;

export interface StylePopoverProps {
  /** Open when a shape is selected. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The map owning the shape (shapes persist on it via updateMap). */
  map: MapDoc;
  /** The selected shape, or null when nothing is selected. */
  shape: Shape | null;
  /** Remove the selected shape (also clears the selection/Transformer). */
  onDelete: () => void;
}

export function StylePopover({ open, onOpenChange, map, shape, onDelete }: StylePopoverProps) {
  const titleId = useId();
  const labelInputId = useId();
  const layerSelectId = useId();

  if (!shape) return null;

  const isLine = shape.kind === 'line';

  /** Rewrite the selected shape with a patch and persist via updateMapShapes. */
  function patchShape(patch: Partial<Shape>) {
    if (!shape) return;
    // WR-01: patch against the FRESHLY-READ shapes array, not this render snapshot, so a concurrent
    // draw/edit isn't clobbered by a stale full-array overwrite.
    void updateMapShapes(map.id, (shapes) =>
      shapes.map((s) => (s.id === shape.id ? { ...s, ...patch } : s)),
    );
  }

  return (
    // Non-modal (modal={false}): the styling surface must NOT make the Stage inert or occlude it —
    // selecting a shape ALSO attaches the Transformer (reshape handles), and the curator has to reach
    // those handles on the canvas while this panel is open. A modal Radix Dialog (the previous default)
    // rendered a full-viewport blocking overlay + a center-screen box that hid the handles entirely —
    // that was the "clicking a shape opens the panel instead of letting me reshape" bug. There is no
    // <Dialog.Overlay> for the same reason (no blocking scrim).
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          className={styles.content}
          aria-labelledby={titleId}
          data-testid="style-popover"
          // Keep the panel open while the curator manipulates the Transformer on the canvas (a
          // pointer-down "outside" the panel is exactly a handle grab). It closes only via Done/Delete,
          // Escape, or MapView's own selection changes — never by touching the canvas.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title id={titleId} className={styles.title}>
            Shape style
          </Dialog.Title>

          {/* 1 — preset palette (single-select). The current preset gets an amber ring. */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Preset</span>
            <div className={styles.swatches} role="radiogroup" aria-label="Preset">
              {PRESETS.map((p) => {
                const active = shape.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={p.label}
                    title={p.label}
                    data-testid={`preset-${p.id}`}
                    className={active ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch}
                    style={{ background: zonePresets[p.id].stroke }}
                    onClick={() => patchShape({ preset: p.id })}
                  />
                );
              })}
            </div>
          </div>

          {/* 2 — fill on/off. Forced off + disabled for line shapes (UI-SPEC l.160). */}
          <div className={styles.section}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={!isLine && shape.fill}
                disabled={isLine}
                data-testid="fill-toggle"
                onChange={(e) => patchShape({ fill: e.target.checked })}
              />
              <span>Fill{isLine ? ' (not available for lines)' : ''}</span>
            </label>
          </div>

          {/* 3 — zone label. A non-empty label promotes the shape to a zone (D-02). */}
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor={labelInputId}>
              Zone label
            </label>
            <input
              id={labelInputId}
              type="text"
              className={styles.input}
              value={shape.label ?? ''}
              placeholder="e.g. Lobby"
              data-testid="label-input"
              onChange={(e) => patchShape({ label: e.target.value })}
            />
          </div>

          {/* 4 — move-to-layer (D-04). Choosing a layer sets the shape's `layerId` and persists via
              updateMap; the content render re-orders/filters by the new layer immediately. */}
          {map.layers.length > 0 && (
            <div className={styles.section}>
              <label className={styles.sectionLabel} htmlFor={layerSelectId}>
                Layer
              </label>
              <select
                id={layerSelectId}
                className={styles.input}
                value={shape.layerId}
                data-testid="shape-layer-select"
                onChange={(e) => patchShape({ layerId: e.target.value })}
              >
                {/* Top→bottom so the dropdown order mirrors the panel (highest order first). */}
                {map.layers
                  .slice()
                  .sort((a, b) => b.order - a.order)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className={styles.actions}>
            {/* Delete removes THIS shape from the map (and clears the selection/Transformer). The
                keyboard Delete/Backspace path in MapView does the same — this button is the
                touch-reachable affordance (no hardware Delete key on a tablet/phone). */}
            <button
              type="button"
              className={styles.delete}
              data-testid="shape-delete"
              onClick={onDelete}
            >
              Delete
            </button>
            <Dialog.Close asChild>
              <button type="button" className={styles.done}>
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

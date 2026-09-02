// MultiSelectBar — the action bar for a marquee multi-selection (2+ banded objects).
//
// WHY A NEW SURFACE RATHER THAN WIDENING StylePopover (D-6). `StylePopover` opens for exactly ONE
// selected SHAPE and has no notion of markers or portals; a marquee selection is a mixed set of
// shapes, person-markers and portals. Rather than bend a single-shape styling panel into a bulk
// editor, the bulk actions get their own DOM overlay that mounts only while a 2+ selection exists.
//
// WHY BOTTOM-CENTRE. It is the one free edge of the Stage: the editor toolbar column (map switcher
// + breadcrumb + tool palette) overlays the TOP-LEFT out to roughly y=135 (a constraint recorded in
// `e2e/canvas-pan-marquee.spec.ts`), the LayersPanel docks 248px down the RIGHT edge, and `.bgHint`
// owns top-centre.
//
// This is a DOM overlay sibling of the Konva Stage, exactly like the `.marquee` band — NOT a Konva
// node — so it stays constant-weight chrome at any zoom. Unlike `.bgHint` it is INTERACTIVE, so it
// must never carry `pointer-events: none`.

import { useId } from 'react';
import type { Layer as MapLayer } from '@/domain/types';
import styles from './MultiSelectBar.module.css';

export interface MultiSelectBarProps {
  /** How many objects the band caught (shapes + markers together). The bar renders only for 2+. */
  count: number;
  /** Delete every selected object — routed through the SAME confirm path as the Delete key. */
  onDelete: () => void;
  /**
   * The active map's layers, for the bulk move-to-layer control. Rendered only when non-empty,
   * mirroring `StylePopover`'s own layer section.
   */
  layers?: MapLayer[];
  /** Apply one layer id to EVERY selected shape and marker/portal in a single action. */
  onMoveToLayer?: (layerId: string) => void;
}

export function MultiSelectBar({
  count,
  onDelete,
  layers = [],
  onMoveToLayer,
}: MultiSelectBarProps) {
  const layerSelectId = useId();
  if (count < 2) return null;

  return (
    <div className={styles.bar} data-testid="multi-select-bar" role="group" aria-label="Selection">
      <span className={styles.count} data-testid="multi-select-count">
        {count} selected
      </span>

      {/* Bulk move-to-layer (A3). One choice re-layers every selected shape AND marker/portal.
          Options are sorted top→bottom (highest order first), the same order StylePopover and the
          LayersPanel list them in, so the dropdown never contradicts the panel. The control is a
          momentary action, not a bound value: a mixed selection has no single current layer, so it
          shows a placeholder and resets after each application. */}
      {layers.length > 0 && onMoveToLayer && (
        <label className={styles.layerField} htmlFor={layerSelectId}>
          <span className={styles.layerLabel}>Layer</span>
          <select
            id={layerSelectId}
            className={styles.select}
            data-testid="multi-select-layer"
            value=""
            onChange={(e) => {
              const layerId = e.target.value;
              if (!layerId) return;
              onMoveToLayer(layerId);
              // Reset to the placeholder so the same layer can be re-applied to a later selection.
              e.target.value = '';
            }}
          >
            <option value="">Move to…</option>
            {layers
              .slice()
              .sort((a, b) => b.order - a.order)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
      )}

      <button
        type="button"
        className={styles.delete}
        data-testid="multi-select-delete"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

// LayersPanel (S11, MAP-03/D-04) — the per-map logical-layers panel. Layers are a LOGICAL
// organization stored on `MapDoc.layers`; this panel is the create/rename/reorder/show/hide/lock
// surface, plus the D-20 marker name-label show/hide toggle. Modeled on FieldManager's list +
// per-row controls, but inline (docked) rather than a modal: it floats over the right of the dark
// Stage and collapses to a `Layers` icon on a narrow viewport.
//
// Rows list TOP→bottom (highest `order` first = topmost on the canvas). Each row carries:
//   · move up/down (reorder; instant — no drag animation, so reduced-motion is satisfied by default)
//   · inline rename (double-click → input; commit on Enter/blur, cancel on Esc)
//   · show/hide toggle (Eye / EyeOff → flip `visible`)
//   · lock/unlock toggle (LockOpen / Lock → flip `locked`)
//   · an object-count mono pill (shapes + markers resolved to that layer)
//   · delete (brick ConfirmDialog) — DISABLED when it is the only layer (always ≥1, D-04)
// Selecting a row marks it the ACTIVE layer (new objects land there). All persistence is via
// `updateMap(mapId, { layers })` — layers are MapDoc sub-objects, so there is NO new repository
// function (RESEARCH Don't-Hand-Roll).
//
// Security (T-03-01): every layer name renders as a React text child / a plain-text input value —
// never dangerouslySetInnerHTML.

import { useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Layers as LayersIcon, Plus, ChevronUp, ChevronDown, X } from 'lucide-react';
import { updateMap } from '@/db/repository';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import type { Layer, MapDoc } from '@/domain/types';
import {
  createLayer,
  deleteLayer,
  layersTopToBottom,
  moveLayer,
  renameLayer,
  setLayerLocked,
  setLayerVisible,
} from './layers';
import styles from './LayersPanel.module.css';

export interface LayersPanelProps {
  /** The active map whose layers are edited (persisted via updateMap). */
  map: MapDoc;
  /** The active layer id (new objects land here); null falls back to the topmost layer. */
  activeLayerId: string | null;
  /** Select a layer as active (clicking a row). */
  onActiveLayerChange: (id: string) => void;
  /** D-20: whether person-name labels show on the canvas. */
  showLabels: boolean;
  /** Toggle the D-20 name-label visibility. */
  onShowLabelsChange: (show: boolean) => void;
  /** Per-layer object count (shapes + markers resolved to a layer), keyed by layer id. */
  objectCounts: Record<string, number>;
}

export function LayersPanel({
  map,
  activeLayerId,
  onActiveLayerChange,
  showLabels,
  onShowLabelsChange,
  objectCounts,
}: LayersPanelProps) {
  // Collapsed (icon-only) state for narrow viewports.
  const [collapsed, setCollapsed] = useState(false);
  // The layer being inline-renamed (its id) + the in-flight draft text.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  // The layer pending a delete-confirm.
  const [deleting, setDeleting] = useState<Layer | null>(null);

  const rows = layersTopToBottom(map.layers);
  const onlyLayer = map.layers.length <= 1;

  /** Persist a new layers array (the single write path). */
  function persist(layers: Layer[]) {
    void updateMap(map.id, { layers });
  }

  function handleNewLayer() {
    const { layers, layerId } = createLayer(map.layers);
    persist(layers);
    onActiveLayerChange(layerId); // a freshly-created layer becomes active
  }

  function commitRename(id: string) {
    persist(renameLayer(map.layers, id, draftName));
    setRenamingId(null);
  }

  return (
    <div className={collapsed ? `${styles.panel} ${styles.collapsed}` : styles.panel} data-testid="layers-panel">
      {collapsed ? (
        <button
          type="button"
          className={styles.collapseToggle}
          aria-label="Show layers"
          data-testid="layers-expand"
          onClick={() => setCollapsed(false)}
        >
          <LayersIcon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.title}>
              <LayersIcon size={16} strokeWidth={1.75} aria-hidden="true" /> Layers
            </span>
            <button
              type="button"
              className={styles.collapseToggle}
              aria-label="Hide layers"
              data-testid="layers-collapse"
              onClick={() => setCollapsed(true)}
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <ul className={styles.list} role="list" data-testid="layer-list">
            {rows.map((layer, index) => {
              const active = layer.id === activeLayerId;
              const count = objectCounts[layer.id] ?? 0;
              return (
                <li
                  key={layer.id}
                  className={active ? `${styles.row} ${styles.rowActive}` : styles.row}
                  data-testid="layer-row"
                  data-layer-id={layer.id}
                  aria-current={active ? 'true' : undefined}
                >
                  {/* Reorder up/down — instant (no drag animation; reduced-motion safe). */}
                  <div className={styles.reorder}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Move ${layer.name} up`}
                      data-testid="layer-move-up"
                      disabled={index === 0}
                      onClick={() => persist(moveLayer(map.layers, layer.id, 'up'))}
                    >
                      <ChevronUp size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Move ${layer.name} down`}
                      data-testid="layer-move-down"
                      disabled={index === rows.length - 1}
                      onClick={() => persist(moveLayer(map.layers, layer.id, 'down'))}
                    >
                      <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Name — double-click to inline-rename. Selecting the row sets it active. */}
                  {renamingId === layer.id ? (
                    <input
                      className={styles.renameInput}
                      data-testid="layer-rename-input"
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(layer.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(layer.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setRenamingId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.name}
                      data-testid="layer-name"
                      onClick={() => onActiveLayerChange(layer.id)}
                      onDoubleClick={() => {
                        setRenamingId(layer.id);
                        setDraftName(layer.name);
                      }}
                      title="Click to make active · double-click to rename"
                    >
                      {layer.name}
                    </button>
                  )}

                  <span className={styles.count} data-testid="layer-count">
                    {count}
                  </span>

                  {/* Show/hide. */}
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                    aria-pressed={!layer.visible}
                    data-testid="layer-visible-toggle"
                    onClick={() => persist(setLayerVisible(map.layers, layer.id, !layer.visible))}
                  >
                    {layer.visible ? (
                      <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>

                  {/* Lock/unlock. */}
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                    aria-pressed={layer.locked}
                    data-testid="layer-lock-toggle"
                    onClick={() => persist(setLayerLocked(map.layers, layer.id, !layer.locked))}
                  >
                    {layer.locked ? (
                      <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <LockOpen size={16} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>

                  {/* Delete — disabled when it is the only layer (always ≥1, D-04). */}
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Delete ${layer.name}`}
                    data-testid="layer-delete"
                    disabled={onlyLayer}
                    onClick={() => setDeleting(layer)}
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* + New layer — NEUTRAL paper button (creating a layer is not a create-entity action). */}
          <button
            type="button"
            className={styles.newLayer}
            data-testid="layer-add"
            onClick={handleNewLayer}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" /> New layer
          </button>

          {/* D-20: marker name-label show/hide toggle (default hidden). */}
          <label className={styles.labelsToggle}>
            <input
              type="checkbox"
              checked={showLabels}
              data-testid="show-labels-toggle"
              onChange={(e) => onShowLabelsChange(e.target.checked)}
            />
            <span>Show name labels</span>
          </label>
        </>
      )}

      {/* Delete-layer confirm — brick (irreversible: the layer's objects fall back to the default
          layer at render via resolveLayer, so nothing is lost, but the layer row is gone). */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Delete this layer?"
        body={
          deleting
            ? `'${deleting.name}' is removed. Objects on it move to the default layer — they are not deleted.`
            : ''
        }
        confirmLabel="Delete layer"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleting) persist(deleteLayer(map.layers, deleting.id));
        }}
      />
    </div>
  );
}

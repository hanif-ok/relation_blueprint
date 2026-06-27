// Pure logical-layer model (MAP-03, D-04). The map editor keeps ALL content inside a SINGLE
// physical Konva content layer (RESEARCH Pattern 3 / Pitfall 2 — NEVER one Konva Layer per user
// layer). User "layers" are a logical organization stored on `MapDoc.layers`; objects (shapes +
// markers) reference one by `layerId`. This module is the DOM-free heart of that model:
//
//   - `resolveLayer`        — an object's effective layer (its `layerId` resolved against the map's
//                             layers, falling back to the default/first layer when absent OR
//                             dangling — T-03-14: a layerId pointing at a deleted layer never drops
//                             the object or crashes the render).
//   - `orderObjectsForRender` — given objects + the map's layers, produce the FLAT render list in
//                             logical order (bottom→top by layer `order`, then original array order
//                             within a layer), EXCLUDING objects on a hidden layer, and tagging each
//                             with whether its layer is locked (locked → dimmed + non-interactive).
//   - the layer-CRUD helpers (`createLayer`/`renameLayer`/`reorderLayers`/`setLayerVisible`/
//                             `setLayerLocked`/`deleteLayer`) — PURE `layers[] -> layers[]`
//                             transforms the panel persists via `updateMap(mapId, { layers })`
//                             (RESEARCH Don't-Hand-Roll; layers are MapDoc sub-objects, so there is
//                             no new repository function). `deleteLayer` REFUSES to remove the last
//                             remaining layer (there is always at least one — D-04).
//
// Everything here is a pure function so the ordering/visibility/locking/CRUD logic is unit-tested
// with plain data and no renderer.

import { nanoid } from 'nanoid';
import type { Layer } from '@/domain/types';

/** The opacity a locked layer's objects render at (UI-SPEC l.162 — 60%). */
export const LOCKED_LAYER_OPACITY = 0.6;

/** The default layer name backfilled for a brand-new map / the first layer (D-04). */
export const DEFAULT_LAYER_NAME = 'Markers';

/** The minimal shape of an object that can live on a layer (a shape or a marker). */
export interface LayeredObject {
  id: string;
  layerId?: string;
}

/** An object paired with the render flags its resolved layer dictates. */
export interface RenderItem<T extends LayeredObject> {
  object: T;
  layer: Layer;
  /** A locked layer renders dimmed + non-interactive (listening=false). */
  locked: boolean;
  /** The opacity to render at (1 normally, LOCKED_LAYER_OPACITY when locked). */
  opacity: number;
}

/** The visible layers, sorted bottom→top by `order` (lowest order first / bottom of the stack). */
export function visibleLayersBottomToTop(layers: Layer[]): Layer[] {
  return layers.filter((l) => l.visible).slice().sort((a, b) => a.order - b.order);
}

/** The layers sorted TOP→bottom (highest order first) — the order the panel lists rows in. */
export function layersTopToBottom(layers: Layer[]): Layer[] {
  return layers.slice().sort((a, b) => b.order - a.order);
}

/**
 * Resolve an object's effective layer: its `layerId` against `layers`, falling back to the default
 * (lowest-order) layer when the id is absent OR dangling (points at a deleted layer — T-03-14).
 * Returns `undefined` only when there are NO layers at all (a pre-Phase-3 map not yet upgraded);
 * callers ensure at least one layer exists before rendering.
 */
export function resolveLayer(object: LayeredObject, layers: Layer[]): Layer | undefined {
  if (layers.length === 0) return undefined;
  if (object.layerId) {
    const found = layers.find((l) => l.id === object.layerId);
    if (found) return found;
  }
  // Absent or dangling layerId → the default/first (lowest-order) layer.
  return layers.slice().sort((a, b) => a.order - b.order)[0];
}

/**
 * Build the FLAT render list (MAP-03 core): objects ordered by their resolved layer's `order`
 * (bottom→top), then by their original array order within a layer. Objects whose resolved layer is
 * hidden are EXCLUDED. Each surviving object is tagged with its layer's locked flag + the opacity
 * to render at (locked → dimmed + non-interactive). Objects with no resolvable layer (no layers at
 * all) are dropped — but callers guarantee a default layer, so this is the degenerate case only.
 */
export function orderObjectsForRender<T extends LayeredObject>(
  objects: T[],
  layers: Layer[],
): RenderItem<T>[] {
  // Map each layer id → its stacking order, so the sort is O(1) per object.
  const orderById = new Map<string, number>();
  for (const l of layers) orderById.set(l.id, l.order);

  const items: Array<RenderItem<T> & { _arrayIndex: number }> = [];
  objects.forEach((object, index) => {
    const layer = resolveLayer(object, layers);
    if (!layer) return; // no layers at all — degenerate
    if (!layer.visible) return; // hidden layer → not rendered
    items.push({
      object,
      layer,
      locked: layer.locked,
      opacity: layer.locked ? LOCKED_LAYER_OPACITY : 1,
      _arrayIndex: index,
    });
  });

  // Stable sort: primary by layer order (bottom→top), secondary by original array index.
  items.sort((a, b) => {
    const oa = orderById.get(a.layer.id) ?? 0;
    const ob = orderById.get(b.layer.id) ?? 0;
    if (oa !== ob) return oa - ob;
    return a._arrayIndex - b._arrayIndex;
  });

  return items.map(({ _arrayIndex, ...rest }) => {
    void _arrayIndex;
    return rest;
  });
}

// ── Pure layer-CRUD transforms (layers[] -> layers[]) ────────────────────────────────────────────
// Each returns a NEW array; the panel persists the result via `updateMap(mapId, { layers })`.

/** Ensure at least one layer exists; returns the existing layers or a single default "Markers". */
export function ensureLayers(layers: Layer[]): Layer[] {
  if (layers.length > 0) return layers;
  return [{ id: nanoid(), name: DEFAULT_LAYER_NAME, visible: true, locked: false, order: 0 }];
}

/** The next auto-incremented default name ("Layer N") for a brand-new layer. */
function nextLayerName(layers: Layer[]): string {
  // The first layer is "Markers"; subsequent default to "Layer 2", "Layer 3", … by count.
  return `Layer ${layers.length + 1}`;
}

/**
 * Append a new layer on TOP of the stack (highest order). New objects land on the active layer; a
 * freshly-created layer becomes a natural target. Returns the new layers + the created layer's id.
 */
export function createLayer(layers: Layer[], name?: string): { layers: Layer[]; layerId: string } {
  const maxOrder = layers.reduce((m, l) => Math.max(m, l.order), -1);
  const layer: Layer = {
    id: nanoid(),
    name: (name ?? '').trim() || nextLayerName(layers),
    visible: true,
    locked: false,
    order: maxOrder + 1,
  };
  return { layers: [...layers, layer], layerId: layer.id };
}

/** Rename one layer (no-op when the id is unknown). Empty/whitespace names are rejected (kept). */
export function renameLayer(layers: Layer[], id: string, name: string): Layer[] {
  const trimmed = name.trim();
  if (!trimmed) return layers;
  return layers.map((l) => (l.id === id ? { ...l, name: trimmed } : l));
}

/** Flip a layer's `visible` flag. */
export function setLayerVisible(layers: Layer[], id: string, visible: boolean): Layer[] {
  return layers.map((l) => (l.id === id ? { ...l, visible } : l));
}

/** Flip a layer's `locked` flag. */
export function setLayerLocked(layers: Layer[], id: string, locked: boolean): Layer[] {
  return layers.map((l) => (l.id === id ? { ...l, locked } : l));
}

/**
 * Reorder the layers so they stack in the given TOP→bottom id list (index 0 = topmost = highest
 * `order`). Recomputes every `order` so the array can never carry stale/cyclic orders (T-03-15).
 * Ids not present in `layers` are ignored; layers missing from `topToBottomIds` keep their relative
 * order at the bottom.
 */
export function reorderLayers(layers: Layer[], topToBottomIds: string[]): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  // Build the bottom→top sequence: reverse the top→bottom list, then append any omitted layers
  // (in their current bottom→top order) so nothing is silently dropped.
  const ordered: Layer[] = [];
  const seen = new Set<string>();
  for (let i = topToBottomIds.length - 1; i >= 0; i--) {
    const l = byId.get(topToBottomIds[i]);
    if (l && !seen.has(l.id)) {
      ordered.push(l);
      seen.add(l.id);
    }
  }
  for (const l of layers.slice().sort((a, b) => a.order - b.order)) {
    if (!seen.has(l.id)) {
      ordered.push(l);
      seen.add(l.id);
    }
  }
  return ordered.map((l, index) => ({ ...l, order: index }));
}

/**
 * Move one layer up (toward the top / higher order) or down (toward the bottom) by one step,
 * keeping every other layer in place. A pure helper for the panel's reorder handles. `direction`
 * `'up'` swaps with the next-higher-order neighbor; `'down'` with the next-lower. No-op at an edge.
 */
export function moveLayer(layers: Layer[], id: string, direction: 'up' | 'down'): Layer[] {
  const top = layersTopToBottom(layers).map((l) => l.id);
  const idx = top.indexOf(id);
  if (idx === -1) return layers;
  // In the top→bottom list, "up" = toward index 0.
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= top.length) return layers;
  const next = top.slice();
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return reorderLayers(layers, next);
}

/**
 * Delete one layer — but REFUSE when it is the only remaining layer (there is always at least one;
 * the default "Markers" layer cannot be deleted when it is the sole layer — D-04). Returns the
 * layers UNCHANGED when the delete is refused or the id is unknown. Orders are recompacted so the
 * remaining layers keep a contiguous 0..n-1 stacking.
 */
export function deleteLayer(layers: Layer[], id: string): Layer[] {
  if (layers.length <= 1) return layers; // last layer is undeletable
  if (!layers.some((l) => l.id === id)) return layers; // unknown id
  const remaining = layers
    .filter((l) => l.id !== id)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((l, index) => ({ ...l, order: index }));
  return remaining;
}

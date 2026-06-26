// useViewportCulling — viewport culling for the marker/shape layer (RESEARCH Pattern 5, criterion 5).
//
// Off-screen markers must NOT be mounted as Konva nodes, so pan/zoom stays smooth as the marker
// count grows into the thousands. This hook exposes a `visibleRect` (the world-space rectangle the
// Stage currently shows) plus an `intersects(box)` predicate the render path uses to filter objects
// BEFORE mapping them to nodes. Per the RESEARCH "recompute the view rect on pan/zoom END
// (debounced) — not every frame" note, the caller wires `recompute(stage)` to the Stage's
// `onDragEnd`/`onWheel`; a short debounce coalesces wheel bursts so we recompute once the gesture
// settles rather than on every wheel tick.
//
// The geometry (`getVisibleRect`, `intersects`) is pure and exported independently of React so it
// is unit-testable without rendering (tests/features/coords.test.ts).

import { useCallback, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The minimal Stage view state `getVisibleRect` needs — pan offset, uniform scale, pixel size. */
export interface StageView {
  x: number;
  y: number;
  scaleX: number;
  width: number;
  height: number;
}

/** Default cull margin (px, world-space): keep nodes within 200px of the viewport mounted so a
 *  marker just off the edge is ready the instant it scrolls in (RESEARCH Code Examples). */
export const CULL_MARGIN = 200;

/**
 * The world-space rectangle currently visible on the Stage, derived from its pan + uniform scale
 * (RESEARCH visibleStageRect): `x = -stage.x()/scale`, `y = -stage.y()/scale`,
 * `width = stage.width()/scale`, `height = stage.height()/scale`. Guards a zero/non-finite scale
 * (treat as 1) so a transient bad scale cannot emit a NaN/∞ rect.
 */
export function getVisibleRect(view: StageView): Rect {
  const scale = view.scaleX !== 0 && Number.isFinite(view.scaleX) ? view.scaleX : 1;
  return {
    x: -view.x / scale,
    y: -view.y / scale,
    width: view.width / scale,
    height: view.height / scale,
  };
}

/**
 * True when `box` intersects `view` expanded by `margin` on every side (RESEARCH intersects). Used
 * to decide whether an object is mounted at all. A `null` view (rect not yet computed) is treated
 * as "everything visible" so the first paint never hides markers before the first recompute.
 */
export function intersects(box: Rect, view: Rect | null, margin = CULL_MARGIN): boolean {
  if (!view) return true;
  return !(
    box.x > view.x + view.width + margin ||
    box.x + box.width < view.x - margin ||
    box.y > view.y + view.height + margin ||
    box.y + box.height < view.y - margin
  );
}

/** Read the live `StageView` off a Konva Stage. */
function viewOf(stage: Konva.Stage): StageView {
  return {
    x: stage.x(),
    y: stage.y(),
    scaleX: stage.scaleX(),
    width: stage.width(),
    height: stage.height(),
  };
}

export interface ViewportCulling {
  /** The current world-space visible rect, or `null` before the first recompute (= show all). */
  visibleRect: Rect | null;
  /** Recompute the visible rect from a Stage; debounced so wheel bursts coalesce to one update. */
  recompute: (stage: Konva.Stage) => void;
  /** Whether a world-space box intersects the current visible rect (+ margin). */
  isVisible: (box: Rect) => boolean;
}

/**
 * Hook form: holds the debounced `visibleRect` in state and re-renders the consumer when it
 * changes. `recompute` is wired by the caller to the Stage `onDragEnd`/`onWheel`; the debounce
 * (default 80ms) means a fast wheel-zoom recomputes once it settles, not on every tick.
 */
export function useViewportCulling(debounceMs = 80): ViewportCulling {
  const [visibleRect, setVisibleRect] = useState<Rect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recompute = useCallback(
    (stage: Konva.Stage) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setVisibleRect(getVisibleRect(viewOf(stage)));
      }, debounceMs);
    },
    [debounceMs],
  );

  const isVisible = useCallback((box: Rect) => intersects(box, visibleRect), [visibleRect]);

  return useMemo(
    () => ({ visibleRect, recompute, isVisible }),
    [visibleRect, recompute, isVisible],
  );
}

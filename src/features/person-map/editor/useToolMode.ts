// useToolMode — the pan/draw/select interaction state machine (RESEARCH Pattern 2 + Pattern 6).
//
// This is ONE of the two genuinely-new pieces of Phase 3 (RESEARCH "Don't Hand-Roll": everything
// else has a library/analog, but the tool-mode/gesture state machine is custom). It decides, by
// the active tool, how Stage pointer events are interpreted:
//
//   Select (default): empty-canvas drag PANS the Stage; an object handles its own drag/move.
//   Rect/Ellipse/Line: Stage.draggable = false, so a single-pointer drag DRAWS (not pans, D-19 /
//                      RESEARCH Pitfall 3). pointerdown records the start (in IMAGE space, via the
//                      consumer's stageToImage), pointermove updates the live preview, pointerup
//                      commits a Shape descriptor above a size threshold — the tool STAYS armed.
//   Polygon: each click pushes a vertex; dblclick/Enter closes + commits; Esc cancels. Stays armed
//            until close.
//   Portal/Person: one-shot — the CONSUMER places at the point and returns to Select.
//
// A two-finger gesture ALWAYS pans/pinches regardless of mode (RESEARCH Pattern 6) — the consumer
// toggles `setTwoFingerActive` from the touch handler and, on the second touch landing, should call
// `stage.stopDrag()` to kill any in-flight single-finger drag (RESEARCH Pitfall 4). We expose that
// as a flag/callback seam rather than reaching into Konva so the core stays pure + testable.
//
// Two further transient gestures ride the SAME seam (quick-260821-nac): a middle-button pan
// (`setMiddlePanning`) and a marquee rubber-band selection (`setMarqueeActive`). Both are
// hand-rolled by the consumer — it repositions the Stage / tracks the band itself — so each forces
// `stageDraggable` false for its duration, ahead of every other rule including the two-finger
// override, and Konva's own drag-and-drop never runs alongside them.
//
// The geometry helpers (beginDraw/updateDraw/commitDraw/addPolygonVertex/closePolygon) and the
// `deriveStageDraggable`/`isDrawMode` derivations are PURE and exported so the state machine is
// unit-tested without a DOM (tests/features/useToolMode.test.ts).

import { useCallback, useMemo, useState } from 'react';
import type { Point } from '../coords';

/** The seven editor tools (D-17). `select` is the default armed mode. */
export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'portal' | 'person';

/** The four tools that draw a shape on a single-pointer drag (vs. select/place tools). */
const DRAW_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['rect', 'ellipse', 'line', 'polygon']);

/**
 * The minimum bounding-box extent (image-space px) a drag must exceed to commit a shape. Below
 * this a draw is treated as a stray click and commits NOTHING — the degenerate-draw guard that
 * also blunts T-03-11 (no zero/near-zero shapes enter MapDoc.shapes from a fat-finger tap).
 */
export const MIN_DRAW_SIZE = 6;

/** A committed shape descriptor (sans `id`/`layerId`/`preset`/`fill`, which the consumer assigns). */
export interface DraftShape {
  kind: 'rect' | 'ellipse' | 'line' | 'polygon';
  /** Bounding-box origin (image-space) — rect/ellipse. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Flat `[x0,y0,…]` vertices (image-space) — line/polygon. */
  points?: number[];
}

/** In-progress draw state. Immutable — each helper returns a fresh state (pure, testable). */
export interface DrawState {
  kind: 'rect' | 'ellipse' | 'line' | 'polygon';
  /** Drag-anchored start point (image-space) for rect/ellipse/line. */
  start: Point;
  /** Live pointer position (image-space) for the preview. */
  current: Point;
  /** Accumulated vertices (image-space) for polygon. */
  vertices: Point[];
}

/** True only for the four drawing tools (rect/ellipse/line/polygon). */
export function isDrawMode(tool: Tool): boolean {
  return DRAW_TOOLS.has(tool);
}

/**
 * Derive whether the Konva Stage should be `draggable` from the active tool + transient gesture
 * state. The single most important interaction rule of MAP-02:
 *   - a HAND-ROLLED gesture (middle-button pan, marquee band) owns the Stage OUTRIGHT — the
 *     consumer repositions the Stage itself from window pointer events, so Konva's own
 *     drag-and-drop must not run alongside it and double-pan. Checked FIRST, ahead of everything
 *     else, so an explicit middle pan even outranks the two-finger override;
 *   - a two-finger gesture ALWAYS pans/pinches (Stage draggable), regardless of tool (Pattern 6);
 *   - otherwise, in a DRAW mode the Stage is NOT draggable so a single-pointer drag DRAWS (Pitfall
 *     3);
 *   - in Select mode the Stage pans on empty-canvas drag, UNLESS an object is mid-drag (then the
 *     object moves, not the Stage).
 *
 * `middlePanning`/`marqueeActive` are OPTIONAL and default to false, so every pre-existing caller
 * keeps its exact behaviour.
 */
export function deriveStageDraggable(
  tool: Tool,
  gesture: {
    objectDragging: boolean;
    twoFingerActive: boolean;
    middlePanning?: boolean;
    marqueeActive?: boolean;
  },
): boolean {
  if (gesture.middlePanning || gesture.marqueeActive) return false;
  if (gesture.twoFingerActive) return true;
  if (isDrawMode(tool)) return false;
  // select / portal / person: pan on empty canvas, but never while an object is being dragged.
  return !gesture.objectDragging;
}

/** Start a drag-draw (rect/ellipse/line) or seed the first polygon vertex. */
export function beginDraw(
  kind: 'rect' | 'ellipse' | 'line' | 'polygon',
  at: Point,
): DrawState {
  return { kind, start: at, current: at, vertices: [at] };
}

/** Update the live pointer position (the preview follows it). */
export function updateDraw(state: DrawState, at: Point): DrawState {
  return { ...state, current: at };
}

/** Normalize a (start,current) drag into a positive-origin bounding box (image-space). */
function normalizedBox(start: Point, current: Point) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  return { x, y, width, height };
}

/**
 * Commit a drag-draw to a {@link DraftShape}, or `null` if the drag is below the size threshold
 * (degenerate — a stray tap). Rect/ellipse become a normalized box; line becomes a two-point
 * open path in image space.
 */
export function commitDraw(state: DrawState): DraftShape | null {
  if (state.kind === 'line') {
    const dx = state.current.x - state.start.x;
    const dy = state.current.y - state.start.y;
    if (Math.hypot(dx, dy) < MIN_DRAW_SIZE) return null;
    return {
      kind: 'line',
      points: [state.start.x, state.start.y, state.current.x, state.current.y],
    };
  }
  const box = normalizedBox(state.start, state.current);
  if (box.width < MIN_DRAW_SIZE && box.height < MIN_DRAW_SIZE) return null;
  return { kind: state.kind, x: box.x, y: box.y, width: box.width, height: box.height };
}

/** Push a clicked vertex onto an in-progress polygon. */
export function addPolygonVertex(state: DrawState, at: Point): DrawState {
  return { ...state, vertices: [...state.vertices, at], current: at };
}

/**
 * Close an in-progress polygon into a closed-polygon {@link DraftShape}, or `null` if fewer than
 * three vertices have been placed (a degenerate polygon).
 */
export function closePolygon(state: DrawState): DraftShape | null {
  if (state.vertices.length < 3) return null;
  const points = state.vertices.flatMap((v) => [v.x, v.y]);
  return { kind: 'polygon', points };
}

/** What the React hook returns to the MapView consumer. */
export interface UseToolMode {
  /** The active tool (default `'select'`). */
  tool: Tool;
  /** Arm a tool. */
  setTool: (tool: Tool) => void;
  /** True for rect/ellipse/line/polygon. */
  isDrawMode: boolean;
  /** Derived `Stage.draggable` flag (tool + gesture state). */
  stageDraggable: boolean;
  /** The consumer toggles this while an object is mid-drag (Select-mode object move). */
  setObjectDragging: (dragging: boolean) => void;
  /** The touch handler toggles this on a two-finger gesture (always pans/pinches). */
  setTwoFingerActive: (active: boolean) => void;
  /** True while a two-finger gesture is active (the consumer should `stage.stopDrag()` on entry). */
  twoFingerActive: boolean;
  /**
   * The consumer toggles this while a HAND-ROLLED middle-button pan is in flight. It forces
   * `stageDraggable` false so Konva's own drag-and-drop never double-pans alongside the manual
   * `stage.position()` writes. Modelled on the `setTwoFingerActive` transient-gesture seam.
   */
  setMiddlePanning: (active: boolean) => void;
  /**
   * The consumer toggles this while a marquee (rubber-band) selection is being dragged. Same
   * contract as `setMiddlePanning`: the band owns the Stage, so it must not pan underneath.
   */
  setMarqueeActive: (active: boolean) => void;
  /** The live in-progress draw state (null when idle). */
  draw: DrawState | null;
  setDraw: (draw: DrawState | null) => void;
}

/**
 * React wrapper over the pure state machine. Holds the active tool + transient gesture flags +
 * in-progress draw state, and derives `stageDraggable`. The MapView owns one instance, passes
 * `tool`/`setTool` to the ToolPalette, and routes Stage pointer events through the pure helpers.
 */
export function useToolMode(): UseToolMode {
  const [tool, setToolState] = useState<Tool>('select');
  const [objectDragging, setObjectDragging] = useState(false);
  const [twoFingerActive, setTwoFingerActive] = useState(false);
  // Hand-rolled gesture flags — each one takes the Stage over for its duration (see
  // deriveStageDraggable). Transient only; never persisted.
  const [middlePanning, setMiddlePanning] = useState(false);
  const [marqueeActive, setMarqueeActive] = useState(false);
  const [draw, setDraw] = useState<DrawState | null>(null);

  // Changing tool always cancels any in-progress draw (e.g. switching mid-polygon).
  const setTool = useCallback((next: Tool) => {
    setToolState(next);
    setDraw(null);
  }, []);

  const stageDraggable = useMemo(
    () => deriveStageDraggable(tool, { objectDragging, twoFingerActive, middlePanning, marqueeActive }),
    [tool, objectDragging, twoFingerActive, middlePanning, marqueeActive],
  );

  return {
    tool,
    setTool,
    isDrawMode: isDrawMode(tool),
    stageDraggable,
    setObjectDragging,
    setTwoFingerActive,
    twoFingerActive,
    setMiddlePanning,
    setMarqueeActive,
    draw,
    setDraw,
  };
}

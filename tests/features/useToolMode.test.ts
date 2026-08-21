// Task 1 (RED→GREEN) — the pan/draw/select interaction state machine (RESEARCH "Don't Hand-Roll":
// this gesture/tool-mode machine is one of the two genuinely-new pieces of Phase 3). It is the
// brain of MAP-02: which tool is armed, whether the Stage pans (Select) or draws (a draw tool) on
// a single-pointer drag, and the always-pans-on-two-fingers override (RESEARCH Pattern 6 / Pitfall
// 3 & 4). The core is a PURE reducer + a couple of pure derivations so it is unit-tested here
// WITHOUT a DOM; the React `useToolMode` hook is a thin wrapper proven separately.
//
// Pins:
//   (1) default tool is 'select',
//   (2) stageDraggable is true in select mode (empty-canvas drag pans) and false in every draw
//       mode (single-pointer drags DRAW, RESEARCH Pitfall 3),
//   (3) a two-finger gesture forces stageDraggable true even in a draw mode (RESEARCH Pattern 6),
//   (4) a rect draw (down → move → up) ABOVE the size threshold commits a shape with image-space
//       geometry; a below-threshold drag commits nothing (degenerate-draw guard, T-03-11),
//   (5) polygon vertex accumulation + close produces a closed polygon descriptor,
//   (6) an explicit hand-rolled gesture (middle-button pan / marquee band) forces stageDraggable
//       false ahead of every other rule — including the two-finger override — so Konva's own
//       drag-and-drop never double-pans alongside it (quick-260821-nac).

import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useToolMode,
  isDrawMode,
  deriveStageDraggable,
  beginDraw,
  updateDraw,
  commitDraw,
  addPolygonVertex,
  closePolygon,
  MIN_DRAW_SIZE,
  type DrawState,
} from '@/features/person-map/editor/useToolMode';

describe('useToolMode — tool selection + draggable derivation', () => {
  it('defaults to the Select tool', () => {
    const { result } = renderHook(() => useToolMode());
    expect(result.current.tool).toBe('select');
  });

  it('Select is the only mode where the Stage is draggable (draw modes suppress single-pointer pan)', () => {
    const { result } = renderHook(() => useToolMode());
    // select → draggable
    expect(result.current.stageDraggable).toBe(true);
    // each draw mode → NOT draggable (so a single-pointer drag draws, RESEARCH Pitfall 3)
    for (const t of ['rect', 'ellipse', 'line', 'polygon'] as const) {
      act(() => result.current.setTool(t));
      expect(result.current.stageDraggable).toBe(false);
    }
  });

  it('isDrawMode is true only for the four drawing tools', () => {
    expect(isDrawMode('select')).toBe(false);
    expect(isDrawMode('portal')).toBe(false);
    expect(isDrawMode('person')).toBe(false);
    expect(isDrawMode('rect')).toBe(true);
    expect(isDrawMode('ellipse')).toBe(true);
    expect(isDrawMode('line')).toBe(true);
    expect(isDrawMode('polygon')).toBe(true);
  });

  it('a two-finger gesture ALWAYS makes the Stage draggable, even mid-draw-mode (Pattern 6)', () => {
    // pure derivation: rect + two-finger → draggable; rect + one-finger → not.
    expect(deriveStageDraggable('rect', { objectDragging: false, twoFingerActive: true })).toBe(true);
    expect(deriveStageDraggable('rect', { objectDragging: false, twoFingerActive: false })).toBe(false);
    // select + an object being dragged → NOT draggable (the object moves, not the Stage).
    expect(deriveStageDraggable('select', { objectDragging: true, twoFingerActive: false })).toBe(false);
    // select + idle → draggable (empty-canvas pan).
    expect(deriveStageDraggable('select', { objectDragging: false, twoFingerActive: false })).toBe(true);
  });

  it('the hook reflects two-finger activation in stageDraggable', () => {
    const { result } = renderHook(() => useToolMode());
    act(() => result.current.setTool('rect'));
    expect(result.current.stageDraggable).toBe(false);
    act(() => result.current.setTwoFingerActive(true));
    expect(result.current.stageDraggable).toBe(true);
    act(() => result.current.setTwoFingerActive(false));
    expect(result.current.stageDraggable).toBe(false);
  });

  it('an explicit hand-rolled gesture (middle pan / marquee) suppresses Konva drag-and-drop', () => {
    // A hand-rolled gesture OWNS the Stage: the consumer repositions it directly from window
    // pointer events, so Konva's own drag-and-drop must never run alongside and double-pan.
    expect(
      deriveStageDraggable('select', {
        objectDragging: false,
        twoFingerActive: false,
        middlePanning: true,
      }),
    ).toBe(false);
    // …and it OUTRANKS the two-finger always-pans override (an explicit middle pan wins).
    expect(
      deriveStageDraggable('rect', {
        objectDragging: false,
        twoFingerActive: true,
        middlePanning: true,
      }),
    ).toBe(false);
    // The marquee band suppresses the Select-mode empty-canvas pan the same way.
    expect(
      deriveStageDraggable('select', {
        objectDragging: false,
        twoFingerActive: false,
        marqueeActive: true,
      }),
    ).toBe(false);
    // Both flags are OPTIONAL and default to false, so every pre-existing caller is unchanged.
    expect(deriveStageDraggable('select', { objectDragging: false, twoFingerActive: false })).toBe(
      true,
    );
  });

  it('the hook reflects middle-pan and marquee activation in stageDraggable', () => {
    const { result } = renderHook(() => useToolMode());
    // Select mode normally pans on an empty-canvas drag…
    expect(result.current.stageDraggable).toBe(true);
    // …but a middle-button pan takes the Stage over.
    act(() => result.current.setMiddlePanning(true));
    expect(result.current.stageDraggable).toBe(false);
    act(() => result.current.setMiddlePanning(false));
    expect(result.current.stageDraggable).toBe(true);
    // The marquee band does the same for its duration.
    act(() => result.current.setMarqueeActive(true));
    expect(result.current.stageDraggable).toBe(false);
    act(() => result.current.setMarqueeActive(false));
    expect(result.current.stageDraggable).toBe(true);
  });
});

describe('useToolMode — rect/ellipse draw (pure begin/update/commit, image space)', () => {
  it('commits a rect descriptor with image-space geometry when the drag exceeds the size threshold', () => {
    let s: DrawState = beginDraw('rect', { x: 10, y: 20 });
    s = updateDraw(s, { x: 110, y: 90 });
    const shape = commitDraw(s);
    expect(shape).not.toBeNull();
    expect(shape!.kind).toBe('rect');
    // image-space bounding box, normalized to a positive origin + size
    expect(shape!.x).toBe(10);
    expect(shape!.y).toBe(20);
    expect(shape!.width).toBe(100);
    expect(shape!.height).toBe(70);
  });

  it('normalizes a drag drawn up-and-left into a positive-origin box', () => {
    let s = beginDraw('rect', { x: 200, y: 200 });
    s = updateDraw(s, { x: 150, y: 120 });
    const shape = commitDraw(s);
    expect(shape).not.toBeNull();
    expect(shape!.x).toBe(150);
    expect(shape!.y).toBe(120);
    expect(shape!.width).toBe(50);
    expect(shape!.height).toBe(80);
  });

  it('commits NOTHING for a below-threshold (degenerate) drag — T-03-11 guard', () => {
    let s = beginDraw('rect', { x: 10, y: 10 });
    s = updateDraw(s, { x: 10 + (MIN_DRAW_SIZE - 1), y: 10 + (MIN_DRAW_SIZE - 1) });
    expect(commitDraw(s)).toBeNull();
  });

  it('an ellipse commits as kind ellipse over the same box math', () => {
    let s = beginDraw('ellipse', { x: 0, y: 0 });
    s = updateDraw(s, { x: 60, y: 40 });
    const shape = commitDraw(s);
    expect(shape!.kind).toBe('ellipse');
    expect(shape!.width).toBe(60);
    expect(shape!.height).toBe(40);
  });
});

describe('useToolMode — line/polygon vertex accumulation', () => {
  it('a line commits as a two-point open Line in image space', () => {
    let s = beginDraw('line', { x: 5, y: 5 });
    s = updateDraw(s, { x: 80, y: 5 });
    const shape = commitDraw(s);
    expect(shape!.kind).toBe('line');
    expect(shape!.points).toEqual([5, 5, 80, 5]);
  });

  it('a polygon accumulates clicked vertices and closes into a closed polygon descriptor', () => {
    let s = beginDraw('polygon', { x: 0, y: 0 });
    s = addPolygonVertex(s, { x: 100, y: 0 });
    s = addPolygonVertex(s, { x: 100, y: 100 });
    s = addPolygonVertex(s, { x: 0, y: 100 });
    const shape = closePolygon(s);
    expect(shape).not.toBeNull();
    expect(shape!.kind).toBe('polygon');
    expect(shape!.points).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
  });

  it('refuses to close a polygon with fewer than three vertices', () => {
    let s = beginDraw('polygon', { x: 0, y: 0 });
    s = addPolygonVertex(s, { x: 10, y: 0 });
    expect(closePolygon(s)).toBeNull();
  });
});

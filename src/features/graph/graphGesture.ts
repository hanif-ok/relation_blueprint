// graphGesture — the PURE mouse-gesture arbitration for the relationship graph.
//
// No React, no Cytoscape, no DOM types (a structural event shape instead of `MouseEvent`, so this
// module never drags a browser lib into a headless unit test).
//
// D-7 — WHY PANNING LEFT THE PLAIN LEFT BUTTON. Cytoscape enters box-select mode only when
// `boxSelectionEnabled() && (multSelKeyDown || !panningEnabled() || !userPanningEnabled())`
// (verified in the INSTALLED cytoscape 3.34.0 build at `cytoscape.cjs.js:26234`). The requirement is
// "pointer targeting nothing → selection mode", so a plain left-drag on empty background must BAND,
// which means mouse panning has to move elsewhere: middle-drag and Alt+left-drag. This is exactly
// the trade the Konva map canvas already made in quick-260821-nac (D-1/D-3), so the two canvases
// stay consistent instead of each teaching a different muscle memory. The cheaper alternative —
// shift+drag to box-select — was rejected: it does not satisfy the stated requirement and would
// leave the two surfaces inconsistent.
//
// D-8 — WHY THE FLAG IS TOGGLED AT RUNTIME, NOT PASSED AS A PROP. A static
// `userPanningEnabled={false}` would also kill single-finger TOUCH panning, because cytoscape's
// touch pan reads the SAME flag — regressing tablets and contradicting the mouse-only rule (D-13).
// Instead the flag is flipped to false for the duration of one mouse gesture and restored on
// release, so touch never observes it. This is safe against React re-renders: `react-cytoscapejs`'s
// `updateCytoscape` re-applies `userPanningEnabled` ONLY when the prop value DIFFERS between
// renders, and omitting the prop entirely means that comparison is `undefined` vs `undefined` on
// every update — so a mid-gesture re-render can never clobber the runtime toggle. Do not "tidy"
// this by adding the prop back.
//
// D-10 — WHY THE RE-EGO GUARD KEYS ON THE MODIFIER, NOT THE SELECTION COUNT. Cytoscape emits `tap`
// BEFORE its own "Single selection" collapse block (`cytoscape.cjs.js:26406` vs `:26444`), so
// counting selected elements at tap time would misread an ordinary plain click — which legitimately
// collapses the selection to one node and SHOULD still re-ego — as a multi-select gesture. Guarding
// on `shiftKey || metaKey || ctrlKey` instead is the exact predicate cytoscape itself uses for
// `isMultSelKeyDown` (`cytoscape.cjs.js:25733`). A real drag can never leak through either: `tap` is
// suppressed by the `!r.dragData.didDrag` guard at `cytoscape.cjs.js:26398`.
//
// D-11 — `originalEvent` IS READ DEFENSIVELY. `e2e/graph.spec.ts` drives nodes with a programmatic
// `.emit('tap')`, which carries no native event — the same class of bug that regressed two specs in
// quick-260821-nac (commit `bea3305`). An absent event means "no modifiers", i.e. today's behaviour.

/**
 * The minimal structural shape these predicates read off a native mouse/pointer event. Declared
 * locally (rather than using `MouseEvent`) so this module stays DOM-free and unit-testable with
 * plain object literals.
 */
export interface GestureEvent {
  /** 0 = left, 1 = middle, 2 = right. */
  button?: number;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** Present only on PointerEvents; a plain MouseEvent has none (treated as a mouse). */
  pointerType?: string;
}

/** Cytoscape's own multi-select predicate: shift, meta or ctrl (deliberately NOT alt). */
export function isMultiSelectModifier(e?: GestureEvent | null): boolean {
  if (!e) return false; // D-11: no native event → no modifiers
  return e.shiftKey === true || e.metaKey === true || e.ctrlKey === true;
}

/**
 * Whether a node tap should re-ego the layout and open the profile (D-10).
 *
 * False only while a multi-select modifier is held — then the click is a SELECTION gesture, not a
 * navigation, and must neither open the sidebar nor re-lay the graph out. An absent event yields
 * true, preserving today's behaviour for programmatic taps (D-11).
 */
export function shouldReEgo(e?: GestureEvent | null): boolean {
  return !isMultiSelectModifier(e);
}

/**
 * Whether this press should suspend cytoscape's user panning for the gesture, letting a plain
 * left-drag on empty background enter box-select mode instead of panning (D-7/D-8).
 *
 * True ONLY for a plain left press from a mouse:
 *   • middle button      → that gesture PANS (see `isPanButton`),
 *   • Alt + left         → the other pan gesture,
 *   • right button       → never starts a graph gesture,
 *   • non-mouse pointer  → mouse-only (D-13); single-finger touch keeps panning.
 *
 * A plain `MouseEvent` carries no `pointerType`; that is treated as a mouse, since the listener this
 * feeds is bound to a mouse/pointer press on the graph container.
 */
export function shouldSuspendPanning(e?: GestureEvent | null): boolean {
  if (!e) return false; // no native event → no gesture to arbitrate
  if (e.button !== 0) return false;
  if (e.altKey === true) return false;
  if (e.pointerType !== undefined && e.pointerType !== 'mouse') return false;
  return true;
}

/** The middle button — the primary pan gesture, mirroring the Konva map canvas. */
export function isPanButton(e?: GestureEvent | null): boolean {
  return !!e && e.button === 1;
}

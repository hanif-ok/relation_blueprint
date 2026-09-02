// quick-260902-nfs Task 3 (RED→GREEN) — the pure mouse-gesture arbitration for the graph.
//
// The graph gains a rubber-band box selection, which forces a decision about what the plain left
// button does: cytoscape enters box mode only when `boxSelectionEnabled() && (multSelKeyDown ||
// !panningEnabled() || !userPanningEnabled())` (verified at cytoscape.cjs.js:26234). Since a plain
// left-drag on empty background must BAND, mouse panning has to move off that button — exactly the
// trade `MapView` already made on the Konva canvas (middle-drag, plus Alt+left-drag here).
//
// `graphGesture.ts` holds those predicates as pure functions so they can be pinned without a DOM or
// a live Cytoscape core. The assertions below encode:
//   • D-10 — the re-ego guard keys on the multi-select MODIFIER, never on the selection count,
//   • D-11 — `originalEvent` is read DEFENSIVELY (a programmatic `.emit('tap')` carries none, the
//     exact class of bug that regressed two specs in quick-260821-nac, commit bea3305),
//   • D-13 — mouse-only: a non-mouse pointer never suspends panning.

import { describe, expect, it } from 'vitest';
import {
  isMultiSelectModifier,
  isPanButton,
  shouldReEgo,
  shouldSuspendPanning,
} from '@/features/graph/graphGesture';

describe('isMultiSelectModifier', () => {
  it('is true for shift, meta or ctrl individually', () => {
    expect(isMultiSelectModifier({ shiftKey: true })).toBe(true);
    expect(isMultiSelectModifier({ metaKey: true })).toBe(true);
    expect(isMultiSelectModifier({ ctrlKey: true })).toBe(true);
  });

  it('is false for alt alone (alt is the PAN modifier here, not a selection one)', () => {
    expect(isMultiSelectModifier({ altKey: true })).toBe(false);
  });

  it('is false for a bare event and for undefined/null (D-11)', () => {
    expect(isMultiSelectModifier({})).toBe(false);
    expect(isMultiSelectModifier(undefined)).toBe(false);
    expect(isMultiSelectModifier(null)).toBe(false);
  });
});

describe('shouldReEgo', () => {
  it('is false exactly when a multi-select modifier is held', () => {
    expect(shouldReEgo({ shiftKey: true })).toBe(false);
    expect(shouldReEgo({ metaKey: true })).toBe(false);
    expect(shouldReEgo({ ctrlKey: true })).toBe(false);
  });

  it('is true for a plain tap — which legitimately collapses to one node and SHOULD re-ego', () => {
    expect(shouldReEgo({})).toBe(true);
    expect(shouldReEgo({ altKey: true })).toBe(true);
  });

  it('is true for an ABSENT originalEvent — today’s behaviour is preserved (D-11)', () => {
    // `e2e/graph.spec.ts` drives nodes with a programmatic `.emit('tap')`, which carries no native
    // event. That must keep opening the profile and re-egoing, exactly as it does today.
    expect(shouldReEgo(undefined)).toBe(true);
    expect(shouldReEgo(null)).toBe(true);
  });
});

describe('shouldSuspendPanning', () => {
  it('is true for a plain left press (button 0, no alt)', () => {
    expect(shouldSuspendPanning({ button: 0 })).toBe(true);
  });

  it('is false for the middle button (that gesture PANS)', () => {
    expect(shouldSuspendPanning({ button: 1 })).toBe(false);
  });

  it('is false for Alt+left (the other pan gesture)', () => {
    expect(shouldSuspendPanning({ button: 0, altKey: true })).toBe(false);
  });

  it('is false for a non-mouse pointerType — mouse-only, D-13', () => {
    // Single-finger touch must keep panning; a pen must not band either.
    expect(shouldSuspendPanning({ button: 0, pointerType: 'touch' })).toBe(false);
    expect(shouldSuspendPanning({ button: 0, pointerType: 'pen' })).toBe(false);
    expect(shouldSuspendPanning({ button: 0, pointerType: 'mouse' })).toBe(true);
  });

  it('is false for an absent event (a programmatic emit starts no gesture)', () => {
    expect(shouldSuspendPanning(undefined)).toBe(false);
    expect(shouldSuspendPanning(null)).toBe(false);
  });

  it('is false for the right button', () => {
    expect(shouldSuspendPanning({ button: 2 })).toBe(false);
  });
});

describe('isPanButton', () => {
  it('is true only for the middle button', () => {
    expect(isPanButton({ button: 1 })).toBe(true);
    expect(isPanButton({ button: 0 })).toBe(false);
    expect(isPanButton({ button: 2 })).toBe(false);
  });

  it('is false for an absent event (D-11)', () => {
    expect(isPanButton(undefined)).toBe(false);
    expect(isPanButton(null)).toBe(false);
    expect(isPanButton({})).toBe(false);
  });
});

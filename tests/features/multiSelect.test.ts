// quick-260902-nfs Task 1 (RED→GREEN) — the pure delete-target derivation behind a marquee
// multi-selection.
//
// `multiSelect.ts` owns the ONE rule that decides what a Delete gesture destroys and whether it
// must be confirmed first. It is pure (no React, no Konva, no Dexie) for the same reason
// `marquee.ts` is: the destructive decision is the part that most needs to be pinned by tests with
// plain data and no renderer. These assertions encode D-1 (a 2+ marquee delete confirms; a
// single-select delete does not) and D-2 (a lone selected MARKER is never deletable from the
// keyboard — removing a placement stays the explicit "Remove from this map" action that
// `e2e/delete-vs-remove.spec.ts` guards).

import { describe, expect, it } from 'vitest';
import {
  deleteTargets,
  selectionCount,
  type MarqueeSelection,
} from '@/features/person-map/editor/multiSelect';

const empty: MarqueeSelection = { shapeIds: [], markerIds: [] };

describe('selectionCount', () => {
  it('counts shapes and markers together', () => {
    expect(selectionCount({ shapeIds: ['a'], markerIds: ['b', 'c'] })).toBe(3);
  });

  it('is 0 for an empty selection', () => {
    expect(selectionCount(empty)).toBe(0);
  });

  it('tolerates a malformed selection missing an array', () => {
    // At-rest/transient state is never trusted to be well-formed (the marquee.boxesIntersect
    // posture): a missing array counts as zero rather than throwing.
    expect(selectionCount({ shapeIds: ['a'] } as unknown as MarqueeSelection)).toBe(1);
  });
});

describe('deleteTargets', () => {
  it('returns the whole marquee selection and REQUIRES a confirm for 2+ objects (D-1)', () => {
    const sel: MarqueeSelection = { shapeIds: ['s1', 's2'], markerIds: ['m1'] };
    expect(deleteTargets(sel, null)).toEqual({
      shapeIds: ['s1', 's2'],
      markerIds: ['m1'],
      requiresConfirm: true,
    });
  });

  it('requires a confirm for a 2-marker selection with no shapes', () => {
    const sel: MarqueeSelection = { shapeIds: [], markerIds: ['m1', 'm2'] };
    expect(deleteTargets(sel, null)).toEqual({
      shapeIds: [],
      markerIds: ['m1', 'm2'],
      requiresConfirm: true,
    });
  });

  it('falls back to the ONE selected shape, with NO confirm, for a 0-object selection (D-1)', () => {
    expect(deleteTargets(empty, 'shape-x')).toEqual({
      shapeIds: ['shape-x'],
      markerIds: [],
      requiresConfirm: false,
    });
  });

  it('falls back to the selected shape, with NO confirm, for a 1-object selection', () => {
    // A 1-hit band sets the existing single-select state instead of the marquee selection, so this
    // is the same zero-friction path as an ordinary click-then-Delete.
    const sel: MarqueeSelection = { shapeIds: ['s1'], markerIds: [] };
    expect(deleteTargets(sel, 'shape-x')).toEqual({
      shapeIds: ['shape-x'],
      markerIds: [],
      requiresConfirm: false,
    });
  });

  it('returns an EMPTY set for a bare Delete with nothing selected (T-QT-01 carried forward)', () => {
    expect(deleteTargets(empty, null)).toEqual({
      shapeIds: [],
      markerIds: [],
      requiresConfirm: false,
    });
  });

  it('never returns a marker id unless the marquee selection held 2+ objects (D-2)', () => {
    // A single banded MARKER with no shape selection deletes nothing at all: the keyboard has no
    // single-marker delete, so the delete-vs-remove distinction stays sharp.
    const oneMarker: MarqueeSelection = { shapeIds: [], markerIds: ['m1'] };
    expect(deleteTargets(oneMarker, null)).toEqual({
      shapeIds: [],
      markerIds: [],
      requiresConfirm: false,
    });
    // …and with a shape selected, only that shape goes — the banded marker is untouched.
    expect(deleteTargets(oneMarker, 'shape-x').markerIds).toEqual([]);
  });
});

// multiSelect — the PURE rule deciding WHAT a Delete gesture destroys, and whether the curator has
// to confirm it first.
//
// This module exists for the same reason `marquee.ts` does: the destructive half of the marquee
// gesture is the part that most needs to be pinned by tests with plain data and no renderer. It is
// free of React, Konva and Dexie; MapView is a thin wiring layer over it.
//
// WHY A BULK DELETE CONFIRMS AND A SINGLE DELETE DOES NOT (D-1). A band hit-tests a rotated shape
// by its UNROTATED composed bounding box (see the `marquee.ts` module header), so a band can
// legitimately catch an object the curator never consciously aimed at — and this is the first
// gesture in the app that can delete MARKERS in bulk. There is no undo: the only recovery from a
// wrong delete is restoring a backup. So a 2+ marquee delete routes through the shared blocking
// `ConfirmDialog` (safe Cancel focused), while the long-standing single-selected-shape Delete keeps
// its zero-friction behaviour, byte-for-byte unchanged.
//
// WHY A LONE SELECTED MARKER IS NOT KEYBOARD-DELETABLE (D-2). Today Delete on a single selected
// marker does nothing, and removing one placement is the explicit "Remove from this map" action in
// `ProfileSidebar`. That is the load-bearing delete-vs-remove distinction `e2e/delete-vs-remove.spec.ts`
// guards: deleting a PERSON destroys the person everywhere; removing a PLACEMENT drops only the
// marker row. A silent keyboard marker-delete would blur exactly that line, so marker ids are
// returned ONLY when the band caught 2+ objects — i.e. only behind the confirm.
//
// Threat T-QT-01 (carried forward): a bare Delete keypress with nothing selected can never build a
// delete set. Every path below returns an empty set rather than guessing at a target.

/**
 * The additive marquee multi-selection: the ids a band caught, split by object class. Markers and
 * portals share `markerIds` because they share the `db.markers` table.
 */
export interface MarqueeSelection {
  shapeIds: string[];
  markerIds: string[];
}

/** The resolved delete set plus whether it must be confirmed before it runs. */
export interface DeleteTargets {
  shapeIds: string[];
  markerIds: string[];
  /** True only for a 2+ marquee selection (D-1). */
  requiresConfirm: boolean;
}

/** Defensive read of one id list — transient selection state is never trusted to be well-formed. */
function ids(list: string[] | undefined): string[] {
  return Array.isArray(list) ? list : [];
}

/** How many objects a marquee selection holds, shapes and markers together. */
export function selectionCount(sel: MarqueeSelection): number {
  return ids(sel?.shapeIds).length + ids(sel?.markerIds).length;
}

/**
 * Resolve the delete set for a Delete/Backspace press or a MultiSelectBar Delete click.
 *
 * - A 2+ marquee selection deletes EVERYTHING it holds (shapes and markers/portals) and
 *   `requiresConfirm` is true (D-1).
 * - Otherwise the single selected shape deletes immediately, with no confirm — today's behaviour.
 * - With neither, nothing is deleted (T-QT-01).
 *
 * Marker ids can only ever leave here via the first branch (D-2).
 */
export function deleteTargets(
  sel: MarqueeSelection,
  selectedShapeId: string | null,
): DeleteTargets {
  const shapeIds = ids(sel?.shapeIds);
  const markerIds = ids(sel?.markerIds);
  if (shapeIds.length + markerIds.length >= 2) {
    return { shapeIds, markerIds, requiresConfirm: true };
  }
  if (selectedShapeId) {
    return { shapeIds: [selectedShapeId], markerIds: [], requiresConfirm: false };
  }
  return { shapeIds: [], markerIds: [], requiresConfirm: false };
}

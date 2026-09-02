// connectors.ts — the PURE map-projection geometry for REL-03 (Pattern 2, D-07/D-08/D-10).
//
// A connector is a rendered consequence of an authored person↔person relationship: it is NEVER
// drawn by hand and its coordinates are NEVER persisted (D-10 viewer-only projection). This module
// derives the connector list from the authored relationship-links + the person-markers on the
// ACTIVE map, composing each endpoint through `imageToStage` exactly like the markers themselves so
// the lines stay anchored when the background is re-fit and can follow a marker live during a drag.
//
// Render rule (D-07): a connector is drawn ONLY when BOTH endpoints are people who each have a
// person-marker on the active map. Person↔group and group↔group links are graph-only (groups have
// no marker) and produce NOTHING here. An endpoint-less legacy shell (no fromId/toId) and a link to
// an unplaced person are dropped (Pitfall 4 / T-04-10 — a missing marker yields no connector, never
// a throw). When a person is multi-placed, the connector attaches to the FIRST/primary placement
// only (B6) — never a fan of lines to every placement.

import type { BackgroundTransform, Marker, RelationshipLink } from '@/domain/types';
import { imageToStage, type Point } from './coords';

/** A single derived connector between two person-markers, in STAGE space (ready to draw). */
export interface Connector {
  /** The source RelationshipLink id (also the selection key + the Konva node name). */
  id: string;
  /** Stage-space endpoint for the link's `from` person (its primary placement). */
  a: Point;
  /** Stage-space endpoint for the link's `to` person (its primary placement). */
  b: Point;
  /** D-01: an arrowhead renders only when the link is directed (normalized `=== true` at read). */
  directed: boolean;
  /** REL-02 label (empty string when unset); drawn in a pill only when the toggle is ON (D-09). */
  label: string;
}

/**
 * A transient live drag position (STAGE space) for the one marker currently being dragged. The
 * connector layer overlays this position for that marker so the line tracks it mid-drag WITHOUT a
 * per-frame Dexie write; on drag-end the marker persists and this override clears (Pitfall 1).
 */
export interface DragOverride {
  markerId: string;
  x: number;
  y: number;
}

export interface BuildConnectorsOptions {
  /** Live drag position for the dragging marker (live-follow-on-drag). */
  dragOverride?: DragOverride | null;
  /**
   * D-5: live drag positions for SEVERAL markers at once — a marquee GROUP drag moves the whole
   * selection, which the singular `dragOverride` above cannot express.
   *
   * Added ALONGSIDE the singular form rather than replacing it, because `ConnectorLayer` already
   * threads `dragOverride` for the one marker Konva is dragging and MapView keeps using it for the
   * GRABBED object (whose live position comes from AvatarMarker's own rAF drag-move). Both are
   * merged into a single lookup below, so callers can pass either, both, or neither.
   */
  dragOverrides?: DragOverride[] | null;
}

/**
 * Derive the connector list from links + the person-markers on the active map.
 *
 * @param links    All relationship-links (a live query of `db.relationshipLinks`).
 * @param markers  The markers on the ACTIVE map (person + portal; portals are ignored here).
 * @param transform The active map's background transform — endpoints compose THROUGH it (D-08).
 */
export function buildConnectors(
  links: RelationshipLink[],
  markers: Marker[],
  transform: BackgroundTransform,
  opts: BuildConnectorsOptions = {},
): Connector[] {
  const { dragOverride = null, dragOverrides = null } = opts;

  // One lookup for both override forms (D-5). The plural list is applied first and the singular
  // one last, so the GRABBED marker — the object Konva is physically dragging, and therefore the
  // most authoritative live position — wins any collision.
  const overrideByMarker = new Map<string, Point>();
  for (const o of dragOverrides ?? []) overrideByMarker.set(o.markerId, { x: o.x, y: o.y });
  if (dragOverride) overrideByMarker.set(dragOverride.markerId, { x: dragOverride.x, y: dragOverride.y });

  // Primary placement per person (B6): chosen DETERMINISTICALLY, not by array order (WR-05). The
  // caller's `markers` come from `db.markers.where('mapId').equals(...)`, which Dexie returns ordered
  // by primary KEY (a random `nanoid`) — NOT insertion time — so a "first-seen wins" rule picked a
  // lexicographically-arbitrary placement that could differ run to run. Instead pick the
  // earliest-touched marker (oldest `updatedAt`), tie-broken by `id` for a total, stable order, so
  // the same placement anchors the connector on every read regardless of Dexie's iteration order.
  const isPrimaryOver = (candidate: Marker, current: Marker): boolean =>
    candidate.updatedAt !== current.updatedAt
      ? candidate.updatedAt < current.updatedAt
      : candidate.id < current.id;
  const primaryByPerson = new Map<string, Marker>();
  for (const mk of markers) {
    if (mk.kind !== 'person' || !mk.personId) continue;
    const current = primaryByPerson.get(mk.personId);
    if (!current || isPrimaryOver(mk, current)) primaryByPerson.set(mk.personId, mk);
  }

  // Resolve a person's endpoint to a stage point — overlaid by the transient drag position when the
  // person's primary marker is the one being dragged.
  const endpointFor = (personId: string): Point | null => {
    const mk = primaryByPerson.get(personId);
    if (!mk) return null;
    const live = overrideByMarker.get(mk.id);
    if (live) return { x: live.x, y: live.y };
    return imageToStage({ x: mk.x, y: mk.y }, transform);
  };

  const connectors: Connector[] = [];
  for (const link of links) {
    // D-07: person↔person only. A group-involving (or Location-typed) endpoint never draws here.
    if (link.fromType !== 'people' || link.toType !== 'people') continue;
    // Endpoint-less legacy shell → not drawable (Pitfall 4).
    if (!link.fromId || !link.toId) continue;
    const a = endpointFor(link.fromId);
    const b = endpointFor(link.toId);
    // Either endpoint unplaced on this map → drop (T-04-10: no connector, never a throw).
    if (!a || !b) continue;
    connectors.push({
      id: link.id,
      a,
      b,
      directed: link.directed === true,
      label: link.label ?? '',
    });
  }
  return connectors;
}

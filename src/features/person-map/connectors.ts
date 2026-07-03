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
  /** True when this relationship is the selected one (amber highlight). */
  selected: boolean;
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
  /** The selected relationship id (turns its connector amber). Never set by clicking the line. */
  selectedRelationshipId?: string | null;
  /** Live drag position for the dragging marker (live-follow-on-drag). */
  dragOverride?: DragOverride | null;
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
  const { selectedRelationshipId = null, dragOverride = null } = opts;

  // Primary placement per person: the FIRST person-marker on the map for that personId (B6). Array
  // order is insertion order, so the first-seen marker wins; later placements are ignored.
  const primaryByPerson = new Map<string, Marker>();
  for (const mk of markers) {
    if (mk.kind !== 'person' || !mk.personId) continue;
    if (!primaryByPerson.has(mk.personId)) primaryByPerson.set(mk.personId, mk);
  }

  // Resolve a person's endpoint to a stage point — overlaid by the transient drag position when the
  // person's primary marker is the one being dragged.
  const endpointFor = (personId: string): Point | null => {
    const mk = primaryByPerson.get(personId);
    if (!mk) return null;
    if (dragOverride && dragOverride.markerId === mk.id) {
      return { x: dragOverride.x, y: dragOverride.y };
    }
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
      selected: selectedRelationshipId === link.id,
      label: link.label ?? '',
    });
  }
  return connectors;
}

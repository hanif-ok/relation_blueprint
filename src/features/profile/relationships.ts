// Pure helpers for the ProfileSidebar "Relationships" section (REL-01/REL-02, 04-02) — the
// unit-testable core, extracted so it renders without a DOM (the "Appears on" `groupPlacementsByMap`
// precedent). A single canonical `RelationshipLink` is read from BOTH endpoints (D-04); these
// helpers resolve the OTHER endpoint given "this" entity, pick the direction glyph (a shape, never a
// color — B2), and DROP legacy endpoint-less shells so a pre-Phase-4 link never renders as a broken
// row. Name resolution is INJECTED (the component feeds a reactive people+groups lookup) so this
// module stays free of Dexie and trivially testable.

import type { RelationshipEndpointType, RelationshipLink } from '@/domain/types';

/** The three direction glyphs (Lucide-backed in the UI): outgoing, incoming, symmetric. */
export type DirectionGlyph = '→' | '←' | '↔';

/** Resolve a name for an endpoint, or `undefined` if that entity no longer exists (orphan). */
export type EndpointNameResolver = (
  type: RelationshipEndpointType,
  id: string,
) => string | undefined;

/** One rendered relationship row: the canonical link + its resolved OTHER endpoint + glyph. */
export interface RelationshipRow {
  /** The canonical link (row click opens its relationship-record profile, D-06). */
  link: RelationshipLink;
  /** The OTHER endpoint's id (endpoint-name click opens that entity, D-10). */
  otherId: string;
  /** The OTHER endpoint's family (people|groups) — used to open the right profile. */
  otherType: RelationshipEndpointType;
  /** The OTHER endpoint's name, or `undefined` when it was deleted (drives the orphan guard). */
  otherName: string | undefined;
  /** Direction relative to THIS entity: `→` from, `←` to, `↔` symmetric. */
  glyph: DirectionGlyph;
}

/** `directed === true` is the only truthy case; absent/false is symmetric (normalize at read). */
function isDirected(link: RelationshipLink): boolean {
  return link.directed === true;
}

/**
 * The endpoint on the OTHER side of the link from `thisEntityId`. Returns `null` for a legacy shell
 * missing endpoint ids, or when `thisEntityId` is neither endpoint. The same canonical link resolves
 * from EITHER end (D-04).
 */
export function resolveOtherEndpoint(
  thisEntityId: string,
  link: RelationshipLink,
): { id: string; type: RelationshipEndpointType } | null {
  if (!link.fromId || !link.toId || !link.fromType || !link.toType) return null;
  if (link.fromId === thisEntityId) return { id: link.toId, type: link.toType };
  if (link.toId === thisEntityId) return { id: link.fromId, type: link.fromType };
  return null;
}

/**
 * Direction glyph relative to `thisEntityId`: `→` when directed and this entity is the `from` end,
 * `←` when directed and this entity is the `to` end, `↔` when the link is symmetric. Direction is a
 * shape, never a color (B2) — the caller maps the glyph to a Lucide icon.
 */
export function directionGlyphFor(thisEntityId: string, link: RelationshipLink): DirectionGlyph {
  if (!isDirected(link)) return '↔';
  return link.fromId === thisEntityId ? '→' : '←';
}

/**
 * Build one row per link where `thisEntityId` is an endpoint, resolving the OTHER endpoint's name +
 * glyph. Links missing endpoint ids (legacy endpoint-less shells) are DROPPED so they never render.
 */
export function buildRelationshipRows(
  thisEntityId: string,
  links: RelationshipLink[],
  resolveName: EndpointNameResolver,
): RelationshipRow[] {
  const rows: RelationshipRow[] = [];
  for (const link of links) {
    const other = resolveOtherEndpoint(thisEntityId, link);
    if (!other) continue; // legacy shell / not an endpoint — never render a broken row
    rows.push({
      link,
      otherId: other.id,
      otherType: other.type,
      otherName: resolveName(other.type, other.id),
      glyph: directionGlyphFor(thisEntityId, link),
    });
  }
  return rows;
}

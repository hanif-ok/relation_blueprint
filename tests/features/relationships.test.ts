// REL-01/REL-02 — pure helpers behind the ProfileSidebar "Relationships" section (04-02).
//
// The section renders one row per canonical RelationshipLink where THIS entity is an endpoint,
// showing the OTHER endpoint's name + a direction glyph. These helpers are the unit-testable core
// (mirroring `groupPlacementsByMap` for "Appears on"): they resolve the other endpoint from either
// side of the link, pick the direction glyph, and DROP legacy endpoint-less shells so a pre-Phase-4
// relationship-link never renders as a broken row. Name resolution is injected (the component feeds
// a reactive people+groups lookup) so the helpers stay free of Dexie.

import { describe, expect, it } from 'vitest';
import type { RelationshipLink } from '@/domain/types';
import {
  buildRelationshipRows,
  directionGlyphFor,
  resolveOtherEndpoint,
} from '@/features/profile/relationships';

/** Build a minimal RelationshipLink with the endpoint fields under test. */
function link(partial: Partial<RelationshipLink>): RelationshipLink {
  return {
    id: partial.id ?? 'l1',
    name: partial.name ?? 'rel',
    gallery: [],
    custom: {},
    updatedAt: 0,
    dirty: false,
    ...partial,
  };
}

const A = 'person-a';
const B = 'person-b';
const G = 'group-g';

describe('directionGlyphFor — arrowhead is a shape, not a color (B2)', () => {
  it('→ when directed and THIS entity is the `from` end', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'people', toId: B, directed: true });
    expect(directionGlyphFor(A, l)).toBe('→');
  });

  it('← when directed and THIS entity is the `to` end', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'people', toId: B, directed: true });
    expect(directionGlyphFor(B, l)).toBe('←');
  });

  it('↔ when the link is not directed (symmetric, the Mutual default)', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'people', toId: B, directed: false });
    expect(directionGlyphFor(A, l)).toBe('↔');
    expect(directionGlyphFor(B, l)).toBe('↔');
  });

  it('treats an absent `directed` as symmetric (normalize at read)', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'people', toId: B });
    expect(directionGlyphFor(A, l)).toBe('↔');
  });
});

describe('resolveOtherEndpoint — the same canonical link is read from BOTH ends (D-04)', () => {
  it('returns the `to` endpoint when THIS entity is the `from` end', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'groups', toId: G });
    expect(resolveOtherEndpoint(A, l)).toEqual({ id: G, type: 'groups' });
  });

  it('returns the `from` endpoint when THIS entity is the `to` end', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'groups', toId: G });
    expect(resolveOtherEndpoint(G, l)).toEqual({ id: A, type: 'people' });
  });

  it('returns null for a legacy shell missing endpoints', () => {
    expect(resolveOtherEndpoint(A, link({}))).toBeNull();
  });
});

describe('buildRelationshipRows — one row per link, other-endpoint name + glyph', () => {
  const resolve = (_type: 'people' | 'groups', id: string): string | undefined => {
    const names: Record<string, string> = { [A]: 'Ada', [B]: 'Babbage', [G]: 'The Guild' };
    return names[id];
  };

  it('builds one row per link naming the OTHER endpoint with its glyph', () => {
    const links = [
      link({ id: 'l1', fromType: 'people', fromId: A, toType: 'people', toId: B, directed: true }),
      link({ id: 'l2', fromType: 'people', fromId: A, toType: 'groups', toId: G, directed: false }),
    ];
    const rows = buildRelationshipRows(A, links, resolve);
    expect(rows).toHaveLength(2);

    expect(rows[0].link.id).toBe('l1');
    expect(rows[0].otherId).toBe(B);
    expect(rows[0].otherName).toBe('Babbage');
    expect(rows[0].glyph).toBe('→');

    expect(rows[1].otherId).toBe(G);
    expect(rows[1].otherType).toBe('groups');
    expect(rows[1].otherName).toBe('The Guild');
    expect(rows[1].glyph).toBe('↔');
  });

  it('reads the link from the OTHER end too (canonical, both endpoints)', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'people', toId: B, directed: true });
    const rows = buildRelationshipRows(B, [l], resolve);
    expect(rows).toHaveLength(1);
    expect(rows[0].otherId).toBe(A);
    expect(rows[0].otherName).toBe('Ada');
    expect(rows[0].glyph).toBe('←'); // B is the `to` end of a directed link
  });

  it('DROPS links missing fromId/toId (legacy endpoint-less shells)', () => {
    const links = [
      link({ id: 'good', fromType: 'people', fromId: A, toType: 'people', toId: B }),
      link({ id: 'shell' }), // no endpoints — must not render
      link({ id: 'half', fromType: 'people', fromId: A }), // only one end — must not render
    ];
    const rows = buildRelationshipRows(A, links, resolve);
    expect(rows.map((r) => r.link.id)).toEqual(['good']);
  });

  it('surfaces a deleted other-endpoint as an undefined name (orphan guard input)', () => {
    const l = link({ fromType: 'people', fromId: A, toType: 'people', toId: 'ghost' });
    const rows = buildRelationshipRows(A, [l], resolve);
    expect(rows).toHaveLength(1);
    expect(rows[0].otherId).toBe('ghost');
    expect(rows[0].otherName).toBeUndefined();
  });
});

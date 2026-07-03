// REL-03 Task 1 (RED→GREEN) — the pure connector-projection geometry (Pattern 2, D-07/D-08/D-10).
//
// `buildConnectors(links, markers, transform, opts)` is the single genuinely-new piece of the map
// projection: it derives a connector list from authored relationship-links + the person-markers on
// the ACTIVE map, composing each endpoint through `imageToStage` exactly like the markers so the
// lines stay anchored on a background re-fit and can follow a marker live during a drag. This test
// pins the render rule and the filters BEFORE the implementation exists (mirrors coords.test.ts as
// pure assertions with no DOM):
//   (1) person↔person, both placed → ONE connector with a/b via imageToStage; `directed` carried,
//   (2) a group-involving link (person↔group / group↔group) → NONE (groups have no marker, D-07),
//   (3) a link whose either endpoint has no marker on the map → DROPPED,
//   (4) an endpoint-less legacy shell (no fromId/toId) → DROPPED (Pitfall 4),
//   (5) multi-placement: a person with several markers → exactly ONE connector to the FIRST/primary
//       placement (B6), never a fan,
//   (6) an absent `directed` normalizes to false at read (Pitfall 4),
//   (7) a transient drag override (STAGE space) overlays the live position for the one dragging
//       marker (live-follow-on-drag; the connector tracks the marker mid-drag without a Dexie write).

import { describe, expect, it } from 'vitest';
import type { BackgroundTransform, Marker, RelationshipLink } from '@/domain/types';
import { imageToStage } from '@/features/person-map/coords';
import { buildConnectors } from '@/features/person-map/connectors';

const identity: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const moved: BackgroundTransform = { offsetX: 100, offsetY: 50, scale: 2, rotation: Math.PI / 4 };

let seq = 0;
function marker(personId: string, x: number, y: number, over: Partial<Marker> = {}): Marker {
  return {
    id: over.id ?? `mk-${personId}-${seq++}`,
    mapId: 'map-1',
    kind: 'person',
    personId,
    x,
    y,
    updatedAt: 0,
    dirty: false,
    ...over,
  };
}

function link(over: Partial<RelationshipLink> = {}): RelationshipLink {
  return {
    id: over.id ?? `rel-${seq++}`,
    name: 'rel',
    gallery: [],
    custom: {},
    updatedAt: 0,
    dirty: false,
    fromType: 'people',
    toType: 'people',
    ...over,
  };
}

describe('buildConnectors — pure map-projection geometry (REL-03, D-07)', () => {
  it('draws one connector between two people who each have a marker on the map', () => {
    const mA = marker('A', 10, 20, { id: 'mA' });
    const mB = marker('B', 40, 60, { id: 'mB' });
    const rel = link({ id: 'r1', fromId: 'A', toId: 'B', directed: true });

    const out = buildConnectors([rel], [mA, mB], moved);

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r1');
    expect(out[0].a).toEqual(imageToStage({ x: 10, y: 20 }, moved));
    expect(out[0].b).toEqual(imageToStage({ x: 40, y: 60 }, moved));
    expect(out[0].directed).toBe(true);
  });

  it('never draws a connector for a group-involving link (person↔group or group↔group)', () => {
    const mA = marker('A', 10, 20);
    const personGroup = link({ fromType: 'people', fromId: 'A', toType: 'groups', toId: 'G1' });
    const groupGroup = link({ fromType: 'groups', fromId: 'G1', toType: 'groups', toId: 'G2' });

    expect(buildConnectors([personGroup, groupGroup], [mA], identity)).toHaveLength(0);
  });

  it('drops a link when either endpoint has no marker on the active map', () => {
    const mA = marker('A', 10, 20);
    // B is a real person but is NOT placed on this map → no connector can be drawn.
    const rel = link({ fromId: 'A', toId: 'B' });

    expect(buildConnectors([rel], [mA], identity)).toHaveLength(0);
  });

  it('drops an endpoint-less legacy shell link (no fromId/toId)', () => {
    const mA = marker('A', 10, 20);
    const mB = marker('B', 40, 60);
    const shell = link({ id: 'shell', fromId: undefined, toId: undefined });

    expect(buildConnectors([shell], [mA, mB], identity)).toHaveLength(0);
  });

  it('draws exactly ONE connector to the first/primary placement when a person is multi-placed (B6)', () => {
    const firstA = marker('A', 10, 20, { id: 'A-primary' });
    const secondA = marker('A', 300, 300, { id: 'A-second' });
    const mB = marker('B', 40, 60, { id: 'mB' });
    const rel = link({ id: 'r1', fromId: 'A', toId: 'B' });

    const out = buildConnectors([rel], [firstA, secondA, mB], identity);

    expect(out).toHaveLength(1);
    // The endpoint composes from the FIRST placement (10,20), never the second (300,300).
    expect(out[0].a).toEqual(imageToStage({ x: 10, y: 20 }, identity));
  });

  it('normalizes an absent `directed` to false at read', () => {
    const mA = marker('A', 10, 20);
    const mB = marker('B', 40, 60);
    const rel = link({ fromId: 'A', toId: 'B' }); // no `directed`

    expect(buildConnectors([rel], [mA, mB], identity)[0].directed).toBe(false);
  });

  it('overlays a transient drag override (stage-space) for the one dragging marker (live-follow)', () => {
    const mA = marker('A', 10, 20, { id: 'mA' });
    const mB = marker('B', 40, 60, { id: 'mB' });
    const rel = link({ id: 'r1', fromId: 'A', toId: 'B' });

    // mA is being dragged; its live STAGE position is (999, 888) — the connector's `a` endpoint
    // must track that live position, NOT the persisted image-space (10,20).
    const out = buildConnectors([rel], [mA, mB], identity, {
      dragOverride: { markerId: 'mA', x: 999, y: 888 },
    });

    expect(out[0].a).toEqual({ x: 999, y: 888 });
    expect(out[0].b).toEqual(imageToStage({ x: 40, y: 60 }, identity));
  });
});

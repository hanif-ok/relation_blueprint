// Phase 3 Wave 0 (MAP-02/03/06/07, D-01..D-16): the zod trust boundary for the map-editor
// data foundation. These assert the EXTENDED Marker (transform/portal) + MapDoc (shapes/
// layers/parentId/backgroundTransform) schemas, the new Shape/Layer/BackgroundTransform
// schemas, and the portal+zone tokens. Every new field is optional-with-default so a
// pre-Phase-3 cloud shard/backup still validates (RESEARCH Pitfall 7).
//
// The `satisfies` locks (compiled by `tsc --noEmit`) guarantee each schema's `z.infer`
// matches its hand-written interface; these tests cover runtime parse + defaulting.

import { describe, expect, it } from 'vitest';
import {
  BackgroundTransformSchema,
  LayerSchema,
  MapDocSchema,
  MarkerKindSchema,
  MarkerSchema,
  ShapeSchema,
} from '@/domain/schemas';
import { colors, zonePresets } from '@/app/tokens';

// ---- Marker (transform + portal discriminant, RESEARCH Pattern 5a/7) -----------------

function preMarker() {
  // The EXACT pre-Phase-3 marker shape: stage-space x/y, no kind/transform fields.
  return {
    id: 'mk1',
    mapId: 'map1',
    personId: 'p1',
    x: 100,
    y: 200,
    updatedAt: 1_700_000_000_000,
    dirty: false,
  };
}

describe('MarkerSchema — Phase-3 transform/portal extension', () => {
  it('accepts a pre-Phase-3 marker (no kind/transform) and defaults kind to person', () => {
    const parsed = MarkerSchema.parse(preMarker());
    expect(parsed.kind).toBe('person');
    // x/y are REINTERPRETED as image-space — same fields, NO rewrite on parse.
    expect(parsed.x).toBe(100);
    expect(parsed.y).toBe(200);
    expect(parsed.personId).toBe('p1');
  });

  it('accepts a person marker carrying width/height/rotation transform fields', () => {
    const parsed = MarkerSchema.parse({
      ...preMarker(),
      kind: 'person',
      width: 48,
      height: 48,
      rotation: 0.5,
    });
    expect(parsed.width).toBe(48);
    expect(parsed.height).toBe(48);
    expect(parsed.rotation).toBe(0.5);
  });

  it('accepts a portal marker with targetMapId and no personId', () => {
    const { personId: _unused, ...rest } = preMarker();
    void _unused;
    const parsed = MarkerSchema.parse({ ...rest, kind: 'portal', targetMapId: 'map2' });
    expect(parsed.kind).toBe('portal');
    expect(parsed.targetMapId).toBe('map2');
    expect(parsed.personId).toBeUndefined();
  });

  it('rejects an out-of-band kind value', () => {
    expect(MarkerSchema.safeParse({ ...preMarker(), kind: 'ghost' }).success).toBe(false);
  });
});

describe('MarkerKindSchema', () => {
  it('is the closed person|portal enum', () => {
    expect(MarkerKindSchema.parse('person')).toBe('person');
    expect(MarkerKindSchema.parse('portal')).toBe('portal');
    expect(MarkerKindSchema.safeParse('door').success).toBe(false);
  });
});

// ---- BackgroundTransform / Layer / Shape ---------------------------------------------

describe('BackgroundTransformSchema (D-16)', () => {
  it('accepts an identity transform', () => {
    const parsed = BackgroundTransformSchema.parse({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
    expect(parsed).toEqual({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
  });

  it('rejects a transform missing a field', () => {
    expect(BackgroundTransformSchema.safeParse({ offsetX: 0, offsetY: 0, scale: 1 }).success).toBe(false);
  });
});

describe('LayerSchema (D-04)', () => {
  it('accepts a well-formed layer', () => {
    const parsed = LayerSchema.parse({ id: 'l1', name: 'Markers', visible: true, locked: false, order: 0 });
    expect(parsed.name).toBe('Markers');
    expect(parsed.visible).toBe(true);
  });
});

describe('ShapeSchema (D-01/D-02/D-03)', () => {
  function rectShape() {
    return {
      id: 's1',
      layerId: 'l1',
      kind: 'rect' as const,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      rotation: 0,
      preset: 'stone',
      fill: true,
    };
  }

  it('accepts a rect shape (no label = plain shape)', () => {
    const parsed = ShapeSchema.parse(rectShape());
    expect(parsed.kind).toBe('rect');
    expect(parsed.label).toBeUndefined();
  });

  it('accepts a labeled shape (a zone per D-02 — label makes it a zone, no separate entity)', () => {
    const parsed = ShapeSchema.parse({ ...rectShape(), label: 'Kitchen' });
    expect(parsed.label).toBe('Kitchen');
  });

  it('accepts a polygon shape carrying a points array', () => {
    const parsed = ShapeSchema.parse({
      id: 's2',
      layerId: 'l1',
      kind: 'polygon',
      points: [0, 0, 10, 0, 10, 10],
      rotation: 0,
      preset: 'sage',
      fill: false,
    });
    expect(parsed.kind).toBe('polygon');
    expect(parsed.points).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it('rejects a shape with an out-of-band kind', () => {
    expect(ShapeSchema.safeParse({ ...rectShape(), kind: 'triangle' }).success).toBe(false);
  });
});

// ---- MapDoc (shapes/layers/parentId/backgroundTransform) -----------------------------

function preMapDoc() {
  // The EXACT pre-Phase-3 MapDoc shape (Phase-2 rich Location, no map-editor sub-objects).
  return {
    id: 'map1',
    name: 'HQ',
    background: { hash: 'h', mime: 'image/png' },
    width: 800,
    height: 600,
    gallery: [],
    custom: {},
    updatedAt: 1_700_000_000_000,
    dirty: false,
  };
}

describe('MapDocSchema — Phase-3 sub-object extension', () => {
  it('accepts a pre-Phase-3 MapDoc and defaults shapes/layers to empty arrays', () => {
    const parsed = MapDocSchema.parse(preMapDoc());
    expect(parsed.shapes).toEqual([]);
    expect(parsed.layers).toEqual([]);
    // Optional fields with no default stay absent.
    expect(parsed.parentId).toBeUndefined();
    expect(parsed.backgroundTransform).toBeUndefined();
  });

  it('accepts a MapDoc carrying parentId, backgroundTransform, shapes, and layers', () => {
    const parsed = MapDocSchema.parse({
      ...preMapDoc(),
      parentId: 'parent-map',
      backgroundTransform: { offsetX: 5, offsetY: 6, scale: 2, rotation: 0.1 },
      layers: [{ id: 'l1', name: 'Markers', visible: true, locked: false, order: 0 }],
      shapes: [
        {
          id: 's1',
          layerId: 'l1',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotation: 0,
          preset: 'stone',
          fill: true,
        },
      ],
    });
    expect(parsed.parentId).toBe('parent-map');
    expect(parsed.backgroundTransform?.scale).toBe(2);
    expect(parsed.layers).toHaveLength(1);
    expect(parsed.shapes).toHaveLength(1);
  });
});

// ---- Tokens (portal hue + zone preset palette, UI-SPEC) ------------------------------

describe('tokens — portal hue + zone presets (UI-SPEC)', () => {
  it('exposes the portal hue', () => {
    expect(colors.portal).toBe('#3E6B8C');
  });

  it('exposes the five zone presets keyed by lowercased id', () => {
    expect(Object.keys(zonePresets).sort()).toEqual(['clay', 'dusk', 'plum', 'sage', 'stone']);
    expect(zonePresets.stone.stroke).toBe('#8A8170');
    expect(zonePresets.stone.fill).toBe('rgba(138,129,112,0.20)');
    expect(zonePresets.sage.stroke).toBe('#6E8E6A');
    expect(zonePresets.clay.stroke).toBe('#A8745A');
    expect(zonePresets.dusk.stroke).toBe('#6E7A9E');
    expect(zonePresets.plum.stroke).toBe('#8A6E8E');
  });
});

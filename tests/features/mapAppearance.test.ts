// POL-01 (D-05/D-06) — per-map colour persistence over the single Dexie `meta` row.
//
// A per-map label/connector colour choice persists in ONE `mapAppearance` meta row keyed by map
// id (NO schema migration, rides the existing `meta` table — see the schema-gate-dexie
// false-positive project note). getMapAppearance is the PURE resolver: an absent map resolves to
// today's look (label = colors.paper, connector = null / default hairline, D-06) so existing DBs
// render identically until customised. A tampered / malformed stored hex is coerced to the default
// rather than escaping to the canvas (threat T-07-01, ASVS V5). setMapColor/clearMapColor
// read-merge-write inside one rw transaction so rapid toggles compose over the latest record.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { colors } from '@/app/tokens';
import {
  clearMapColor,
  getMapAppearance,
  loadAppearance,
  setMapColor,
} from '@/features/person-map/mapAppearance';

beforeEach(async () => {
  await db.meta.clear();
});

describe('POL-01 (D-06) — getMapAppearance default resolution (PURE)', () => {
  it('resolves an absent map to today\'s look (paper label, null connector)', () => {
    expect(getMapAppearance({}, 'mapA')).toEqual({
      labelColor: colors.paper,
      connectorColor: null,
    });
  });

  it('returns the stored hexes for a customised map', () => {
    const record = { mapA: { labelColor: '#112233', connectorColor: '#445566' } };
    expect(getMapAppearance(record, 'mapA')).toEqual({
      labelColor: '#112233',
      connectorColor: '#445566',
    });
  });

  it('does not leak one map\'s colours to another map id', () => {
    const record = { mapA: { labelColor: '#112233', connectorColor: '#445566' } };
    expect(getMapAppearance(record, 'mapB')).toEqual({
      labelColor: colors.paper,
      connectorColor: null,
    });
  });
});

describe('POL-01 (threat T-07-01) — bad-hex coercion never escapes getMapAppearance', () => {
  it('coerces a non-#rrggbb labelColor to the paper default', () => {
    const record = { mapA: { labelColor: 'red', connectorColor: '#445566' } };
    expect(getMapAppearance(record, 'mapA')).toEqual({
      labelColor: colors.paper,
      connectorColor: '#445566',
    });
  });

  it('coerces a short / malformed connectorColor to null', () => {
    const record = { mapA: { labelColor: '#112233', connectorColor: '#12' } };
    expect(getMapAppearance(record, 'mapA')).toEqual({
      labelColor: '#112233',
      connectorColor: null,
    });
  });

  it('coerces a labelColor with a non-hex character to the default', () => {
    const record = { mapA: { labelColor: '#12ZZ34', connectorColor: null } };
    expect(getMapAppearance(record, 'mapA').labelColor).toBe(colors.paper);
  });

  it('never returns a value that is not #rrggbb or the null/paper default', () => {
    const record = {
      mapA: { labelColor: 'rgba(0,0,0,1)', connectorColor: 'blue' as unknown as string },
    };
    const resolved = getMapAppearance(record, 'mapA');
    expect(resolved.labelColor).toBe(colors.paper);
    expect(resolved.connectorColor).toBeNull();
  });
});

describe('POL-01 (D-05) — setMapColor / clearMapColor persistence over db.meta', () => {
  it('persists a labelColor and leaves connectorColor at its default', async () => {
    await setMapColor('mapA', 'labelColor', '#ABCDEF');
    const record = await loadAppearance();
    expect(getMapAppearance(record, 'mapA')).toEqual({
      labelColor: '#ABCDEF',
      connectorColor: null,
    });
  });

  it('stores the solid #rrggbb straight from the picker (no baked alpha)', async () => {
    await setMapColor('mapA', 'connectorColor', '#445566');
    const row = await db.meta.get('mapAppearance');
    expect((row?.value as Record<string, { connectorColor: string }>).mapA.connectorColor).toBe(
      '#445566',
    );
  });

  it('merges — setting connectorColor does not drop the existing labelColor', async () => {
    await setMapColor('mapA', 'labelColor', '#111111');
    await setMapColor('mapA', 'connectorColor', '#222222');
    expect(getMapAppearance(await loadAppearance(), 'mapA')).toEqual({
      labelColor: '#111111',
      connectorColor: '#222222',
    });
  });

  it('does not touch another map when setting one map\'s colour', async () => {
    await setMapColor('mapA', 'labelColor', '#111111');
    await setMapColor('mapB', 'labelColor', '#222222');
    const record = await loadAppearance();
    expect(getMapAppearance(record, 'mapA').labelColor).toBe('#111111');
    expect(getMapAppearance(record, 'mapB').labelColor).toBe('#222222');
  });

  it('clearMapColor removes the field so it falls back to the D-06 default', async () => {
    await setMapColor('mapA', 'labelColor', '#ABCDEF');
    await setMapColor('mapA', 'connectorColor', '#445566');
    await clearMapColor('mapA', 'labelColor');
    const resolved = getMapAppearance(await loadAppearance(), 'mapA');
    expect(resolved.labelColor).toBe(colors.paper);
    expect(resolved.connectorColor).toBe('#445566');
  });

  it('drops the map key entirely once its last field is cleared', async () => {
    await setMapColor('mapA', 'labelColor', '#ABCDEF');
    await clearMapColor('mapA', 'labelColor');
    const record = await loadAppearance();
    expect(Object.prototype.hasOwnProperty.call(record, 'mapA')).toBe(false);
    expect(getMapAppearance(record, 'mapA')).toEqual({
      labelColor: colors.paper,
      connectorColor: null,
    });
  });

  it('serialises rapid writes so each composes over the latest record (no lost write)', async () => {
    await Promise.all([
      setMapColor('mapA', 'labelColor', '#111111'),
      setMapColor('mapA', 'connectorColor', '#222222'),
    ]);
    expect(getMapAppearance(await loadAppearance(), 'mapA')).toEqual({
      labelColor: '#111111',
      connectorColor: '#222222',
    });
  });
});

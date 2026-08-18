// mapAppearance — POL-01 (D-05/D-06) per-map label/connector colour persistence.
//
// A per-map colour choice is a LOCAL Dexie-`meta` preference (ONE `mapAppearance` row keyed by map
// id), NOT a synced entity — it mirrors the one-row projection pattern in graph/positionCache.ts
// and the read-merge-write-in-rw-transaction pattern in search/useScopeSelection.ts. It rides the
// EXISTING `meta` table: there is NO `db.version()` bump, no new table, no MapDoc field (see the
// schema-gate-dexie-false-positive project-memory note).
//
// getMapAppearance is the PURE resolver and the trust boundary: an ABSENT map resolves to today's
// look (label = colors.paper, connector = null / default hairline, D-06) so existing databases
// render identically until customised, and a tampered / malformed stored hex is COERCED to its
// default rather than escaping to the Konva canvas (threat T-07-01, ASVS V5). The solid `#rrggbb`
// is stored straight from the picker — alpha is applied at render time in Plan 02, NEVER baked here.

import { db } from '@/db/schema';
import { colors } from '@/app/tokens';

/** The single stable Dexie `meta` key under which the whole per-map appearance map lives (local). */
const MAP_APPEARANCE_KEY = 'mapAppearance';

/** A resolved, always-valid per-map appearance: a `#rrggbb` label + an optional `#rrggbb` connector. */
export interface MapAppearance {
  labelColor: string;
  connectorColor: string | null;
}

/** The persisted map: `mapId -> { labelColor, connectorColor }`. Absent map = D-06 defaults. */
export type MapAppearanceRecord = Record<
  string,
  { labelColor: string; connectorColor: string | null }
>;

/** A strict solid `#rrggbb` shape (six hex digits) — the only value allowed to reach the canvas. */
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Coerce an unknown stored value to a valid `#rrggbb` string, or `null` if it is not one. */
function coerceHex(value: unknown): string | null {
  return typeof value === 'string' && HEX6.test(value) ? value : null;
}

/** Read the whole per-map appearance record back, or `{}` when nothing has been stored yet. */
export async function loadAppearance(): Promise<MapAppearanceRecord> {
  const row = await db.meta.get(MAP_APPEARANCE_KEY);
  return (row?.value as MapAppearanceRecord | undefined) ?? {};
}

/**
 * PURE resolver — the effective appearance for one map id. Looks up `record[mapId]`; validates each
 * stored field against the strict `#rrggbb` shape and COERCES a non-matching value to its default
 * (labelColor → colors.paper per D-06; connectorColor → null / default hairline). An absent map
 * therefore resolves to `{ labelColor: colors.paper, connectorColor: null }`. A malformed value can
 * never escape this function (threat T-07-01).
 */
export function getMapAppearance(record: MapAppearanceRecord, mapId: string): MapAppearance {
  const entry = record[mapId];
  return {
    labelColor: coerceHex(entry?.labelColor) ?? colors.paper,
    connectorColor: coerceHex(entry?.connectorColor),
  };
}

/** The colour fields a caller can set / clear on a map. */
export type MapColorField = 'labelColor' | 'connectorColor';

/**
 * Persist one colour field for a map by read-merge-put inside a single rw transaction — exactly the
 * useScopeSelection.setFieldChecked pattern — so rapid concurrent writes each compose over the
 * LATEST persisted record instead of a stale snapshot (no lost write). The solid `#rrggbb` is stored
 * as-is; alpha is applied at render time (Plan 02), never baked here.
 */
export async function setMapColor(
  mapId: string,
  field: MapColorField,
  hex: string,
): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const record =
      ((await db.meta.get(MAP_APPEARANCE_KEY))?.value as MapAppearanceRecord | undefined) ?? {};
    const existing = record[mapId] ?? { labelColor: colors.paper, connectorColor: null };
    const next: MapAppearanceRecord = {
      ...record,
      [mapId]: { ...existing, [field]: hex },
    };
    await db.meta.put({ key: MAP_APPEARANCE_KEY, value: next });
  });
}

/**
 * Clear one colour field for a map so it falls back to its D-06 default. Removes the field from the
 * map's entry (labelColor → back to colors.paper; connectorColor → back to null); if the entry has
 * no meaningful fields left, the map key is dropped entirely. Same single-rw-transaction
 * read-merge-put discipline as setMapColor.
 */
export async function clearMapColor(mapId: string, field: MapColorField): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const record =
      ((await db.meta.get(MAP_APPEARANCE_KEY))?.value as MapAppearanceRecord | undefined) ?? {};
    const existing = record[mapId];
    if (!existing) return;

    const nextEntry = { ...existing };
    if (field === 'labelColor') delete (nextEntry as Partial<typeof nextEntry>).labelColor;
    else delete (nextEntry as Partial<typeof nextEntry>).connectorColor;

    const next: MapAppearanceRecord = { ...record };
    // If nothing meaningful remains (no valid label AND no valid connector), drop the map key so a
    // fully-reset map resolves cleanly to the D-06 default via getMapAppearance.
    if (
      coerceHex((nextEntry as { labelColor?: unknown }).labelColor) === null &&
      coerceHex((nextEntry as { connectorColor?: unknown }).connectorColor) === null
    ) {
      delete next[mapId];
    } else {
      next[mapId] = nextEntry as { labelColor: string; connectorColor: string | null };
    }
    await db.meta.put({ key: MAP_APPEARANCE_KEY, value: next });
  });
}

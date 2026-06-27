import { expect, test } from '@playwright/test';

/**
 * MAP-03 — the per-map logical-layers panel drives the canvas. Seeds a map with TWO layers and an
 * object on each (a shape on "Base", a marker on "Top") through the SAME repository the UI uses
 * (window.__rb), opens the app, then asserts the three observable layer behaviors via a
 * bridge-exposed read of the real render set (the editor's own `orderObjectsForRender`), keeping
 * the assertions on the layer-driven behavior rather than brittle canvas pixel math:
 *   (1) HIDE a layer → its objects vanish from the render set; SHOW it → they reappear
 *   (2) LOCK a layer → its objects become non-interactive (in the locked set)
 *   (3) REORDER layers → the canvas z-order (render-set order) reflects the panel order
 *
 * All state is routed through the repository (updateMap / upsertMarker) — never a direct Dexie put.
 */

// A valid 8x8 RGB PNG (decodes cleanly through the map-upload cap pipeline).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC';

async function resetDb(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

async function suppressPrivacyNotice(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/**
 * Seed a map with two layers — "base" (order 0, bottom) and "top" (order 1, top) — a shape on the
 * base layer and a person marker on the top layer. Returns the ids needed for the assertions.
 */
async function seed(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const map = await rb.createMap({ name: 'Floor 1', background: ref, width: 800, height: 600 });

    const layers = [
      { id: 'base', name: 'Base', visible: true, locked: false, order: 0 },
      { id: 'top', name: 'Top', visible: true, locked: false, order: 1 },
    ];
    const shape = {
      id: 'shape-1',
      layerId: 'base',
      kind: 'rect' as const,
      x: 100,
      y: 100,
      width: 160,
      height: 120,
      rotation: 0,
      preset: 'stone',
      fill: true,
    };
    await rb.updateMap(map.id, { layers, shapes: [shape] });

    const person = await rb.createPerson({ name: 'Ada Lovelace' });
    const marker = await rb.upsertMarker({
      mapId: map.id,
      personId: person.id,
      x: 200,
      y: 200,
      layerId: 'top',
    });

    return { mapId: map.id, shapeId: shape.id, markerId: marker.id };
  }, PNG_BASE64);
}

/** Rewrite ONE layer's fields (visible/locked) through the repository (updateMap). */
async function patchLayer(
  page: import('@playwright/test').Page,
  mapId: string,
  layerId: string,
  patch: { visible?: boolean; locked?: boolean },
) {
  await page.evaluate(
    async ({ mapId, layerId, patch }) => {
      const rb = window.__rb!;
      const map = await rb.db.maps.get(mapId);
      if (!map) throw new Error('no map');
      const layers = map.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l));
      await rb.updateMap(mapId, { layers });
    },
    { mapId, layerId, patch },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await resetDb(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await suppressPrivacyNotice(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
});

test('hiding a layer removes its objects from the canvas render set; showing restores them', async ({
  page,
}) => {
  const { mapId, shapeId, markerId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Both objects render initially.
  const before = await page.evaluate((id) => window.__rb!.visibleObjectIds(id), mapId);
  expect(before).toContain(shapeId);
  expect(before).toContain(markerId);

  // Hide the "top" layer (the marker's layer) → the marker disappears, the shape stays.
  await patchLayer(page, mapId, 'top', { visible: false });
  const hidden = await page.evaluate((id) => window.__rb!.visibleObjectIds(id), mapId);
  expect(hidden).toContain(shapeId);
  expect(hidden).not.toContain(markerId);

  // Show it again → the marker reappears.
  await patchLayer(page, mapId, 'top', { visible: true });
  const shown = await page.evaluate((id) => window.__rb!.visibleObjectIds(id), mapId);
  expect(shown).toContain(markerId);
});

test('locking a layer makes its objects non-interactive (in the locked set)', async ({ page }) => {
  const { mapId, shapeId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Nothing locked initially.
  const before = await page.evaluate((id) => window.__rb!.lockedObjectIds(id), mapId);
  expect(before).not.toContain(shapeId);

  // Lock the "base" layer → the shape on it becomes non-interactive (listening=false / dimmed).
  await patchLayer(page, mapId, 'base', { locked: true });
  const locked = await page.evaluate((id) => window.__rb!.lockedObjectIds(id), mapId);
  expect(locked).toContain(shapeId);

  // It is still rendered (locked ≠ hidden) — only non-interactive.
  const visible = await page.evaluate((id) => window.__rb!.visibleObjectIds(id), mapId);
  expect(visible).toContain(shapeId);
});

test('reordering layers changes the canvas z-order (render-set order)', async ({ page }) => {
  const { mapId, shapeId, markerId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Initially: base (shape) below, top (marker) above. The shape renders before the marker.
  const before = await page.evaluate((id) => window.__rb!.visibleObjectIds(id), mapId);
  expect(before.indexOf(shapeId)).toBeLessThan(before.indexOf(markerId));

  // Reorder so "top" goes to the bottom (order 0) and "base" to the top (order 1) — through the
  // repository, the same write the panel's reorder fires.
  await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const map = await rb.db.maps.get(id);
    if (!map) throw new Error('no map');
    const layers = map.layers.map((l) =>
      l.id === 'base' ? { ...l, order: 1 } : l.id === 'top' ? { ...l, order: 0 } : l,
    );
    await rb.updateMap(id, { layers });
  }, mapId);

  // Now the marker's layer (order 0) is BELOW the shape's layer (order 1): the marker renders
  // FIRST (bottom) and the shape LAST (top) — the z-order flipped to reflect the new panel order.
  const after = await page.evaluate((id) => window.__rb!.visibleObjectIds(id), mapId);
  expect(after.indexOf(markerId)).toBeLessThan(after.indexOf(shapeId));
});

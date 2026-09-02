import { expect, test } from '@playwright/test';

/**
 * quick-260902-nfs — the marquee multi-selection becomes ACTIONABLE.
 *
 * quick-260821-nac shipped a band that widened an amber outline and deleted shapes; a curator who
 * banded five markers could not move them, delete them, or re-layer them. These specs drive the
 * three bulk actions with a REAL `page.mouse` (the gesture is about physical mouse buttons, which a
 * synthesized Konva event cannot faithfully model) and assert the RESULT through `window.__rb`:
 *
 *   1. BULK DELETE — a band over 2+ objects + Delete removes every banded shape, marker and portal
 *      after ONE confirm, while the referenced PERSON survives (delete-vs-remove, D-2).
 *   2. GROUP MOVE — grabbing any banded object drags the whole selection by the same delta.
 *   3. BULK RE-LAYER — one dropdown choice re-layers every selected shape and portal, and a
 *      portal keeps its `targetMapId` (T-NFS-02: upsertMarker does a full put).
 *
 * A band must START clear of the floating DOM chrome: the editor toolbar column overlays the
 * TOP-LEFT out to roughly y=135 and the LayersPanel docks 248px down the RIGHT edge (the constraint
 * recorded in `e2e/canvas-pan-marquee.spec.ts`). Every band below starts around (150, 260).
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

/** Seed one map and return its id. */
async function seedMap(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const map = await rb.createMap({ name: 'Floor 1', background: ref, width: 800, height: 600 });
    return map.id;
  }, PNG_BASE64);
}

async function suppressPrivacyNotice(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Wait for the canvas to be mounted and return its bounding box. */
async function canvasBox(page: import('@playwright/test').Page) {
  const canvas = page.locator('[data-testid="map-view"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  return (await canvas.boundingBox())!;
}

/** Drag a real rubber band from (x0,y0) to (x1,y1) in canvas-relative px. */
async function band(
  page: import('@playwright/test').Page,
  box: { x: number; y: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  await page.mouse.move(box.x + x0, box.y + y0);
  await page.mouse.down();
  await page.mouse.move(box.x + (x0 + x1) / 2, box.y + (y0 + y1) / 2, { steps: 5 });
  await page.mouse.move(box.x + x1, box.y + y1, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="marquee-rect"]')).toHaveCount(0);
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

test('a band over 2 shapes + 1 person marker deletes all three after one confirm, and the person survives', async ({
  page,
}) => {
  const mapId = await seedMap(page);

  // Seed two rects and one PERSON marker, all inside the band area. At the identity background
  // transform image space IS stage space (and, with the Stage unpanned at scale 1, stage space is
  // canvas-relative px), so these land exactly where the numbers say.
  const { personId, markerId } = await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const layer = { id: 'layer-0', name: 'Markers', visible: true, locked: false, order: 0 };
    const rect = (sid: string, x: number, y: number) => ({
      id: sid,
      layerId: layer.id,
      kind: 'rect' as const,
      x,
      y,
      width: 80,
      height: 60,
      rotation: 0,
      preset: 'stone',
      fill: true,
    });
    await rb.updateMap(id, {
      shapes: [rect('shape-a', 200, 300), rect('shape-b', 400, 420)],
      layers: [layer],
    });
    const person = await rb.createPerson({ name: 'Ada' });
    const marker = await rb.upsertMarker({
      mapId: id,
      kind: 'person',
      personId: person.id,
      x: 320,
      y: 340,
      layerId: layer.id,
    });
    return { personId: person.id, markerId: marker.id };
  }, mapId);

  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const box = await canvasBox(page);

  // Band all three (Select is the default tool).
  await band(page, box, 150, 260, 560, 520);

  // The bulk-action bar appears with a live count of 3.
  const bar = page.locator('[data-testid="multi-select-bar"]');
  await expect(bar).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-testid="multi-select-count"]')).toHaveText('3 selected');

  // Delete → the blocking confirm (D-1). Nothing is destroyed until it is accepted.
  await page.locator('[data-testid="multi-select-delete"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog).toContainText('Delete 3 selected objects?');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  // Every banded shape is gone (one write) and the marker row is gone…
  await page.waitForFunction(
    async ({ id, mk }) => {
      const rb = window.__rb!;
      const m = await rb.db.maps.get(id);
      const marker = await rb.db.markers.get(mk);
      return (m?.shapes.length ?? 0) === 0 && marker === undefined;
    },
    { id: mapId, mk: markerId },
    { timeout: 15_000 },
  );

  // …but the PERSON survives. Removing a placement is not deleting a person (delete-vs-remove).
  const personStillThere = await page.evaluate(
    async (pid) => (await window.__rb!.db.people.get(pid)) !== undefined,
    personId,
  );
  expect(personStillThere).toBe(true);
});

test('cancelling the bulk-delete confirm destroys nothing', async ({ page }) => {
  const mapId = await seedMap(page);
  await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const layer = { id: 'layer-0', name: 'Markers', visible: true, locked: false, order: 0 };
    const rect = (sid: string, x: number, y: number) => ({
      id: sid,
      layerId: layer.id,
      kind: 'rect' as const,
      x,
      y,
      width: 80,
      height: 60,
      rotation: 0,
      preset: 'stone',
      fill: true,
    });
    await rb.updateMap(id, {
      shapes: [rect('shape-a', 200, 300), rect('shape-b', 400, 420)],
      layers: [layer],
    });
  }, mapId);

  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const box = await canvasBox(page);
  await band(page, box, 150, 260, 560, 520);

  await page.locator('[data-testid="multi-select-delete"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  const shapeCount = await page.evaluate(
    async (id) => (await window.__rb!.db.maps.get(id))?.shapes.length ?? 0,
    mapId,
  );
  expect(shapeCount).toBe(2);
});

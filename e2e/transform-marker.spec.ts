import { expect, test } from '@playwright/test';

/**
 * MAP-02 / criterion 6 — a placed person can be resized + rotated, and the transform PERSISTS
 * across a full page reload (width/height/rotation saved on the marker record).
 *
 * The map + person + marker are seeded through the SAME repository the UI uses (window.__rb). The
 * transform is driven through `__rb.transformMarker` — the exact `upsertMarker` call the
 * Transformer's transform-end fires — keeping the assertion on PERSISTENCE (the criterion), not on
 * brittle canvas handle-drag pixel math. The marker Group also consumes width/height/rotation on
 * render, so the persisted record IS what the UI shows after reload.
 */

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF8FAGGmA1u4d5n5AAAAAElFTkSuQmCC';

async function resetDb(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Seed one map + one person + one marker at (x,y); returns the marker + person ids. */
async function seed(page: import('@playwright/test').Page, x: number, y: number) {
  return page.evaluate(
    async ({ b64, mx, my }) => {
      const rb = window.__rb!;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
      const map = await rb.createMap({ name: 'm', background: ref, width: 800, height: 600 });
      const person = await rb.createPerson({ name: 'Ada Lovelace' });
      const marker = await rb.upsertMarker({
        mapId: map.id,
        personId: person.id,
        x: mx,
        y: my,
      });
      return { mapId: map.id, markerId: marker.id, personId: person.id };
    },
    { b64: PNG_BASE64, mx: x, my: y },
  );
}

/** Pre-dismiss the one-time privacy notice so it never blocks a flow that isn't testing it. */
async function suppressPrivacyNotice(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
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

test('resizing + rotating a marker persists width/height/rotation across reload', async ({
  page,
}) => {
  const { markerId } = await seed(page, 200, 200);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // A marker with no baked transform persists no width/height/rotation yet.
  const before = await page.evaluate((id) => window.__rb!.db.markers.get(id), markerId);
  expect(before?.width).toBeUndefined();
  expect(before?.height).toBeUndefined();
  expect(before?.rotation).toBeUndefined();

  // Drive the resize + rotate through the SAME repository call the Transformer's transform-end
  // fires (upsertMarker with baked width/height/rotation).
  await page.evaluate(
    (id) => window.__rb!.transformMarker(id, { width: 96, height: 72, rotation: 0.5 }),
    markerId,
  );

  // Persistence must survive a full reload (Dexie is the durable source of truth).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const after = await page.evaluate((id) => window.__rb!.db.markers.get(id), markerId);
  expect(after?.width).toBe(96);
  expect(after?.height).toBe(72);
  expect(after?.rotation).toBe(0.5);

  // The marker Group is still in the scene graph after reload (the UI consumes the persisted dims).
  await page.waitForFunction(
    () => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) return false;
      type Node = { name(): string; find(sel: string): Node[] };
      const stage = (Konva.stages as unknown as Node[])[0];
      if (!stage) return false;
      return stage.find('Group').some((g) => g.name().startsWith('marker-'));
    },
    undefined,
    { timeout: 15_000 },
  );
});

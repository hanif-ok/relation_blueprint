import { expect, test } from '@playwright/test';

/**
 * MAP-01 — upload an image to create a map; it renders on the dark Konva Stage.
 *
 * Drives the REAL upload affordance: the empty-state "Start with a place." card with the
 * hidden file input. After upload, the empty state is gone and a Konva <canvas> is mounted
 * (the Stage). Each test starts from a clean IndexedDB so it is order-independent.
 */

// A VALID 8x8 RGB PNG. The map upload routes through `storeMedia({ kind: 'map' })` →
// `capGalleryImage`, which decodes via `createImageBitmap` — and `createImageBitmap` REJECTS
// the old 2x2 test PNG ("source image could not be decoded"). This 8x8 decodes cleanly
// (the same fixture profile.spec uses for its gallery-upload path).
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

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await resetDb(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
});

test('empty state shows the upload affordance before a map exists', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Start with a place.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload map image' })).toBeVisible();
});

test('uploading an image renders the map on a Konva Stage', async ({ page }) => {
  // Set the hidden file input to a small valid PNG and trigger the change handler.
  await page.setInputFiles('[data-testid="map-upload-input"]', {
    name: 'floorplan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });

  // The empty-state heading disappears once a map exists.
  await expect(page.getByRole('heading', { name: 'Start with a place.' })).toHaveCount(0, {
    timeout: 15_000,
  });

  // A Konva Stage mounts a <canvas> inside the map view.
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // And the map persisted to Dexie.
  const mapCount = await page.evaluate(() => window.__rb!.db.maps.count());
  expect(mapCount).toBe(1);
});

import { expect, test, type Page } from '@playwright/test';

/**
 * Regression guard for QUICK-260703-et9 — the Locations browse-list "Open map ↗" action opens the
 * CORRECT map on the canvas.
 *
 * A Location IS a map, so its row carries an ENABLED `browse-open-map` action (distinct from the
 * People-only `browse-show-on-map`). Clicking it must set THAT map active and switch to the Map
 * view — reusing App's existing `setActiveMapId` + `setActiveView('map')` plumbing (App.openMap).
 *
 * Two maps are seeded so the test proves the SPECIFIC (non-first) map opens, not just any map:
 * App seeds `activeMapId` to the first map by insertion order, so the app opens on "Head Office".
 * Clicking "Warehouse" (the second, non-active map) must switch the active map away from the seeded
 * one — the map-switcher-trigger then reads "Warehouse". No layers/markers are needed: this flow
 * opens a map, it does not place a person.
 *
 * Seeds through the SAME repository the UI uses (window.__rb), mirroring show-on-map.spec: reset the
 * DB, suppress the privacy notice via the meta table, and reload/waitFor the bridge. The Playwright
 * webServer runs `npm run build:e2e && npm run preview` (--mode e2e), so `window.__rb` is present in
 * this preview only (project memory: the bridge is absent under `npm run dev`).
 */

// A valid 8x8 RGB PNG (decodes cleanly through the map-upload cap pipeline).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC';

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

async function suppressPrivacyNotice(page: Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/**
 * Seed TWO maps (each with a background) through the repository the UI uses. "Head Office" is
 * created FIRST so App seeds it as the initially-active map; "Warehouse" is created SECOND and is
 * the discriminating target — clicking its "Open map" must switch AWAY from the seeded Head Office.
 */
async function seed(page: Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const makeBackground = async () => {
      const blob = new Blob([bytes], { type: 'image/png' });
      return rb.storeMedia(blob, { width: 8, height: 8 });
    };
    const headOffice = await rb.createMap({
      name: 'Head Office',
      background: await makeBackground(),
      width: 800,
      height: 600,
    });
    const warehouse = await rb.createMap({
      name: 'Warehouse',
      background: await makeBackground(),
      width: 800,
      height: 600,
    });
    return { headOfficeId: headOffice.id, warehouseId: warehouse.id };
  }, PNG_BASE64);
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

test('Locations list "Open map" opens the CORRECT (non-first) map on the canvas', async ({
  page,
}) => {
  await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Go to the Locations browse list.
  await page.getByTestId('view-maps').click();
  await expect(page.getByTestId('browse-list-maps')).toBeVisible({ timeout: 15_000 });

  // Both Location rows are present.
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Head Office' })).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Warehouse' })).toBeVisible();

  // On the Warehouse ROW specifically, its "Open map" button is enabled and opens THAT map.
  const openMap = page
    .getByTestId('browse-row')
    .filter({ hasText: 'Warehouse' })
    .getByTestId('browse-open-map');
  await expect(openMap).toBeEnabled();
  await openMap.click();

  // The Map view mounted (the Stage canvas is visible).
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // The CORRECT map is active — the switcher shows "Warehouse", proving it switched away from the
  // seeded Head Office.
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Warehouse', {
    timeout: 15_000,
  });
});

import { expect, test } from '@playwright/test';

/**
 * D-05 / MAP-07 — the map switcher changes the active map, and the parent-chain breadcrumb walks
 * UP. Two maps are seeded through the SAME repository the UI uses (window.__rb): a parent "Street"
 * and a child "Building" (Building.parentId = Street.id), plus a marker on the child. The test:
 *   1. switches the active map to the child via the MapSwitcher and asserts the trigger reflects it,
 *   2. asserts the breadcrumb now shows the Street → Building chain (a parent chain exists),
 *   3. clicks the "Street" ancestor crumb and asserts Street becomes the active map.
 *
 * Mirrors map-create.spec.ts / marker.spec.ts bridge-seeding + privacy-suppression patterns.
 */

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

/** Seed parent "Street" ⊇ child "Building" (Building.parentId = Street) + a marker on the child. */
async function seedHierarchy(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const street = await rb.createMap({ name: 'Street', background: ref, width: 800, height: 600 });
    const building = await rb.createMap({
      name: 'Building',
      background: ref,
      width: 800,
      height: 600,
    });
    await rb.updateMap(building.id, { parentId: street.id });
    const person = await rb.createPerson({ name: 'Ada Lovelace' });
    await rb.upsertMarker({ mapId: building.id, personId: person.id, x: 100, y: 100 });
    return { streetId: street.id, buildingId: building.id };
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

test('the map switcher changes the active map and the breadcrumb walks the parent chain up', async ({
  page,
}) => {
  const { streetId, buildingId } = await seedHierarchy(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The Stage canvas is present (a map is active — seeded as the first map, "Street").
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Open the switcher and pick the child map "Building".
  await page.locator('[data-testid="map-switcher-trigger"]').click();
  await page.locator(`[data-testid="map-switcher-item-${buildingId}"]`).click();

  // The trigger now reflects the active map name.
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Building', {
    timeout: 15_000,
  });

  // A parent chain exists, so the breadcrumb is shown with a clickable Street ancestor crumb.
  await expect(page.locator(`[data-testid="breadcrumb-crumb-${streetId}"]`)).toBeVisible({
    timeout: 15_000,
  });

  // Click the Street ancestor crumb → Street becomes the active map (walks UP, D-10).
  await page.locator(`[data-testid="breadcrumb-crumb-${streetId}"]`).click();
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Street', {
    timeout: 15_000,
  });

  // Street is top-level (no parent) → the breadcrumb disappears.
  await expect(page.locator('[data-testid="map-breadcrumb"]')).toHaveCount(0, { timeout: 15_000 });
});

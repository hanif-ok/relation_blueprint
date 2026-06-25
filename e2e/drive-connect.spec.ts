import { expect, test } from '@playwright/test';

/**
 * STOR-01 / STOR-04 — Drive connect/reconnect/status chrome.
 *
 * A LIVE Drive connect requires the human OAuth Client ID (VITE_GOOGLE_CLIENT_ID), which is
 * intentionally absent in CI — see SETUP.md. The real GIS token lifecycle is unit-tested with a
 * mocked GIS in tests/storage/auth.test.ts. This E2E therefore exercises the CHROME against the
 * production bundle deterministically by driving the sync-status store transitions through the
 * `window.__rb.connect` test bridge — proving the pill renders the six semantic states and that
 * a token-expiry (401) surfaces the non-destructive Reconnect banner while the app stays usable.
 *
 * The real-consent + visible-folder assertion is a documented MANUAL gate (verify-work).
 */

// A VALID 8x8 RGB PNG (decodes cleanly via createImageBitmap — the map upload routes through
// capGalleryImage; the old 2x2 fixture is rejected by createImageBitmap).
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

test('the status pill renders the six semantic states', async ({ page }) => {
  const pill = page.getByTestId('status-pill');

  // Default (no token, configured-or-not): Not connected -> the Connect Drive pill.
  await expect(pill).toHaveAttribute('data-phase', 'not-connected');
  await expect(pill).toContainText('Connect Drive');

  // Syncing.
  await page.evaluate(() => window.__rb!.connect.markConnected());
  await page.evaluate(() => window.__rb!.connect.markSyncing());
  await expect(pill).toHaveAttribute('data-phase', 'syncing');
  await expect(pill).toContainText('Syncing');

  // Synced.
  await page.evaluate(() => window.__rb!.connect.markSynced());
  await expect(pill).toHaveAttribute('data-phase', 'synced');
  await expect(pill).toContainText('Synced');

  // Reconnect needed (token expiry / 401).
  await page.evaluate(() => window.__rb!.connect.markNeedsReconnect());
  await expect(pill).toHaveAttribute('data-phase', 'reconnect');
  await expect(pill).toContainText('Reconnect');

  // Error.
  await page.evaluate(() => window.__rb!.connect.markDisconnected());
  await page.evaluate(() => window.__rb!.connect.markError('boom'));
  await expect(pill).toHaveAttribute('data-phase', 'error');
  await expect(pill).toContainText('Retry');
});

test('a 401 shows the non-destructive Reconnect banner and the app stays usable offline', async ({
  page,
}) => {
  // Connect, then simulate a 401/expiry.
  await page.evaluate(() => window.__rb!.connect.markConnected());
  await page.evaluate(() => window.__rb!.connect.markNeedsReconnect());

  // The Reconnect banner appears with the exact UI-SPEC copy.
  const banner = page.getByTestId('reconnect-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Drive needs to reconnect to sync your changes. Your work is saved locally.');
  await expect(page.getByTestId('reconnect-button')).toBeVisible();

  // The app stays fully usable offline: a map can be created and a person placed while the
  // banner is up — proving writes are not blocked on the token (RESEARCH ## Pitfall 4).
  await page.setInputFiles('[data-testid="map-upload-input"]', {
    name: 'floorplan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({ timeout: 15_000 });

  // Create a Person via the "+ New ▾" menu (the Phase-1 "+ Person" button generalized, U5).
  await page.getByTestId('new-entity-trigger').click();
  await page.getByTestId('new-entity-people').click();
  await page.getByTestId('field-name').fill('Offline Person');
  await page.getByTestId('entity-form-save').click();

  // The person persisted to Dexie despite Drive being in the reconnect state.
  await expect
    .poll(async () => page.evaluate(() => window.__rb!.db.people.count()))
    .toBeGreaterThan(0);

  // The banner is still present (non-destructive — it does not block or vanish on local writes).
  await expect(banner).toBeVisible();
});

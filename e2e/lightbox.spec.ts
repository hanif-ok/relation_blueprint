import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 / criterion 5 (D-20, S18) — the photo lightbox.
 *
 * Seeds a person with THREE distinct gallery photos, opens their profile from the People
 * browse list (list context), clicks the 2nd gallery thumbnail, and verifies:
 *   - the lightbox opens showing the "2 / 3" index caption,
 *   - ArrowRight advances to "3 / 3",
 *   - Esc dismisses back to the profile AND focus returns to the originating thumbnail.
 *
 * Three DISTINCT photos are required so the gallery has three real tiles to page through; each
 * is painted on a canvas with a different fill so its bytes (and content hash) differ.
 */

// A 2x2 PNG (red square) for the map seed.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF8FAGGmA1u4d5n5AAAAAElFTkSuQmCC';

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Seed a single map so the app shell is fully usable. */
async function seedMap(page: Page) {
  await page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
    await rb.createMap({ name: 'Head Office', background: ref, width: 800, height: 600 });
  }, PNG_BASE64);
}

/**
 * Create a person whose gallery holds THREE distinct, decodable photos. Each photo is painted
 * on an 8x8 canvas with a unique fill so its content hash is distinct (no dedupe collapse).
 */
async function seedPersonWithGallery(page: Page, name: string) {
  await page.evaluate(async (personName) => {
    const rb = window.__rb!;
    async function makePhoto(color: string) {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 8, 8);
      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      return rb.storeMedia(blob, { width: 8, height: 8 });
    }
    const gallery = [
      await makePhoto('#ff0000'),
      await makePhoto('#00ff00'),
      await makePhoto('#0000ff'),
    ];
    await rb.createPerson({ name: personName, gallery });
  }, name);
}

/** Pre-dismiss the one-time privacy notice so it never blocks a flow that isn't testing it. */
async function suppressPrivacyNotice(page: Page) {
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

test('clicking a gallery photo opens the lightbox; arrows navigate; Esc returns to the profile', async ({
  page,
}) => {
  await seedMap(page);
  await seedPersonWithGallery(page, 'Ada Lovelace');
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Open the profile from the People browse list (list context).
  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').first().click();
  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();

  // The gallery rendered all three tiles.
  const tiles = page.getByTestId('gallery-tile');
  await expect(tiles).toHaveCount(3, { timeout: 15_000 });

  // Click the 2nd thumbnail → lightbox opens at index 2 of 3.
  await tiles.nth(1).click();
  const lightbox = page.getByTestId('photo-lightbox');
  await expect(lightbox).toBeVisible();
  await expect(page.getByTestId('lightbox-caption')).toHaveText('2 / 3');

  // ArrowRight advances to 3 / 3 (and at the end, Next is disabled — never a dead no-op).
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('lightbox-caption')).toHaveText('3 / 3');
  await expect(page.getByTestId('lightbox-next')).toBeDisabled();

  // ArrowLeft pages back to 2 / 3.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('lightbox-caption')).toHaveText('2 / 3');

  // Esc dismisses the lightbox back to the profile, with focus returned to the originating tile.
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
  await expect(sidebar).toBeVisible();
  await expect(tiles.nth(1)).toBeFocused();
});

test('a single-photo lightbox hides prev/next', async ({ page }) => {
  await seedMap(page);
  // Seed a person with exactly one gallery photo.
  await page.evaluate(async () => {
    const rb = window.__rb!;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#abcdef';
    ctx.fillRect(0, 0, 8, 8);
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    await rb.createPerson({ name: 'Solo Photo', gallery: [ref] });
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').first().click();
  await expect(page.getByTestId('profile-sidebar')).toBeVisible();

  const tiles = page.getByTestId('gallery-tile');
  await expect(tiles).toHaveCount(1, { timeout: 15_000 });
  await tiles.first().click();

  await expect(page.getByTestId('photo-lightbox')).toBeVisible();
  await expect(page.getByTestId('lightbox-caption')).toHaveText('1 / 1');
  // Single photo: prev/next are not rendered — only close.
  await expect(page.getByTestId('lightbox-prev')).toHaveCount(0);
  await expect(page.getByTestId('lightbox-next')).toHaveCount(0);
  await expect(page.getByTestId('lightbox-close')).toBeVisible();
});

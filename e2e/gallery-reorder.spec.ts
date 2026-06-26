import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 / criterion 6 (D-21, S19) — gallery drag-to-reorder with persistence.
 *
 * Seeds a person with THREE distinct gallery photos, opens the edit form, reorders the 3rd
 * photo to first via KEYBOARD (the contract path: Space pick / arrow move / Space drop), saves,
 * reloads, and verifies the persisted gallery order has the moved photo first — and that the
 * first tile is badged "Thumbnail".
 *
 * Keyboard reorder is asserted (not drag) because keyboard is the a11y contract (U10); drag is
 * the enhancement. The three photos are painted with distinct fills so their content hashes
 * differ, letting us track which photo landed where.
 */

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

async function seedMap(page: Page) {
  await page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
    await rb.createMap({ name: 'Head Office', background: ref, width: 800, height: 600 });
  }, PNG_BASE64);
}

/** Seed a person with three distinct gallery photos; return their hashes in order [0,1,2]. */
async function seedPersonWithGallery(page: Page, name: string): Promise<string[]> {
  return page.evaluate(async (personName) => {
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
    return gallery.map((g) => g.hash);
  }, name);
}

async function suppressPrivacyNotice(page: Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Read the (single) person's current gallery hash order from Dexie. */
async function readGalleryOrder(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const p = (await window.__rb!.db.people.toArray())[0];
    return p.gallery.map((g: { hash: string }) => g.hash);
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

test('keyboard-reorder moves the 3rd photo to first and the order persists across reload', async ({
  page,
}) => {
  await seedMap(page);
  const [h0, h1, h2] = await seedPersonWithGallery(page, 'Ada Lovelace');
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Open the edit form via the profile (list context).
  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').first().click();
  await expect(page.getByTestId('profile-sidebar')).toBeVisible();
  await page.getByTestId('profile-edit').click();

  // The form's gallery shows all three tiles, each with a reorder handle.
  const handles = page.getByTestId('gallery-handle');
  await expect(handles).toHaveCount(3, { timeout: 15_000 });

  // Keyboard reorder: focus the 3rd tile's handle, pick up (Space), move left twice (→ position 1),
  // drop (Space). This is the a11y contract path (U10) — drag is only the enhancement.
  await handles.nth(2).focus();
  await page.keyboard.press(' ');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press(' ');

  // Save changes, then reload to prove the order persisted to storage (not just in-memory).
  await page.getByTestId('entity-form-save').click();
  await expect(page.getByTestId('entity-form-save')).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The previously-3rd photo (h2) is now first; the rest follow in their prior relative order.
  const order = await readGalleryOrder(page);
  expect(order).toEqual([h2, h0, h1]);

  // The first tile is badged "Thumbnail" in the profile gallery + the edit form.
  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').first().click();
  await page.getByTestId('profile-edit').click();
  await expect(page.getByTestId('gallery-thumbnail-badge')).toBeVisible();
  await expect(page.getByTestId('gallery-thumbnail-badge')).toHaveText('Thumbnail');
  // Exactly one Thumbnail badge (only the first tile is badged).
  await expect(page.getByTestId('gallery-thumbnail-badge')).toHaveCount(1);
});

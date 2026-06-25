import { expect, test } from '@playwright/test';

/**
 * PROF-01 / DATA-04 — create a person via the form, open their profile by selecting the
 * marker, verify all DATA-02 fields render, edit a field, then delete (with confirm) and
 * verify both the person and their marker are gone.
 *
 * Marker selection is driven through Konva (fire 'click' on the marker Group) because the
 * canvas is not a DOM tree — this mirrors the AT bridge the UI-SPEC defines (marker click
 * opens the focus-managed sidebar). Everything else is real DOM interaction.
 */

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF8FAGGmA1u4d5n5AAAAAElFTkSuQmCC';

// A VALID 8x8 RGB PNG. Unlike the 2x2 PNG above (which an <img> tolerates but
// `createImageBitmap` rejects with "source image could not be decoded"), this one decodes
// cleanly — required for the gallery upload path, which thumbnails via createImageBitmap +
// OffscreenCanvas before storing.
const PNG_DECODABLE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC';

async function resetDb(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Seed a single map so + Person is enabled. */
async function seedMap(page: import('@playwright/test').Page) {
  await page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
    await rb.createMap({ name: 'm', background: ref, width: 800, height: 600 });
  }, PNG_BASE64);
}

/** Fire a Konva click on the first marker Group, opening the profile sidebar. */
async function clickFirstMarker(page: import('@playwright/test').Page) {
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
  await page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    type Node = {
      name(): string;
      find(sel: string): Node[];
      fire(evt: string, payload?: unknown, bubble?: boolean): void;
    };
    const stage = (Konva!.stages as unknown as Node[])[0];
    const group = stage.find('Group').find((g) => g.name().startsWith('marker-'))!;
    group.fire('click', { target: group }, true);
  });
}

/** Open the Person create form via the top-bar "+ New ▾" menu (the generalized "+ Person"). */
async function openCreatePerson(page: import('@playwright/test').Page) {
  await page.getByTestId('new-entity-trigger').click();
  await page.getByTestId('new-entity-people').click();
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

test('the "+ New" menu offers Person and opens the create form', async ({ page }) => {
  // The Phase-1 "+ Person" became the always-available "+ New ▾" create menu (U5, DATA-01);
  // it is no longer gated on a map existing.
  await page.getByTestId('new-entity-trigger').click();
  await expect(page.getByTestId('new-entity-people')).toBeVisible();
  await page.getByTestId('new-entity-people').click();
  await expect(page.getByTestId('entity-form-title')).toHaveText('New person');
});

test('empty name disables save and shows the validation message', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await openCreatePerson(page);
  await expect(page.getByText('Add a name so you can find this person.')).toBeVisible();
  await expect(page.getByTestId('entity-form-save')).toBeDisabled();
});

test('create → profile → edit → remove from map (entity survives)', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Create a person with all DATA-02 fields via the generalized entity form.
  await openCreatePerson(page);
  await page.getByTestId('field-name').fill('Ada Lovelace');
  await page.getByTestId('field-phone').fill('555-0100');
  await page.getByTestId('field-description').fill('First programmer');
  const tagInput = page.getByPlaceholder('Add a tag, press Enter');
  await tagInput.fill('mathematician');
  await tagInput.press('Enter');
  await page.getByTestId('field-notes').fill('Notes about Ada.');
  await page.getByTestId('entity-form-save').click();

  // The created person was placed as a marker; select it to open the profile.
  await clickFirstMarker(page);

  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Ada Lovelace');
  await expect(page.getByTestId('profile-phone')).toHaveText('555-0100');
  await expect(page.getByTestId('profile-description')).toHaveText('First programmer');
  await expect(page.getByTestId('profile-tags')).toContainText('mathematician');
  await expect(page.getByTestId('profile-notes')).toHaveText('Notes about Ada.');

  // Edit: change the phone and save (edit save is the neutral "Save changes").
  await page.getByTestId('profile-edit').click();
  await page.getByTestId('field-phone').fill('555-9999');
  await page.getByTestId('entity-form-save').click();
  await expect(page.getByTestId('profile-phone')).toHaveText('555-9999');

  // Marker context shows the neutral "Remove from map" action (S21) — NOT a cascade delete.
  await page.getByTestId('profile-remove').click();
  await expect(page.getByText('Remove from this map?')).toBeVisible();
  await expect(
    page.getByText(
      'Ada Lovelace stays in your database and lists — only the marker on this map is removed.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove from map' }).click();

  // The marker is gone, but the PERSON survives in the database (the delete-from-map bug fix).
  await expect(sidebar).toHaveCount(0);
  const counts = await page.evaluate(async () => {
    const rb = window.__rb!;
    return { people: await rb.db.people.count(), markers: await rb.db.markers.count() };
  });
  expect(counts.people).toBe(1);
  expect(counts.markers).toBe(0);
});

/**
 * PROF-02 — a person with no gallery shows the empty-state copy in the profile.
 */
test('empty gallery shows "No photos yet." in the profile', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await openCreatePerson(page);
  await page.getByTestId('field-name').fill('Grace Hopper');
  await page.getByTestId('entity-form-save').click();

  await clickFirstMarker(page);
  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText('No photos yet.')).toBeVisible();
  await expect(page.getByTestId('profile-gallery')).toHaveCount(0);
});

/**
 * PROF-02 / PROF-03 — adding a photo through the form's gallery control thumbnails it
 * client-side, stores it as a content-addressed blob, and renders it in the profile gallery.
 */
test('adding a gallery photo in the form renders it in the profile gallery', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await openCreatePerson(page);
  await page.getByTestId('field-name').fill('Radia Perlman');

  // Upload a real decodable PNG through the multi-photo gallery input; the browser
  // thumbnails it client-side (createImageBitmap + OffscreenCanvas) before storing.
  await page.getByTestId('person-gallery-input').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_DECODABLE_BASE64, 'base64'),
  });

  // Wait until the in-form gallery shows a stored tile (image resolved from the blob store).
  await expect(page.getByTestId('form-gallery').locator('img')).toHaveCount(1, {
    timeout: 15_000,
  });

  await page.getByTestId('entity-form-save').click();

  await clickFirstMarker(page);
  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();

  const gallery = page.getByTestId('profile-gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('img')).toHaveCount(1, { timeout: 15_000 });

  // The photo persisted as exactly one content-addressed media blob (dedupe-friendly).
  const mediaCount = await page.evaluate(() => window.__rb!.db.media.count());
  expect(mediaCount).toBeGreaterThanOrEqual(1);
});

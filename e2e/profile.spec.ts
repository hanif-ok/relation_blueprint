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

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await resetDb(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
});

test('+ Person is disabled until a map exists', async ({ page }) => {
  await expect(page.getByTestId('add-person')).toBeDisabled();
  await expect(page.getByTestId('add-person')).toHaveAttribute('title', 'Upload a map first');
});

test('empty name disables save and shows the validation message', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await page.getByTestId('add-person').click();
  await expect(page.getByText('Add a name so you can find this person.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save person' })).toBeDisabled();
});

test('create → profile → edit → delete with cascade', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Create a person with all DATA-02 fields via the form.
  await page.getByTestId('add-person').click();
  await page.getByTestId('field-name').fill('Ada Lovelace');
  await page.getByTestId('field-phone').fill('555-0100');
  await page.getByTestId('field-description').fill('First programmer');
  const tagInput = page.getByPlaceholder('Add a tag, press Enter');
  await tagInput.fill('mathematician');
  await tagInput.press('Enter');
  await page.getByTestId('field-notes').fill('Notes about Ada.');
  await page.getByRole('button', { name: 'Save person' }).click();

  // The created person was placed as a marker; select it to open the profile.
  await clickFirstMarker(page);

  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Ada Lovelace');
  await expect(page.getByTestId('profile-phone')).toHaveText('555-0100');
  await expect(page.getByTestId('profile-description')).toHaveText('First programmer');
  await expect(page.getByTestId('profile-tags')).toContainText('mathematician');
  await expect(page.getByTestId('profile-notes')).toHaveText('Notes about Ada.');

  // Edit: change the phone and save.
  await page.getByTestId('profile-edit').click();
  await page.getByTestId('field-phone').fill('555-9999');
  await page.getByRole('button', { name: 'Save person' }).click();
  await expect(page.getByTestId('profile-phone')).toHaveText('555-9999');

  // Delete: confirm dialog with the exact UI-SPEC copy, then verify cascade.
  await page.getByTestId('profile-delete').click();
  await expect(page.getByText('Delete this person?')).toBeVisible();
  await expect(
    page.getByText(
      "Ada Lovelace will be removed from the map and your database. This can't be undone unless you restore a backup.",
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete person' }).click();

  // Person and marker are both gone (cascade).
  await expect(sidebar).toHaveCount(0);
  const counts = await page.evaluate(async () => {
    const rb = window.__rb!;
    return { people: await rb.db.people.count(), markers: await rb.db.markers.count() };
  });
  expect(counts.people).toBe(0);
  expect(counts.markers).toBe(0);
});

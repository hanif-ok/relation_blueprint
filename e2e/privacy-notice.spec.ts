import { expect, test, type Page } from '@playwright/test';

/**
 * Criterion 4 / D-19 / S20 — the one-time privacy/sensitivity notice.
 *
 * On a fresh session, creating the first entity surfaces the notice; "Got it" dismisses it;
 * a reload does NOT re-show it (the dismissal persists in the Dexie `meta` table, round-tripping
 * with the DB); and the nav "About / Privacy" item re-opens the same dialog any time.
 */

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Create a Group via the "+ New ▾" menu (a non-spatial type needs no map). */
async function createGroup(page: Page, name: string) {
  await page.getByTestId('new-entity-trigger').click();
  await page.getByTestId('new-entity-groups').click();
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('entity-form-save').click();
  await expect(page.getByTestId('entity-form-save')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await resetDb(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
});

test('the notice auto-shows at first entity creation, "Got it" dismisses, and reload does not re-show it', async ({
  page,
}) => {
  // Fresh session: the notice is NOT visible before any entity exists.
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);

  // Creating the first entity surfaces the notice with the exact UI-SPEC copy.
  await createGroup(page, 'Analytical Society');
  const notice = page.getByTestId('privacy-notice');
  await expect(notice).toBeVisible();
  await expect(notice.getByText('A note on the people you record.')).toBeVisible();

  // "Got it" dismisses it.
  await page.getByTestId('privacy-dismiss').click();
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);

  // The dismissal persisted to the Dexie meta table.
  const dismissed = await page.evaluate(
    async () => (await window.__rb!.db.meta.get('privacyNoticeDismissed'))?.value,
  );
  expect(dismissed).toBe(true);

  // A full reload does NOT re-show the notice (one-time, persisted).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);
});

test('the nav "About / Privacy" item re-opens the notice (re-view) without rewriting state', async ({
  page,
}) => {
  // Dismiss the first-run notice.
  await createGroup(page, 'Analytical Society');
  await expect(page.getByTestId('privacy-notice')).toBeVisible();
  await page.getByTestId('privacy-dismiss').click();
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);

  // The nav About / Privacy item re-opens the same dialog (re-view).
  await page.getByTestId('view-privacy').click();
  await expect(page.getByTestId('privacy-notice')).toBeVisible();
  await expect(
    page.getByTestId('privacy-notice').getByText('A note on the people you record.'),
  ).toBeVisible();

  // Closing the re-view leaves the persisted dismissal intact (it never auto-shows again).
  await page.getByTestId('privacy-dismiss').click();
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);
  const dismissed = await page.evaluate(
    async () => (await window.__rb!.db.meta.get('privacyNoticeDismissed'))?.value,
  );
  expect(dismissed).toBe(true);
});

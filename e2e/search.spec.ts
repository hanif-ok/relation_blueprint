import { expect, test, type Page } from '@playwright/test';

/**
 * SRCH-01 — the Field-Scoped Search spine, end-to-end through the REAL UI.
 *
 * Seeds People via the test bridge, opens the new "Search" rail entry, types a partial query, and
 * asserts tolerant prefix/fuzzy matching surfaces the right person (and hides the others); a result
 * row click opens the existing ProfileSidebar; and the two distinct states (pre-query prompt,
 * zero-match with the echoed query) render with the contract copy.
 *
 * Every test starts from a clean IndexedDB so it is order-independent.
 */

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Create a Person directly through the repository the UI uses. */
async function seedPerson(page: Page, name: string) {
  await page.evaluate(async (n) => {
    await window.__rb!.createPerson({ name: n });
  }, name);
}

/** Pre-dismiss the one-time privacy notice so it never blocks the search flow. */
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

test('typing a partial query surfaces a People match and the row opens the profile', async ({
  page,
}) => {
  await seedPerson(page, 'Smith');
  await seedPerson(page, 'Jones');

  // Open the Search view from the rail (D-01).
  await page.getByTestId('view-search').click();
  await expect(page.getByTestId('search-view')).toBeVisible();

  // Type a prefix of "Smith" — the fuzzy/prefix index surfaces Smith and NOT Jones (D-06).
  await page.getByTestId('search-input').fill('smi');
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Smith' })).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jones' })).toHaveCount(0);

  // Clicking the row opens the existing ProfileSidebar on Smith (D-10).
  await page.getByTestId('browse-row').first().click();
  await expect(page.getByTestId('profile-sidebar')).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Smith');
});

test('the pre-query and zero-match states render with the contract copy', async ({ page }) => {
  await seedPerson(page, 'Smith');

  await page.getByTestId('view-search').click();

  // 0–1 chars → the pre-query prompt (D-08/D-11), never the whole DB.
  await page.getByTestId('search-input').fill('s');
  await expect(page.getByTestId('search-prequery')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Search people' })).toBeVisible();

  // ≥2 chars with no match → the zero-match panel echoing the typed query as a React child.
  await page.getByTestId('search-input').fill('zzznomatch');
  await expect(page.getByTestId('search-zero-match')).toBeVisible();
  await expect(page.getByTestId('search-zero-match')).toContainText('zzznomatch');
});

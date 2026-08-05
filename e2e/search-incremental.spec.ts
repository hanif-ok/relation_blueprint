import { expect, test, type Page } from '@playwright/test';

/**
 * SRCH-01 criterion 3 + D-09 — incremental index freshness AND the matched-field snippet, driven
 * end-to-end through the REAL UI.
 *
 * Seeds the blacksmith scenario (Jane Smith = name match; Alex Black whose Job = "blacksmith" = a
 * NON-name match) via the test bridge. Then, with the Search view open on a query that matches:
 *   - the non-name match renders the matched-field snippet with the term in a real <mark> (D-09),
 *   - a NEW matching person created via window.__rb.createPerson appears in the results with NO
 *     page reload — the index updated incrementally through the repository change signal (criterion 3).
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

/** Pre-dismiss the one-time privacy notice so it never blocks the search flow. */
async function suppressPrivacyNotice(page: Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Seed Jane Smith (name match), Alex Black (Job = "blacksmith"), and the custom People "Job" field. */
async function seedScenario(page: Page) {
  await page.evaluate(async () => {
    const rb = window.__rb!;
    await rb.createPerson({ name: 'Jane Smith' });
    const alex = await rb.createPerson({ name: 'Alex Black' });
    const job = await rb.createFieldDef({ entityType: 'people', label: 'Job', type: 'text' });
    await rb.updatePerson(alex.id, { custom: { [job.id]: 'blacksmith' } });
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

test('a non-name match shows the matched-field snippet with the term in a real <mark> (D-09)', async ({
  page,
}) => {
  await seedScenario(page);

  await page.getByTestId('view-search').click();
  await page.getByTestId('search-input').fill('smith');

  // Both people surface: Jane via NAME, Alex via his "blacksmith" Job value.
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jane Smith' })).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Alex Black' })).toBeVisible();

  // The non-name match (Alex) renders the matched-field snippet: a real <mark> around "smith".
  const snippet = page.getByTestId('search-snippet');
  await expect(snippet).toBeVisible();
  const mark = snippet.locator('mark');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveText('smith');
  // The snippet reveals WHICH field matched (the "Job:" prefix — the evidence the scoping worked).
  await expect(snippet).toContainText('Job:');
});

test('a person created while Search is open appears in results with no reload (criterion 3)', async ({
  page,
}) => {
  await seedScenario(page);

  await page.getByTestId('view-search').click();
  await page.getByTestId('search-input').fill('smith');
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jane Smith' })).toBeVisible();

  // A brand-new matching person is NOT yet present.
  await expect(
    page.getByTestId('browse-row-name').filter({ hasText: 'Smithson' }),
  ).toHaveCount(0);

  // Create it through the SAME repository the UI uses — no reload, no re-navigation.
  await page.evaluate(async () => {
    await window.__rb!.createPerson({ name: 'Smithson' });
  });

  // The incremental index add surfaces it live in the current results (retrying assertion waits for
  // the change-signal → applyChange → re-query to settle).
  await expect(
    page.getByTestId('browse-row-name').filter({ hasText: 'Smithson' }),
  ).toBeVisible();
});

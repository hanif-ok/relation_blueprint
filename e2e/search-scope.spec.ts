import { expect, test, type Page } from '@playwright/test';

/**
 * SRCH-02 — the field-scope checkbox panel (the signature "smith vs blacksmith" behavior), driven
 * end-to-end through the REAL UI.
 *
 * Seeds two People and a custom "Job" field via the test bridge: "Jane Smith" (matches on NAME) and
 * "Alex Black" whose Job value is "blacksmith" (matches "smith" only via the custom Job field). Then:
 *   - all fields ON → "smith" surfaces BOTH people,
 *   - unchecking the Job checkbox drops the blacksmith but keeps the name match (SRCH-02),
 *   - the choice PERSISTS across a reload (keyed by the stable FieldDef.id, D-05),
 *   - unchecking EVERY field shows the distinct all-fields-off guard (D-11), not a zero-match.
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

/**
 * Seed the blacksmith scenario: Jane Smith (name match), Alex Black (Job = "blacksmith"), and the
 * custom People "Job" field. Returns the stable Job FieldDef id so the spec can target its checkbox.
 */
async function seedScenario(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const rb = window.__rb!;
    await rb.createPerson({ name: 'Jane Smith' });
    const alex = await rb.createPerson({ name: 'Alex Black' });
    const job = await rb.createFieldDef({ entityType: 'people', label: 'Job', type: 'text' });
    await rb.updatePerson(alex.id, { custom: { [job.id]: 'blacksmith' } });
    return job.id;
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

test('the scope panel renders built-ins + the live custom field, all checked by default', async ({
  page,
}) => {
  await seedScenario(page);

  await page.getByTestId('view-search').click();
  await expect(page.getByTestId('scope-panel')).toBeVisible();

  // The five built-ins + the live custom "Job" field are all present and checked (D-04 default ON).
  for (const key of [
    'builtin:name',
    'builtin:phone',
    'builtin:description',
    'builtin:tags',
    'builtin:notes',
  ]) {
    await expect(page.getByTestId(`scope-checkbox-${key}`)).toBeChecked();
  }
  await expect(page.getByRole('checkbox', { name: 'Job' })).toBeChecked();
});

test('unchecking "Job" makes "smith" match names but not blacksmiths (SRCH-02, persisted)', async ({
  page,
}) => {
  const jobId = await seedScenario(page);

  await page.getByTestId('view-search').click();
  await page.getByTestId('search-input').fill('smith');

  // All fields ON → BOTH people surface (Alex via his "blacksmith" Job value).
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jane Smith' })).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Alex Black' })).toBeVisible();

  // Uncheck the Job field → the blacksmith drops, the name match remains (the signature behavior).
  // The checkbox is controlled by the persisted (Dexie) selection, so click and let the retrying
  // assertion wait for the live state to settle unchecked.
  await page.getByTestId(`scope-checkbox-${jobId}`).click();
  await expect(page.getByTestId(`scope-checkbox-${jobId}`)).not.toBeChecked();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jane Smith' })).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Alex Black' })).toHaveCount(0);

  // The un-check PERSISTS across a reload, keyed by the stable FieldDef.id (D-05).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await page.getByTestId('view-search').click();
  await expect(page.getByTestId(`scope-checkbox-${jobId}`)).not.toBeChecked();

  await page.getByTestId('search-input').fill('smith');
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jane Smith' })).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Alex Black' })).toHaveCount(0);
});

test('unchecking EVERY field shows the distinct all-fields-off guard (D-11)', async ({ page }) => {
  const jobId = await seedScenario(page);

  await page.getByTestId('view-search').click();
  await page.getByTestId('search-input').fill('smith');
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Jane Smith' })).toBeVisible();

  // Turn every checkbox off (built-ins + Job). Click then wait for each to settle unchecked before
  // the next — the state is persisted (Dexie-backed) so the controlled input reflects it live.
  for (const key of [
    'builtin:name',
    'builtin:phone',
    'builtin:description',
    'builtin:tags',
    'builtin:notes',
    jobId,
  ]) {
    await page.getByTestId(`scope-checkbox-${key}`).click();
    await expect(page.getByTestId(`scope-checkbox-${key}`)).not.toBeChecked();
  }

  // The all-fields-off guard is a DISTINCT state (not the zero-match message).
  await expect(page.getByTestId('search-all-off')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing to search' })).toBeVisible();
  await expect(page.getByTestId('search-zero-match')).toHaveCount(0);
});

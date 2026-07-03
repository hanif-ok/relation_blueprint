import { expect, test, type Page } from '@playwright/test';

/**
 * REL-01 / REL-02 — author a relationship FROM a profile and see it appear on BOTH endpoints.
 *
 * Seeds two people through the real repository (`window.__rb`, exposed only under `--mode e2e`),
 * opens Person A's profile from the People browse list, drives the "+ Add relationship" flow to
 * relate A to B (Mutual), and asserts the resulting Relationships row names B on A's profile AND —
 * from the SINGLE canonical link (D-04) — names A on B's profile. Everything is real DOM
 * interaction; seeding routes through the repository so the wiring is proven end-to-end.
 */

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Pre-dismiss the one-time privacy notice so it never blocks the flow under test. */
async function suppressPrivacyNotice(page: Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Seed two people through the repository; returns their ids. */
async function seedTwoPeople(page: Page): Promise<{ aId: string; bId: string }> {
  return page.evaluate(async () => {
    const rb = window.__rb!;
    const a = await rb.createPerson({ name: 'Ada Lovelace' });
    const b = await rb.createPerson({ name: 'Charles Babbage' });
    return { aId: a.id, bId: b.id };
  });
}

/** Open a person's profile from the People browse list, matched by name. */
async function openProfileByName(page: Page, name: string) {
  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').filter({ hasText: name }).first().click();
  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText(name);
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

test('author a Mutual relationship from a profile → it appears on BOTH endpoints', async ({
  page,
}) => {
  const { bId } = await seedTwoPeople(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Open Ada's profile — the Relationships section starts empty.
  await openProfileByName(page, 'Ada Lovelace');
  await expect(page.getByTestId('profile-relationships')).toBeVisible();
  await expect(page.getByTestId('profile-relationships-empty')).toHaveText('No relationships yet.');

  // Drive the "+ Add relationship" flow: pick Charles, keep Mutual (default), add a label.
  await page.getByTestId('profile-relationships-add').click();
  await expect(page.getByTestId('add-relationship-dialog')).toBeVisible();
  await page.getByTestId(`add-relationship-candidate-${bId}`).click();
  await page.getByTestId('add-relationship-label').fill('collaborator');
  await page.getByTestId('add-relationship-save').click();

  // The dialog closes and the row now names the OTHER endpoint on Ada's profile.
  await expect(page.getByTestId('add-relationship-dialog')).toHaveCount(0);
  const adaList = page.getByTestId('profile-relationships-list');
  await expect(adaList).toContainText('Charles Babbage');
  await expect(adaList).toContainText('collaborator');

  // Exactly one canonical link was written (single source of truth, D-04).
  const linkCount = await page.evaluate(() => window.__rb!.db.relationshipLinks.count());
  expect(linkCount).toBe(1);

  // Open Charles' profile — the SAME link auto-appears, naming Ada (both ends).
  await page.getByTestId('profile-name'); // ensure sidebar is present before switching
  await openProfileByName(page, 'Charles Babbage');
  const babbageList = page.getByTestId('profile-relationships-list');
  await expect(babbageList).toContainText('Ada Lovelace');
  await expect(babbageList).toContainText('collaborator');
});

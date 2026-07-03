import { expect, test, type Page } from '@playwright/test';

/**
 * DATA-01 / BRWS-01 / BRWS-02 — the headline vertical slice of Phase 2.
 *
 * Drives the REAL UI: the top-bar "+ New ▾" menu creates one of each first-class entity type;
 * the left-nav view switcher swaps the main surface to each browse list; a People row opens the
 * profile in LIST context (showing the brick "Delete person" — confirming the 02-02 contract);
 * the sort toggle reorders; and an empty type shows the single amber "Create the first {type}" CTA.
 *
 * Every test starts from a clean IndexedDB so it is order-independent.
 */

// A 2x2 PNG (red square), base64-encoded — small, valid, image/png (used for the map seed).
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

/** Seed a single map so the Person create→auto-place thread works (and Locations exist). */
async function seedMap(page: Page) {
  await page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
    await rb.createMap({ name: 'Head Office', background: ref, width: 800, height: 600 });
  }, PNG_BASE64);
}

/** Create an entity of `type` via the +New menu, filling Name and saving. */
async function createViaMenu(page: Page, type: string, name: string) {
  await page.getByTestId('new-entity-trigger').click();
  await page.getByTestId(`new-entity-${type}`).click();
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('entity-form-save').click();
  // The form closes after a successful save.
  await expect(page.getByTestId('entity-form-save')).toHaveCount(0);
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

test('+ New creates the create-able entity types and each appears in its browse list', async ({
  page,
}) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await createViaMenu(page, 'people', 'Ada Lovelace');
  await createViaMenu(page, 'groups', 'Analytical Society');
  // Relationship-links are no longer create-able from the standalone +New menu (D-05, 04-02) — an
  // endpoint-less shell is meaningless; they are authored from a profile. Seed one directly so the
  // browse-list assertion below still proves the relationship-links list renders.
  await page.evaluate(async () => {
    await window.__rb!.createRelationshipLink({ name: 'Mentorship' });
  });
  // The standalone menu item is gone.
  await page.getByTestId('new-entity-trigger').click();
  await expect(page.getByTestId('new-entity-relationship-links')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Each created entity persisted to its own table (DATA-01).
  const counts = await page.evaluate(async () => {
    const rb = window.__rb!;
    return {
      people: await rb.db.people.count(),
      maps: await rb.db.maps.count(),
      groups: await rb.db.groups.count(),
      links: await rb.db.relationshipLinks.count(),
    };
  });
  expect(counts.people).toBe(1);
  expect(counts.maps).toBe(1); // the seeded location
  expect(counts.groups).toBe(1);
  expect(counts.links).toBe(1);

  // The People browse list shows the new person (BRWS-01).
  await page.getByTestId('view-people').click();
  await expect(page.getByTestId('browse-list-people')).toBeVisible();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Ada Lovelace' })).toBeVisible();

  // The Locations browse list shows the seeded location (BRWS-02).
  await page.getByTestId('view-maps').click();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Head Office' })).toBeVisible();

  // Groups + Relationship-links browse too (D-14).
  await page.getByTestId('view-groups').click();
  await expect(
    page.getByTestId('browse-row-name').filter({ hasText: 'Analytical Society' }),
  ).toBeVisible();

  await page.getByTestId('view-relationship-links').click();
  await expect(page.getByTestId('browse-row-name').filter({ hasText: 'Mentorship' })).toBeVisible();
});

test('a People row opens the profile in LIST context (brick "Delete person")', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await createViaMenu(page, 'people', 'Grace Hopper');

  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').first().click();

  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Grace Hopper');

  // List context shows the brick cascade delete — NOT the marker-only "Remove from map" (S21).
  await expect(page.getByTestId('profile-delete')).toBeVisible();
  await expect(page.getByTestId('profile-delete')).toHaveText('Delete person');
  await expect(page.getByTestId('profile-remove')).toHaveCount(0);
});

test('the sort toggle reorders the list (Name A–Z ⇄ Recently updated)', async ({ page }) => {
  await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Create Ada first, then Zoe — so name order [Ada, Zoe] differs from recency [Zoe, Ada].
  await createViaMenu(page, 'groups', 'Ada Team');
  await createViaMenu(page, 'groups', 'Zoe Team');

  await page.getByTestId('view-groups').click();

  // Name A–Z (default): Ada before Zoe.
  const namesAsc = await page.getByTestId('browse-row-name').allInnerTexts();
  expect(namesAsc).toEqual(['Ada Team', 'Zoe Team']);

  // Recently updated: Zoe (created last → newest) first — the order is reversed.
  await page.getByTestId('sort-recent').click();
  await expect(page.getByTestId('sort-recent')).toHaveAttribute('aria-pressed', 'true');
  const namesRecent = await page.getByTestId('browse-row-name').allInnerTexts();
  expect(namesRecent).toEqual(['Zoe Team', 'Ada Team']);

  // Toggling back restores Name A–Z.
  await page.getByTestId('sort-name').click();
  await expect(page.getByTestId('sort-name')).toHaveAttribute('aria-pressed', 'true');
  const namesBack = await page.getByTestId('browse-row-name').allInnerTexts();
  expect(namesBack).toEqual(['Ada Team', 'Zoe Team']);
});

test('an empty type shows the single amber "Create the first {type}" CTA', async ({ page }) => {
  // Fresh DB, no entities of any type.
  await page.getByTestId('view-groups').click();

  await expect(page.getByTestId('browse-empty')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No groups yet.' })).toBeVisible();
  const cta = page.getByTestId('browse-empty-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveText('Create the first group');

  // The CTA opens the create form for that type.
  await cta.click();
  await expect(page.getByTestId('entity-form-title')).toHaveText('New group');
});

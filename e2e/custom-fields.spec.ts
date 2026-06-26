import { expect, test, type Page } from '@playwright/test';

/**
 * DATA-03 — the custom-field keystone, end-to-end against the REAL UI + Dexie.
 *
 * Flow: open the People field manager and add two custom fields (a "Start date" date field and an
 * "Employer" link-to-entity targeting Groups); create a Group + a Person, filling both custom
 * fields in the entity form; open the person's profile and assert the date renders formatted and
 * the employer renders as a clickable name link (D-10 one-way pointer). Then delete the target
 * group → the link shows "(removed)" (T-03-06). Finally soft-delete the date field → it disappears
 * from the profile; restore it → the stored value returns (D-05 keep-on-soft-delete).
 *
 * Field-def lifecycle steps that have no first-class UI affordance (re-add = un-delete the SAME
 * def so values keyed by its stable id return) are driven through the same repository the UI uses.
 */

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

async function suppressPrivacyNotice(page: Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Create an entity of `type` via the +New menu, filling Name (+ optional per-field steps). */
async function openCreate(page: Page, type: string, name: string) {
  await page.getByTestId('new-entity-trigger').click();
  await page.getByTestId(`new-entity-${type}`).click();
  await page.getByTestId('field-name').fill(name);
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

test('define → fill → render custom fields; (removed) on deleted target; soft-delete keeps values', async ({
  page,
}) => {
  // A target Group for the Employer link-to-entity.
  await openCreate(page, 'groups', 'Acme Corp');
  await page.getByTestId('entity-form-save').click();
  await expect(page.getByTestId('entity-form-save')).toHaveCount(0);

  const groupId = await page.evaluate(async () => (await window.__rb!.db.groups.toArray())[0].id);

  // --- Define two custom fields on People via the field manager (S13/S14) ---
  await page.getByTestId('view-people').click();
  await page.getByTestId('view-fields').click();
  await expect(page.getByTestId('field-manager')).toBeVisible();
  await expect(page.getByTestId('field-manager-title')).toHaveText('People fields');

  // Add the "Start date" date field.
  await page.getByTestId('field-add').click();
  await page.getByTestId('field-editor-name').fill('Start date');
  await page.getByTestId('field-editor-type').selectOption('date');
  await page.getByTestId('field-editor-save').click();

  // Add the "Employer" link-to-entity field targeting Groups.
  await page.getByTestId('field-add').click();
  await page.getByTestId('field-editor-name').fill('Employer');
  await page.getByTestId('field-editor-type').selectOption('link-to-entity');
  await page.getByTestId('field-editor-target').selectOption('groups');
  await page.getByTestId('field-editor-save').click();

  // Both definitions persisted (live, per-mutation — U9).
  await expect(page.getByTestId('field-row')).toHaveCount(2);
  await page.getByTestId('field-manager-done').click();

  // Resolve the two field ids so we can address their inputs deterministically.
  const ids = await page.evaluate(async () => {
    const defs = await window.__rb!.listFieldDefs('people');
    const byLabel = (l: string) => defs.find((d) => d.label === l)!.id;
    return { date: byLabel('Start date'), employer: byLabel('Employer') };
  });

  // --- Create a Person, filling both custom fields (S16) ---
  await openCreate(page, 'people', 'Ada Lovelace');
  await page.getByTestId(`custom-input-${ids.date}`).fill('2026-06-25');
  await page.getByTestId(`custom-input-${ids.employer}`).selectOption(groupId);
  await page.getByTestId('entity-form-save').click();
  await expect(page.getByTestId('entity-form-save')).toHaveCount(0);

  // --- Open the person's profile; assert custom rows render by type (S15) ---
  await page.getByTestId('view-people').click();
  await page.getByTestId('browse-row').filter({ hasText: 'Ada Lovelace' }).first().click();
  await expect(page.getByTestId('profile-sidebar')).toBeVisible();

  // The date renders with the raw ISO in its title (formatted human date in the body).
  await expect(page.getByTestId('custom-date')).toHaveAttribute('title', '2026-06-25');
  // The employer renders as the target group's NAME as a link (one-way pointer, D-10).
  await expect(page.getByTestId('custom-link')).toHaveText('Acme Corp');

  // --- Delete the target group → the link shows "(removed)" (T-03-06) ---
  await page.evaluate(async (id) => {
    await window.__rb!.deleteEntity('groups', id);
  }, groupId);
  await expect(page.getByTestId('custom-link-removed')).toHaveText('(removed)');
  await expect(page.getByTestId('custom-link')).toHaveCount(0);

  // --- Soft-delete the "Start date" field → its row disappears (D-05) ---
  await page.evaluate(async (id) => {
    await window.__rb!.softDeleteFieldDef(id);
  }, ids.date);
  await expect(page.getByTestId('custom-date')).toHaveCount(0);

  // The stored value is RETAINED (soft-delete hides, never destroys).
  const retained = await page.evaluate(async (fieldId) => {
    const p = (await window.__rb!.db.people.toArray())[0];
    return p.custom[fieldId];
  }, ids.date);
  expect(retained).toBe('2026-06-25');

  // --- Re-add (un-delete the SAME def) → the value returns under its stable id ---
  await page.evaluate(async (id) => {
    await window.__rb!.updateFieldDef(id, { deleted: false });
  }, ids.date);
  await expect(page.getByTestId('custom-date')).toHaveAttribute('title', '2026-06-25');
});

test('a required-but-empty custom field blocks save with the required message', async ({ page }) => {
  // Define a required text field on Groups.
  await page.evaluate(async () => {
    await window.__rb!.createFieldDef({
      entityType: 'groups',
      label: 'Charter',
      type: 'text',
      required: true,
    });
  });

  await openCreate(page, 'groups', 'Founders');
  // Leave the required custom field empty and try to save.
  await page.getByTestId('entity-form-save').click();

  // The form stays open and the required error shows beneath the custom input.
  await expect(page.getByText('This field is required.')).toBeVisible();
  await expect(page.getByTestId('entity-form-save')).toBeVisible();
  const groupCount = await page.evaluate(async () => window.__rb!.db.groups.count());
  expect(groupCount).toBe(0);
});

import { expect, test } from '@playwright/test';

/**
 * S21 / D-12 — the user-flagged delete-from-map correctness fix.
 *
 * From a MARKER context the profile sidebar offers a neutral "Remove from map" action that
 * deletes ONLY the marker — the person stays in the database (and, later, the browse list).
 * This is the regression guard: removing someone from a map must never delete them from the DB.
 *
 * Marker selection is driven through Konva (the canvas is not a DOM tree), mirroring the AT
 * bridge the UI-SPEC defines. The person's survival is asserted via the real Dexie database
 * through the `window.__rb` test bridge.
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

/** Seed one map + one person + one marker; returns the ids. */
async function seed(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
    const map = await rb.createMap({ name: 'm', background: ref, width: 800, height: 600 });
    const person = await rb.createPerson({ name: 'Ada Lovelace' });
    const marker = await rb.upsertMarker({ mapId: map.id, personId: person.id, x: 200, y: 200 });
    return { mapId: map.id, personId: person.id, markerId: marker.id };
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

test('"Remove from map" removes the marker but the person stays in the database', async ({
  page,
}) => {
  const { personId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Open the profile from the marker (marker context).
  await clickFirstMarker(page);
  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();

  // The marker-context action is the NEUTRAL "Remove from map" — there is no cascade Delete here.
  await expect(page.getByTestId('profile-remove')).toBeVisible();
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);

  await page.getByTestId('profile-remove').click();
  await expect(page.getByText('Remove from this map?')).toBeVisible();
  await page.getByRole('button', { name: 'Remove from map' }).click();

  // The sidebar closes and the marker is gone from the scene graph.
  await expect(sidebar).toHaveCount(0);
  await page.waitForFunction(
    () => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) return false;
      type Node = { name(): string; find(sel: string): Node[] };
      const stage = (Konva.stages as unknown as Node[])[0];
      if (!stage) return false;
      return !stage.find('Group').some((g) => g.name().startsWith('marker-'));
    },
    undefined,
    { timeout: 15_000 },
  );

  // The correctness assertion: the marker is gone but the PERSON survives in the database,
  // confirmed both before and after a full reload (the entity is truly persisted, not just hidden).
  const before = await page.evaluate(
    (id) => window.__rb!.db.people.get(id),
    personId,
  );
  expect(before).toBeTruthy();

  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const after = await page.evaluate(async (id) => {
    const rb = window.__rb!;
    return { person: await rb.db.people.get(id), markers: await rb.db.markers.count() };
  }, personId);
  expect(after.person).toBeTruthy();
  expect(after.markers).toBe(0);
});

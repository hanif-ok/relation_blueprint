import { expect, test, type Page } from '@playwright/test';

/**
 * DEBUG list-no-goto-map-location — the browse-list "Show on map ↗" action must go to the
 * LOCATION, not just to the map.
 *
 * Regression guard for the fix in App.showOnMap: clicking a People row's "Show on map" button
 * switches to the Map view AND selects + recenters that person's placement — the same select+center
 * outcome the profile "Appears on" jump produces (place-person.spec step 4). Before the fix,
 * showOnMap only switched the active map + view and opened the profile; it never set `focusMarkerId`,
 * so MapView never selected/recentered the marker. On a map larger than the viewport the placement
 * sat off the fresh (0,0)/scale-1 Stage and was culled off-screen — the action reached the map but
 * never the location.
 *
 * Faithful to the bug: the person is placed OFF-CENTER on a LARGE (2000x1500) map, so without the
 * recenter the marker is far outside the initial viewport (and culled). Two discriminating signals,
 * both mirroring the trusted place-person.spec: (1) a Konva Transformer attaches to a node only when
 * the placement was SELECTED (which, from this path, happens only via the `focusMarkerId` effect the
 * fix wires in); (2) the marker Group is present in the scene graph only when it was recentered
 * on-screen (off-screen markers are culled before mount). Both are false before the fix, true after.
 *
 * Seeds through the SAME repository the UI uses (window.__rb); a default "Markers" layer + a
 * layerId'd marker reproduce the exact renderable placed-person state the Person tool produces
 * (a marker on a map with no layers is not rendered by design — orderObjectsForRender). Reads the
 * scene graph via the exposed Konva global (deterministic regardless of devicePixelRatio).
 */

// A valid 8x8 RGB PNG (decodes cleanly through the map-upload cap pipeline).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC';

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

/**
 * Seed ONE large map (with a default "Markers" layer) + ONE person placed OFF-CENTER on it, through
 * the repository the UI uses. The off-center placement on a viewport-exceeding map is what makes
 * "reach the map but not the location" observable: without a recenter the marker is far outside the
 * initial (0,0)/scale-1 view and is culled before mount.
 */
async function seed(page: Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const map = await rb.createMap({ name: 'Head Office', background: ref, width: 2000, height: 1500 });
    // A default "Markers" layer — the state the Person tool / version(4) upgrade guarantee before a
    // placement renders (a marker whose layer can't resolve is dropped by orderObjectsForRender).
    const layerId = 'layer-markers';
    await rb.updateMap(map.id, {
      layers: [{ id: layerId, name: 'Markers', visible: true, locked: false, order: 0 }],
    });
    const person = await rb.createPerson({ name: 'Ada Lovelace' });
    // Far from the top-left origin the fresh Stage shows — outside a typical viewport (→ culled
    // unless the placement is recentered into view).
    await rb.upsertMarker({
      kind: 'person',
      mapId: map.id,
      personId: person.id,
      layerId,
      x: 1650,
      y: 1250,
    });
    return { mapId: map.id, personId: person.id };
  }, PNG_BASE64);
}

/** True when SOME Konva Transformer in the (single) Stage is attached to at least one node. */
function transformerAttached(page: Page) {
  return page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) return false;
    type Node = { find(sel: string): Array<{ nodes(): unknown[] }> };
    const stage = (Konva.stages as unknown as Node[])[0];
    if (!stage) return false;
    return stage.find('Transformer').some((t) => t.nodes().length > 0);
  });
}

/** True when the person's marker Group is mounted in the scene graph (on-screen → not culled). */
function markerMounted(page: Page, personId: string) {
  return page.evaluate((pid) => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) return false;
    type Node = { name(): string; find(sel: string): Node[] };
    const stage = (Konva.stages as unknown as Node[])[0];
    if (!stage) return false;
    return stage.find('Group').some((n) => n.name() === `marker-${pid}`);
  }, personId);
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

test('browse-list "Show on map" switches to the map AND selects + centers the placement', async ({
  page,
}) => {
  const { personId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // Go to the People browse list and find the seeded person's row.
  await page.getByTestId('view-people').click();
  await expect(page.getByTestId('browse-list-people')).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByTestId('browse-row-name').filter({ hasText: 'Ada Lovelace' }),
  ).toBeVisible();

  // The row's "Show on map ↗" is enabled for People and points at the placement.
  const showOnMap = page.getByTestId('browse-show-on-map').first();
  await expect(showOnMap).toBeEnabled();
  await showOnMap.click();

  // 1. It goes to the Map view (the Stage canvas mounts) on the person's map.
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Head Office', {
    timeout: 15_000,
  });

  // 2. It goes to the LOCATION: the off-center placement is recentered into view (its marker Group
  //    mounts — off-screen markers are culled) AND selected (a Transformer attaches). From this path
  //    both happen only via the focusMarkerId effect the fix wires in; before the fix showOnMap left
  //    the Stage at the origin, so the marker stayed culled and unselected.
  await expect.poll(() => markerMounted(page, personId), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => transformerAttached(page), { timeout: 15_000 }).toBe(true);
});

import { expect, test } from '@playwright/test';

/**
 * MAP-05 (criterion 4) — place an existing person on two maps, "Appears on" jump, edit propagation.
 *
 * Seeds two maps (Alpha, Bravo) + one Person through the SAME repository the UI uses
 * (window.__rb), opens the app on map Alpha, then:
 *   1. arms the Person tool and drops on the Konva Stage → the PersonPicker opens; picks the person
 *      → a person-kind Marker row is placed on Alpha (read back through the bridge);
 *   2. switches to map Bravo (MapSwitcher) and places the SAME person again → two Marker rows for one
 *      personId and exactly one Person record (the multi-placement contract, D-13);
 *   3. opens the person's profile (marker click) and asserts "Appears on" lists BOTH Alpha and Bravo;
 *   4. clicks the "Appears on" row for Alpha → the active map switches to Alpha and the placement is
 *      selected (a Transformer attaches — select + center);
 *   5. edits the person's name through the bridge and asserts both placements still reference the one
 *      canonical Person and the rendered profile name updates everywhere (criterion 4 propagation).
 *
 * Mirrors marker.spec / portal.spec bridge-seeding + Konva-event harness. Canvas drops fire Konva
 * pointer events on the Stage (deterministic regardless of devicePixelRatio); state is read/written
 * only through the repository (window.__rb), never straight to Dexie.
 */

// A valid 8x8 RGB PNG (decodes cleanly through the map-upload cap pipeline).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC';

async function resetDb(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

async function suppressPrivacyNotice(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Seed two maps (Alpha, Bravo) + one Person. Returns their ids. */
async function seed(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const alpha = await rb.createMap({ name: 'Alpha', background: ref, width: 800, height: 600 });
    const bravo = await rb.createMap({ name: 'Bravo', background: ref, width: 800, height: 600 });
    const person = await rb.createPerson({ name: 'Ada Lovelace' });
    return { alphaId: alpha.id, bravoId: bravo.id, personId: person.id };
  }, PNG_BASE64);
}

/** Fire ONE Konva pointer event on the Stage at canvas-relative (x,y). */
async function firePointer(
  page: import('@playwright/test').Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
) {
  await page.evaluate(
    ({ type, x, y }) => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) throw new Error('Konva global missing');
      type Stage = {
        content: HTMLElement;
        setPointersPositions(evt: unknown): void;
        fire(evt: string, payload?: unknown, bubble?: boolean): void;
      };
      const stage = (Konva.stages as unknown as Stage[])[0];
      const r = stage.content.getBoundingClientRect();
      const evt = { clientX: r.left + x, clientY: r.top + y, button: 0, type, preventDefault() {} };
      stage.setPointersPositions(evt);
      stage.fire(type, { evt, target: stage }, true);
    },
    { type, x, y },
  );
}

/** Fire a named event on a person marker Group node (by its `marker-<personId>` name). */
async function fireMarkerEvent(
  page: import('@playwright/test').Page,
  personId: string,
  evt: string,
) {
  await page.evaluate(
    ({ personId, evt }) => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) throw new Error('Konva global missing');
      type Node = { name(): string; find(sel: string): Node[]; fire(e: string, p?: unknown, b?: boolean): void };
      const stage = (Konva.stages as unknown as Node[])[0];
      const matches = stage.find('Group').filter((n) => n.name() === `marker-${personId}`);
      const node = matches[0];
      if (!node) throw new Error(`marker node marker-${personId} not found`);
      node.fire(evt, { target: node }, true);
    },
    { personId, evt },
  );
}

/** Arm the Person tool, drop at (x,y), and pick `personId` from the PersonPicker. */
async function placeViaPicker(
  page: import('@playwright/test').Page,
  personId: string,
  x: number,
  y: number,
) {
  await page.locator('[data-testid="tool-person"]').click();
  await firePointer(page, 'pointerdown', x, y);
  await expect(page.locator('[data-testid="person-picker"]')).toBeVisible({ timeout: 15_000 });
  await page.locator(`[data-testid="person-picker-item-${personId}"]`).click();
  await expect(page.locator('[data-testid="person-picker"]')).toHaveCount(0, { timeout: 15_000 });
}

/** Person-kind marker count on a map (read through the repository/bridge). */
async function personMarkerCountOnMap(page: import('@playwright/test').Page, mapId: string) {
  return page.evaluate(async (id) => {
    const markers = await window.__rb!.db.markers.where('mapId').equals(id).toArray();
    return markers.filter((m) => m.kind === 'person').length;
  }, mapId);
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

test('place a person on two maps, see both in "Appears on", jump, and edit propagates', async ({
  page,
}) => {
  const { alphaId, bravoId, personId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The Stage canvas is mounted (Alpha is active — seeded as the first map).
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Alpha', {
    timeout: 15_000,
  });

  // 1. Place the person on Alpha via the Person tool + picker.
  await placeViaPicker(page, personId, 200, 160);
  await expect.poll(() => personMarkerCountOnMap(page, alphaId), { timeout: 15_000 }).toBe(1);

  // 2. Switch to Bravo and place the SAME person again.
  await page.locator('[data-testid="map-switcher-trigger"]').click();
  await page.locator(`[data-testid="map-switcher-item-${bravoId}"]`).click();
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Bravo', {
    timeout: 15_000,
  });
  await placeViaPicker(page, personId, 240, 200);
  await expect.poll(() => personMarkerCountOnMap(page, bravoId), { timeout: 15_000 }).toBe(1);

  // Two placements, ONE canonical Person (the multi-placement contract).
  const counts = await page.evaluate(async (id) => {
    const markers = await window.__rb!.db.markers.where('personId').equals(id).toArray();
    const people = await window.__rb!.db.people.toArray();
    return { markerCount: markers.length, peopleCount: people.length };
  }, personId);
  expect(counts.markerCount).toBe(2);
  expect(counts.peopleCount).toBe(1);

  // 3. Open the person's profile from the marker on Bravo; "Appears on" lists BOTH maps.
  await fireMarkerEvent(page, personId, 'click');
  await expect(page.locator('[data-testid="profile-sidebar"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="profile-appears-on"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`[data-testid="profile-appears-on-${alphaId}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="profile-appears-on-${bravoId}"]`)).toBeVisible();

  // 4. Click the "Appears on" row for Alpha → the active map switches to Alpha (jump-to-placement).
  // Dispatch the click directly to the button (the floating LayersPanel overlaps the sidebar in this
  // viewport and intercepts a hit-tested click — dispatchEvent fires the real React onClick anyway,
  // mirroring how portal.spec fires Konva events directly past canvas hit-testing).
  await page.locator(`[data-testid="profile-appears-on-${alphaId}"]`).dispatchEvent('click');
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Alpha', {
    timeout: 15_000,
  });

  // The jump selects + centers the placement: a Transformer is now attached to a node.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
          if (!Konva) return false;
          type Node = { find(sel: string): Array<{ nodes(): unknown[] }> };
          const stage = (Konva.stages as unknown as Node[])[0];
          return stage.find('Transformer').some((t) => t.nodes().length > 0);
        }),
      { timeout: 15_000 },
    )
    .toBe(true);

  // 5. Edit the canonical Person → both placements still reference it (identity is shared).
  await page.evaluate(async (id) => {
    await window.__rb!.updatePerson(id, { name: 'Ada, Countess of Lovelace' });
  }, personId);

  const after = await page.evaluate(async (id) => {
    const markers = await window.__rb!.db.markers.where('personId').equals(id).toArray();
    const people = await window.__rb!.db.people.toArray();
    const person = await window.__rb!.db.people.get(id);
    return {
      markerCount: markers.length,
      peopleCount: people.length,
      allReference: markers.every((m) => m.personId === id),
      name: person?.name ?? null,
    };
  }, personId);
  expect(after.peopleCount).toBe(1);
  expect(after.markerCount).toBe(2);
  expect(after.allReference).toBe(true);
  expect(after.name).toBe('Ada, Countess of Lovelace');

  // The rendered profile name reflects the canonical edit (propagation across placements).
  await expect(page.locator('[data-testid="profile-name"]')).toContainText(
    'Ada, Countess of Lovelace',
    { timeout: 15_000 },
  );
});

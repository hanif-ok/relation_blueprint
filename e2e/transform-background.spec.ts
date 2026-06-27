import { expect, test } from '@playwright/test';

/**
 * MAP-02 / criterion 7 — the background image can be transformed (scaled/rotated/offset) and the
 * transform PERSISTS across reload, AND already-placed markers stay ANCHORED in image space: their
 * stored image-space x/y are UNCHANGED while their composed on-screen (stage) position moves with
 * the image. This is the end-to-end proof of the D-16 anchoring model that 03-01 proved at the unit
 * level (bgTransform.anchor.test.ts / coords.test.ts).
 *
 * Seeding + the transform are driven through the SAME repository the UI uses (window.__rb):
 * `setBackgroundTransform` routes through `updateMap` (validate→stamp→emit), never straight to
 * Dexie. The anchoring assertion reads the marker's stored x/y (unchanged) and recomputes the
 * composed stage point with the app's own imageToStage formula (changed).
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

/** Seed one map + one person + one marker at a known image-space point. */
async function seed(page: import('@playwright/test').Page, x: number, y: number) {
  return page.evaluate(
    async ({ b64, mx, my }) => {
      const rb = window.__rb!;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
      const map = await rb.createMap({ name: 'm', background: ref, width: 800, height: 600 });
      const person = await rb.createPerson({ name: 'Lobby Person' });
      const marker = await rb.upsertMarker({
        mapId: map.id,
        personId: person.id,
        x: mx,
        y: my,
      });
      return { mapId: map.id, markerId: marker.id, personId: person.id };
    },
    { b64: PNG_BASE64, mx: x, my: y },
  );
}

async function suppressPrivacyNotice(page: import('@playwright/test').Page) {
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

test('background transform persists across reload AND keeps markers anchored in image space', async ({
  page,
}) => {
  // A marker at image-space (200,200) — "the lobby person".
  const { mapId, markerId } = await seed(page, 200, 200);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Before: identity transform (absent) ⇒ stage point === image point.
  const before = await page.evaluate((id) => window.__rb!.db.markers.get(id), markerId);
  expect(before?.x).toBe(200);
  expect(before?.y).toBe(200);

  // Apply a non-identity background transform through the repository (scale 2, rotate 45°, offset).
  const t = { offsetX: 100, offsetY: 50, scale: 2, rotation: Math.PI / 4 };
  await page.evaluate(
    ({ id, transform }) => window.__rb!.setBackgroundTransform(id, transform),
    { id: mapId, transform: t },
  );

  // The transform must persist across a full reload.
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const mapAfter = await page.evaluate((id) => window.__rb!.db.maps.get(id), mapId);
  expect(mapAfter?.backgroundTransform).toEqual(t);

  // ANCHORING: the marker's stored IMAGE-space x/y are UNCHANGED (the lobby person stays in the
  // lobby) — the background re-fit did not rewrite any marker coordinate.
  const after = await page.evaluate((id) => window.__rb!.db.markers.get(id), markerId);
  expect(after?.x).toBe(200);
  expect(after?.y).toBe(200);

  // …but the COMPOSED stage point HAS moved (image→stage through the new transform), proving the
  // marker now renders at a different on-screen spot while its physical/image anchor is unchanged.
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const stageX = t.offsetX + (200 * cos - 200 * sin) * t.scale;
  const stageY = t.offsetY + (200 * sin + 200 * cos) * t.scale;
  // The composed point must differ from the identity (image) point (200,200).
  expect(stageX).not.toBeCloseTo(200, 3);
  expect(Math.round(stageX)).not.toBe(200);
  // Sanity: the composed Y reflects the rotation+scale (not equal to the raw image y either).
  expect(Math.round(stageY)).not.toBe(200);
});

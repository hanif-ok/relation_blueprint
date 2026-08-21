import { expect, test } from '@playwright/test';

/**
 * quick-260821-nac — the three map-editor canvas gestures that all live on the same Stage
 * pointer-event seam:
 *
 *   1. MIDDLE-BUTTON PAN — holding the middle mouse button and moving pans the Stage whatever tool
 *      is armed (including a draw tool), and commits nothing.
 *   2. MARQUEE SELECT — with the Select tool, a left drag on EMPTY canvas draws a rubber band and
 *      selects everything it intersects on release (Delete then removes every selected shape).
 *   3. AUTO-RETURN TO SELECT — finishing a shape draw re-arms the Select tool.
 *
 * The pan/marquee tests drive a REAL `page.mouse` sequence (they are about physical mouse buttons,
 * which a synthesized Konva event cannot faithfully model); the draw test uses the `firePointer`
 * Konva-event helper copied from `e2e/draw-shapes.spec.ts` (deterministic regardless of
 * devicePixelRatio).
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

/** Seed one map and return its id. */
async function seedMap(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const map = await rb.createMap({ name: 'Floor 1', background: ref, width: 800, height: 600 });
    return map.id;
  }, PNG_BASE64);
}

async function suppressPrivacyNotice(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__rb!.db.meta.put({ key: 'privacyNoticeDismissed', value: true });
  });
}

/** Read the live Stage position through the Konva global (what a pan actually moves). */
async function stagePosition(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    const stage = (Konva.stages as unknown as Array<{ x(): number; y(): number }>)[0];
    return { x: stage.x(), y: stage.y() };
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

test('a middle-button drag pans the Stage even with a draw tool armed, and commits no shape', async ({
  page,
}) => {
  const mapId = await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  const canvas = page.locator('[data-testid="map-view"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // Arm the RECT tool — the point of the gesture is that it pans regardless of the armed tool.
  await page.locator('[data-testid="tool-rect"]').click();

  const box = (await canvas.boundingBox())!;
  const before = await stagePosition(page);

  // A real middle-button press-move-release. `steps` above 1 so intermediate pointermove events
  // actually fire (a single jump would land one event and could mask a broken move handler).
  const startX = box.x + 200;
  const startY = box.y + 180;
  const DX = 120;
  const DY = 90;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(startX + DX, startY + DY, { steps: 10 });
  await page.mouse.up({ button: 'middle' });

  const after = await stagePosition(page);
  expect(after.x - before.x).toBeCloseTo(DX, 0);
  expect(after.y - before.y).toBeCloseTo(DY, 0);

  // The Rect tool was armed the whole time, but a middle drag must never draw.
  const shapeCount = await page.evaluate(async (id) => {
    const m = await window.__rb!.db.maps.get(id);
    return m?.shapes.length ?? 0;
  }, mapId);
  expect(shapeCount).toBe(0);
});

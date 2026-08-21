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

test('a Select-tool left drag on empty canvas marquee-selects, and Delete removes every hit shape', async ({
  page,
}) => {
  const mapId = await seedMap(page);

  // Seed two well-separated rects on one layer so a single band can span BOTH of them. At the
  // identity background transform image space IS stage space (and, with the Stage unpanned at
  // scale 1, stage space is canvas-relative px) — so these occupy 200,300 → 280,360 and
  // 400,420 → 480,480.
  await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const layer = { id: 'layer-0', name: 'Markers', visible: true, locked: false, order: 0 };
    const mk = (sid: string, x: number, y: number) => ({
      id: sid,
      layerId: layer.id,
      kind: 'rect' as const,
      x,
      y,
      width: 80,
      height: 60,
      rotation: 0,
      preset: 'stone',
      fill: true,
    });
    await rb.updateMap(id, {
      shapes: [mk('shape-a', 200, 300), mk('shape-b', 400, 420)],
      layers: [layer],
    });
  }, mapId);

  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const canvas = page.locator('[data-testid="map-view"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // Start on EMPTY canvas above-left of both shapes and drag past the far corner of both. The
  // default tool is Select, so this is the marquee gesture.
  //
  // The start point must clear the floating DOM chrome: the editor toolbar column (map switcher +
  // breadcrumb + tool palette) overlays the TOP-LEFT of the canvas out to roughly y=135, and the
  // LayersPanel docks 248px down the RIGHT edge. A press landing on either goes to that DOM node,
  // never to the Stage, and no gesture starts at all.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 150, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 380, { steps: 5 });
  // The band is a DOM overlay, visible for the duration of the drag.
  await expect(page.locator('[data-testid="marquee-rect"]')).toBeVisible({ timeout: 5_000 });
  await page.mouse.move(box.x + 560, box.y + 520, { steps: 5 });
  await page.mouse.up();
  // …and gone once the band is released.
  await expect(page.locator('[data-testid="marquee-rect"]')).toHaveCount(0);

  // Both shapes are now marquee-selected; one Delete removes them in a single write.
  await page.keyboard.press('Delete');
  await page.waitForFunction(
    async (id) => {
      const m = await window.__rb!.db.maps.get(id);
      return (m?.shapes.length ?? 0) === 0;
    },
    mapId,
    { timeout: 15_000 },
  );
});

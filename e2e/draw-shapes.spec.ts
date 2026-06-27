import { expect, test } from '@playwright/test';

/**
 * MAP-02 — draw a shape on the map and style it. Seeds a map through the SAME repository the UI
 * uses (window.__rb), opens the app, picks the Rect tool from the ToolPalette, drags on the Konva
 * Stage to draw a rectangle, and asserts a shape now persists on MapDoc.shapes. Then opens the
 * style popover (the just-drawn shape auto-selects) and picks the Sage preset, asserting it
 * round-trips to Dexie after a reload.
 *
 * Drawing is driven by dispatching Konva pointer events on the Stage (deterministic regardless of
 * devicePixelRatio), mirroring the marker.spec drag approach.
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

/**
 * Fire ONE Konva pointer event on the Stage at canvas-relative (x,y). We use Konva's own
 * `setPointersPositions` (so `getPointerPosition()` resolves) then `fire()` the event — the same
 * mechanism react-konva listens on. Each call is its own `page.evaluate`, which yields a microtask
 * boundary so React flushes the `setDraw` state between pointerdown → move → up (otherwise the
 * synchronous fires would read a stale `draw === null` closure on pointerup).
 */
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

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await resetDb(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await suppressPrivacyNotice(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
});

test('drawing a rectangle with the Rect tool persists a shape on the map', async ({ page }) => {
  const mapId = await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The Stage canvas is mounted.
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Arm the Rect tool from the palette.
  await page.locator('[data-testid="tool-rect"]').click();

  // Drive a draw on the Stage: pointerdown → move → up, each in its own evaluate so React flushes
  // the in-progress draw state between events. The drag spans well over the size threshold, so the
  // MapView draw path commits a shape via updateMap.
  await firePointer(page, 'pointerdown', 120, 100);
  await firePointer(page, 'pointermove', 280, 220);
  await firePointer(page, 'pointerup', 280, 220);

  // Wait until the committed shape lands in Dexie before reloading (avoid racing the IDB commit).
  await page.waitForFunction(
    async (id) => {
      const m = await window.__rb!.db.maps.get(id);
      return (m?.shapes.length ?? 0) >= 1;
    },
    mapId,
    { timeout: 15_000 },
  );

  // The shape persisted to MapDoc.shapes (read back through the bridge after a reload).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const shapeCount = await page.evaluate(async (id) => {
    const m = await window.__rb!.db.maps.get(id);
    return m?.shapes.length ?? 0;
  }, mapId);
  expect(shapeCount).toBeGreaterThanOrEqual(1);
});

test('picking a preset in the style popover persists it', async ({ page }) => {
  const mapId = await seedMap(page);
  // Seed a shape directly so the popover has something to style without depending on the draw
  // gesture (which is covered by the test above).
  await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const layer = { id: 'layer-0', name: 'Markers', visible: true, locked: false, order: 0 };
    const shape = {
      id: 'shape-1',
      layerId: layer.id,
      kind: 'rect' as const,
      x: 100,
      y: 100,
      width: 160,
      height: 120,
      rotation: 0,
      preset: 'stone',
      fill: true,
    };
    await rb.updateMap(id, { shapes: [shape], layers: [layer] });
  }, mapId);

  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Select the shape via the Konva scene graph (fire a click on its node), opening the
  // StylePopover (react-konva binds onClick → node.on('click')).
  await page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    type Node = { name(): string; find(sel: string): Node[]; fire(evt: string, p?: unknown, b?: boolean): void };
    const stage = (Konva.stages as unknown as Node[])[0];
    const matches = stage.find('Rect').filter((n) => n.name() === 'shape-shape-1');
    const node = matches[0];
    if (!node) throw new Error('shape node not found');
    node.fire('click', { target: node }, true);
  });

  // The style popover opens for the selected shape.
  await expect(page.locator('[data-testid="style-popover"]')).toBeVisible({ timeout: 15_000 });

  // Pick the Sage preset in the popover.
  await page.locator('[data-testid="preset-sage"]').click();

  // Wait until the preset write lands in Dexie (the updateMap is fire-and-forget) BEFORE reloading,
  // so the reload can't race the IndexedDB commit.
  await page.waitForFunction(
    async (id) => {
      const m = await window.__rb!.db.maps.get(id);
      return m?.shapes[0]?.preset === 'sage';
    },
    mapId,
    { timeout: 15_000 },
  );

  // It round-trips to Dexie across a full reload (durability).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const preset = await page.evaluate(async (id) => {
    const m = await window.__rb!.db.maps.get(id);
    return m?.shapes[0]?.preset;
  }, mapId);
  expect(preset).toBe('sage');
});

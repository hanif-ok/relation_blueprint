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

/**
 * Fire ONE Konva pointer event on the Stage at canvas-relative (x,y) — the `draw-shapes.spec.ts`
 * mechanism, used for the DRAW gesture because it is deterministic regardless of devicePixelRatio.
 * Each call is its own `page.evaluate`, which yields a microtask boundary so React flushes the
 * `setDraw` state between pointerdown → move → up (otherwise the synchronous fires would read a
 * stale `draw === null` closure on pointerup).
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

/** Read the live Stage position through the Konva global (what a pan actually moves). */
async function stagePosition(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    const stage = (Konva.stages as unknown as Array<{ x(): number; y(): number }>)[0];
    return { x: stage.x(), y: stage.y() };
  });
}

/**
 * `stagePosition` widened with the uniform scale — the full SCREEN↔WORLD transform
 * (`screen = world · scale + position`). The quick-260903-d77 regression tests derive their band
 * coordinates from this OBSERVED transform rather than from a hard-coded scale, so a difference in
 * how many wheel ticks the browser actually delivers cannot make them flaky.
 */
async function stageView(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    const stage = (
      Konva.stages as unknown as Array<{ x(): number; y(): number; scaleX(): number }>
    )[0];
    return { x: stage.x(), y: stage.y(), scale: stage.scaleX() };
  });
}

/**
 * The quick-260903-d77 seed: the SAME two well-separated rects the identity-view marquee test
 * uses, so the only difference between that test and these two is the Stage transform in force
 * when the band is drawn.
 */
async function seedTwoRects(page: import('@playwright/test').Page, mapId: string) {
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

  // Both shapes are now marquee-selected; one Delete removes them in a single write — but a 2+
  // selection routes through `requestDelete`'s BLOCKING confirm (T-NFS-01, quick-260902-nfs), so
  // nothing is written until the curator clicks Delete in the dialog (D77-DEF-2).
  await page.keyboard.press('Delete');
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible({ timeout: 5_000 });
  await expect(confirm).toContainText('Delete 2 selected objects?');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

  // expect.poll over page.evaluate, NOT waitForFunction — an async predicate is vacuous there (D77-DEF-1).
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const m = await window.__rb!.db.maps.get(id);
          return (m?.shapes ?? []).map((s) => s.id);
        }, mapId),
      { timeout: 15_000 },
    )
    .toEqual([]);
});

test('committing a rect draw re-arms the Select tool', async ({ page }) => {
  const mapId = await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  await page.locator('[data-testid="tool-rect"]').click();
  await expect(page.locator('[data-testid="tool-rect"]')).toHaveAttribute('aria-pressed', 'true');

  // A suprathreshold drag → the shape commits.
  await firePointer(page, 'pointerdown', 120, 100);
  await firePointer(page, 'pointermove', 280, 220);
  await firePointer(page, 'pointerup', 280, 220);

  // expect.poll over page.evaluate, NOT waitForFunction — an async predicate is vacuous there (D77-DEF-1).
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const m = await window.__rb!.db.maps.get(id);
          return m?.shapes.length ?? 0;
        }, mapId),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // …and the palette is back on Select — the one-shot behaviour Portal/Person already have.
  await expect(page.locator('[data-testid="tool-select"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="tool-rect"]')).toHaveAttribute('aria-pressed', 'false');
});

/**
 * quick-260903-d77 — the band is captured in SCREEN px but hit-tested against WORLD-space object
 * boxes, so it was only ever correct at the untouched initial view. The marquee test above bands at
 * exactly that view, which is why the defect shipped twice unnoticed. These two tests move the
 * Stage FIRST — one pans, one wheel-zooms — and then band.
 *
 * Both derive their band from the WORLD rectangle (180,280)→(500,500), which comfortably contains
 * both seeded rects (200,300→280,360 and 400,420→480,480), mapped forward through the OBSERVED
 * Stage transform (`screen = world · scale + position`). On the pre-fix code the raw screen band
 * was tested against world boxes directly, catching at most ONE rect, so the single Delete left a
 * shape behind and the wait below timed out.
 */
const WORLD_BAND = { x0: 180, y0: 280, x1: 500, y1: 500 };

/** Map a world point forward through an observed Stage view to the screen point it is drawn at. */
function worldToScreen(
  p: { x: number; y: number },
  view: { x: number; y: number; scale: number },
) {
  return { x: p.x * view.scale + view.x, y: p.y * view.scale + view.y };
}

/**
 * Band the WORLD_BAND rectangle through the observed `view`, then Delete, and wait for the map to
 * be empty — i.e. assert BOTH seeded rects were selected by the one band.
 */
async function bandWorldRectAndExpectBothDeleted(
  page: import('@playwright/test').Page,
  box: { x: number; y: number },
  view: { x: number; y: number; scale: number },
  mapId: string,
) {
  // Non-vacuity guard: "the map ends up empty" only means anything if it started with BOTH rects.
  const seeded = await page.evaluate(async (id) => {
    const m = await window.__rb!.db.maps.get(id);
    return (m?.shapes ?? []).map((s) => s.id);
  }, mapId);
  expect(seeded.sort()).toEqual(['shape-a', 'shape-b']);

  const from = worldToScreen({ x: WORLD_BAND.x0, y: WORLD_BAND.y0 }, view);
  const to = worldToScreen({ x: WORLD_BAND.x1, y: WORLD_BAND.y1 }, view);

  // The press must clear the floating DOM chrome (toolbar column down to ~y=135, LayersPanel 248px
  // down the right edge) or it lands on a DOM node and no gesture starts at all. Asserted rather
  // than assumed, so a future geometry change fails loudly here instead of as a mystery timeout.
  expect(from.y).toBeGreaterThan(150);
  expect(from.x).toBeGreaterThan(0);

  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + (from.x + to.x) / 2, box.y + (from.y + to.y) / 2, { steps: 5 });
  await expect(page.locator('[data-testid="marquee-rect"]')).toBeVisible({ timeout: 5_000 });
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="marquee-rect"]')).toHaveCount(0);

  // A 2+ selection routes through `requestDelete`'s blocking confirm (T-NFS-01), so the band having
  // caught BOTH rects is itself observable in the dialog's title before anything is written. That
  // makes this assertion sharper than the shape count alone: a band that caught only one rect would
  // take the immediate single-delete path and never open a dialog at all.
  await page.keyboard.press('Delete');
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible({ timeout: 5_000 });
  await expect(confirm).toContainText('Delete 2 selected objects?');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

  // Asserted with `expect.poll` over a `page.evaluate`, NOT with `page.waitForFunction`: the
  // predicate has to `await` a Dexie read, and `waitForFunction` checks the returned value for
  // truthiness WITHOUT awaiting it — an async predicate hands it a Promise, which is truthy on the
  // first poll, so such a wait passes unconditionally. Verified during quick-260903-d77: under a
  // deliberately un-converted (pre-fix) band this helper reported survivors `["shape-a"]` while a
  // `waitForFunction(… === 0)` over the same state still went green. Polling a real value also
  // names the surviving shape on failure instead of timing out anonymously.
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const m = await window.__rb!.db.maps.get(id);
          return (m?.shapes ?? []).map((s) => s.id);
        }, mapId),
      { timeout: 15_000 },
    )
    .toEqual([]);
}

test('a marquee drawn AFTER the Stage has been panned still selects every banded object', async ({
  page,
}) => {
  const mapId = await seedMap(page);
  await seedTwoRects(page, mapId);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const canvas = page.locator('[data-testid="map-view"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const box = (await canvas.boundingBox())!;
  const before = await stagePosition(page);

  // Pan right/down by a known delta with the middle button (the gesture the spec above covers).
  const PAN_X = 250;
  const PAN_Y = 60;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + 200 + PAN_X, box.y + 200 + PAN_Y, { steps: 10 });
  await page.mouse.up({ button: 'middle' });

  const after = await stagePosition(page);
  expect(after.x - before.x).toBeCloseTo(PAN_X, 0);
  expect(after.y - before.y).toBeCloseTo(PAN_Y, 0);

  // The pan must have actually taken effect, or the band would run at the identity view and prove
  // nothing — which is precisely the hole this test exists to close.
  const view = await stageView(page);
  expect(Math.abs(view.x)).toBeGreaterThan(100);
  expect(view.scale).toBeCloseTo(1, 5);

  await bandWorldRectAndExpectBothDeleted(page, box, view, mapId);
});

test('a marquee drawn AFTER the Stage has been wheel-zoomed still selects every banded object', async ({
  page,
}) => {
  const mapId = await seedMap(page);
  await seedTwoRects(page, mapId);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const canvas = page.locator('[data-testid="map-view"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const box = (await canvas.boundingBox())!;

  // Zoom OUT about a point down-right of both rects. `handleWheel` moves scale by 1.05 per tick and
  // writes the Stage POSITION too (it zooms about the pointer), so this exercises both halves of
  // the transform at once. Zooming out (rather than in) is what pulls the band away from the
  // rects' world coordinates: on the pre-fix code the raw screen band then misses shape-a entirely.
  await page.mouse.move(box.x + 600, box.y + 450);
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, 100);
  }

  // Read the transform BACK rather than assuming 1.05^10 — and refuse to run the band at the
  // identity view, where the test would silently pass and prove nothing.
  const view = await stageView(page);
  expect(view.scale).toBeLessThan(0.9);
  expect(view.scale).toBeGreaterThan(0.2);

  await bandWorldRectAndExpectBothDeleted(page, box, view, mapId);
});

import { expect, test } from '@playwright/test';

/**
 * MAP-06 + MAP-07 (descend) — portals link maps and double-click descends through them.
 *
 * Seeds a single map A through the SAME repository the UI uses (window.__rb), opens the app, then:
 *   1. arms the Portal tool and drops a portal on the Konva Stage → the PortalTargetPicker opens;
 *   2. in the picker, "Create a new map…" → names it "Floor 2" + uploads a background → this creates
 *      child map C, sets C.parentId = A (the descend hierarchy A▸C), and points the portal at C;
 *   3. asserts the just-dropped portal now carries a targetMapId (read back through the bridge);
 *   4. double-clicks the portal glyph → the active map becomes C and the breadcrumb shows A▸C
 *      (confirming parentId), then clicks the A ancestor crumb to walk back UP to A;
 *   5. asserts a SINGLE click on a portal SELECTS it (Transformer handles appear) and does NOT
 *      navigate (D-07 select-vs-navigate disambiguation).
 *
 * Mirrors draw-shapes.spec / map-switch.spec bridge-seeding + Konva-event harness. Navigation is
 * driven by firing Konva events on the portal node (deterministic regardless of devicePixelRatio).
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

/** Seed one map "A" and return its id. */
async function seedMap(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const a = await rb.createMap({ name: 'A', background: ref, width: 800, height: 600 });
    return a.id;
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

/** Fire a named event on the portal Group node (by its `portal-<id>` name) in the scene graph. */
async function firePortalEvent(page: import('@playwright/test').Page, portalId: string, evt: string) {
  await page.evaluate(
    ({ portalId, evt }) => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) throw new Error('Konva global missing');
      type Node = { name(): string; find(sel: string): Node[]; fire(e: string, p?: unknown, b?: boolean): void };
      const stage = (Konva.stages as unknown as Node[])[0];
      const matches = stage.find('Group').filter((n) => n.name() === `portal-${portalId}`);
      const node = matches[0];
      if (!node) throw new Error(`portal node portal-${portalId} not found`);
      node.fire(evt, { target: node }, true);
    },
    { portalId, evt },
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

test('place a portal, inline-create its child target, descend by double-click, ascend by breadcrumb', async ({
  page,
}) => {
  const aId = await seedMap(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The Stage canvas is mounted (map A is active — seeded as the first map).
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Arm the Portal tool and drop a portal on the Stage (one-shot — opens the target picker).
  await page.locator('[data-testid="tool-portal"]').click();
  await firePointer(page, 'pointerdown', 200, 160);

  // The picker opens with the UI-SPEC title.
  await expect(page.locator('[data-testid="portal-target-picker"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="portal-target-picker"]')).toContainText(
    'Where does this portal go?',
  );

  // A target-less portal now exists on A (placed, awaiting a target).
  const portalId = await page.evaluate(async (id) => {
    const markers = await window.__rb!.db.markers.where('mapId').equals(id).toArray();
    const portal = markers.find((m) => m.kind === 'portal');
    return portal?.id ?? null;
  }, aId);
  expect(portalId).not.toBeNull();

  // Choose "Create a new map…", name it, and upload a background image.
  await page.locator('[data-testid="portal-create-new"]').click();
  await page.locator('[data-testid="portal-new-name"]').fill('Floor 2');
  await page.locator('[data-testid="portal-new-background"]').setInputFiles({
    name: 'floor2.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
  await page.locator('[data-testid="portal-create-confirm"]').click();

  // The picker closes; the portal now targets the new child C, and C.parentId === A (the hierarchy).
  await expect(page.locator('[data-testid="portal-target-picker"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  const childId = await page.evaluate(
    async ({ pid }) => {
      const portal = await window.__rb!.db.markers.get(pid!);
      return portal?.targetMapId ?? null;
    },
    { pid: portalId },
  );
  expect(childId).not.toBeNull();
  const childParent = await page.evaluate(async (cid) => {
    const child = await window.__rb!.db.maps.get(cid!);
    return child?.parentId ?? null;
  }, childId);
  expect(childParent).toBe(aId);

  // Double-click the portal glyph → descend into child C (the active map becomes C).
  await firePortalEvent(page, portalId!, 'dblclick');
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('Floor 2', {
    timeout: 15_000,
  });

  // The breadcrumb shows the A▸C hierarchy (the A ancestor crumb is clickable).
  await expect(page.locator(`[data-testid="breadcrumb-crumb-${aId}"]`)).toBeVisible({
    timeout: 15_000,
  });

  // Walk back UP to A via the breadcrumb crumb.
  await page.locator(`[data-testid="breadcrumb-crumb-${aId}"]`).click();
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('A', {
    timeout: 15_000,
  });
  // A is top-level → the breadcrumb disappears.
  await expect(page.locator('[data-testid="map-breadcrumb"]')).toHaveCount(0, { timeout: 15_000 });
});

test('single-click a portal SELECTS it (handles appear) and does NOT navigate (D-07)', async ({
  page,
}) => {
  const aId = await seedMap(page);

  // Seed a portal directly via the bridge targeting a sibling map B, so the single-click vs.
  // double-click disambiguation is isolated from the create flow above.
  const { portalId } = await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const ref = (await rb.db.maps.get(id))!.background;
    const b = await rb.createMap({ name: 'B', background: ref, width: 800, height: 600 });
    const layer = { id: 'layer-0', name: 'Markers', visible: true, locked: false, order: 0 };
    await rb.updateMap(id, { layers: [layer] });
    const portal = await rb.upsertMarker({
      mapId: id,
      kind: 'portal',
      targetMapId: b.id,
      layerId: layer.id,
      x: 200,
      y: 160,
    });
    return { portalId: portal.id };
  }, aId);

  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Single-click the portal → it SELECTS (a Transformer attaches), and the active map is UNCHANGED.
  await firePortalEvent(page, portalId, 'click');

  // The active map is still A (single click did NOT navigate to B).
  await expect(page.locator('[data-testid="map-switcher-trigger"]')).toContainText('A', {
    timeout: 15_000,
  });

  // A Transformer is now attached to a node (the selected portal gets handles). Assert via the
  // scene graph: the L2 Transformer has at least one node attached.
  const transformerHasNode = await page.evaluate(() => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    type Node = { getClassName?(): string; nodes?(): unknown[]; find(sel: string): unknown[] };
    const stage = (Konva.stages as unknown as Node[])[0];
    const transformers = stage.find('Transformer') as Array<{ nodes(): unknown[] }>;
    return transformers.some((t) => t.nodes().length > 0);
  });
  expect(transformerHasNode).toBe(true);
});

import { expect, test } from '@playwright/test';

/**
 * REL-03 — authored relationships appear as data-driven connectors between person-markers on the
 * active map, follow a marker live as it is dragged, and recompute from source on release.
 *
 * Seeds — through the SAME repository the UI uses (window.__rb) — one map + two people, a
 * person-marker for each on that map, and one person↔person RelationshipLink between them. The map
 * is the first/active map (opened via the __rb active-map path, NOT the Locations browse list — so
 * this spec was always independent of the former "Locations list → open map" defect, now resolved
 * commit 76c55d8). It then:
 *   1. asserts a connector Arrow renders in the scene graph for the link;
 *   2. drags marker A (Konva dragmove) and asserts the connector's `a` endpoint TRACKS the marker
 *      mid-drag (the transient live-follow, no per-frame Dexie write);
 *   3. fires dragend, reloads, and asserts the marker's new position PERSISTED and the connector
 *      recomputed from the source of truth to the same point.
 *
 * Mirrors marker.spec / place-person.spec bridge-seeding + the Konva-event drag harness. Connector
 * geometry is read straight off the Konva `Arrow` node's `points()` — deterministic regardless of
 * devicePixelRatio. State is read/written only through the repository (window.__rb).
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

/**
 * Seed one map + two people + a person-marker for each + a directed person↔person link.
 * Marker A lands at image-space (200,160); marker B at (400,300). Returns the ids.
 */
async function seed(page: import('@playwright/test').Page) {
  return page.evaluate(async (b64) => {
    const rb = window.__rb!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const ref = await rb.storeMedia(blob, { width: 8, height: 8 });
    const map = await rb.createMap({ name: 'Alpha', background: ref, width: 800, height: 600 });
    // Materialize the default "Markers" layer, exactly as the app does the moment a person is placed
    // (a fresh map ships layerless — a marker with no resolvable layer is not rendered, D-04). Both
    // markers land on it so they mount as scene nodes and the drag harness can address them.
    const layerId = 'layer-markers';
    await rb.updateMap(map.id, {
      layers: [{ id: layerId, name: 'Markers', visible: true, locked: false, order: 0 }],
    });
    const a = await rb.createPerson({ name: 'Ada' });
    const b = await rb.createPerson({ name: 'Bianca' });
    const markerA = await rb.upsertMarker({ mapId: map.id, personId: a.id, x: 200, y: 160, layerId });
    await rb.upsertMarker({ mapId: map.id, personId: b.id, x: 400, y: 300, layerId });
    const rel = await rb.createRelationshipLink({
      name: 'rel',
      label: 'mentor',
      fromType: 'people',
      fromId: a.id,
      toType: 'people',
      toId: b.id,
      directed: true,
    });
    return {
      mapId: map.id,
      personA: a.id,
      personB: b.id,
      markerAId: markerA.id,
      relId: rel.id,
    };
  }, PNG_BASE64);
}

/** Read a connector Arrow's flat points [ax,ay,bx,by] by its `connector-<relId>` name (or null). */
async function connectorPoints(page: import('@playwright/test').Page, relId: string) {
  return page.evaluate((id) => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) return null;
    type Node = { name(): string; find(sel: string): Node[]; points?: () => number[] };
    const stage = (Konva.stages as unknown as Node[])[0];
    if (!stage) return null;
    const arrows = stage.find('Arrow').filter((n) => n.name() === `connector-${id}`);
    const arrow = arrows[0];
    return arrow && arrow.points ? arrow.points() : null;
  }, relId);
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

test('a relationship renders as a connector that follows a marker on drag and persists on release', async ({
  page,
}) => {
  const { personA, relId, markerAId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The Stage canvas is mounted (Alpha is active — the first/only map).
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // 1. A connector Arrow for the link exists, anchored to the two persisted marker positions.
  await expect
    .poll(() => connectorPoints(page, relId), { timeout: 15_000 })
    .toEqual([200, 160, 400, 300]);

  // Wait for marker A's Group to be in the scene graph before driving its drag.
  await page.waitForFunction(
    (pid) => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) return false;
      type Node = { name(): string; find(sel: string): Node[] };
      const stage = (Konva.stages as unknown as Node[])[0];
      if (!stage) return false;
      return stage.find('Group').some((g) => g.name() === `marker-${pid}`);
    },
    personA,
    { timeout: 15_000 },
  );

  // 2. Drag marker A to (300,220) and fire dragmove — the connector's `a` endpoint must TRACK the
  // live marker position (transient overlay, no persist yet). rAF-throttled, so poll for it.
  await page.evaluate((pid) => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    type Node = {
      name(): string;
      find(sel: string): Node[];
      x(v?: number): number;
      y(v?: number): number;
      fire(evt: string, payload?: unknown, bubble?: boolean): void;
    };
    const stage = (Konva.stages as unknown as Node[])[0];
    const group = stage.find('Group').filter((g) => g.name() === `marker-${pid}`)[0];
    group.x(300);
    group.y(220);
    group.fire('dragmove', { target: group }, true);
  }, personA);

  await expect
    .poll(() => connectorPoints(page, relId), { timeout: 15_000 })
    .toEqual([300, 220, 400, 300]);

  // 3. Release the drag → the existing onDragEnd persists via upsertMarker; transient state clears.
  await page.evaluate((pid) => {
    const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    if (!Konva) throw new Error('Konva global missing');
    type Node = {
      name(): string;
      find(sel: string): Node[];
      x(v?: number): number;
      y(v?: number): number;
      fire(evt: string, payload?: unknown, bubble?: boolean): void;
    };
    const stage = (Konva.stages as unknown as Node[])[0];
    const group = stage.find('Group').filter((g) => g.name() === `marker-${pid}`)[0];
    group.fire('dragend', { target: group }, true);
  }, personA);

  // `onDragEnd` persists through an UNAWAITED `void upsertMarker(...)`, so the dragend event
  // returning does NOT mean the Dexie write has committed. Reloading in that same tick tore the
  // page down mid-write — the pre-existing flake, where the post-reload read came back with the
  // pre-drag seed position instead of the dropped one. This poll is a SYNCHRONIZATION GUARD only:
  // the reload and the assertions below it still carry the full burden of proving persistence.
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const m = await window.__rb!.db.markers.get(id);
          return m ? [m.x, m.y] : null;
        }, markerAId),
      { timeout: 15_000 },
    )
    .toEqual([300, 220]);

  // The move persisted to Dexie (read after a full reload).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const persisted = await page.evaluate((id) => window.__rb!.db.markers.get(id), markerAId);
  expect(persisted?.x).toBe(300);
  expect(persisted?.y).toBe(220);

  // And the connector recomputed from the source of truth to the persisted position.
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() => connectorPoints(page, relId), { timeout: 15_000 })
    .toEqual([300, 220, 400, 300]);
});

/**
 * The Layers-panel "Relationship lines" toggle. Proves the toggle by the resulting canvas render
 * (the e2e/layers.spec.ts precedent) rather than by pixel math: the connector Arrow either is or
 * is not in the Konva scene graph. Also pins the SESSION-ONLY contract — nothing is persisted, so
 * a reload returns the toggle to its ON default with the connector drawn again.
 */
test('relationship lines can be hidden and shown from the Layers panel (session-only)', async ({
  page,
}) => {
  const { relId } = await seed(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  const linesToggle = page.locator('[data-testid="show-connector-lines-toggle"]');
  const labelsToggle = page.locator('[data-testid="show-connector-labels-toggle"]');

  // 1. Default is ON — the connector draws exactly as it did before the toggle existed.
  await expect
    .poll(() => connectorPoints(page, relId), { timeout: 15_000 })
    .toEqual([200, 160, 400, 300]);
  await expect(linesToggle).toBeChecked();

  // 2. Unchecking removes the connector Arrow from the scene graph entirely (no line, no label,
  // and no buildConnectors pass — the whole ConnectorLayer is unrendered).
  await linesToggle.uncheck();
  await expect.poll(() => connectorPoints(page, relId), { timeout: 15_000 }).toBeNull();

  // 3. Labels are drawn ON the lines, so their toggle is unavailable while lines are hidden.
  await expect(labelsToggle).toBeDisabled();

  // 4. Re-checking restores the connector at the same image-space-anchored endpoints.
  await linesToggle.check();
  await expect
    .poll(() => connectorPoints(page, relId), { timeout: 15_000 })
    .toEqual([200, 160, 400, 300]);
  await expect(labelsToggle).toBeEnabled();

  // 5. Session-only: a reload returns the toggle to ON and the connector is drawn — the hidden
  // state was never written to mapAppearance, db.meta, or the MapDoc.
  await linesToggle.uncheck();
  await expect.poll(() => connectorPoints(page, relId), { timeout: 15_000 }).toBeNull();
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-testid="show-connector-lines-toggle"]')).toBeChecked();
  await expect
    .poll(() => connectorPoints(page, relId), { timeout: 15_000 })
    .toEqual([200, 160, 400, 300]);
});

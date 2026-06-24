import { expect, test } from '@playwright/test';

/**
 * MAP-04 — a placed person renders as the signature round avatar marker; dragging it
 * persists the new position to Dexie (proving repository.upsertMarker on dragEnd).
 *
 * The map + person + marker are seeded through the SAME repository the UI uses (window.__rb)
 * so the test exercises the real read path. Drag is performed on the Konva Stage and the
 * persisted x/y is read back after a full page reload.
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

/** Seed one map + one person + one marker at (x,y); returns the marker + person ids. */
async function seed(page: import('@playwright/test').Page, x: number, y: number) {
  return page.evaluate(
    async ({ b64, mx, my }) => {
      const rb = window.__rb!;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      const ref = await rb.storeMedia(blob, { width: 2, height: 2 });
      const map = await rb.createMap({ name: 'm', background: ref, width: 800, height: 600 });
      const person = await rb.createPerson({ name: 'Ada Lovelace' });
      const marker = await rb.upsertMarker({
        mapId: map.id,
        personId: person.id,
        x: mx,
        y: my,
      });
      return { markerId: marker.id, personId: person.id };
    },
    { b64: PNG_BASE64, mx: x, my: y },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await resetDb(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
});

test('a placed person renders a round avatar marker on the Stage', async ({ page }) => {
  await seed(page, 200, 200);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });

  // The Konva Stage canvas is present (the marker is drawn into it).
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // The marker Group exists in the scene graph under its stable name.
  const markerCount = await page.waitForFunction(
    () => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) return false;
      type Node = { name(): string; find(sel: string): Node[] };
      const stage = (Konva.stages as unknown as Node[])[0];
      if (!stage) return false;
      const named = stage.find('Group').filter((g) => g.name().startsWith('marker-'));
      return named.length === 1;
    },
    undefined,
    { timeout: 15_000 },
  );
  expect(markerCount).toBeTruthy();
});

test('dragging the marker persists its new position after reload', async ({ page }) => {
  const { markerId, personId } = await seed(page, 200, 200);
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  await expect(page.locator('[data-testid="map-view"] canvas').first()).toBeVisible({
    timeout: 15_000,
  });

  // Wait until the marker Group is in the scene graph before driving its drag. The marker
  // Group is named by PERSON id (`marker-${personId}`) — see AvatarMarker.
  await page.waitForFunction(
    (pid) => {
      const Konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
      if (!Konva) return false;
      type Node = { name(): string; find(sel: string): Node[] };
      const stage = (Konva.stages as unknown as Node[])[0];
      if (!stage) return false;
      return stage.find('Group').some((g) => g.name() === `marker-${pid}`);
    },
    personId,
    { timeout: 15_000 },
  );

  // Drive the marker's dragEnd through Konva directly: find the Group by name, move it,
  // and fire dragend so the real onDragEnd -> upsertMarker path runs. This is
  // deterministic regardless of devicePixelRatio / Stage transform.
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
    const stages = Konva.stages as unknown as Node[];
    const stage = stages[0];
    const groups = stage.find('Group').filter((g) => g.name() === `marker-${pid}`);
    const group = groups[0];
    group.x(420);
    group.y(330);
    group.fire('dragend', { target: group }, true);
  }, personId);

  // The new position must be persisted to Dexie (read after a full reload).
  await page.reload();
  await page.waitForFunction(() => !!window.__rb, undefined, { timeout: 15_000 });
  const persisted = await page.evaluate(
    (id) => window.__rb!.db.markers.get(id),
    markerId,
  );
  expect(persisted?.x).toBe(420);
  expect(persisted?.y).toBe(330);
});

import { expect, test } from '@playwright/test';

/**
 * quick-260902-nfs — LAYOUT-ONLY box selection and group drag on the relationship graph.
 *
 * The graph gains a rubber-band selection (B1), a native multi-node drag whose per-element
 * `dragfree` is coalesced to ONE position save (B3/D-9), and a modifier-click that extends the
 * selection without opening a profile or re-egoing (B4/D-10). What it must NOT gain is any way to
 * write entity data: the graph is viewer-only by PROJECT.md, so the `graphPositions` meta row stays
 * the only thing any gesture here can touch (T-NFS-05) — asserted below by snapshotting
 * `db.people`, `db.groups` and `db.relationshipLinks` around a multi-node drag.
 *
 * Cytoscape renders to its own canvas, so node geometry is read through the e2e-exposed core
 * (`window.__cyGraph`), while the GESTURES are driven with a real `page.mouse` — they are about
 * physical mouse buttons and modifiers, which a programmatic `.emit()` cannot model. Positions are
 * pinned explicitly (zoom 1 / pan 0, so model coords ARE container px) because `cose` is
 * force-directed and would otherwise place nodes somewhere different on every run.
 */

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

/** Seed two people, a group, and two relationship-links connecting them. Returns node ids. */
async function seedGraph(page: import('@playwright/test').Page) {
  return await page.evaluate(async () => {
    const rb = window.__rb!;
    const alice = await rb.createPerson({ name: 'Alice' });
    const bob = await rb.createPerson({ name: 'Bob' });
    const team = await rb.createGroup({ name: 'Team' });
    await rb.createRelationshipLink({
      name: 'knows',
      label: 'knows',
      fromType: 'people',
      fromId: alice.id,
      toType: 'people',
      toId: bob.id,
      directed: true,
    });
    await rb.createRelationshipLink({
      name: 'member',
      label: 'member of',
      fromType: 'people',
      fromId: alice.id,
      toType: 'groups',
      toId: team.id,
    });
    return { aliceId: alice.id, bobId: bob.id, teamId: team.id };
  });
}

/** Open the graph and wait for the core to carry the seeded nodes. */
async function openGraph(page: import('@playwright/test').Page, probeId: string) {
  await page.getByTestId('view-graph').click();
  await page.waitForFunction(
    (id) => {
      const cy = (
        window as unknown as { __cyGraph?: { getElementById: (i: string) => { length: number } } }
      ).__cyGraph;
      return !!cy && cy.getElementById(id).length > 0;
    },
    probeId,
    { timeout: 15_000 },
  );
}

type CyLite = {
  zoom: (z: number) => void;
  pan: (p: { x: number; y: number }) => void;
  getElementById: (id: string) => {
    position: (p?: { x: number; y: number }) => { x: number; y: number };
    unselect: () => void;
  };
  nodes: () => { unselect: () => void };
  $: (sel: string) => { length: number };
};

/**
 * Pin zoom/pan and place the three nodes at known MODEL coordinates. With zoom 1 and pan {0,0} a
 * model coordinate is exactly a container pixel, so the mouse maths below is direct.
 */
async function pinLayout(
  page: import('@playwright/test').Page,
  ids: { aliceId: string; bobId: string; teamId: string },
) {
  await page.evaluate((n) => {
    const cy = (window as unknown as { __cyGraph: CyLiteRuntime }).__cyGraph;
    cy.zoom(1);
    cy.pan({ x: 0, y: 0 });
    cy.getElementById(n.aliceId).position({ x: 160, y: 160 });
    cy.getElementById(n.bobId).position({ x: 300, y: 160 });
    cy.getElementById(n.teamId).position({ x: 520, y: 380 });
    cy.nodes().unselect();
  }, ids);
}

// The runtime shape used inside page.evaluate (the browser-side `cy` core).
type CyLiteRuntime = CyLite & { nodes: () => { unselect: () => void } };

/** The graph canvas box, for translating container px to page px. */
async function graphBox(page: import('@playwright/test').Page) {
  const canvas = page.locator('[data-testid="graph-view"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  return (await canvas.boundingBox())!;
}

/** How many elements are currently selected in the core. */
async function selectedCount(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const cy = (window as unknown as { __cyGraph: { $: (s: string) => { length: number } } })
      .__cyGraph;
    return cy.$(':selected').length;
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

test('a plain left-drag on empty background rubber-band-selects 2+ nodes', async ({ page }) => {
  const ids = await seedGraph(page);
  await openGraph(page, ids.aliceId);
  await pinLayout(page, ids);

  const box = await graphBox(page);
  expect(await selectedCount(page)).toBe(0);

  // Band from empty background above-left of Alice and Bob, past their far side. The Team node sits
  // well outside at (520,380) so a correct band leaves it alone.
  await page.mouse.move(box.x + 90, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 5 });
  await page.mouse.move(box.x + 380, box.y + 230, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(() => selectedCount(page), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
});

test('dragging one node of a multi-selection moves them all, writes ONE graphPositions row, and mutates no entity table', async ({
  page,
}) => {
  const ids = await seedGraph(page);
  await openGraph(page, ids.aliceId);
  await pinLayout(page, ids);
  const box = await graphBox(page);

  // T-NFS-05: snapshot every entity table BEFORE the gesture.
  const before = await page.evaluate(async () => {
    const rb = window.__rb!;
    return {
      people: JSON.stringify(await rb.db.people.toArray()),
      groups: JSON.stringify(await rb.db.groups.toArray()),
      links: JSON.stringify(await rb.db.relationshipLinks.toArray()),
    };
  });

  // Band Alice + Bob.
  await page.mouse.move(box.x + 90, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 5 });
  await page.mouse.move(box.x + 380, box.y + 230, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => selectedCount(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  // Grab ALICE and drag. Cytoscape collects every selected grabbable node into the drag list, so
  // BOB must travel the same delta natively (verified at cytoscape.cjs.js:26063-26078).
  const DX = 120;
  const DY = 90;
  await page.mouse.move(box.x + 160, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 160 + DX / 2, box.y + 160 + DY / 2, { steps: 5 });
  await page.mouse.move(box.x + 160 + DX, box.y + 160 + DY, { steps: 5 });
  await page.mouse.up();

  // Both moved by approximately the same delta.
  const moved = await page.evaluate((n) => {
    const cy = (
      window as unknown as {
        __cyGraph: { getElementById: (i: string) => { position: () => { x: number; y: number } } };
      }
    ).__cyGraph;
    return {
      alice: cy.getElementById(n.aliceId).position(),
      bob: cy.getElementById(n.bobId).position(),
    };
  }, ids);
  expect(moved.alice.x - 160).toBeCloseTo(DX, -1);
  expect(moved.alice.y - 160).toBeCloseTo(DY, -1);
  expect(moved.bob.x - 300).toBeCloseTo(DX, -1);
  expect(moved.bob.y - 160).toBeCloseTo(DY, -1);

  // The graphPositions meta row reflects the new positions (the ONLY write this gesture makes).
  // expect(async …).toPass, NOT waitForFunction — an async predicate is vacuous there (D77-DEF-1).
  // toPass rather than expect.poll because this assertion carries a numeric TOLERANCE (±12) that
  // toEqual cannot express without silently tightening it.
  await expect(async () => {
    const a = await page.evaluate(async (n) => {
      const row = await window.__rb!.db.meta.get('graphPositions');
      const positions = row?.value as Record<string, { x: number; y: number }> | undefined;
      return positions?.[n.aliceId] ?? null;
    }, ids);
    expect(a).not.toBeNull();
    expect(Math.abs(a!.x - (160 + DX))).toBeLessThanOrEqual(12);
  }).toPass({ timeout: 15_000 });

  // T-NFS-05: every entity table is byte-identical.
  const after = await page.evaluate(async () => {
    const rb = window.__rb!;
    return {
      people: JSON.stringify(await rb.db.people.toArray()),
      groups: JSON.stringify(await rb.db.groups.toArray()),
      links: JSON.stringify(await rb.db.relationshipLinks.toArray()),
    };
  });
  expect(after).toEqual(before);
});

test('a shift-click on a node extends the selection without opening a profile', async ({ page }) => {
  const ids = await seedGraph(page);
  await openGraph(page, ids.aliceId);
  await pinLayout(page, ids);
  const box = await graphBox(page);

  // B4/D-10: the modifier makes this a SELECTION gesture, so the ProfileSidebar must stay closed.
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 160, box.y + 160);
  await page.keyboard.up('Shift');

  await expect(page.getByTestId('profile-sidebar')).toHaveCount(0);
  // …and it really did select the node, rather than doing nothing at all.
  await expect.poll(() => selectedCount(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
});

test('a plain click on a node still opens its profile (no regression)', async ({ page }) => {
  const ids = await seedGraph(page);
  await openGraph(page, ids.aliceId);
  await pinLayout(page, ids);
  const box = await graphBox(page);

  await page.mouse.click(box.x + 160, box.y + 160);

  await expect(page.getByTestId('profile-sidebar')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('profile-name')).toHaveText('Alice');
});

test('an Alt+left-drag pans the graph instead of banding', async ({ page }) => {
  const ids = await seedGraph(page);
  await openGraph(page, ids.aliceId);
  await pinLayout(page, ids);
  const box = await graphBox(page);

  const panBefore = await page.evaluate(
    () => (window as unknown as { __cyGraph: { pan: () => { x: number; y: number } } }).__cyGraph.pan(),
  );

  const DX = 100;
  const DY = 60;
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 90, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 90 + DX / 2, box.y + 90 + DY / 2, { steps: 5 });
  await page.mouse.move(box.x + 90 + DX, box.y + 90 + DY, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');

  const panAfter = await page.evaluate(
    () => (window as unknown as { __cyGraph: { pan: () => { x: number; y: number } } }).__cyGraph.pan(),
  );
  expect(panAfter.x - panBefore.x).toBeCloseTo(DX, -1);
  expect(panAfter.y - panBefore.y).toBeCloseTo(DY, -1);
  // A pan is not a selection.
  expect(await selectedCount(page)).toBe(0);
});

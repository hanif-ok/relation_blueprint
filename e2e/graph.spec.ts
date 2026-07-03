import { expect, test } from '@playwright/test';

/**
 * REL-04 — the viewer-only relationship graph. Seed people + a group + relationship-links
 * through the SAME repository the UI uses (`window.__rb`), open the new "Graph" nav entry,
 * tap a node, and assert its ProfileSidebar opens through the existing selection→AT bridge.
 *
 * The graph is viewer-only (PROJECT.md): nodes cannot be dragged to mutate data
 * (`autoungrabify`), and the surface exposes no relationship add/edit control. Cytoscape
 * renders to its own canvas (like Konva), so node interaction is driven through the exposed
 * `cy` core (`window.__cyGraph`, e2e-only) rather than DOM clicks — mirroring how profile.spec
 * fires Konva marker events.
 */

async function resetDb(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('relation-blueprint');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/** Pre-dismiss the one-time privacy notice so it never blocks the flow. */
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
    return { aliceId: alice.id };
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

test('tapping a graph node opens its ProfileSidebar (viewer-only)', async ({ page }) => {
  const { aliceId } = await seedGraph(page);

  // Open the new Graph view from the left-nav rail.
  await page.getByTestId('view-graph').click();

  // The Cytoscape core is exposed for e2e once the graph mounts and lays out.
  await page.waitForFunction(
    (id) => {
      const cy = (window as unknown as { __cyGraph?: { getElementById: (i: string) => { length: number } } })
        .__cyGraph;
      return !!cy && cy.getElementById(id).length > 0;
    },
    aliceId,
    { timeout: 15_000 },
  );

  // Fire a tap on Alice's node — this drives the cy.on('tap','node') → ProfileSidebar bridge.
  await page.evaluate((id) => {
    const cy = (window as unknown as { __cyGraph: { getElementById: (i: string) => { emit: (e: string) => void } } })
      .__cyGraph;
    cy.getElementById(id).emit('tap');
  }, aliceId);

  const sidebar = page.getByTestId('profile-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Alice');

  // Viewer-only: the tapped node is NOT grabbable (autoungrabify — no data-mutating drag).
  const grabbable = await page.evaluate((id) => {
    const cy = (window as unknown as { __cyGraph: { getElementById: (i: string) => { grabbable: () => boolean } } })
      .__cyGraph;
    return cy.getElementById(id).grabbable();
  }, aliceId);
  expect(grabbable).toBe(false);

  // Viewer-only: the graph surface exposes no relationship add/edit affordance.
  await expect(page.getByTestId('graph-add-relationship')).toHaveCount(0);
  await expect(page.getByTestId('graph-edit-relationship')).toHaveCount(0);
});

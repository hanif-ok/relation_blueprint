import { expect, test } from '@playwright/test';

/**
 * REL-04 — the viewer-only relationship graph. Seed people + a group + relationship-links
 * through the SAME repository the UI uses (`window.__rb`), open the new "Graph" nav entry,
 * tap a node, and assert its ProfileSidebar opens through the existing selection→AT bridge.
 *
 * The graph is viewer-only for RELATIONSHIP editing (PROJECT.md): the surface exposes no
 * relationship add/edit control. POL-02 makes nodes grabbable so the curator can rearrange the
 * LAYOUT — but a drag is layout-only: it persists to the `graphPositions` meta row and NEVER
 * mutates entity data (db.people / db.relationshipLinks stay byte-identical). Adding an entity
 * keeps every saved position and auto-places only the newcomer (D-08); a Reset-layout control
 * clears the saved positions (D-09). Cytoscape renders to its own canvas (like Konva), so node
 * interaction is driven through the exposed `cy` core (`window.__cyGraph`, e2e-only) rather than
 * DOM clicks — mirroring how profile.spec fires Konva marker events. window.__rb / window.__cyGraph
 * are e2e-build-only (run via `npx vite --mode e2e` / build:e2e).
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
    return { aliceId: alice.id, bobId: bob.id, teamId: team.id };
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

  // POL-02: the tapped node IS grabbable now (drag rearranges the layout; tap still selected it).
  const grabbable = await page.evaluate((id) => {
    const cy = (window as unknown as { __cyGraph: { getElementById: (i: string) => { grabbable: () => boolean } } })
      .__cyGraph;
    return cy.getElementById(id).grabbable();
  }, aliceId);
  expect(grabbable).toBe(true);

  // Viewer-only for RELATIONSHIPS: the graph surface exposes no relationship add/edit affordance.
  await expect(page.getByTestId('graph-add-relationship')).toHaveCount(0);
  await expect(page.getByTestId('graph-edit-relationship')).toHaveCount(0);
});

/**
 * POL-02 drag-persist + viewer-only proof: dragging a node persists its new position to the
 * `graphPositions` meta row (dragfree) while leaving every entity row byte-identical.
 */
test('dragging a node persists its position without mutating entity data (viewer-only)', async ({
  page,
}) => {
  const { aliceId } = await seedGraph(page);
  await page.getByTestId('view-graph').click();
  await page.waitForFunction(
    (id) => {
      const cy = (window as unknown as { __cyGraph?: { getElementById: (i: string) => { length: number } } })
        .__cyGraph;
      return !!cy && cy.getElementById(id).length > 0;
    },
    aliceId,
    { timeout: 15_000 },
  );

  // Snapshot the entity tables BEFORE the drag (the viewer-only proof compares byte-for-byte).
  const before = await page.evaluate(async () => {
    const rb = window.__rb!;
    return {
      people: JSON.stringify(await rb.db.people.toArray()),
      links: JSON.stringify(await rb.db.relationshipLinks.toArray()),
    };
  });

  // Move Alice's node to a known spot, then fire `dragfree` (the sticky-persist trigger).
  await page.evaluate((id) => {
    const cy = (window as unknown as {
      __cyGraph: { getElementById: (i: string) => { position: (p: { x: number; y: number }) => void; emit: (e: string) => void } };
    }).__cyGraph;
    const node = cy.getElementById(id);
    node.position({ x: 512, y: 384 });
    node.emit('dragfree');
  }, aliceId);

  // The graphPositions meta row now records Alice at her dragged position.
  await page.waitForFunction(
    (id) => {
      const cy = (window as unknown as {
        __cyGraph: { getElementById: (i: string) => { position: () => { x: number; y: number } } };
      }).__cyGraph;
      const p = cy.getElementById(id).position();
      return Math.round(p.x) === 512 && Math.round(p.y) === 384;
    },
    aliceId,
    { timeout: 15_000 },
  );
  const saved = await page.evaluate(async (id) => {
    const rb = window.__rb!;
    const row = await rb.db.meta.get('graphPositions');
    return (row?.value as Record<string, { x: number; y: number }> | undefined)?.[id];
  }, aliceId);
  expect(saved).toBeDefined();
  expect(Math.round(saved!.x)).toBe(512);
  expect(Math.round(saved!.y)).toBe(384);

  // Viewer-only: dragging mutated NO entity data — people + relationshipLinks are byte-identical.
  const after = await page.evaluate(async () => {
    const rb = window.__rb!;
    return {
      people: JSON.stringify(await rb.db.people.toArray()),
      links: JSON.stringify(await rb.db.relationshipLinks.toArray()),
    };
  });
  expect(after.people).toBe(before.people);
  expect(after.links).toBe(before.links);
});

/**
 * POL-02 Reset layout (D-09/IC-3): clicking "Reset layout" discards the saved manual positions.
 * The escape hatch immediately re-runs a fresh `cose`, so the durable observable is that the saved
 * manual layout is gone (the row is absent at the clear, then regenerated by the fresh cose).
 */
test('Reset layout clears the saved manual positions', async ({ page }) => {
  const { aliceId, bobId, teamId } = await seedGraph(page);

  // Seed a distinctive manual layout for the whole node-set BEFORE opening (allCached → preset).
  const manual = { [aliceId]: { x: 111, y: 222 }, [bobId]: { x: 333, y: 444 }, [teamId]: { x: 555, y: 666 } };
  await page.evaluate(async (value) => {
    await window.__rb!.db.meta.put({ key: 'graphPositions', value });
  }, manual);

  await page.getByTestId('view-graph').click();
  await page.waitForFunction(
    (id) => {
      const cy = (window as unknown as { __cyGraph?: { getElementById: (i: string) => { length: number } } })
        .__cyGraph;
      return !!cy && cy.getElementById(id).length > 0;
    },
    aliceId,
    { timeout: 15_000 },
  );

  await page.getByTestId('graph-reset-layout').click();

  // Reset discards the manual positions — the row is either absent (at the clear) or regenerated by
  // the fresh cose; either way it no longer equals the seeded manual layout.
  await page.waitForFunction(
    async (seeded) => {
      const row = await window.__rb!.db.meta.get('graphPositions');
      const value = row?.value as Record<string, { x: number; y: number }> | undefined;
      return value === undefined || JSON.stringify(value) !== JSON.stringify(seeded);
    },
    manual,
    { timeout: 15_000 },
  );
});

/**
 * POL-02 "Sticky partial cache" (D-08 place-newcomer-only) — the integration proof of GraphView's
 * lock → cose(newcomer) → unlock → save wiring. Seed a manual layout for the existing nodes, add a
 * connected newcomer, open the graph, and assert every existing node stays byte-identical while the
 * newcomer is auto-placed (non-origin, non-colliding).
 */
test('adding an entity keeps saved positions and auto-places only the newcomer (sticky partial cache)', async ({
  page,
}) => {
  const { aliceId, bobId, teamId } = await seedGraph(page);

  // Explicit, well-separated saved positions for the EXISTING node-set (savePositions value shape).
  const cached = {
    [aliceId]: { x: 100, y: 100 },
    [bobId]: { x: 600, y: 100 },
    [teamId]: { x: 350, y: 600 },
  };
  await page.evaluate(async (value) => {
    await window.__rb!.db.meta.put({ key: 'graphPositions', value });
  }, cached);

  // Add a NEW connected person (Carol) with an edge to a fixed anchor (Alice) — the newcomer.
  const carolId = await page.evaluate(async (anchorId) => {
    const rb = window.__rb!;
    const carol = await rb.createPerson({ name: 'Carol' });
    await rb.createRelationshipLink({
      name: 'knows',
      label: 'knows',
      fromType: 'people',
      fromId: carol.id,
      toType: 'people',
      toId: anchorId,
    });
    return carol.id;
  }, aliceId);

  await page.getByTestId('view-graph').click();

  // Wait until Carol exists AND has been placed off the origin (the placement effect has run).
  await page.waitForFunction(
    (id) => {
      const cy = (window as unknown as {
        __cyGraph?: { getElementById: (i: string) => { length: number; position: () => { x: number; y: number } } };
      }).__cyGraph;
      if (!cy || cy.getElementById(id).length === 0) return false;
      const p = cy.getElementById(id).position();
      return Math.abs(p.x) + Math.abs(p.y) > 1;
    },
    carolId,
    { timeout: 15_000 },
  );

  // Read the final live positions of every node.
  const positions = await page.evaluate(
    (ids) => {
      const cy = (window as unknown as {
        __cyGraph: { getElementById: (i: string) => { position: () => { x: number; y: number } } };
      }).__cyGraph;
      const out: Record<string, { x: number; y: number }> = {};
      for (const id of ids) out[id] = cy.getElementById(id).position();
      return out;
    },
    [aliceId, bobId, teamId, carolId],
  );

  // (a) Every existing (locked) node stayed byte-identical to its seeded cached position.
  expect(positions[aliceId]).toEqual(cached[aliceId]);
  expect(positions[bobId]).toEqual(cached[bobId]);
  expect(positions[teamId]).toEqual(cached[teamId]);

  // (b) The newcomer got a non-origin position that collides with no existing (cached) node.
  const carol = positions[carolId];
  expect(Math.abs(carol.x) + Math.abs(carol.y)).toBeGreaterThan(1);
  for (const id of [aliceId, bobId, teamId]) {
    const dist = Math.abs(carol.x - cached[id].x) + Math.abs(carol.y - cached[id].y);
    expect(dist).toBeGreaterThan(1);
  }

  // The re-saved graphPositions row now covers the newcomer too (allCached next open).
  const rowHasCarol = await page.evaluate(async (id) => {
    const row = await window.__rb!.db.meta.get('graphPositions');
    const value = row?.value as Record<string, { x: number; y: number }> | undefined;
    return !!value && Object.prototype.hasOwnProperty.call(value, id);
  }, carolId);
  expect(rowHasCarol).toBe(true);
});

/**
 * POL-03 "Ego focus is transient" (D-10..D-13) — the Pitfall-1 guard proof. Opening the graph, then
 * tapping a node, re-lays the whole graph out concentrically around that ego (focus follows the tap)
 * AND opens its ProfileSidebar (AT bridge preserved). Clicking "Exit focus" restores the EXACT
 * pre-focus base positions, and — crucially — the persisted `graphPositions` meta row is UNCHANGED
 * across the enter-focus → exit-focus cycle (the transient concentric overlay is fenced off the
 * auto-save by suspendSaveRef, so it never clobbers the saved base).
 */
test('ego focus is transient: exit restores the base and never overwrites graphPositions', async ({
  page,
}) => {
  const { aliceId, bobId, teamId } = await seedGraph(page);

  await page.getByTestId('view-graph').click();
  await page.waitForFunction(
    (id) => {
      const cy = (window as unknown as { __cyGraph?: { getElementById: (i: string) => { length: number } } })
        .__cyGraph;
      return !!cy && cy.getElementById(id).length > 0;
    },
    aliceId,
    { timeout: 15_000 },
  );

  // Wait until the initial `cose` has settled AND persisted a graphPositions row (layoutstop saved),
  // so both the node-position snapshot and the meta row below are stable pre-focus baselines.
  await page.waitForFunction(
    async () => {
      const row = await window.__rb!.db.meta.get('graphPositions');
      return row?.value !== undefined;
    },
    undefined,
    { timeout: 15_000 },
  );

  // Snapshot every node's resting position + the persisted meta row BEFORE entering focus.
  const beforePositions = await page.evaluate((ids) => {
    const cy = (window as unknown as {
      __cyGraph: { getElementById: (i: string) => { position: () => { x: number; y: number } } };
    }).__cyGraph;
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of ids) out[id] = cy.getElementById(id).position();
    return out;
  }, [aliceId, bobId, teamId]);
  const beforeMeta = await page.evaluate(async () => {
    const row = await window.__rb!.db.meta.get('graphPositions');
    return JSON.stringify(row?.value ?? null);
  });

  // Tap Bob (a DIFFERENT node) → enter focus + re-ego onto Bob, and open his ProfileSidebar.
  await page.evaluate((id) => {
    const cy = (window as unknown as { __cyGraph: { getElementById: (i: string) => { emit: (e: string) => void } } })
      .__cyGraph;
    cy.getElementById(id).emit('tap');
  }, bobId);

  // AT bridge preserved: tapping Bob during focus still opens his profile.
  await expect(page.getByTestId('profile-sidebar')).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Bob');

  // Exit focus (rendered only while focused) → restore the base.
  await page.getByTestId('graph-exit-focus').click();

  // Every node's position is restored to its exact pre-focus base (discarding nothing).
  await page.waitForFunction(
    (snapshot) => {
      const cy = (window as unknown as {
        __cyGraph: { getElementById: (i: string) => { position: () => { x: number; y: number } } };
      }).__cyGraph;
      return Object.entries(snapshot).every(([id, pos]) => {
        const p = cy.getElementById(id).position();
        return Math.abs(p.x - pos.x) < 0.5 && Math.abs(p.y - pos.y) < 0.5;
      });
    },
    beforePositions,
    { timeout: 15_000 },
  );

  // The Exit-focus control is gone once focus is cleared.
  await expect(page.getByTestId('graph-exit-focus')).toHaveCount(0);

  // Pitfall-1 guard: the persisted graphPositions row is byte-identical across focus → exit — the
  // transient concentric overlay never overwrote the saved base.
  const afterMeta = await page.evaluate(async () => {
    const row = await window.__rb!.db.meta.get('graphPositions');
    return JSON.stringify(row?.value ?? null);
  });
  expect(afterMeta).toBe(beforeMeta);
});

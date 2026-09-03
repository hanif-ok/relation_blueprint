import { expect, test } from '@playwright/test';

/**
 * STOR-06 — PWA install + offline shell (VALIDATION).
 *
 * Automated (this file):
 *   - the web manifest is served at the scoped path with the GitHub Pages start_url/scope,
 *   - the service worker registers and precaches the shell,
 *   - the app shell opens and renders OFFLINE after a first online visit.
 *
 * Manual-only gates (documented, NOT automated — browser/OS-mediated, VALIDATION Manual-Only):
 *   - the real OS "Install app" flow and home-screen launch,
 *   - the browser granting navigator.storage.persist() (engagement-weighted).
 * These are verified by hand during /gsd-verify-work on real hardware.
 */

const SCOPE = '/relation_blueprint/';

test('serves a web manifest scoped to the GitHub Pages subpath', async ({ page, baseURL }) => {
  await page.goto('./');

  // The manifest <link> is present and resolves under the scoped path.
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(manifestHref).toBeTruthy();

  const manifestUrl = new URL(manifestHref!, baseURL).toString();
  const res = await page.request.get(manifestUrl);
  expect(res.ok()).toBeTruthy();

  const manifest = await res.json();
  expect(manifest.name).toBe('Relation Blueprint');
  // start_url and scope MUST be the repo subpath or the SW mis-scopes (RESEARCH Pattern 4).
  expect(manifest.start_url).toBe(SCOPE);
  expect(manifest.scope).toBe(SCOPE);
  expect(manifest.display).toBe('standalone');
});

test('registers a service worker and precaches the shell for offline open', async ({
  page,
  context,
}) => {
  // First online visit — let the SW install and the precache populate.
  await page.goto('./');
  await page.waitForLoadState('networkidle');

  // Wait for the service worker to reach the ACTIVE state (precache ready). In prompt mode
  // the SW does not call clients.claim(), so it does not control THIS page until the next
  // navigation — we wait for `active`, not for `controller`.
  // expect.poll over page.evaluate, NOT waitForFunction — an async predicate is vacuous there
  // (D77-DEF-1). Polling a status STRING names the actual SW state on failure.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'no-serviceworker-api';
          const reg = await navigator.serviceWorker.ready.catch(() => null);
          if (!reg) return 'no-registration';
          return reg.active ? 'active' : 'registered-no-active';
        }),
      { timeout: 30_000 },
    )
    .toBe('active');

  // Reload once (online) so the active SW takes control of the page.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
    timeout: 30_000,
  });

  // Now go offline and reload — the precached shell must still render from the SW.
  await context.setOffline(true);
  await page.reload();

  // The walking-skeleton shell renders the wordmark from the precached bundle.
  await expect(page.getByText('Relation Blueprint')).toBeVisible();

  await context.setOffline(false);
});

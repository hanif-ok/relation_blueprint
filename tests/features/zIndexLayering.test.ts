// Regression guard for the "browse chrome paints over the profile modal" bug
// (.planning/debug/resolved/map-canvas-over-profile-modal.md).
//
// Root cause: the Radix Dialog.Portal modals (EntityForm, PersonForm, PrivacyNotice,
// ConfirmDialog, FieldManager, PhotoLightbox) set `position: fixed` with NO z-index, so
// in the shared root stacking context the browse `.header` (title + A–Z sorter) and
// overflow `.menu` — both positive-z chrome — painted ON TOP of them.
//
// jsdom does not lay out or paint CSS-module stylesheets, so real stacking cannot be
// asserted at runtime. Instead this locks the fix into the CSS SOURCE: (1) the shared
// z-index scale in tokens.css is ordered so a modal outranks every chrome layer, and
// (2) every modal overlay + panel/content declares `var(--z-modal)`. Dropping the token
// from any modal — the exact regression — fails this test.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Read a repo-root-relative source file. Vitest runs from the repo root (process.cwd()). */
function read(relFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), relFromRoot), 'utf8');
}

/** Numeric value of a `--token: N;` custom property declared in tokens.css. */
function tokenValue(css: string, name: string): number {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(\\d+)\\s*;`));
  if (!m) throw new Error(`z-index token --${name} not found in tokens.css`);
  return Number(m[1]);
}

/** Body of the first `.selector { ... }` rule (selectors here are simple + unique per file). */
function ruleBody(css: string, selector: string): string {
  const m = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`selector .${selector} not found`);
  return m[1];
}

const tokens = read('src/app/tokens.css');

describe('z-index scale (tokens.css) is ordered chrome < panel < modal < toast', () => {
  const sticky = tokenValue(tokens, 'z-sticky');
  const chrome = tokenValue(tokens, 'z-chrome');
  const menu = tokenValue(tokens, 'z-menu');
  const popover = tokenValue(tokens, 'z-popover');
  const popoverContent = tokenValue(tokens, 'z-popover-content');
  const panel = tokenValue(tokens, 'z-panel');
  const modal = tokenValue(tokens, 'z-modal');
  const toast = tokenValue(tokens, 'z-toast');

  it('layers ascend: sticky < chrome < menu < popover < popover-content < panel < modal < toast', () => {
    expect(sticky).toBeLessThan(chrome);
    expect(chrome).toBeLessThan(menu);
    expect(menu).toBeLessThan(popover);
    expect(popover).toBeLessThan(popoverContent);
    expect(popoverContent).toBeLessThan(panel);
    expect(panel).toBeLessThan(modal);
    expect(modal).toBeLessThan(toast);
  });

  it('the load-bearing invariant: a modal outranks every chrome/panel layer that used to cover it', () => {
    const highestChrome = Math.max(sticky, chrome, menu, popover, popoverContent, panel);
    expect(modal).toBeGreaterThan(highestChrome);
  });

  it('the profile sidebar (panel tier) clears chrome but stays below the dialogs it spawns', () => {
    expect(panel).toBeGreaterThan(menu); // no longer painted over by the browse header/sorter in list context
    expect(panel).toBeLessThan(modal); // Edit / Delete / Lightbox opened from it still land on top
  });
});

describe('every Radix Dialog.Portal modal declares the modal z-index on its scrim + surface', () => {
  // file → the two rules that must carry var(--z-modal): the overlay (scrim) and the panel/content.
  const MODALS: Array<{ file: string; surfaces: [string, string] }> = [
    { file: 'src/features/entity-form/EntityForm.module.css', surfaces: ['overlay', 'panel'] },
    { file: 'src/features/person-form/PersonForm.module.css', surfaces: ['overlay', 'panel'] },
    { file: 'src/features/onboarding/PrivacyNotice.module.css', surfaces: ['overlay', 'content'] },
    { file: 'src/features/common/ConfirmDialog.module.css', surfaces: ['overlay', 'content'] },
    { file: 'src/features/fields/FieldManager.module.css', surfaces: ['overlay', 'panel'] },
    { file: 'src/features/profile/PhotoLightbox.module.css', surfaces: ['overlay', 'content'] },
  ];

  it.each(MODALS)('$file overlay + surface carry var(--z-modal)', ({ file, surfaces }) => {
    const css = read(file);
    for (const surface of surfaces) {
      expect(
        ruleBody(css, surface),
        `${file} .${surface} must declare z-index: var(--z-modal) or browse chrome paints over it`,
      ).toMatch(/z-index:\s*var\(--z-modal\)/);
    }
  });
});

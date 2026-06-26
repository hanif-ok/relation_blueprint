// 02-UAT test 5: every ViewSwitcher item must expose an accessible name (aria-label) so the
// icon-only narrow rail stays labelled for assistive tech. `getByRole('button', { name })` resolves
// against the computed ACCESSIBLE NAME (the aria-label here), so these assertions prove the name is
// present in the a11y tree — independent of whether a visible label or a hover tooltip is shown.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewSwitcher } from '@/features/nav/ViewSwitcher';

describe('ViewSwitcher accessible names', () => {
  it('exposes an accessible name on every view + tool item', () => {
    render(
      <ViewSwitcher
        active="map"
        onSelectView={() => {}}
        onOpenFields={() => {}}
        onOpenPrivacy={() => {}}
      />,
    );

    for (const name of ['Map', 'People', 'Locations', 'Groups', 'Relationship-links']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Fields' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About and Privacy' })).toBeTruthy();
  });

  it('gives every item a hover title tooltip so icon-only mode is discoverable (F-3)', () => {
    render(
      <ViewSwitcher
        active="map"
        onSelectView={() => {}}
        onOpenFields={() => {}}
        onOpenPrivacy={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Map' }).getAttribute('title')).toBe('Map');
    expect(screen.getByRole('button', { name: 'People' }).getAttribute('title')).toBe('People');
    expect(screen.getByRole('button', { name: 'Relationship-links' }).getAttribute('title')).toBe(
      'Relationship-links',
    );
    expect(screen.getByRole('button', { name: 'Fields' }).getAttribute('title')).toBe('Fields');
    expect(screen.getByRole('button', { name: 'About and Privacy' }).getAttribute('title')).toBe(
      'About / Privacy',
    );
  });
});

// F-2: SetAsideNote renders a muted, reassuring note for each quarantined ("set aside") value on a
// field — naming the value and the field type to switch back to in order to recover it. It renders
// nothing when there is nothing set aside, so it is safe to drop under every field.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { quarantineKey } from '@/db/repository';
import { SetAsideNote } from '@/features/fields/SetAsideNote';

describe('SetAsideNote', () => {
  it('shows a recover note naming the value and the type to switch back to', () => {
    const custom = { [quarantineKey('f1', 'text')]: 'hello' };
    render(<SetAsideNote custom={custom} fieldId="f1" />);

    const note = screen.getByTestId('set-aside-note');
    expect(note.textContent).toContain('hello');
    expect(note.textContent).toContain('Text');
    expect(note.textContent?.toLowerCase()).toContain('set aside');
  });

  it('lists each set-aside value across multiple hops', () => {
    const custom = {
      [quarantineKey('f1', 'text')]: 'hello',
      [quarantineKey('f1', 'number')]: 5,
    };
    render(<SetAsideNote custom={custom} fieldId="f1" />);

    const note = screen.getByTestId('set-aside-note');
    expect(note.textContent).toContain('hello');
    expect(note.textContent).toContain('5');
  });

  it('renders nothing when there are no set-aside values', () => {
    const { container } = render(<SetAsideNote custom={{ f1: 'live' }} fieldId="f1" />);
    expect(container.querySelector('[data-testid="set-aside-note"]')).toBeNull();
  });
});

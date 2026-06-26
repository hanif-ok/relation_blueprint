// F-2: a reader that surfaces the set-aside (quarantined) originals for one field from an entity's
// custom map, so the UI can reassure the curator that a vanished value is recoverable (not lost).
// It is the inverse of quarantineKey: parse `__quarantine:<fieldId>:<sourceType>` keys back into
// {sourceType, value} entries — ignoring the live value and other fields' quarantine keys.

import { describe, expect, it } from 'vitest';
import { quarantineKey, quarantinedEntriesFor } from '@/db/repository';

describe('quarantinedEntriesFor', () => {
  it('returns each set-aside original for a field, ignoring the live value and other fields', () => {
    const custom = {
      f1: 5,
      [quarantineKey('f1', 'text')]: 'hello',
      [quarantineKey('f1', 'phone')]: '123',
      [quarantineKey('f2', 'text')]: 'other-field',
    };
    const entries = quarantinedEntriesFor(custom, 'f1');
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual({ sourceType: 'text', value: 'hello' });
    expect(entries).toContainEqual({ sourceType: 'phone', value: '123' });
  });

  it('returns [] when the field has no set-aside values', () => {
    expect(quarantinedEntriesFor({ f1: 'live' }, 'f1')).toEqual([]);
    expect(quarantinedEntriesFor({}, 'f1')).toEqual([]);
  });

  it('skips empty (null) set-aside slots', () => {
    const custom = { [quarantineKey('f1', 'text')]: null };
    expect(quarantinedEntriesFor(custom, 'f1')).toEqual([]);
  });
});

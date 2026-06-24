// EXPT-01 — export bundle contents. The export Blob is a self-contained JSON backup that
// MUST carry `schemaVersion`, the manifest, every entity array, and every media blob as
// base64. These assertions lock the bundle shape the importer (and any future tool) relies on.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { exportDb } from '@/features/backup/exportDb';
import { generateDbFixture } from '../_fixtures/generateDbFixture';

beforeEach(async () => {
  await generateDbFixture(4);
});

describe('exportDb (EXPT-01 self-contained backup)', () => {
  it('returns a JSON Blob whose parsed body carries schemaVersion + manifest + entities + media', async () => {
    const blob = await exportDb();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('application/json');

    const parsed = JSON.parse(await blob.text());

    expect(typeof parsed.schemaVersion).toBe('number');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.manifest).toBeTypeOf('object');

    expect(Array.isArray(parsed.entities.people)).toBe(true);
    expect(Array.isArray(parsed.entities.maps)).toBe(true);
    expect(Array.isArray(parsed.entities.markers)).toBe(true);

    // Every seeded entity is present.
    expect(parsed.entities.people).toHaveLength(await db.people.count());
    expect(parsed.entities.maps).toHaveLength(await db.maps.count());
    expect(parsed.entities.markers).toHaveLength(await db.markers.count());
  });

  it('encodes every media blob as a base64 string keyed by content hash', async () => {
    const blob = await exportDb();
    const parsed = JSON.parse(await blob.text());

    const mediaCount = await db.media.count();
    expect(Object.keys(parsed.media)).toHaveLength(mediaCount);

    for (const [hash, b64] of Object.entries(parsed.media)) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof b64).toBe('string');
      // Valid base64 (no data-URL prefix, JSON-safe).
      expect(b64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    }
  });
});

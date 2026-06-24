// Deterministic in-memory database generator for the export/restore round-trip property
// test (EXPT-02). Seeds N people (with the DATA-02 fields), one map, one marker per person,
// and attaches the two real sample PNGs as content-addressed media — so the round trip has
// genuine photo bytes to prove survive byte-for-byte (Pitfall 6, "export theater").
//
// The two sample PNGs are read from disk as real image bytes; the byte-equality assertion in
// roundtrip.test.ts compares the restored media ArrayBuffers against these exact bytes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/db/schema';
import { createMap, createPerson, putMedia, upsertMarker } from '@/db/repository';
import { buildMediaRef } from '@/media/mediaManager';
import type { MediaRef } from '@/domain/types';

const PNG_MIME = 'image/png';

/** The two real sample photos, read as raw bytes so byte-equality is meaningful. */
function readSample(name: 'sample-photo-a.png' | 'sample-photo-b.png'): Uint8Array<ArrayBuffer> {
  // Vitest runs from the repo root; the fixtures live beside this generator.
  const path = join(process.cwd(), 'tests', '_fixtures', name);
  const buf = readFileSync(path);
  // Copy into a fresh, plain ArrayBuffer so the bytes are a valid BlobPart.
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

export interface SeededDb {
  /** The MediaRefs of the two sample photos that were attached, in order. */
  photoRefs: MediaRef[];
  /** Raw bytes of each sample photo, for byte-equality assertions. */
  photoBytes: Uint8Array[];
}

/**
 * Wipe every table, then seed `count` people (each with one of the two sample photos as their
 * avatar, alternating), one map (its background is the first sample photo), and one marker per
 * person on that map. Returns the sample photo refs + raw bytes for the round-trip assertions.
 */
export async function generateDbFixture(count = 6): Promise<SeededDb> {
  await Promise.all([
    db.people.clear(),
    db.maps.clear(),
    db.markers.clear(),
    db.media.clear(),
    db.meta.clear(),
  ]);

  const samples = [readSample('sample-photo-a.png'), readSample('sample-photo-b.png')];
  const blobs = samples.map((bytes) => new Blob([bytes], { type: PNG_MIME }));
  const refs = await Promise.all(blobs.map((b) => buildMediaRef(b)));
  // Persist the two media blobs once (content-addressed; idempotent).
  await Promise.all(refs.map((ref, i) => putMedia(ref, blobs[i])));

  // One map whose background is the first sample photo.
  const map = await createMap({
    name: 'Test Map',
    background: refs[0],
    width: 800,
    height: 600,
  });

  for (let i = 0; i < count; i++) {
    const photo = refs[i % 2];
    const person = await createPerson({
      name: `Person ${i}`,
      photo,
      phone: `555-000${i}`,
      description: `Description for person ${i}`,
      tags: [`tag-${i}`, 'shared'],
      notes: `Notes ${i}`,
      gallery: [refs[(i + 1) % 2]],
    });
    await upsertMarker({
      mapId: map.id,
      personId: person.id,
      x: (i + 1) * 10,
      y: (i + 1) * 20,
    });
  }

  return { photoRefs: refs, photoBytes: samples };
}

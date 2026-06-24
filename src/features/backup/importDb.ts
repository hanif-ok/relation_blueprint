// Restore a backup bundle into Dexie — VALIDATED and ALL-OR-NOTHING (EXPT-02 / T-07-01/02).
//
// Two non-negotiable safety properties:
//   1. The bundle is parsed through `BackupSchema` BEFORE any table is touched. A foreign or
//      corrupt file (bad JSON, missing fields) throws here and the current DB is untouched
//      (RESEARCH ## Security Domain V5; threat T-07-01).
//   2. The clear + restore runs inside ONE `db.transaction('rw', ...)`. A failure mid-restore
//      rolls the whole thing back — there is no partial-clobber state (threat T-07-02).
//
// Media mime recovery: the bundle stores media as { <hash>: base64 } (no mime — the bytes are
// the identity). The MIME for each blob is recovered from the MediaRefs on the entities that
// reference it (person.photo/gallery, map.background); an unreferenced blob defaults to a
// generic binary type. The raw BYTES are restored byte-for-byte regardless of mime.

import { db } from '@/db/schema';
import { BackupSchema } from '@/domain/schemas';
import type { MediaRecord } from '@/db/schema';
import type { Backup, MediaRef } from '@/domain/types';
import { base64ToBytes } from './base64';

const DEFAULT_MIME = 'application/octet-stream';

/** Build a hash -> mime lookup from every MediaRef carried on the bundle's entities. */
function collectMimes(bundle: Backup): Map<string, string> {
  const mimes = new Map<string, string>();
  const add = (ref?: MediaRef) => {
    if (ref && !mimes.has(ref.hash)) mimes.set(ref.hash, ref.mime);
  };
  for (const person of bundle.entities.people) {
    add(person.photo);
    for (const g of person.gallery) add(g);
  }
  for (const map of bundle.entities.maps) add(map.background);
  return mimes;
}

/**
 * Validate `file` as a backup bundle and, on success, replace the entire local database with
 * its contents inside a single atomic transaction. Throws (leaving current data untouched) if
 * the file is not a valid Relation Blueprint backup.
 */
export async function importDb(file: Blob): Promise<void> {
  // STEP 1 — validate the untrusted file BEFORE any write. `JSON.parse` throws on non-JSON;
  // `BackupSchema.parse` throws (ZodError) on a foreign/corrupt-but-valid-JSON file. Either
  // way we bail out here, before the transaction, so the current DB is never touched.
  const raw: unknown = JSON.parse(await file.text());
  const bundle: Backup = BackupSchema.parse(raw);

  const mimes = collectMimes(bundle);
  const mediaRecords: MediaRecord[] = Object.entries(bundle.media).map(([hash, b64]) => ({
    hash,
    bytes: base64ToBytes(b64),
    mime: mimes.get(hash) ?? DEFAULT_MIME,
  }));

  // STEP 2 — atomic replace-all. Clear then bulkPut every table in ONE rw transaction; if any
  // write throws, Dexie rolls the whole transaction back (no partial restore — T-07-02).
  await db.transaction('rw', db.people, db.maps, db.markers, db.media, async () => {
    await Promise.all([
      db.people.clear(),
      db.maps.clear(),
      db.markers.clear(),
      db.media.clear(),
    ]);
    await Promise.all([
      db.people.bulkPut(bundle.entities.people),
      db.maps.bulkPut(bundle.entities.maps),
      db.markers.bulkPut(bundle.entities.markers),
      db.media.bulkPut(mediaRecords),
    ]);
  });
}

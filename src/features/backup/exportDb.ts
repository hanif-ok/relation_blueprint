// Export the WHOLE database as a single self-contained backup file (EXPT-01). The cloud is
// the only durable copy in v1, so this portable file is the user's escape hatch — it bundles
// every entity AND every media blob (base64) into one JSON document that `importDb` can
// losslessly restore (proven by the round-trip property test).
//
// Bundle shape (locked by BackupSchema):
//   { schemaVersion, manifest,
//     entities: { people, maps, markers, groups, 'relationship-links' },
//     fieldDefs, media: { <hash>: base64 } }
// Custom-field VALUES ride on each entity's `custom` map (so the entity arrays carry them);
// the field DEFINITIONS travel in their own `fieldDefs` slot so a restored DB renders them.
//
// `schemaVersion` is the bundle's OWN format version (1) — distinct from the cloud manifest's
// `version`. Media is base64-embedded here (the skeleton format); a zip/fflate container is a
// flagged scale fast-follow, NOT this phase.

import { db } from '@/db/schema';
import type { Backup, Manifest } from '@/domain/types';
import { bytesToBase64 } from './base64';

/** The backup-bundle format version. Bump when the on-disk bundle shape changes. */
export const BACKUP_SCHEMA_VERSION = 1;

const JSON_TYPE = 'application/json';

/** ISO date (YYYY-MM-DD) for the suggested download filename. */
export function backupFilename(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `relation-blueprint-backup-${yyyy}-${mm}-${dd}.json`;
}

/**
 * A self-describing manifest for the export. The cloud manifest (Plan 05) is only meaningful
 * against a provider; a local export carries a minimal v0 manifest so the bundle is
 * schema-complete and importable on a device that has never synced. Shard pointers are empty
 * strings (no cloud files) — the entities themselves travel inline in `entities`.
 */
function localManifest(now: number): Manifest {
  const emptyPointer = { fileId: '', hash: '', updatedAt: 0 };
  return {
    version: 0,
    updatedAt: now,
    shards: {
      people: { ...emptyPointer },
      maps: { ...emptyPointer },
      markers: { ...emptyPointer },
      groups: { ...emptyPointer },
      'relationship-links': { ...emptyPointer },
    },
  };
}

/**
 * Read every entity + every media blob from Dexie and bundle them into a portable JSON Blob.
 * Media bytes are base64-encoded so photos survive the round trip byte-for-byte.
 */
export async function exportDb(): Promise<Blob> {
  const [people, maps, markers, groups, relationshipLinks, fieldDefs, mediaRows] = await Promise.all([
    db.people.toArray(),
    db.maps.toArray(),
    db.markers.toArray(),
    db.groups.toArray(),
    db.relationshipLinks.toArray(),
    db.fieldDefs.toArray(),
    db.media.toArray(),
  ]);

  const media: Record<string, string> = {};
  for (const row of mediaRows) {
    media[row.hash] = bytesToBase64(row.bytes);
  }

  const bundle: Backup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    manifest: localManifest(Date.now()),
    entities: { people, maps, markers, groups, 'relationship-links': relationshipLinks },
    fieldDefs,
    media,
  };

  return new Blob([JSON.stringify(bundle)], { type: JSON_TYPE });
}

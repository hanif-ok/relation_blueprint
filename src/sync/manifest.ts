// Manifest read/write — the manifest is the SINGLE trusted index of the cloud database and
// the SINGLE commit point of the atomic swap (RESEARCH ## Pattern 2). Two safety rules live
// here:
//
//   1. READ is validated. The manifest is untrusted-at-rest (threat T-05-02): a corrupt or
//      truncated manifest must be rejected, not silently trusted. `readManifest` runs the
//      bytes through `ManifestSchema.parse`, so a missing shard pointer or invalid JSON throws
//      and the engine can fall back to a rolling backup.
//
//   2. WRITE keeps a rolling backup. Before the canonical manifest is overwritten (the commit),
//      `writeManifestWithBackup` copies the CURRENT manifest to `backups/manifest-<prevVersion>.json`.
//      If the overwrite is interrupted, the last-good manifest is recoverable from that backup.
//      `rollBackups` trims the backup folder to the most recent `keep` versions.

import { ManifestSchema } from '@/domain/schemas';
import type { StorageProvider } from '@/storage/StorageProvider';
import type { Manifest } from '@/domain/types';

const JSON_TYPE = 'application/json';

/** Name of the folder (under the app folder) holding rolling manifest backups. */
export const BACKUPS_FOLDER = 'backups';

/** Read the canonical manifest file and validate it with `ManifestSchema` (rejects bad data). */
export async function readManifest(provider: StorageProvider, manifestFileId: string): Promise<Manifest> {
  const blob = await provider.readFile(manifestFileId);
  const raw: unknown = JSON.parse(await blob.text());
  // .parse throws ZodError on a missing/invalid field — the engine treats that as "manifest
  // corrupt, fall back to a backup" rather than loading a partial DB.
  return ManifestSchema.parse(raw);
}

/**
 * Commit-time manifest write with a rolling backup. BEFORE overwriting the canonical manifest
 * in place (the single commit point), the current manifest bytes are copied to
 * `backups/manifest-<currentVersion>.json`. Only after the backup exists is the manifest
 * overwritten with `next`. Callers run {@link rollBackups} afterwards to bound retention.
 */
export async function writeManifestWithBackup(
  provider: StorageProvider,
  folderId: string,
  manifestFileId: string,
  next: Manifest,
): Promise<void> {
  // Snapshot the CURRENT manifest (the version being superseded) into the backups folder.
  const currentBlob = await provider.readFile(manifestFileId);
  const current: unknown = JSON.parse(await currentBlob.text());
  const prevVersion = ManifestSchema.parse(current).version;

  const backupsFolder = await provider.ensureFolder(BACKUPS_FOLDER, folderId);
  await provider.writeFile(
    `manifest-${prevVersion}.json`,
    backupsFolder,
    new Blob([JSON.stringify(current)], { type: JSON_TYPE }),
    JSON_TYPE,
  );

  // THE COMMIT: overwrite the canonical manifest in place. This is the only `overwriteFile`
  // call in the whole commit sequence; everything else is a new immutable file.
  await provider.overwriteFile(
    manifestFileId,
    new Blob([JSON.stringify(next)], { type: JSON_TYPE }),
    JSON_TYPE,
  );
}

/**
 * Trim the backups folder to the most recent `keep` manifest backups (by version number
 * parsed from the file name). Run AFTER a successful commit — never delete backups before the
 * manifest is safely written.
 */
export async function rollBackups(provider: StorageProvider, folderId: string, keep = 5): Promise<void> {
  const backupsFolder = await provider.ensureFolder(BACKUPS_FOLDER, folderId);
  const entries = await provider.list(backupsFolder);

  const versioned = entries
    .map((e) => ({ id: e.id, version: parseBackupVersion(e.name) }))
    .filter((e): e is { id: string; version: number } => e.version !== null)
    .sort((a, b) => a.version - b.version);

  // Delete everything except the newest `keep` (the tail of the ascending-sorted list).
  const toDelete = versioned.slice(0, Math.max(0, versioned.length - keep));
  for (const entry of toDelete) {
    await provider.delete(entry.id);
  }
}

/** Parse the version number from a `manifest-<n>.json` backup name; null if it doesn't match. */
function parseBackupVersion(name: string): number | null {
  const match = /^manifest-(\d+)\.json$/.exec(name);
  return match ? Number(match[1]) : null;
}

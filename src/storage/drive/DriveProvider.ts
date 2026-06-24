// DriveProvider — the live Google Drive backend behind the proven StorageProvider seam.
//
// It does NOTHING the sync engine (Plan 05) can observe differently from the InMemoryProvider:
// it implements the SAME interface and passes the SAME conformance contract. That is the whole
// point of the abstraction — the corruption-proof commit logic runs against real Drive unchanged.
//
// `writeFile` -> createFile (a NEW immutable file). `overwriteFile` -> the manifest PATCH (the
// sole commit point). All REST specifics + token handling live in `driveRest` / `auth`.

import type { FileEntry, StorageProvider } from '../StorageProvider';
import * as driveRest from './driveRest';

/** Map a Drive REST file resource onto the provider-agnostic FileEntry shape. */
function toEntry(file: driveRest.DriveFile): FileEntry {
  return {
    id: file.id,
    name: file.name,
    size: file.size ? Number(file.size) : 0,
    modifiedAt: file.modifiedTime ? Date.parse(file.modifiedTime) : 0,
  };
}

export class DriveProvider implements StorageProvider {
  async ensureFolder(name: string, parentId?: string): Promise<string> {
    return driveRest.ensureFolder(name, parentId);
  }

  async list(folderId: string): Promise<FileEntry[]> {
    return (await driveRest.list(folderId)).map(toEntry);
  }

  async readFile(fileId: string): Promise<Blob> {
    return driveRest.readFile(fileId);
  }

  async writeFile(name: string, parentId: string, body: Blob, contentType: string): Promise<string> {
    // New immutable file — distinct id every call (immutable-new-file semantic).
    return driveRest.createFile(name, parentId, body, contentType);
  }

  async overwriteFile(fileId: string, body: Blob, contentType: string): Promise<void> {
    // In-place overwrite — used ONLY for the manifest commit point.
    return driveRest.overwriteFile(fileId, body, contentType);
  }

  async delete(fileId: string): Promise<void> {
    return driveRest.deleteFile(fileId);
  }

  async stat(fileId: string): Promise<FileEntry> {
    return toEntry(await driveRest.stat(fileId));
  }
}

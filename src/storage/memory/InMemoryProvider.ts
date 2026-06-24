// In-memory fake implementing StorageProvider. This is the interface LOCK: if a method
// signature drifts, this file (and its conformance test) stop compiling. The sync engine
// (Plan 05) and the Drive adapter (Plan 06) are tested/built against the same contract.
//
// No network, no persistence — everything lives in two Maps for the lifetime of the
// instance. Folder ids are content-derived (name+parent) so `ensureFolder` is idempotent;
// file ids are unique per `writeFile` call so writes are immutable-new-file by default.

import { nanoid } from 'nanoid';
import type { FileEntry, StorageProvider } from '../StorageProvider';

interface StoredFile {
  name: string;
  parentId: string;
  body: Blob;
  contentType: string;
  modifiedAt: number;
}

const ROOT = 'root';

export class InMemoryProvider implements StorageProvider {
  /** fileId -> stored file. */
  private readonly files = new Map<string, StoredFile>();
  /** folderId -> { name, parentId } for listing/idempotency. */
  private readonly folders = new Map<string, { name: string; parentId: string }>();

  private folderId(name: string, parentId: string): string {
    // Deterministic id so the SAME name+parent always resolves to the SAME folder.
    return `folder:${parentId}/${name}`;
  }

  async ensureFolder(name: string, parentId: string = ROOT): Promise<string> {
    const id = this.folderId(name, parentId);
    if (!this.folders.has(id)) {
      this.folders.set(id, { name, parentId });
    }
    return id;
  }

  async list(folderId: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    for (const [id, folder] of this.folders) {
      if (folder.parentId === folderId) {
        entries.push({ id, name: folder.name, size: 0, modifiedAt: 0 });
      }
    }
    for (const [id, file] of this.files) {
      if (file.parentId === folderId) {
        entries.push({ id, name: file.name, size: file.body.size, modifiedAt: file.modifiedAt });
      }
    }
    return entries;
  }

  async readFile(fileId: string): Promise<Blob> {
    const file = this.files.get(fileId);
    if (!file) throw new Error(`InMemoryProvider: no file with id ${fileId}`);
    return file.body;
  }

  async writeFile(name: string, parentId: string, body: Blob, contentType: string): Promise<string> {
    // New immutable file: fresh id every call, even for the same name.
    const id = `file:${nanoid()}`;
    this.files.set(id, { name, parentId, body, contentType, modifiedAt: Date.now() });
    return id;
  }

  async overwriteFile(fileId: string, body: Blob, contentType: string): Promise<void> {
    const existing = this.files.get(fileId);
    if (!existing) throw new Error(`InMemoryProvider: cannot overwrite missing file ${fileId}`);
    // In-place: same id, replaced content.
    this.files.set(fileId, { ...existing, body, contentType, modifiedAt: Date.now() });
  }

  async delete(fileId: string): Promise<void> {
    this.files.delete(fileId);
  }

  async stat(fileId: string): Promise<FileEntry> {
    const file = this.files.get(fileId);
    if (!file) throw new Error(`InMemoryProvider: no file with id ${fileId}`);
    return { id: fileId, name: file.name, size: file.body.size, modifiedAt: file.modifiedAt };
  }
}

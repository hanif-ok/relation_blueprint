// The single provider-agnostic seam every storage backend implements. Locked here in
// Plan 02 against the InMemoryProvider fake; Plan 05 (sync engine) and Plan 06 (Drive
// adapter) target these signatures and MUST NOT change them without a coordinated bump.
//
// Both Google Drive and Mega reduce to a flat folder/file store, so the interface speaks
// only in folder ids, file ids, and Blobs.

/** A file or folder entry as returned by `list`/`stat`. */
export interface FileEntry {
  id: string;
  name: string;
  /** Byte size of the file content (0 for folders). */
  size: number;
  /** Epoch ms of the last modification. */
  modifiedAt: number;
}

export interface StorageProvider {
  /**
   * Idempotently ensure a folder named `name` exists under `parentId` (or the root when
   * omitted) and return its id. Calling twice with the same `name`/`parentId` returns the
   * SAME id — never a duplicate.
   */
  ensureFolder(name: string, parentId?: string): Promise<string>;

  /** List the files/folders directly inside `folderId`. */
  list(folderId: string): Promise<FileEntry[]>;

  /** Read the bytes of `fileId` as a Blob. */
  readFile(fileId: string): Promise<Blob>;

  /**
   * Create a NEW immutable file and return its id. Each call creates a distinct file
   * (distinct id) even with the same name — this is the immutable-new-file semantic the
   * atomic manifest-swap relies on.
   */
  writeFile(name: string, parentId: string, body: Blob, contentType: string): Promise<string>;

  /**
   * Overwrite the content of an existing `fileId` in place. ONLY used for the small
   * manifest commit point; everything else uses `writeFile` to stay immutable.
   */
  overwriteFile(fileId: string, body: Blob, contentType: string): Promise<void>;

  /** Delete a file by id. */
  delete(fileId: string): Promise<void>;

  /** Return metadata for a single file id. */
  stat(fileId: string): Promise<FileEntry>;
}

// A StorageProvider decorator that throws at a chosen commit-step boundary, used to PROVE
// the atomic manifest-swap is incorruptible (STOR-05). It wraps any real provider (the
// InMemoryProvider in tests) and is configured with a `throwAt` set of step labels; when a
// decorated operation matches a label in that set, it throws a synthetic `InjectedFailure`
// INSTEAD of delegating — simulating a crash / 401 / quota error / dropped network at that
// exact point in the commit sequence.
//
// `implements StorageProvider` is load-bearing: the decorator preserves the interface so the
// sync engine cannot tell it apart from a real provider (the whole point — atomicity must
// hold against the same seam Plan 06's Drive adapter will fill).

import type { FileEntry, StorageProvider } from '@/storage/StorageProvider';

/** Thrown by the decorator when a fault is injected; identifiable so tests can assert on it. */
export class InjectedFailure extends Error {
  constructor(public readonly step: StepLabel) {
    super(`InjectedFailure at step: ${step}`);
    this.name = 'InjectedFailure';
  }
}

/**
 * Step boundaries of the commit sequence (RESEARCH ## Pattern 2). The engine writes shard/
 * media files first (`writeFile:*`), reads the current manifest for the backup
 * (`readFile:manifest`), writes the backup (`writeFile:backup`), then overwrites the manifest
 * (`overwriteFile:manifest`) — the single true commit. Faults injected at any boundary BEFORE
 * `overwriteFile:manifest` must leave the canonical manifest untouched.
 */
export type StepLabel =
  | 'writeFile:shard'
  | 'writeFile:media'
  | 'writeFile:backup'
  | 'readFile:manifest'
  | 'overwriteFile:manifest'
  | 'delete'; // GC of orphans — must only run after a successful commit.

export interface FaultConfig {
  /** The set of step labels at which to throw. */
  throwAt: Set<StepLabel>;
  /**
   * When set, throw only on the Nth matching call to that label (1-based). Lets a test inject
   * a fault "after writing shard 1, before shard 2" precisely. Omit to throw on the first match.
   */
  occurrence?: number;
}

/** Wrap a provider so it throws an `InjectedFailure` at the configured commit-step boundary. */
export class FaultInjectingProvider implements StorageProvider {
  private readonly counts = new Map<StepLabel, number>();

  constructor(
    private readonly inner: StorageProvider,
    private readonly config: FaultConfig,
  ) {}

  private maybeThrow(label: StepLabel): void {
    if (!this.config.throwAt.has(label)) return;
    const next = (this.counts.get(label) ?? 0) + 1;
    this.counts.set(label, next);
    const target = this.config.occurrence ?? 1;
    if (next === target) throw new InjectedFailure(label);
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    return this.inner.ensureFolder(name, parentId);
  }

  async list(folderId: string): Promise<FileEntry[]> {
    return this.inner.list(folderId);
  }

  async readFile(fileId: string): Promise<Blob> {
    // The engine reads the canonical manifest right before backing it up; that's the
    // `readFile:manifest` boundary. Other reads (pull-on-open) are not commit steps.
    this.maybeThrow('readFile:manifest');
    return this.inner.readFile(fileId);
  }

  async writeFile(name: string, parentId: string, body: Blob, contentType: string): Promise<string> {
    if (name.startsWith('manifest-')) this.maybeThrow('writeFile:backup');
    else if (name.startsWith('media/') || parentId.includes('media')) this.maybeThrow('writeFile:media');
    else this.maybeThrow('writeFile:shard');
    return this.inner.writeFile(name, parentId, body, contentType);
  }

  async overwriteFile(fileId: string, body: Blob, contentType: string): Promise<void> {
    this.maybeThrow('overwriteFile:manifest');
    return this.inner.overwriteFile(fileId, body, contentType);
  }

  async delete(fileId: string): Promise<void> {
    this.maybeThrow('delete');
    return this.inner.delete(fileId);
  }

  async stat(fileId: string): Promise<FileEntry> {
    return this.inner.stat(fileId);
  }
}

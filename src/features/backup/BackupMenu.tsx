// S5 — Export / Restore overflow menu (UI-SPEC S5 + Destructive actions A11).
//
// The overflow ⋯ menu (Radix DropdownMenu, for correct roving focus / arrow-keys / Esc) hosts:
//   • "Export backup" → saves `relation-blueprint-backup-YYYY-MM-DD.json` (inline "Preparing
//     backup…" spinner while bundling, then the toast "Backup saved.").
//   • "Restore backup" → file picker → the DESTRUCTIVE ConfirmDialog (restore replaces the
//     whole local DB; an accidental restore must not silently wipe unsynced local work — A11).
//     On confirm → importDb; success toast "Backup restored."; on a zod/parse failure → an
//     error dialog with the exact UI-SPEC copy, current data left untouched.

import { useCallback, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import confirmStyles from '@/features/common/ConfirmDialog.module.css';
import { backupFilename, exportDb } from './exportDb';
import { importDb } from './importDb';
import styles from './BackupMenu.module.css';

const RESTORE_INVALID_MESSAGE =
  "This file isn't a Relation Blueprint backup, or it's damaged. Your current data is untouched.";

export function BackupMenu() {
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4000);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const blob = await exportDb();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Backup saved.');
    } finally {
      setExporting(false);
    }
  }, [showToast]);

  // "Restore backup" opens the OS file picker; selecting a file stashes it and opens the
  // destructive confirm (the import itself only runs after the user confirms).
  const handleRestoreClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // Reset the input so re-picking the same file re-fires change.
    e.target.value = '';
    if (!file) return;
    pendingFileRef.current = file;
    setConfirmOpen(true);
  }, []);

  const handleConfirmRestore = useCallback(() => {
    const file = pendingFileRef.current;
    pendingFileRef.current = null;
    if (!file) return;
    void (async () => {
      try {
        await importDb(file);
        showToast('Backup restored.');
      } catch {
        // zod/parse failure: the DB was left untouched by importDb (validation runs first).
        setErrorOpen(true);
      }
    })();
  }, [showToast]);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={styles.trigger}
            aria-label="More actions"
            data-testid="overflow-menu"
          >
            ⋯
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
            <DropdownMenu.Item
              className={styles.item}
              disabled={exporting}
              data-testid="export-backup"
              onSelect={(e) => {
                e.preventDefault();
                void handleExport();
              }}
            >
              Export backup
              {exporting && <span className={styles.spinner}>Preparing backup…</span>}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.item}
              data-testid="restore-backup"
              onSelect={(e) => {
                e.preventDefault();
                handleRestoreClick();
              }}
            >
              Restore backup
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Hidden file input driving the restore picker. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="restore-file-input"
        onChange={handleFileChosen}
      />

      {/* Destructive restore confirmation (UI-SPEC A11 — exact copy). */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Restore from backup?"
        body="This replaces everything currently in this app with the contents of the backup file. Export your current data first if you want to keep it."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRestore}
      />

      {/* Restore-invalid error dialog (zod fail) — current data untouched. */}
      <Dialog.Root open={errorOpen} onOpenChange={setErrorOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={confirmStyles.overlay} />
          <Dialog.Content className={confirmStyles.content} data-testid="restore-error">
            <Dialog.Title className={confirmStyles.title}>Restore failed</Dialog.Title>
            <Dialog.Description asChild>
              <p className={styles.dialogError}>{RESTORE_INVALID_MESSAGE}</p>
            </Dialog.Description>
            <div className={confirmStyles.actions}>
              <Dialog.Close asChild>
                <button type="button" className={confirmStyles.cancel}>
                  OK
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && (
        <div role="status" aria-live="polite" className={styles.toast} data-testid="backup-toast">
          {toast}
        </div>
      )}
    </>
  );
}

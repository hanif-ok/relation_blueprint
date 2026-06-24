// ConfirmDialog — a reusable destructive-confirmation dialog built on Radix Dialog.
//
// Radix gives us a correct accessible modal (focus trap, Esc-to-close, focus return) with
// NO visual template — all styling comes from our tokens. Per UI-SPEC accessibility, the
// SAFE action (Cancel) takes initial focus on a destructive dialog, so an accidental
// Enter never destroys data.

import { useId, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  /** Destructive (brick) action label. */
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          // Initial focus lands on the safe Cancel button (UI-SPEC accessibility).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <Dialog.Title id={titleId} className={styles.title}>
            {title}
          </Dialog.Title>
          <Dialog.Description id={bodyId} className={styles.body}>
            {body}
          </Dialog.Description>
          <div className={styles.actions}>
            <Dialog.Close asChild>
              <button type="button" className={styles.cancel} ref={cancelRef}>
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={styles.confirm}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

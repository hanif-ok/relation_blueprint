// PrivacyNotice — the one-time dismissible privacy/sensitivity notice (S20, D-19). A Radix
// Dialog (paper, elevation-2, radius-md) with the exact UI-SPEC copy and a single NEUTRAL
// "Got it" dismiss (acknowledgement, not creation — never amber). Focus-trapped, Esc = dismiss,
// focus returns to a stable anchor (Radix handles focus-return to the trigger).
//
// It shows automatically on first run (first provider connect OR first entity creation,
// whichever comes first) when the dismissal flag is absent; once dismissed it never auto-shows
// again. The nav "About / Privacy" item re-opens the same dialog any time (re-view) WITHOUT
// rewriting the flag. The host (App) owns the open state + the meta-flag persistence.

import { useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import styles from './PrivacyNotice.module.css';

export interface PrivacyNoticeProps {
  open: boolean;
  /** Raised when the user dismisses (Got it / Esc / backdrop). */
  onDismiss: () => void;
}

export const PRIVACY_TITLE = 'A note on the people you record.';
export const PRIVACY_BODY =
  "This app stores everything in your own Google Drive — there's no server and no one else can see it. Even so, you're keeping records about real people. Record only what you have a good reason to, and keep your backups private.";

export function PrivacyNotice({ open, onDismiss }: PrivacyNoticeProps) {
  const titleId = useId();
  const bodyId = useId();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          data-testid="privacy-notice"
        >
          <Dialog.Title id={titleId} className={styles.title}>
            {PRIVACY_TITLE}
          </Dialog.Title>
          <Dialog.Description id={bodyId} className={styles.body}>
            {PRIVACY_BODY}
          </Dialog.Description>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.dismiss}
              data-testid="privacy-dismiss"
              onClick={onDismiss}
            >
              Got it
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// PhotoLightbox (S18, D-20) — a full-viewport dark-scrim overlay that opens any gallery
// photo (or a custom Photo-field thumbnail) full-size. Built on Radix Dialog for the free
// focus-trap / Esc / focus-return guarantees (mirrors ConfirmDialog).
//
// Contract (S18):
//   * Dark scrim is the slate canvas color (#1B2230) at ~92% — via the shared token, not
//     generic black.
//   * prev/next (ChevronLeft / ChevronRight) + close (X), all paper-colored ≥44px glyph
//     buttons with an amber focus ring. Mono index caption "{n} / {total}" bottom-center.
//   * Keyboard: ←/→ navigate, Esc closes; focus trapped while open (Radix); on dismiss Radix
//     returns focus to the trigger thumbnail.
//   * At a boundary prev/next are DISABLED-with-state (never a dead no-op) — v1 does not wrap.
//   * Single photo: prev/next hidden; only close.
//   * NO zoom/pan (deferred to Phase 3 Konva work, D-20).
//   * States: loading full-res = centered quiet shimmer (never a blank flash); decode error =
//     paper line "This photo couldn't be opened." + close.
//   * Respects prefers-reduced-motion (no slide transition when reduced — handled in CSS).
//
// Leak discipline (T-03-07, prohibition): exactly one full-res object URL is held at a time;
// it is revoked on photo change / unmount via the established resolveMediaUrl lifecycle.
// Security (T-03-01): the caption renders index text as React children — never innerHTML.

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { resolveMediaUrl } from '@/media/mediaManager';
import type { MediaRef } from '@/domain/types';
import styles from './PhotoLightbox.module.css';

export interface PhotoLightboxProps {
  /** The ordered photos to page through (the gallery array, or a single-photo array). */
  photos: MediaRef[];
  /** The index currently displayed. */
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Page to another index (prev/next + arrow keys). */
  onIndexChange: (index: number) => void;
}

/** The full-res load result: a usable object URL, or a decode/missing error. */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' };

/**
 * Resolve the current photo full-res, holding exactly ONE object URL at a time and revoking
 * it on change/unmount (no leak — T-03-07). A null resolution (unknown hash) OR an <img>
 * decode failure surfaces the decode-error state (T-03-02), never a crash or blank flash.
 */
function useFullRes(hash: string | undefined): [LoadState, () => void] {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    setState({ status: 'loading' });
    void Promise.resolve(hash ? resolveMediaUrl(hash) : null).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      current = u;
      setState(u ? { status: 'ready', url: u } : { status: 'error' });
    });
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [hash]);
  // Caller signals a decode failure on a resolved-but-undecodable blob.
  const markDecodeError = () => setState({ status: 'error' });
  return [state, markDecodeError];
}

export function PhotoLightbox({
  photos,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: PhotoLightboxProps) {
  const total = photos.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const current = photos[safeIndex];
  const [load, markDecodeError] = useFullRes(open ? current?.hash : undefined);

  const hasMultiple = total > 1;
  const atFirst = safeIndex <= 0;
  const atLast = safeIndex >= total - 1;

  // Arrow-key navigation. Esc + focus-trap + focus-return are owned by Radix Dialog; we only
  // add ←/→ paging while the overlay is open. At a boundary the move is a no-op AND the on-screen
  // control is disabled-with-state, so neither path is a dead no-op (S18).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && !atFirst) {
        e.preventDefault();
        onIndexChange(safeIndex - 1);
      } else if (e.key === 'ArrowRight' && !atLast) {
        e.preventDefault();
        onIndexChange(safeIndex + 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, atFirst, atLast, safeIndex, onIndexChange]);

  if (total === 0) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Dark scrim — the slate canvas token (#1B2230) at ~92%, NOT generic black (U7). */}
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-label="Photo viewer"
          data-testid="photo-lightbox"
          // Focus-return to the originating thumbnail is owned by the host (ProfileSidebar) so it
          // lands on the exact tile even after paging — prevent Radix from also moving focus.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Radix requires a title for a11y; visually hidden so the image stays the focus. */}
          <Dialog.Title className={styles.srOnly}>Photo viewer</Dialog.Title>

          <div className={styles.stage}>
            {load.status === 'loading' && (
              <span className={styles.shimmer} aria-hidden="true" data-testid="lightbox-loading" />
            )}
            {load.status === 'error' && (
              <p className={styles.decodeError} data-testid="lightbox-error">
                This photo couldn&apos;t be opened.
              </p>
            )}
            {load.status === 'ready' && (
              <img
                src={load.url}
                alt=""
                className={styles.image}
                data-testid="lightbox-image"
                onError={markDecodeError}
              />
            )}
          </div>

          {/* prev / next — hidden entirely for a single photo; disabled-with-state at a boundary. */}
          {hasMultiple && (
            <button
              type="button"
              className={`${styles.nav} ${styles.prev}`}
              aria-label="Previous photo"
              data-testid="lightbox-prev"
              disabled={atFirst}
              onClick={() => !atFirst && onIndexChange(safeIndex - 1)}
            >
              <ChevronLeft size={28} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          {hasMultiple && (
            <button
              type="button"
              className={`${styles.nav} ${styles.next}`}
              aria-label="Next photo"
              data-testid="lightbox-next"
              disabled={atLast}
              onClick={() => !atLast && onIndexChange(safeIndex + 1)}
            >
              <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
            </button>
          )}

          {/* Close — top-right, paper glyph. */}
          <Dialog.Close asChild>
            <button
              type="button"
              className={`${styles.nav} ${styles.close}`}
              aria-label="Close"
              data-testid="lightbox-close"
            >
              <X size={26} strokeWidth={2} aria-hidden="true" />
            </button>
          </Dialog.Close>

          {/* Mono index caption, bottom-center — paper text on the scrim. */}
          <p className={styles.caption} data-testid="lightbox-caption">
            {safeIndex + 1} / {total}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

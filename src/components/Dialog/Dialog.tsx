/**
 * A small modal dialog.
 *
 * Built on the native `<dialog>` element, which brings the focus trap, the
 * Escape key, inertness of the page behind it and the top layer for free —
 * all of which are easy to reimplement badly.
 *
 * The specification asks for a lightweight modal rather than a browser
 * confirmation box, and this is the lightest one that is still correct.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';

interface Props {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  /** Rendered in the footer, in reading order. */
  readonly actions: ReactNode;
  readonly onClose: () => void;
}

export function Dialog({ open, title, children, actions, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    // Fires for the Escape key as well as for close(), so the parent's state
    // cannot drift out of step with what is on screen.
    const handleClose = () => onClose();
    element.addEventListener('close', handleClose);
    return () => element.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      className={styles.dialog}
      ref={dialog}
      aria-labelledby="dialog-title"
      // Clicking the backdrop dismisses it; clicks inside the panel must not.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <h2 className={styles.title} id="dialog-title">
          {title}
        </h2>
        <div className={styles.body}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </dialog>
  );
}

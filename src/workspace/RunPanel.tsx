/**
 * The Run controls and the status region beneath them.
 *
 * Status is announced through a polite live region rather than shouted, and
 * errors are shown inline with the technical detail folded away. No browser
 * dialogs: an alert would interrupt, and there is nothing here worth
 * interrupting for.
 */

import { useState } from 'react';
import { type WorkspaceState, describeStatus } from './workspaceState';
import styles from './RunPanel.module.css';

interface Props {
  readonly state: WorkspaceState;
  readonly onRun: () => void;
  readonly onStop: () => void;
  readonly onResetCode: () => void;
}

export function RunPanel({ state, onRun, onStop, onResetCode }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const running = state.status === 'running';

  return (
    <div className={styles.panel}>
      <div className={styles.actions}>
        {running ? (
          <button type="button" className={styles.stop} onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" className={styles.run} onClick={onRun}>
            Run
            <kbd className={styles.shortcut}>{shortcutLabel()}</kbd>
          </button>
        )}
      </div>

      {/*
        Polite, so it waits for a natural pause rather than cutting across
        whatever the user is reading. The container is always present: a live
        region added to the page at the same moment as its text is often not
        announced at all.
      */}
      <p className={styles.status} role="status" aria-live="polite" data-status={state.status}>
        {describeStatus(state)}
      </p>

      {state.error !== null && (
        <div className={styles.error} role="alert">
          <p className={styles.errorMessage}>{state.error.message}</p>

          <div className={styles.errorActions}>
            <button type="button" className={styles.link} onClick={onResetCode}>
              Reset code
            </button>
            {state.error.detail !== undefined && (
              <>
                <button
                  type="button"
                  className={styles.link}
                  aria-expanded={detailOpen}
                  onClick={() => setDetailOpen((open) => !open)}
                >
                  {detailOpen ? 'Hide details' : 'Details'}
                </button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    void navigator.clipboard?.writeText(state.error?.detail ?? '');
                  }}
                >
                  Copy error
                </button>
              </>
            )}
          </div>

          {detailOpen && state.error.detail !== undefined && (
            <pre className={styles.detail}>{state.error.detail}</pre>
          )}
        </div>
      )}

      {state.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {state.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The modifier key this platform actually uses.
 *
 * Read from the user agent because there is no way to ask the keyboard. It
 * only affects a hint, so being wrong is cosmetic.
 */
function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+Enter';
  const platform = navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad/u.test(platform) ? '⌘↵' : 'Ctrl+↵';
}

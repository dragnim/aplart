/**
 * The Run controls and the status region beneath them.
 *
 * Progress is announced through a polite live region rather than shouted, and
 * errors are shown inline with the technical detail folded away. No browser
 * dialogs: a modal would interrupt, and nothing here is worth interrupting for.
 *
 * A failure is the one thing that does speak up, and it speaks exactly once: the
 * error below is an assertive alert, and the polite region falls silent while it
 * is showing so that one failure is not announced twice.
 */

import { useState } from 'react';
import { type WorkspaceState, describeStatus } from './workspaceState';
import styles from './RunPanel.module.css';

interface Props {
  readonly state: WorkspaceState;
  readonly onRun: () => void;
  readonly onStop: () => void;
  readonly onResetCode: () => void;
  /** Runs a particular source, for retrying the attempt that failed. */
  readonly onRetry: (source: string) => void;
}

export function RunPanel({ state, onRun, onStop, onResetCode, onRetry }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const running = state.status === 'running';

  /*
   * Offered only when it would do something Run would not.
   *
   * A banded run can fail seconds after it was submitted, and the editor may
   * have moved on since. Retrying means retrying what failed; Run means running
   * what is written now. When those are the same string there is one action, so
   * showing two controls for it would invent a distinction that is not there.
   */
  const failedSource = state.error?.source;
  const retryable = failedSource !== undefined && failedSource !== state.code;

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
      <p
        className={styles.status}
        role="status"
        /*
         * Silent on failure, because the alert below is the announcement.
         *
         * Shortening this region's text to "Run failed." stopped the detailed
         * message being read out twice, but two live regions still changed at
         * once, so a single failure arrived as two announcements. An explicit
         * `off` overrides the politeness `role="status"` implies, which leaves
         * the assertive alert as the only region that speaks. The text stays on
         * screen: it is a visible state cue, not an announcement.
         */
        aria-live={state.status === 'error' ? 'off' : 'polite'}
        data-status={state.status}
      >
        {describeStatus(state)}
      </p>

      {state.error !== null && (
        <div className={styles.error} role="alert">
          <p className={styles.errorMessage}>{state.error.message}</p>

          <div className={styles.errorActions}>
            {retryable && (
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  onRetry(failedSource);
                }}
              >
                Try that run again
              </button>
            )}
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

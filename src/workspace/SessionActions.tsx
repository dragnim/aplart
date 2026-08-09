/**
 * What you can do to the artwork, whichever way you are editing it.
 *
 * These three belong to the artwork rather than to any one editing mode, and
 * they are the three that change it: make it something else, take that back, or
 * put it back to the preset's own. They sit beneath every mode and stay put as
 * the tab changes.
 *
 * What is deliberately not here. Share and Export act on the artwork as an
 * *output* and live in the toolbar above, where they belong to the piece rather
 * than to the editing of it; offering them in both places made two of the four
 * controls here duplicates of controls already on screen. Save image is gone
 * outright — it wrote a 1024px PNG through the same function Export calls, with
 * none of the size, caption or composition choices, so it was Export with the
 * choices taken away. And Run is a Code idea: it means "run this source", and
 * putting it here would suggest the other modes need pressing too, which they do
 * not, because a control applies itself.
 */

import styles from './SessionActions.module.css';

interface Props {
  readonly onRandomise: () => void;
  readonly onUndo: () => void;
  /** What Undo would take back, or null when there is nothing behind you. */
  readonly undoLabel: string | null;
  readonly onReset: () => void;
  /** False when the artwork is already the preset's own, in source and appearance. */
  readonly canReset: boolean;
}

export function SessionActions({ onRandomise, onUndo, undoLabel, onReset, canReset }: Props) {
  return (
    <div className={styles.actions} aria-label="Artwork actions" role="group">
      <button type="button" className={styles.primary} onClick={onRandomise}>
        Randomise
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={onUndo}
        disabled={undoLabel === null}
        /*
         * "Undo" plus what it would take back, so a screen reader user knows what
         * is behind them without having to try it. The visible word is still the
         * first word of the name, which is what keeps voice control working.
         */
        aria-label={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
      >
        Undo
      </button>
      {/*
        No confirmation. It used to ask, because it could not be taken back;
        it is now one entry in the same history as everything else, so asking
        would be a dialog guarding an action with an Undo button beside it.
      */}
      <button type="button" className={styles.action} onClick={onReset} disabled={!canReset}>
        Reset
      </button>
    </div>
  );
}

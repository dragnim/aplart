/**
 * What you can do to the artwork, whichever way you are editing it.
 *
 * These four belong to the session rather than to any one editing mode: saving a
 * picture is not a Create idea, and Undo is least useful in the tab you happen to
 * be looking at. They sat inside the Create controls while Create was the only
 * panel; now that there are four, they sit beneath all of them and stay put as
 * the tab changes.
 *
 * Run is deliberately absent. It means "run this source", which is a Code idea,
 * and putting it here would suggest the other tabs need pressing too — they do
 * not, because a control applies itself.
 */

import styles from './SessionActions.module.css';

interface Props {
  readonly onRandomise: () => void;
  readonly onUndo: () => void;
  /** What Undo would take back, or null when there is nothing behind you. */
  readonly undoLabel: string | null;
  readonly onSaveImage: () => void;
  readonly onShare: () => void;
  /** False before the first artwork exists, when there is nothing to save. */
  readonly canSave: boolean;
}

export function SessionActions({ onRandomise, onUndo, undoLabel, onSaveImage, onShare, canSave }: Props) {
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
      <button type="button" className={styles.action} onClick={onSaveImage} disabled={!canSave}>
        Save image
      </button>
      <button type="button" className={styles.action} onClick={onShare}>
        Share
      </button>
    </div>
  );
}

/**
 * What the selected cell holds.
 *
 * Sits over the artwork rather than in the controls, because it answers a
 * question asked by pressing the artwork — and because that is the only place it
 * can be in Focus mode without opening the drawer to read it.
 *
 * One live region, not two. The whole-view note and the cell reading are never
 * shown together: pressing a cell replaces the note with something more
 * specific, which is also why the note is not announced again on every press.
 */

import { type CellReading } from '@/matrix/matrixInspection';
import { type ValueNotes } from '@/presets/schema';
import styles from './ValueInspector.module.css';

interface Props {
  readonly reading: CellReading | null;
  /** Present only when the whole result is at the ceiling and nothing is chosen. */
  readonly viewNote: string | null;
  readonly notes: ValueNotes | undefined;
  /** The ceiling as the visible code currently sets it, if it says. */
  readonly ceiling: number | null;
  /**
   * Whether the values name kinds rather than measure something.
   *
   * A tiling's numbers are labels: tile class 1 is not more than tile class 0,
   * it is a different shape. "The largest value in this artwork" is true of it
   * and tells nobody anything, so magnitude is left unsaid. How many cells share
   * it still matters — that is how common the shape is.
   */
  readonly categorical: boolean;
  readonly onDismiss: () => void;
}

/** Rounded for reading. A float cell is a measurement, not an identifier. */
function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function describeShare(reading: CellReading): string {
  if (reading.matching === 1) return 'The only cell with this value.';

  const percent = (100 * reading.matching) / reading.total;
  // Below a tenth of a percent, a rounded figure reads as zero and says nothing.
  const share = percent < 0.1 ? 'fewer than 0.1%' : `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
  return `${reading.matching.toLocaleString()} cells share it — ${share} of the artwork.`;
}

export function ValueInspector({ reading, viewNote, notes, ceiling, categorical, onDismiss }: Props) {
  if (reading === null && viewNote === null) return null;

  return (
    <div className={styles.panel} role="status">
      {reading === null ? (
        <p className={styles.note}>{viewNote}</p>
      ) : (
        <>
          <div className={styles.header}>
            <p className={styles.position}>
              Row {reading.row}, column {reading.column}
            </p>
            <button type="button" className={styles.dismiss} onClick={onDismiss}>
              {/* Named for what it does, not marked with a glyph the label has to explain. */}
              Clear
            </button>
          </div>

          <p className={styles.value}>{formatValue(reading.value)}</p>
          <p className={styles.detail}>{describeShare(reading)}</p>

          {reading.isMaximum && notes !== undefined && ceiling !== null && (
            <p className={styles.detail}>{notes.cellAtCeiling.replace('{ceiling}', String(ceiling))}</p>
          )}

          {!categorical && reading.isMaximum && notes === undefined && (
            <p className={styles.detail}>The largest value in this artwork.</p>
          )}
          {!categorical && reading.isMinimum && !reading.isMaximum && (
            <p className={styles.detail}>The smallest value in this artwork.</p>
          )}
        </>
      )}
    </div>
  );
}

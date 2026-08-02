/**
 * What the selected cell holds.
 *
 * Sits over the artwork rather than in the controls, because it answers a
 * question asked by pressing the artwork — and because that is the only place it
 * can be in Focus mode without opening the drawer to read it.
 *
 * One live region, announcing one purpose-written sentence. The visible layout
 * is hidden from assistive technology instead of being read out as it falls: a
 * heading, a button label and three separate paragraphs are a poor way to hear
 * "row four, column seven, value seventeen". The whole-view note and the cell
 * reading share that region rather than having one each, because they answer the
 * same question at different precisions and only one is ever shown.
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

function ceilingNote(
  reading: CellReading,
  notes: ValueNotes | undefined,
  ceiling: number | null,
): string | null {
  if (!reading.isMaximum || notes === undefined || ceiling === null) return null;
  return notes.cellAtCeiling.replace('{ceiling}', String(ceiling));
}

function extentNote(
  reading: CellReading,
  notes: ValueNotes | undefined,
  categorical: boolean,
): string | null {
  if (categorical || notes !== undefined) return null;
  if (reading.isMaximum) return 'The largest value in this artwork.';
  if (reading.isMinimum) return 'The smallest value in this artwork.';
  return null;
}

export function ValueInspector({ reading, viewNote, notes, ceiling, categorical, onDismiss }: Props) {
  if (reading === null && viewNote === null) return null;

  const extra =
    reading === null
      ? null
      : (ceilingNote(reading, notes, ceiling) ?? extentNote(reading, notes, categorical));

  const spoken =
    reading === null
      ? (viewNote ?? '')
      : [
          `Row ${reading.row}, column ${reading.column}.`,
          `Value ${formatValue(reading.value)}.`,
          describeShare(reading),
          extra,
        ]
          .filter((part) => part !== null)
          .join(' ');

  return (
    <div className={styles.panel}>
      <p className={styles.spoken} role="status">
        {spoken}
      </p>

      {reading === null ? (
        <p className={styles.note} aria-hidden="true">
          {viewNote}
        </p>
      ) : (
        <>
          <div className={styles.header}>
            <p className={styles.position} aria-hidden="true">
              Row {reading.row}, column {reading.column}
            </p>
            {/* Outside the hidden layout: a control has to stay reachable. */}
            <button type="button" className={styles.dismiss} onClick={onDismiss}>
              Clear
            </button>
          </div>

          <div aria-hidden="true">
            <p className={styles.value}>{formatValue(reading.value)}</p>
            <p className={styles.detail}>{describeShare(reading)}</p>
            {extra !== null && <p className={styles.detail}>{extra}</p>}
          </div>
        </>
      )}
    </div>
  );
}

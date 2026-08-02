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
import { type PanelCorner } from './readingPlacement';
import { type ValueNotes } from '@/presets/schema';
import { bandCountFor, bandNumberFor } from '@/renderer/escapeColouring';
import { type EscapeSettings } from './escapeSettings';
import styles from './ValueInspector.module.css';

interface Props {
  readonly reading: CellReading | null;
  /** Present only when the whole result is at the ceiling and nothing is chosen. */
  readonly viewNote: string | null;
  readonly notes: ValueNotes | undefined;
  /** The ceiling as the visible code currently sets it, if it says. */
  readonly ceiling: number | null;
  /** Present only for a preset that declares the range its values come from. */
  readonly escape?: EscapeSettings | undefined;
  /**
   * Whether the values name kinds rather than measure something.
   *
   * A tiling's numbers are labels: tile class 1 is not more than tile class 0,
   * it is a different shape. "The largest value in this artwork" is true of it
   * and tells nobody anything, so magnitude is left unsaid. How many cells share
   * it still matters — that is how common the shape is.
   */
  readonly categorical: boolean;
  /**
   * Which corner to sit in, chosen furthest from what was selected.
   *
   * A reading that covers the cell it is describing makes somebody dismiss it
   * to see the thing they just asked about, which is the whole of the problem.
   */
  readonly corner: PanelCorner;
  /** Hides the reading and keeps the selection and its markers. */
  readonly onHide: () => void;
  /** Removes the selection entirely. A different act, so a different control. */
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

/**
 * Whether the cell holds the largest value the calculation could produce.
 *
 * The declared ceiling when the preset states one, and the largest value in
 * this particular result otherwise. The difference matters: a view where
 * nothing reaches the limit still has a largest value, and describing that cell
 * as having "reached the maximum of 28 iterations" would be a claim about a
 * point that escaped perfectly well.
 */
function atCeiling(reading: CellReading, escape: EscapeSettings | undefined): boolean {
  if (escape === undefined) return reading.isMaximum;
  return reading.value >= escape.range.max;
}

function ceilingNote(
  reading: CellReading,
  notes: ValueNotes | undefined,
  ceiling: number | null,
  escape: EscapeSettings | undefined,
): string | null {
  if (!atCeiling(reading, escape)) {
    /*
     * The counterpart, and worth stating rather than leaving to inference: it
     * says what the number means without claiming anything about the set. The
     * count ran out for some points and not for others, and that is all either
     * of these sentences asserts.
     */
    return escape === undefined ? null : 'Escaped before the iteration limit.';
  }
  if (notes === undefined || ceiling === null) return null;
  return notes.cellAtCeiling.replace('{ceiling}', String(ceiling));
}

/**
 * Which colour band the cell fell into, when the mode has bands.
 *
 * The same arithmetic the renderer used, not a second description of it — so a
 * reader can tell two cells apart by their number when the colours are close,
 * and can see why two cells that look identical are identical.
 */
function bandNote(reading: CellReading, escape: EscapeSettings | undefined): string | null {
  if (escape === undefined) return null;
  const band = bandNumberFor(reading.value, escape.range, escape.colouring, escape.entries);
  const count = bandCountFor(escape.colouring, escape.entries);
  if (band === null || count === null) return null;
  return `Colour band ${String(band)} of ${String(count)}.`;
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

export function ValueInspector({
  reading,
  viewNote,
  notes,
  ceiling,
  escape,
  categorical,
  corner,
  onHide,
  onDismiss,
}: Props) {
  if (reading === null && viewNote === null) return null;

  /*
   * The raw value is never one of these. It is shown on its own, always, in
   * every mode — the colouring is a reading of the number and the number is
   * what the APL produced, so it is the one thing that cannot be replaced by a
   * description of it.
   */
  const extras =
    reading === null
      ? []
      : [
          ceilingNote(reading, notes, ceiling, escape),
          bandNote(reading, escape),
          extentNote(reading, notes, categorical),
        ].filter((part) => part !== null);

  const spoken =
    reading === null
      ? (viewNote ?? '')
      : [
          `Row ${reading.row}, column ${reading.column}.`,
          `Value ${formatValue(reading.value)}.`,
          describeShare(reading),
          ...extras,
        ].join(' ');

  return (
    <div className={styles.panel} data-corner={corner}>
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
            {/*
              Two different acts, so two controls. Hiding puts the reading away
              and leaves the cell chosen and marked; clearing gives the cell up.
              One button doing both meant somebody who only wanted to see what
              was underneath lost their selection for it.
            */}
            <div className={styles.actions}>
              <button type="button" className={styles.dismiss} onClick={onHide}>
                Hide
              </button>
              <button type="button" className={styles.dismiss} onClick={onDismiss}>
                Clear
              </button>
            </div>
          </div>

          <div aria-hidden="true">
            <p className={styles.value}>{formatValue(reading.value)}</p>
            <p className={styles.detail}>{describeShare(reading)}</p>
            {extras.map((part) => (
              <p key={part} className={styles.detail}>
                {part}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

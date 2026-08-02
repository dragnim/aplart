/**
 * Reading one cell out of a matrix, and saying something useful about it.
 *
 * Nothing here knows what any particular artwork's numbers mean. It reports the
 * value, where it sits in the range, and how many other cells hold the same
 * thing — which is what turns "28" into "28, like every other point in this
 * view", the difference between a number and an explanation.
 *
 * Counting the matches is a full pass over the matrix, so it happens once when a
 * cell is chosen and never while the pointer is moving.
 */

import { type MatrixStats } from './matrixStats';
import { type NumericMatrix } from './matrixTypes';

export interface CellReading {
  /** One-based, the way APL indexes and the way the code reads. */
  readonly row: number;
  readonly column: number;
  readonly value: number;
  /** How many cells in the whole matrix hold this value, including this one. */
  readonly matching: number;
  /** Cells holding a value at all. Below `rows × columns` while a run delivers. */
  readonly total: number;
  readonly isMinimum: boolean;
  readonly isMaximum: boolean;
}

export function withinMatrix(matrix: NumericMatrix, row: number, column: number): boolean {
  return row >= 1 && column >= 1 && row <= matrix.rows && column <= matrix.columns;
}

export function readCell(
  matrix: NumericMatrix,
  stats: MatrixStats,
  row: number,
  column: number,
): CellReading | null {
  if (!withinMatrix(matrix, row, column)) return null;

  const value = matrix.values[(row - 1) * matrix.columns + (column - 1)] as number;
  // A cell that has not arrived holds no value to read, so there is no reading.
  if (!Number.isFinite(value)) return null;

  let matching = 0;
  let total = 0;
  for (const candidate of matrix.values) {
    // Absence is not a value, so it is neither a match nor part of the share.
    // "17% of the artwork" counted against cells nobody has fetched would fall
    // as the rest arrived, describing the delivery rather than the artwork.
    if (!Number.isFinite(candidate)) continue;
    total += 1;
    if (candidate === value) matching += 1;
  }

  return {
    row,
    column,
    value,
    matching,
    total,
    isMinimum: value === stats.min,
    isMaximum: value === stats.max,
  };
}

/**
 * Whether every cell holds the largest value in the matrix.
 *
 * For an escape-time fractal this means the whole view is inside the set, which
 * is mathematically correct and looks exactly like a bug: one flat colour. Worth
 * saying out loud, because the alternative is someone concluding the artwork is
 * broken and going away.
 *
 * `stats.min === stats.max` is the same question asked more cheaply, since a
 * matrix whose smallest and largest values agree is uniform by definition.
 */
export function isUniform(stats: MatrixStats): boolean {
  // Over the values present. A partly delivered result whose arrived cells all
  // agree is uniform so far, and `matrixStats` has already left absence out.
  return stats.counted > 0 && stats.min === stats.max;
}

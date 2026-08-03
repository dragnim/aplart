/**
 * Checks a parsed matrix against the output contract before it reaches the
 * renderer.
 *
 * `parseMatrix` guarantees the output is rectangular and finite; this module
 * enforces the size limits and the minimum useful dimensions, and produces the
 * user-facing wording for each failure.
 */

import { type NumericMatrix } from './matrixTypes';

/** The smallest thing worth calling an artwork. */
export const MIN_DIMENSION = 2;

export interface MatrixLimits {
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
}

export type MatrixValidationFailure =
  | { readonly kind: 'tooSmall'; readonly message: string }
  | {
      readonly kind: 'tooLarge';
      readonly message: string;
      readonly rows: number;
      readonly columns: number;
    };

export type MatrixValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly failure: MatrixValidationFailure };

export function validateMatrix(matrix: NumericMatrix, limits: MatrixLimits): MatrixValidationResult {
  const { rows, columns } = matrix;

  if (rows < MIN_DIMENSION || columns < MIN_DIMENSION) {
    return {
      ok: false,
      failure: {
        kind: 'tooSmall',
        message: `This returned a ${rows}×${columns} result. Artwork needs to be at least ${MIN_DIMENSION}×${MIN_DIMENSION}.`,
      },
    };
  }

  if (rows > limits.maxRows || columns > limits.maxColumns) {
    return {
      ok: false,
      failure: {
        kind: 'tooLarge',
        message: `This matrix is too large for APL Art to draw safely: ${rows}×${columns}, where the limit is ${limits.maxRows}×${limits.maxColumns}. Reduce the size and run again.`,
        rows,
        columns,
      },
    };
  }

  const cells = rows * columns;
  if (cells > limits.maxCells) {
    return {
      ok: false,
      failure: {
        kind: 'tooLarge',
        message: `This matrix is too large for APL Art to draw safely: ${cells.toLocaleString('en-GB')} cells, where the limit is ${limits.maxCells.toLocaleString('en-GB')}. Reduce the size and run again.`,
        rows,
        columns,
      },
    };
  }

  return { ok: true };
}

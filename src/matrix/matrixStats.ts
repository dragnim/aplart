/**
 * Summary statistics for a matrix.
 *
 * Used by continuous colour mapping, which needs the range, and by the
 * canvas's accessible description, which needs something honest and short to
 * say about a picture it cannot show.
 */

import { type NumericMatrix } from './matrixTypes';

export interface MatrixStats {
  readonly min: number;
  readonly max: number;
  /**
   * Distinct values, counted only up to `distinctLimit`. Beyond that the exact
   * figure stops being useful and the counting stops being cheap, so
   * `distinctCapped` says the real number is at least this.
   */
  readonly distinct: number;
  readonly distinctCapped: boolean;
  /** True when every cell holds the same value; continuous mapping guards on this. */
  readonly uniform: boolean;
}

const DEFAULT_DISTINCT_LIMIT = 256;

export function matrixStats(matrix: NumericMatrix, distinctLimit = DEFAULT_DISTINCT_LIMIT): MatrixStats {
  const { values } = matrix;

  if (values.length === 0) {
    return { min: 0, max: 0, distinct: 0, distinctCapped: false, uniform: true };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const seen = new Set<number>();
  let capped = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] as number;
    if (value < min) min = value;
    if (value > max) max = value;
    if (!capped) {
      seen.add(value);
      if (seen.size >= distinctLimit) capped = true;
    }
  }

  return {
    min,
    max,
    distinct: seen.size,
    distinctCapped: capped,
    uniform: min === max,
  };
}

/**
 * A short sentence describing the artwork for screen reader users.
 *
 * Deliberately structural rather than pictorial: the honest thing to report is
 * the shape and the range of values, not a guess at what the picture depicts.
 */
export function describeMatrix(matrix: NumericMatrix, stats: MatrixStats, paletteName: string): string {
  const { rows, columns } = matrix;

  if (stats.uniform) {
    return `A ${rows} by ${columns} grid in which every cell holds the value ${formatValue(stats.min)}, drawn with the ${paletteName} palette.`;
  }

  const distinct = stats.distinctCapped
    ? `more than ${stats.distinct} distinct values`
    : `${stats.distinct} distinct values`;

  return `A ${rows} by ${columns} grid with ${distinct} ranging from ${formatValue(stats.min)} to ${formatValue(stats.max)}, drawn with the ${paletteName} palette.`;
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/u, '');
}

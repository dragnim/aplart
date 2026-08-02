/**
 * Reading a cell, and the arithmetic that turns it into a sentence.
 */

import { describe, expect, it } from 'vitest';
import { matrixStats } from '@/matrix/matrixStats';
import { isUniform, readCell, withinMatrix } from '@/matrix/matrixInspection';
import { fromNested } from '@/matrix/matrixTypes';

/** Not square, so a row and a column confusion cannot pass. */
const MATRIX = fromNested([
  [1, 2, 2, 3, 3],
  [3, 3, 4, 4, 4],
  [4, 4, 4, 4, 9],
]);
const STATS = matrixStats(MATRIX);

describe('readCell', () => {
  it('indexes from one, the way APL and the code do', () => {
    // Row 1, column 1 is the first cell, not the second.
    expect(readCell(MATRIX, STATS, 1, 1)?.value).toBe(1);
    expect(readCell(MATRIX, STATS, 3, 5)?.value).toBe(9);
  });

  it('reads across before down', () => {
    // The classic transposition. Row 2 column 3 is 4; row 3 column 2 is also 4,
    // so the assertion uses a pair that differs.
    expect(readCell(MATRIX, STATS, 1, 4)?.value).toBe(3);
    expect(readCell(MATRIX, STATS, 4, 1)).toBeNull();
  });

  it('counts how many cells share the value', () => {
    const reading = readCell(MATRIX, STATS, 1, 2);
    expect(reading?.value).toBe(2);
    expect(reading?.matching).toBe(2);
    expect(reading?.total).toBe(15);
  });

  it('counts the cell itself among the matches', () => {
    // Otherwise a unique value would report zero, which reads as "not found".
    expect(readCell(MATRIX, STATS, 1, 1)?.matching).toBe(1);
  });

  it('marks the ends of the range', () => {
    expect(readCell(MATRIX, STATS, 1, 1)?.isMinimum).toBe(true);
    expect(readCell(MATRIX, STATS, 1, 1)?.isMaximum).toBe(false);
    expect(readCell(MATRIX, STATS, 3, 5)?.isMaximum).toBe(true);
  });

  it('declines a cell the matrix does not have', () => {
    for (const [row, column] of [
      [0, 1],
      [1, 0],
      [4, 1],
      [1, 6],
      [-1, -1],
    ] as const) {
      expect(readCell(MATRIX, STATS, row, column)).toBeNull();
    }
  });

  it('reports both ends for a matrix of one value', () => {
    const flat = fromNested([
      [7, 7],
      [7, 7],
    ]);
    const reading = readCell(flat, matrixStats(flat), 1, 1);
    expect(reading?.isMinimum).toBe(true);
    expect(reading?.isMaximum).toBe(true);
    expect(reading?.matching).toBe(4);
  });
});

describe('withinMatrix', () => {
  it('accepts the corners and rejects just outside them', () => {
    expect(withinMatrix(MATRIX, 1, 1)).toBe(true);
    expect(withinMatrix(MATRIX, 3, 5)).toBe(true);
    expect(withinMatrix(MATRIX, 3, 6)).toBe(false);
    expect(withinMatrix(MATRIX, 4, 5)).toBe(false);
  });
});

describe('isUniform', () => {
  it('is true only when every cell holds the same value', () => {
    // The state that makes an escape-time fractal look broken: one flat colour,
    // entirely correct.
    const flat = fromNested([
      [28, 28],
      [28, 28],
    ]);
    expect(isUniform(matrixStats(flat))).toBe(true);
    expect(isUniform(STATS)).toBe(false);
  });
});

describe('a partly delivered buffer', () => {
  /*
   * The rule is that absence never reaches the parts of the application that
   * describe an artwork: statistics and matching counts are taken over what has
   * arrived, and the inspector reads only a completed result. These pin the
   * arithmetic that rule depends on, because both would give confidently wrong
   * answers if a not-a-number ever got through.
   */
  const arrived = Float64Array.from([4, 9, 4, 9, 4]);

  it('describes only the cells that have arrived', () => {
    const whole = Float64Array.from([...arrived, Number.NaN, Number.NaN]);
    const filled = arrived.length;

    // Taken over the prefix, exactly as the workspace does while a run delivers.
    const stats = matrixStats({ rows: 1, columns: filled, values: whole.subarray(0, filled) });

    expect(stats.min).toBe(4);
    expect(stats.max).toBe(9);
    expect(Number.isNaN(stats.min)).toBe(false);
    expect(Number.isNaN(stats.max)).toBe(false);
  });

  it('ignores absence in the range, but would count it as a distinct value', () => {
    /*
     * Stated as it is rather than as one might hope. Every comparison against
     * not-a-number is false, so it can never become the smallest or largest
     * value and the colour range is safe either way. The distinct count is not:
     * a set holds it like anything else, and a half-delivered artwork would
     * describe itself as having one more distinct value than it does.
     *
     * Which is why the workspace takes statistics over the cells that have
     * arrived rather than over the whole buffer. If that ever changes, this
     * says what will go wrong.
     */
    const polluted = matrixStats({
      rows: 1,
      columns: 3,
      values: Float64Array.from([4, Number.NaN, 9]),
    });

    expect(polluted.min).toBe(4);
    expect(polluted.max).toBe(9);
    expect(polluted.distinct).toBe(3);
  });

  it('counts matching cells only among real values', () => {
    // `readCell` is only ever given a completed result, so its count is over
    // real values by construction. Stated as a test so a future caller that
    // hands it a delivery has something to fail against.
    const matrix = { rows: 1, columns: arrived.length, values: arrived };
    const reading = readCell(matrix, matrixStats(matrix), 1, 1);

    expect(reading?.value).toBe(4);
    expect(reading?.matching).toBe(3);
    expect(reading?.total).toBe(5);
  });
});

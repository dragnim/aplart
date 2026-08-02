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

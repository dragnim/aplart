/**
 * Mapping a press back to a matrix cell.
 *
 * The interesting property is not any single case but agreement with the
 * forward transform, so most of this is a round trip: put a known matrix
 * through `transformMatrix`, pick a cell of the result, ask `displayToSource`
 * where it came from, and check the value found there is the one that was
 * drawn. All sixteen combinations of rotation and mirroring, because the pair
 * that is easy to get wrong — a mirror with a quarter turn — is also the pair
 * nobody checks by hand.
 */

import { describe, expect, it } from 'vitest';
import { fromNested } from '@/matrix/matrixTypes';
import { clampFraction, displayToSource } from '@/renderer/displayMapping';
import { defaultRenderOptions, transformMatrix, type Rotation } from '@/renderer/renderOptions';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Deliberately not square: a square hides every row/column confusion. */
const SOURCE = fromNested([
  [11, 12, 13, 14, 15],
  [21, 22, 23, 24, 25],
  [31, 32, 33, 34, 35],
]);

function valueAt(
  matrix: { rows: number; columns: number; values: Float64Array },
  row: number,
  column: number,
) {
  return matrix.values[row * matrix.columns + column];
}

describe('displayToSource', () => {
  it('is the identity with nothing applied', () => {
    const options = defaultRenderOptions('mono');
    expect(displayToSource({ u: 0.25, v: 0.75 }, options)).toEqual({ u: 0.25, v: 0.75 });
  });

  for (const rotation of ROTATIONS) {
    for (const mirrorHorizontally of [false, true]) {
      for (const mirrorVertically of [false, true]) {
        const label = `rotation ${String(rotation)}${mirrorHorizontally ? ' mirrored across' : ''}${
          mirrorVertically ? ' mirrored down' : ''
        }`;

        it(`agrees with the forward transform at ${label}`, () => {
          const options = { ...defaultRenderOptions('mono'), rotation, mirrorHorizontally, mirrorVertically };
          const displayed = transformMatrix(SOURCE, options);

          for (let row = 0; row < displayed.rows; row += 1) {
            for (let column = 0; column < displayed.columns; column += 1) {
              // The centre of the cell, which is where a press on it lands.
              const u = (column + 0.5) / displayed.columns;
              const v = (row + 0.5) / displayed.rows;

              const source = displayToSource({ u, v }, options);
              const sourceColumn = Math.floor(source.u * SOURCE.columns);
              const sourceRow = Math.floor(source.v * SOURCE.rows);

              expect(valueAt(SOURCE, sourceRow, sourceColumn), `at display ${row},${column}`).toBe(
                valueAt(displayed, row, column),
              );
            }
          }
        });
      }
    }
  }

  it('sends a quarter turn across to down, and not the other way', () => {
    const options = { ...defaultRenderOptions('mono'), rotation: 90 as Rotation };
    // The left edge of a quarter-turned display is the bottom of the matrix.
    expect(displayToSource({ u: 0, v: 0.5 }, options)).toEqual({ u: 0.5, v: 1 });
    expect(displayToSource({ u: 1, v: 0.5 }, options)).toEqual({ u: 0.5, v: 0 });
  });
});

describe('clampFraction', () => {
  it('keeps a position inside the artwork', () => {
    // A drag released beyond the letterbox must not name a cell that is not there.
    expect(clampFraction(-0.4)).toBe(0);
    expect(clampFraction(1.7)).toBe(1);
    expect(clampFraction(0.3)).toBe(0.3);
  });
});

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
import {
  cellBounds,
  clampFraction,
  displayToSource,
  displayedShape,
  sourceCellAt,
  sourceToDisplay,
} from '@/renderer/displayMapping';
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

describe('sourceCellAt', () => {
  it('names the cell a fraction falls inside, counting from one', () => {
    expect(sourceCellAt({ u: 0.05, v: 0.05 }, 3, 5)).toEqual({ row: 1, column: 1 });
    expect(sourceCellAt({ u: 0.5, v: 0.5 }, 3, 5)).toEqual({ row: 2, column: 3 });
  });

  it('gives the far edge to the last cell rather than to one past the end', () => {
    expect(sourceCellAt({ u: 1, v: 1 }, 3, 5)).toEqual({ row: 3, column: 5 });
  });

  it('misses rather than rounding onto an edge cell', () => {
    /*
     * The artwork is letterboxed, so a press can land on the mat beside it.
     * Answering "column 1" for a press that was plainly not on the picture is a
     * small lie that looks exactly like a bug.
     */
    expect(sourceCellAt({ u: -0.01, v: 0.5 }, 3, 5)).toBeNull();
    expect(sourceCellAt({ u: 0.5, v: 1.4 }, 3, 5)).toBeNull();
  });

  it('has nothing to name in an empty matrix', () => {
    expect(sourceCellAt({ u: 0.5, v: 0.5 }, 0, 0)).toBeNull();
  });
});

describe('sourceToDisplay', () => {
  for (const rotation of ROTATIONS) {
    for (const mirrorHorizontally of [false, true]) {
      for (const mirrorVertically of [false, true]) {
        it(`undoes displayToSource at rotation ${String(rotation)}${mirrorHorizontally ? ' across' : ''}${mirrorVertically ? ' down' : ''}`, () => {
          const options = { ...defaultRenderOptions('mono'), rotation, mirrorHorizontally, mirrorVertically };

          // The pair has to be mutually inverse, or a marker would be drawn on a
          // different cell from the one that was pressed.
          for (const point of [
            { u: 0.1, v: 0.2 },
            { u: 0.75, v: 0.4 },
            { u: 0, v: 1 },
          ]) {
            const round = sourceToDisplay(displayToSource(point, options), options);
            expect(round.u).toBeCloseTo(point.u, 12);
            expect(round.v).toBeCloseTo(point.v, 12);
          }
        });
      }
    }
  }
});

describe('cellBounds', () => {
  it('covers exactly one cell of the display when nothing is applied', () => {
    const options = defaultRenderOptions('mono');
    expect(cellBounds({ row: 1, column: 1 }, 4, 5, options)).toEqual({
      left: 0,
      top: 0,
      width: 1 / 5,
      height: 1 / 4,
    });
  });

  it('never returns a negative extent, whichever way the artwork is turned', () => {
    // Both corners move under rotation, and at half the rotations the first one
    // ends up to the right of the second.
    for (const rotation of ROTATIONS) {
      const options = { ...defaultRenderOptions('mono'), rotation };
      const bounds = cellBounds({ row: 2, column: 3 }, 4, 5, options);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(1.000001);
      expect(bounds.top + bounds.height).toBeLessThanOrEqual(1.000001);
    }
  });

  it('swaps the cell’s proportions under a quarter turn', () => {
    const turned = cellBounds({ row: 1, column: 1 }, 4, 5, {
      ...defaultRenderOptions('mono'),
      rotation: 90,
    });
    // A cell that was a fifth wide and a quarter tall is the other way round.
    expect(turned.width).toBeCloseTo(1 / 4, 12);
    expect(turned.height).toBeCloseTo(1 / 5, 12);
  });

  it('marks the cell the press found, all the way round', () => {
    /*
     * The end-to-end property: press somewhere, find the cell, ask where that
     * cell is drawn, and land back where the press was.
     */
    for (const rotation of ROTATIONS) {
      const options = { ...defaultRenderOptions('mono'), rotation, mirrorHorizontally: true };
      const pressed = { u: 0.34, v: 0.62 };
      const shown = displayedShape(4, 5, options);

      const cell = sourceCellAt(displayToSource(pressed, options), 4, 5);
      expect(cell).not.toBeNull();

      const bounds = cellBounds(cell!, 4, 5, options);
      expect(pressed.u).toBeGreaterThanOrEqual(bounds.left - 1e-9);
      expect(pressed.u).toBeLessThanOrEqual(bounds.left + bounds.width + 1e-9);
      expect(pressed.v).toBeGreaterThanOrEqual(bounds.top - 1e-9);
      expect(pressed.v).toBeLessThanOrEqual(bounds.top + bounds.height + 1e-9);
      // And the cell is one of the displayed grid's, not the source grid's.
      expect(bounds.width).toBeCloseTo(1 / shown.columns, 12);
    }
  });
});

describe('displayedShape', () => {
  it('transposes for a quarter turn and not otherwise', () => {
    const options = defaultRenderOptions('mono');
    expect(displayedShape(3, 5, options)).toEqual({ rows: 3, columns: 5 });
    expect(displayedShape(3, 5, { ...options, rotation: 90 })).toEqual({ rows: 5, columns: 3 });
    expect(displayedShape(3, 5, { ...options, rotation: 180 })).toEqual({ rows: 3, columns: 5 });
    expect(displayedShape(3, 5, { ...options, rotation: 270 })).toEqual({ rows: 5, columns: 3 });
  });

  it('agrees with the transform that actually reshapes the matrix', () => {
    for (const rotation of ROTATIONS) {
      const options = { ...defaultRenderOptions('mono'), rotation };
      const transformed = transformMatrix(SOURCE, options);
      expect(displayedShape(SOURCE.rows, SOURCE.columns, options)).toEqual({
        rows: transformed.rows,
        columns: transformed.columns,
      });
    }
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

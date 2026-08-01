/**
 * The single data structure that flows from APL execution to the renderer.
 *
 * Values are held flat and row-major in a `Float64Array` rather than as nested
 * arrays. A 256x256 artwork is 65,536 numbers that get walked on every repaint
 * and every palette change, and a flat typed array avoids both the per-row
 * object overhead and the bounds-check-per-row cost of `number[][]`.
 *
 * Fixtures on disk use nested arrays because they are meant to be readable in
 * a diff; `fromNested` and `toNested` convert at that boundary.
 */
export interface NumericMatrix {
  readonly rows: number;
  readonly columns: number;
  /** Row-major, `rows * columns` long. Cell (r, c) is at `r * columns + c`. */
  readonly values: Float64Array;
}

export function cellAt(matrix: NumericMatrix, row: number, column: number): number {
  // Callers are internal and already bounded by rows/columns, so this stays a
  // plain index rather than paying for a check on every pixel.
  return matrix.values[row * matrix.columns + column] as number;
}

export function fromNested(nested: readonly (readonly number[])[]): NumericMatrix {
  const rows = nested.length;
  const columns = rows === 0 ? 0 : (nested[0]?.length ?? 0);
  const values = new Float64Array(rows * columns);

  for (let row = 0; row < rows; row += 1) {
    const source = nested[row];
    if (source === undefined || source.length !== columns) {
      throw new Error(
        `fromNested requires a rectangular array: row ${row} has ${source?.length ?? 0} values, expected ${columns}`,
      );
    }
    for (let column = 0; column < columns; column += 1) {
      values[row * columns + column] = source[column] as number;
    }
  }

  return { rows, columns, values };
}

export function toNested(matrix: NumericMatrix): number[][] {
  const nested: number[][] = [];
  for (let row = 0; row < matrix.rows; row += 1) {
    const start = row * matrix.columns;
    nested.push(Array.from(matrix.values.subarray(start, start + matrix.columns)));
  }
  return nested;
}

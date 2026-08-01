/**
 * Turns TryAPL's textual output into a numeric matrix.
 *
 * This is deliberately a pure function over an array of lines, with no
 * knowledge of HTTP, the wire format or the renderer. Everything about how
 * APL formats numbers is handled here and nowhere else.
 */

import { type NumericMatrix } from './matrixTypes';

export type MatrixParseFailure =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'ragged'; readonly message: string; readonly row: number }
  | { readonly kind: 'token'; readonly message: string; readonly token: string; readonly row: number }
  | { readonly kind: 'notFinite'; readonly message: string; readonly token: string; readonly row: number };

export type MatrixParseResult =
  | { readonly ok: true; readonly matrix: NumericMatrix }
  | { readonly ok: false; readonly failure: MatrixParseFailure };

/**
 * An APL-formatted number.
 *
 * Negatives use a high bar (`¯3`), not a minus sign, but a leading `-` is
 * accepted too because it costs nothing and some formatting paths produce it.
 * The exponent of a number in scientific notation is itself overbarred when
 * negative, as in `1.5E¯7`.
 */
const APL_NUMBER =
  /^[¯-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][¯+-]?\d+)?$/u;

function toNumber(token: string): number {
  // JavaScript understands none of the overbars, so normalise them to minus
  // signs before handing the token to Number().
  return Number(token.replaceAll('¯', '-'));
}

/**
 * Parses lines of APL output into a matrix.
 *
 * Blank lines are trimmed from the top and bottom — TryAPL pads output with
 * them — but a blank line *between* rows is a genuine structural problem and
 * is reported as such rather than silently dropped.
 */
export function parseMatrix(lines: readonly string[]): MatrixParseResult {
  const trimmed = trimBlankEnds(lines);

  if (trimmed.length === 0) {
    return {
      ok: false,
      failure: { kind: 'empty', message: 'The code ran but produced no output.' },
    };
  }

  const rows = trimmed.length;
  const parsed: number[][] = [];
  let columns = -1;

  for (let row = 0; row < rows; row += 1) {
    const line = trimmed[row] as string;
    const tokens = line.trim().split(/\s+/u);

    if (line.trim() === '') {
      return {
        ok: false,
        failure: {
          kind: 'ragged',
          message: `Row ${row + 1} is blank, so the result is not a rectangular matrix.`,
          row,
        },
      };
    }

    const values: number[] = [];
    for (const token of tokens) {
      if (!APL_NUMBER.test(token)) {
        return {
          ok: false,
          failure: {
            kind: 'token',
            message: `“${token}” is not a number, so this output is not a numeric matrix.`,
            token,
            row,
          },
        };
      }

      const value = toNumber(token);
      if (!Number.isFinite(value)) {
        return {
          ok: false,
          failure: {
            kind: 'notFinite',
            message: `“${token}” is not a finite number and cannot be drawn.`,
            token,
            row,
          },
        };
      }
      values.push(value);
    }

    if (columns === -1) {
      columns = values.length;
    } else if (values.length !== columns) {
      return {
        ok: false,
        failure: {
          kind: 'ragged',
          message: `Row ${row + 1} has ${values.length} values but row 1 has ${columns}, so the result is not rectangular.`,
          row,
        },
      };
    }

    parsed.push(values);
  }

  const flat = new Float64Array(rows * columns);
  for (let row = 0; row < rows; row += 1) {
    const source = parsed[row] as number[];
    for (let column = 0; column < columns; column += 1) {
      flat[row * columns + column] = source[column] as number;
    }
  }

  return { ok: true, matrix: { rows, columns, values: flat } };
}

function trimBlankEnds(lines: readonly string[]): readonly string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] as string).trim() === '') start += 1;
  while (end > start && (lines[end - 1] as string).trim() === '') end -= 1;
  return lines.slice(start, end);
}

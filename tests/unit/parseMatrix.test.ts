import { describe, expect, it } from 'vitest';
import { toNested } from '@/matrix/matrixTypes';
import { parseMatrix } from '@/matrix/parseMatrix';

/** Parses and asserts success, returning the matrix as nested arrays. */
function parsed(lines: readonly string[]): number[][] {
  const result = parseMatrix(lines);
  if (!result.ok) throw new Error(`expected a successful parse, got: ${result.failure.message}`);
  return toNested(result.matrix);
}

/** Parses and asserts failure, returning the failure. */
function failure(lines: readonly string[]) {
  const result = parseMatrix(lines);
  if (result.ok) throw new Error('expected the parse to fail, but it succeeded');
  return result.failure;
}

describe('parseMatrix', () => {
  it('parses the output TryAPL actually returns for a 3x3', () => {
    // Verbatim from the live endpoint for `3 3⍴⍳9`.
    expect(parsed(['1 2 3', '4 5 6', '7 8 9'])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });

  it('reports the shape it found', () => {
    const result = parseMatrix(['1 2 3 4', '5 6 7 8']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matrix.rows).toBe(2);
      expect(result.matrix.columns).toBe(4);
      expect(result.matrix.values).toBeInstanceOf(Float64Array);
      expect(result.matrix.values).toHaveLength(8);
    }
  });

  describe('number formats', () => {
    it('reads overbar negatives, which is how APL writes them', () => {
      expect(parsed(['¯2.5 ¯2 ¯1.5 ¯1', '1 2 3 4'])).toEqual([
        [-2.5, -2, -1.5, -1],
        [1, 2, 3, 4],
      ]);
    });

    it('also accepts a conventional minus sign', () => {
      expect(parsed(['-3 -2', '1 2'])).toEqual([
        [-3, -2],
        [1, 2],
      ]);
    });

    it('reads decimals', () => {
      expect(parsed(['1 0.5 0.3333333333', '0.25 0.2 0.1666666667'])).toEqual([
        [1, 0.5, 0.3333333333],
        [0.25, 0.2, 0.1666666667],
      ]);
    });

    it('reads a trailing decimal point', () => {
      expect(parsed(['1. 2.', '3. 4.'])).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('reads a leading decimal point', () => {
      expect(parsed(['.5 .25', '.125 .0625'])).toEqual([
        [0.5, 0.25],
        [0.125, 0.0625],
      ]);
    });

    it('reads scientific notation, including an overbarred exponent', () => {
      expect(parsed(['1.5E7 1.5E¯7', '2E3 2e3'])).toEqual([
        [1.5e7, 1.5e-7],
        [2000, 2000],
      ]);
    });

    it('reads a negative mantissa with a negative exponent', () => {
      expect(parsed(['¯1.5E¯7 1', '2 3'])).toEqual([
        [-1.5e-7, 1],
        [2, 3],
      ]);
    });
  });

  describe('whitespace', () => {
    it('accepts the multiple spaces APL uses to align columns', () => {
      // Verbatim from the live endpoint for `4 4⍴1000000×÷⍳16`.
      expect(parsed(['1000000       500000', '  76923.07692  71428.57143'])).toEqual([
        [1000000, 500000],
        [76923.07692, 71428.57143],
      ]);
    });

    it('ignores leading and trailing whitespace on a row', () => {
      expect(parsed(['   1 2   ', '\t3 4\t'])).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('ignores blank lines above and below the matrix', () => {
      expect(parsed(['', '  ', '1 2', '3 4', '', ''])).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('rejections', () => {
    it('rejects output with no content at all', () => {
      expect(failure([]).kind).toBe('empty');
      expect(failure(['', '   ']).kind).toBe('empty');
    });

    it('rejects rows of differing lengths', () => {
      const result = failure(['1 2 3', '4 5']);
      expect(result.kind).toBe('ragged');
      expect(result.message).toMatch(/Row 2 has 2 values but row 1 has 3/);
    });

    it('rejects a blank line between rows rather than quietly dropping it', () => {
      const result = failure(['1 2', '', '3 4']);
      expect(result.kind).toBe('ragged');
      expect(result).toMatchObject({ row: 1 });
    });

    it('rejects an APL error report, which arrives as ordinary output', () => {
      // TryAPL returns errors with HTTP 200, so the parser is the thing that
      // has to notice they are not a matrix.
      const result = failure(['LENGTH ERROR', ' 3 3⍴⍳9', '    ∧']);
      expect(result.kind).toBe('token');
      expect(result).toMatchObject({ token: 'LENGTH' });
    });

    it('rejects character output', () => {
      // Verbatim from the live endpoint for `2 3⍴'abcdef'`.
      expect(failure(['abc', 'def']).kind).toBe('token');
    });

    it('rejects a complex number, which APL writes with J', () => {
      // Verbatim from the live endpoint for `2 2⍴1J2 3J4 5 6`.
      expect(failure(['1J2 3J4', '5   6  ']).kind).toBe('token');
    });

    it('rejects nested output, which APL draws in boxes', () => {
      // Verbatim from the live endpoint for `2 2⍴(1 2)(3 4)(5 6)(7 8)`.
      const result = failure(['┌───┬───┐', '│1 2│3 4│', '├───┼───┤', '│5 6│7 8│', '└───┴───┘']);
      expect(result.kind).toBe('token');
    });

    it('names the token it could not read', () => {
      const result = failure(['1 2', '3 wat']);
      expect(result).toMatchObject({ kind: 'token', token: 'wat', row: 1 });
      expect(result.message).toContain('wat');
    });

    it('rejects a bare minus sign', () => {
      expect(failure(['1 -', '2 3']).kind).toBe('token');
    });

    it('rejects a lone decimal point', () => {
      expect(failure(['1 .', '2 3']).kind).toBe('token');
    });
  });

  describe('edge shapes', () => {
    it('parses a single row', () => {
      expect(parsed(['1 2 3'])).toEqual([[1, 2, 3]]);
    });

    it('parses a single column', () => {
      expect(parsed(['1', '2', '3'])).toEqual([[1], [2], [3]]);
    });

    it('parses a large matrix without complaint', () => {
      const row = Array.from({ length: 90 }, (_, index) => String(index % 7)).join(' ');
      const result = parseMatrix(Array.from({ length: 90 }, () => row));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.matrix.values).toHaveLength(8100);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import {
  ADAPTIVE_MARKER,
  buildAdaptiveExpression,
  formatAdaptiveReply,
  parseAdaptiveReply,
} from '@/execution/adaptiveProbe';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';

const CAPS = TRYAPL_CAPABILITIES;

function integers(rows: number, columns: number, value = 1): NumericMatrix {
  const values = new Float64Array(rows * columns).fill(value);
  return { rows, columns, values };
}

describe('buildAdaptiveExpression', () => {
  it('wraps the source without replacing it', () => {
    const expression = buildAdaptiveExpression(['9|∘.×⍨⍳64'], CAPS);
    expect(expression).toContain('r←(9|∘.×⍨⍳64)');
  });

  it('parenthesises only the final statement, leaving the setup outside', () => {
    /*
     * Regression, and the reason `bindResult` is shared rather than reimplemented:
     * `r←(size←160 ⋄ 9|∘.×⍨⍳size)` is not equivalent to running the statements in
     * sequence. The live service reported it as rank 1, so the artwork was
     * rejected as not being a matrix.
     */
    const expression = buildAdaptiveExpression(['size←160', '9|∘.×⍨⍳size'], CAPS);
    expect(expression).toContain('size←160 ⋄ r←(9|∘.×⍨⍳size)');
    expect(expression).not.toContain('r←(size←160');
  });

  it('carries both service caps, and compares against them strictly', () => {
    // At either cap a reply cannot be told from one truncated there, so the
    // comparison has to be `<` and not `≤`.
    const expression = buildAdaptiveExpression(['2 2⍴1'], CAPS);
    expect(expression).toContain(`n<${String(CAPS.maxOutputLines)}`);
    expect(expression).toContain(`w<${String(CAPS.maxLineLength)}`);
  });

  it('avoids ∈, which the endpoint does not support', () => {
    // Measured against the live service: `∈` comes back as
    // `NOT SUPPORTED: "∈" (⎕UCS 8712)`, so membership is spelled out as
    // comparisons. A future edit that reaches for it would break every run.
    expect(buildAdaptiveExpression(['2 2⍴1'], CAPS)).not.toContain('∈');
  });
});

describe('parseAdaptiveReply', () => {
  it('reads anything unmarked as the artwork itself', () => {
    expect(parseAdaptiveReply(['1 2 3', '4 5 6'])).toEqual({
      kind: 'matrix',
      lines: ['1 2 3', '4 5 6'],
    });
  });

  it('reads a marked reply as metadata', () => {
    expect(parseAdaptiveReply([`${ADAPTIVE_MARKER} 2 1 83 128 383 128 128`])).toEqual({
      kind: 'metadata',
      rank: 2,
      depth: 1,
      dataRepresentation: 83,
      elementType: 'integer',
      lines: 128,
      width: 383,
      shape: [128, 128],
    });
  });

  it('cannot confuse a numeric matrix for metadata', () => {
    // The marker opens with a comment glyph, so no printed numeric result can
    // begin with it — including one whose first value happens to be large.
    expect(parseAdaptiveReply(['2 1 83 128 383 128 128'])).toMatchObject({ kind: 'matrix' });
  });

  it('reads an undrawable result, which reports no size', () => {
    // The formatting sits behind a guard, so a nested result is never formatted
    // merely to measure dimensions nobody will use.
    expect(parseAdaptiveReply([`${ADAPTIVE_MARKER} 2 2 326 0 0 2 2`])).toMatchObject({
      kind: 'metadata',
      depth: 2,
      elementType: 'nested',
      lines: 0,
      width: 0,
    });
  });

  it('reads a rank-1 result, which has one axis', () => {
    expect(parseAdaptiveReply([`${ADAPTIVE_MARKER} 1 1 83 0 0 5`])).toMatchObject({
      kind: 'metadata',
      rank: 1,
      shape: [5],
    });
  });

  it('refuses metadata with too few numbers', () => {
    expect(parseAdaptiveReply([`${ADAPTIVE_MARKER} 2 1 83`])).toMatchObject({ kind: 'error' });
  });

  it('refuses metadata whose axis count disagrees with its rank', () => {
    expect(parseAdaptiveReply([`${ADAPTIVE_MARKER} 2 1 83 4 9 4`])).toMatchObject({ kind: 'error' });
  });

  it('refuses metadata containing something that is not a number', () => {
    expect(parseAdaptiveReply([`${ADAPTIVE_MARKER} 2 1 83 4 9 four 4`])).toMatchObject({
      kind: 'error',
    });
  });
});

describe('formatAdaptiveReply', () => {
  it('returns the matrix itself when its printed form fits', () => {
    const lines = formatAdaptiveReply(
      fromNested([
        [1, 2],
        [3, 4],
      ]),
      CAPS,
    );
    expect(lines).toEqual(['1 2', '3 4']);
  });

  it('returns metadata for a result too tall to print', () => {
    const reply = parseAdaptiveReply(formatAdaptiveReply(integers(200, 4), CAPS));
    expect(reply).toMatchObject({ kind: 'metadata', shape: [200, 4] });
  });

  it('returns metadata for a result too wide to print', () => {
    // Short enough to print, and 400 columns of a nine-character integer is
    // still far past the line cap. Height alone would have missed this.
    const reply = parseAdaptiveReply(formatAdaptiveReply(integers(4, 400, 100_000_000), CAPS));
    expect(reply).toMatchObject({ kind: 'metadata', shape: [4, 400] });
  });

  it('treats a result exactly at the line cap as one that did not fit', () => {
    const rows = CAPS.maxOutputLines;
    const reply = parseAdaptiveReply(formatAdaptiveReply(integers(rows, 2), CAPS));
    expect(reply).toMatchObject({ kind: 'metadata', shape: [rows, 2] });
  });

  it('returns one line fewer than the cap as the matrix itself', () => {
    const rows = CAPS.maxOutputLines - 1;
    expect(formatAdaptiveReply(integers(rows, 2), CAPS)).toHaveLength(rows);
  });
});

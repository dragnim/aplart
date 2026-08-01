import { describe, expect, it } from 'vitest';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import {
  buildBandExpression,
  buildProbeExpression,
  elementTypeOf,
  estimateValueWidth,
  isDrawableType,
  parseProbeReply,
  planBands,
} from '@/execution/transport';

describe('elementTypeOf', () => {
  // These ⎕DR values were read back from the live service.
  it.each([
    [11, 'boolean'],
    [83, 'integer'],
    [163, 'integer'],
    [323, 'integer'],
    [645, 'float'],
    [80, 'character'],
    [326, 'nested'],
    [1289, 'complex'],
  ])('maps ⎕DR %i to %s', (dr, expected) => {
    expect(elementTypeOf(dr)).toBe(expected);
  });

  it('accepts only the types the renderer can draw', () => {
    expect(isDrawableType('boolean')).toBe(true);
    expect(isDrawableType('integer')).toBe(true);
    expect(isDrawableType('float')).toBe(true);
    expect(isDrawableType('character')).toBe(false);
    expect(isDrawableType('nested')).toBe(false);
    expect(isDrawableType('complex')).toBe(false);
  });
});

describe('buildProbeExpression', () => {
  it('wraps a single expression without altering it', () => {
    const probe = buildProbeExpression(['9|∘.×⍨⍳64']);
    expect(probe).toContain('(9|∘.×⍨⍳64)');
    expect(probe).toBe('r←(9|∘.×⍨⍳64) ⋄ (≢⍴r),(≡r),(⎕DR r),(⍴r)');
  });

  it('parenthesises only the final statement, leaving the setup outside', () => {
    // Regression: `r←(size←160 ⋄ 9|∘.×⍨⍳size)` is not equivalent to running the
    // statements in sequence. The live service reported it as rank 1, so the
    // artwork was rejected as not being a matrix.
    const probe = buildProbeExpression(['size←160', '9|∘.×⍨⍳size']);
    expect(probe).toBe('size←160 ⋄ r←(9|∘.×⍨⍳size) ⋄ (≢⍴r),(≡r),(⎕DR r),(⍴r)');
    expect(probe).not.toContain('r←(size←160');
  });
});

describe('parseProbeReply', () => {
  it('reads the reply for a simple integer matrix', () => {
    // Verbatim from the live service for `r←3 3⍴⍳9 ⋄ (≢⍴r),(≡r),(⎕DR r)`.
    const result = parseProbeReply(['2 1 83 3 3']);
    expect(result).toEqual({
      ok: true,
      probe: { rank: 2, depth: 1, dataRepresentation: 83, elementType: 'integer', shape: [3, 3] },
    });
  });

  it('reads a nested array, which must be rejected upstream', () => {
    const result = parseProbeReply(['2 2 326 2 2']);
    expect(result).toMatchObject({ ok: true, probe: { depth: 2, elementType: 'nested' } });
  });

  it('reads a complex array', () => {
    expect(parseProbeReply(['2 1 1289 2 2'])).toMatchObject({
      probe: { elementType: 'complex' },
    });
  });

  it('reads a character array', () => {
    expect(parseProbeReply(['2 1 80 2 3'])).toMatchObject({ probe: { elementType: 'character' } });
  });

  it('reads a rank-1 result', () => {
    expect(parseProbeReply(['1 1 83 5'])).toMatchObject({ probe: { rank: 1, shape: [5] } });
  });

  it('reads a scalar, which has no axes', () => {
    expect(parseProbeReply(['0 0 83'])).toMatchObject({ probe: { rank: 0, shape: [] } });
  });

  it('rejects a reply whose axis count disagrees with the rank', () => {
    expect(parseProbeReply(['2 1 83 3'])).toMatchObject({ ok: false });
  });

  it('rejects an empty reply', () => {
    expect(parseProbeReply([])).toMatchObject({ ok: false });
    expect(parseProbeReply(['   '])).toMatchObject({ ok: false });
  });

  it('rejects a reply that is not numeric, such as an APL error', () => {
    expect(parseProbeReply(['VALUE ERROR: Undefined name: r'])).toMatchObject({ ok: false });
  });
});

describe('buildBandExpression', () => {
  it('re-executes the expression and slices the flattened result', () => {
    const band = buildBandExpression(['⍳9'], 100, 50, 10);
    expect(band).toBe('r←(⍳9) ⋄ b←50↑100↓,r ⋄ p←(10×⌈(≢b)÷10)↑b ⋄ (((≢p)÷10),10)⍴p');
  });

  it('pads to a whole number of lines so the reshape cannot recycle values', () => {
    // ⍴ fills a short final row from the start of the data, which would
    // silently corrupt it; ↑ pads with zeros instead.
    expect(buildBandExpression(['x'], 0, 7, 4)).toContain('p←(4×⌈(≢b)÷4)↑b');
  });
});

describe('planBands', () => {
  it('fits a small result into one band', () => {
    const plans = planBands(100, 9, TRYAPL_CAPABILITIES);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ offset: 0, count: 100 });
  });

  it('covers every cell exactly once, with no gaps or overlaps', () => {
    const total = 65_536;
    const plans = planBands(total, 9, TRYAPL_CAPABILITIES);

    let expectedOffset = 0;
    for (const plan of plans) {
      expect(plan.offset).toBe(expectedOffset);
      expectedOffset += plan.count;
    }
    expect(expectedOffset).toBe(total);
  });

  it('stays inside the backend limits it is given', () => {
    const plans = planBands(65_536, 9, TRYAPL_CAPABILITIES);
    for (const plan of plans) {
      const linesNeeded = Math.ceil(plan.count / plan.perLine);
      expect(linesNeeded).toBeLessThan(TRYAPL_CAPABILITIES.maxOutputLines);
      expect(plan.perLine * 9).toBeLessThanOrEqual(TRYAPL_CAPABILITIES.maxLineLength);
    }
  });

  it('needs more bands for wider values', () => {
    const narrow = planBands(65_536, 2, TRYAPL_CAPABILITIES).length;
    const wide = planBands(65_536, 16, TRYAPL_CAPABILITIES).length;
    expect(wide).toBeGreaterThan(narrow);
  });

  it('fetches a full 256x256 integer artwork in a handful of requests', () => {
    const plans = planBands(65_536, estimateValueWidth('integer'), TRYAPL_CAPABILITIES);
    expect(plans.length).toBeLessThanOrEqual(8);
  });
});

import { describe, expect, it } from 'vitest';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import {
  buildBandExpression,
  elementTypeOf,
  estimateValueWidth,
  isDrawableType,
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

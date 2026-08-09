/**
 * The promise the tiling artworks make: repeat one of these and no join shows.
 *
 * That is a mathematical property rather than a matter of taste, so it is tested
 * as one. A pattern with period `p` must satisfy `row r = row r + p` everywhere
 * in the artwork — and if it does, the row after the last is the first, which is
 * exactly what a seamless repeat needs. The fixtures hold real service output at
 * each artwork's defaults, so this reads the actual pixels rather than trusting
 * the arithmetic that produced them.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { getPreset, listedPresets, presets } from '@/presets/presets';
import { tilePeriodRule } from '@/presets/createQuality';
import { type ArtworkPreset } from '@/presets/schema';

/**
 * The tiling artworks, with the period each repeats on and the divisor its
 * curated controls are held to.
 *
 * For three of them those are the same number: the pattern repeats every strap
 * pair, every block, every three rows of orbs, and the grid must be a whole
 * number of those across.
 *
 * Maze Tiles is the exception, and deliberately. Its arrangement is hashed, so
 * it repeats only over the whole grid — there is no smaller period to find. What
 * its tile size has to do is divide the grid, so that the hash wraps over a
 * whole number of tiles rather than a fractional one. Its seam is guarded by
 * `repeatsWithin: false` below, which measures the wrap join instead.
 */
const TILES = [
  {
    id: 'basket-weave',
    period: (values: Record<string, number>) => 2 * (values.width as number),
    repeatsWithin: true,
  },
  {
    id: 'quilt-stars',
    period: (values: Record<string, number>) => values.block as number,
    repeatsWithin: true,
  },
  {
    id: 'glow-grid',
    period: (values: Record<string, number>) => 3 * (values.spacing as number),
    repeatsWithin: true,
  },
  {
    id: 'maze-tiles',
    period: (values: Record<string, number>) => values.cell as number,
    repeatsWithin: false,
  },
] as const;

function presetFor(id: string): ArtworkPreset {
  const preset = getPreset(id);
  expect(preset, `${id} is registered`).toBeDefined();
  return preset as ArtworkPreset;
}

/** The artwork's default values, read from the parameters themselves. */
function defaults(preset: ArtworkPreset): Record<string, number> {
  const values: Record<string, number> = {};
  for (const parameter of preset.parameters) values[parameter.variable] = parameter.defaultValue as number;
  return values;
}

describe.each(TILES)('$id', ({ id, period, repeatsWithin }) => {
  const preset = presetFor(id);

  it('is drawn on a grid that is a whole number of periods across', () => {
    const values = defaults(preset);
    expect((values.size as number) % period(values)).toBe(0);
  });

  it.runIf(repeatsWithin)('repeats exactly on its period, row and column alike', () => {
    /*
     * Read from the fixture, which is what the real service returned at these
     * defaults. Every row must equal the row one period below it, and every
     * column the column one period across — which is periodicity itself, and
     * therefore a guarantee that the tile joins its own copy without a seam.
     */
    const fixture = JSON.parse(readFileSync(preset.fixturePath, 'utf8')) as PresetFixture;
    const matrix = fixtureToMatrix(fixture);
    const p = period(defaults(preset));

    const at = (row: number, column: number) => matrix.values[row * matrix.columns + column] as number;

    let rowMismatch = 0;
    let columnMismatch = 0;
    for (let row = 0; row + p < matrix.rows; row += 1) {
      for (let column = 0; column < matrix.columns; column += 1) {
        if (at(row, column) !== at(row + p, column)) rowMismatch += 1;
      }
    }
    for (let row = 0; row < matrix.rows; row += 1) {
      for (let column = 0; column + p < matrix.columns; column += 1) {
        if (at(row, column) !== at(row, column + p)) columnMismatch += 1;
      }
    }

    expect(rowMismatch, 'cells differing one period down').toBe(0);
    expect(columnMismatch, 'cells differing one period across').toBe(0);
  });

  it.runIf(!repeatsWithin)('joins its own copy no worse than it joins itself', () => {
    /*
     * The hashed artwork has no period smaller than the grid, so instead of
     * repetition this measures the join: the difference across the wrap against
     * the difference between ordinary neighbouring rows. A seam would be a step
     * the pattern never takes anywhere else in the tile.
     */
    const fixture = JSON.parse(readFileSync(preset.fixturePath, 'utf8')) as PresetFixture;
    const matrix = fixtureToMatrix(fixture);
    const at = (row: number, column: number) => matrix.values[row * matrix.columns + column] as number;

    const rowGap = (a: number, b: number) => {
      let total = 0;
      for (let column = 0; column < matrix.columns; column += 1)
        total += Math.abs(at(a, column) - at(b, column));
      return total / matrix.columns;
    };

    const join = rowGap(matrix.rows - 1, 0);
    let typical = 0;
    for (let row = 0; row < matrix.rows - 1; row += 1) typical += rowGap(row, row + 1);
    typical /= matrix.rows - 1;

    expect(typical, 'the artwork has some variation to compare against').toBeGreaterThan(0);
    expect(join / typical, 'the wrap join is an ordinary step').toBeLessThan(1.5);
  });

  it('offers only curated settings whose period divides the grid', () => {
    const config = preset.instantPlay;
    expect(config).toBeDefined();

    for (const recipe of config?.recipes ?? []) {
      const values = { ...defaults(preset), ...recipe.values };
      expect((values.size as number) % period(values), `${recipe.id} tiles cleanly`).toBe(0);
    }
  });
});

describe('the tile period rule', () => {
  const rule = tilePeriodRule({
    size: 'size',
    period: (values) => 2 * ((values.get('width') as number) ?? 0),
    sizeRange: { min: 48, max: 120 },
    periodVariable: 'width',
    periodRange: { min: 6, max: 24, step: 2 },
  });

  const values = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it('leaves a grid that already fits exactly alone', () => {
    const before = values({ size: 96, width: 12 });
    expect(rule(before)).toBe(before);
  });

  it('grows the grid to a whole number of periods when nothing is held', () => {
    const after = rule(values({ size: 100, width: 12 }));
    expect((after.get('size') as number) % 24).toBe(0);
    expect(after.get('width')).toBe(12);
  });

  it('moves the pattern instead when the grid is the control being held', () => {
    const after = rule(values({ size: 100, width: 12 }), 'size');
    expect(after.get('size'), 'the held control never moves').toBe(100);
    expect(100 % (2 * (after.get('width') as number))).toBe(0);
  });

  it('keeps the pattern on a value its own control can return to', () => {
    const after = rule(values({ size: 100, width: 12 }), 'size');
    const width = after.get('width') as number;
    expect((width - 6) % 2, 'lands on the step').toBe(0);
    expect(width).toBeGreaterThanOrEqual(6);
    expect(width).toBeLessThanOrEqual(24);
  });

  it('leaves nothing untiled anywhere the two controls reach', () => {
    // Stepping by the grid control's own step. A size the slider cannot produce
    // is not a state Create can be in, and some of them — 52, say — have no
    // strap width that divides them at all.
    for (let size = 48; size <= 120; size += 12) {
      for (let width = 6; width <= 24; width += 2) {
        for (const holding of [undefined, 'size', 'width'] as const) {
          const after = rule(values({ size, width }), holding);
          const grid = after.get('size') as number;
          const period = 2 * (after.get('width') as number);
          expect(
            grid % period,
            `size ${String(size)} width ${String(width)} holding ${String(holding)}`,
          ).toBe(0);
        }
      }
    }
  });
});

describe('the gallery listing', () => {
  it('leads with the patterns and keeps the fractals behind them', () => {
    const order = listedPresets.map((preset) => preset.id);
    const firstFractal = order.findIndex((id) => getPreset(id)?.category === 'fractal');
    const lastPattern = order.reduce(
      (last, id, index) => (getPreset(id)?.category === 'pattern' ? index : last),
      -1,
    );

    expect(firstFractal, 'a fractal is listed').toBeGreaterThan(-1);
    expect(lastPattern, 'the last pattern comes before the first fractal').toBeLessThan(firstFractal);
    expect(order[0], 'the weave leads').toBe('basket-weave');
  });

  it('retires Tricorn and Multibrot from the listing without deleting them', () => {
    const listed = listedPresets.map((preset) => preset.id);
    expect(listed).not.toContain('tricorn');
    expect(listed).not.toContain('multibrot');

    // Still artworks: an address anybody has shared still resolves to one.
    expect(getPreset('tricorn')).toBeDefined();
    expect(getPreset('multibrot')).toBeDefined();
    expect(presets.map((preset) => preset.id)).toContain('tricorn');
  });
});

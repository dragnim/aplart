/**
 * Whether the Truchet tiling is actually scattered.
 *
 * The first generator here multiplied the row and column numbers together and
 * took a fraction of the result. Every multiplier in it was irrational, which
 * was offered as the reason it looked random — but irrational is not the same as
 * unstructured. Along any one row the step is fixed, so the pattern is a regular
 * sequence, and whenever the step happens to land near a whole number the row
 * comes out almost constant. At the shipped seed that produced a run of
 * eighteen identical tiles in a row of twenty-eight, and bands across the piece.
 *
 * These tests evaluate the preset's own arithmetic in JavaScript. That is not
 * proof the interpreter agrees to the last bit — the committed fixture is real
 * output and covers that — but the structure being measured here is a property
 * of the formula, not of the last bit.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { truchetGrid } from '@/presets/truchet-grid';

/** How many motifs the renderer can draw. The class is taken modulo this. */
const MOTIF_COUNT = 4;

/** The tile class the preset's expression gives for a cell, one-based. */
function tileAt(row: number, column: number, seed: number, classes: number): number {
  const angle = 12.9898 * row + 78.233 * column + seed * 0.618_033_988_7;
  const hashed = 43_758.5453 * Math.sin(angle);
  return Math.floor(classes * (hashed - Math.floor(hashed))) % classes;
}

/** The generator that was replaced, kept so the improvement can be measured. */
function previousTileAt(row: number, column: number, seed: number, classes: number): number {
  const value = seed * 0.618_033_988_7 + row * (column * 0.754_877_666_2);
  return Math.floor(10_000 * (value - Math.floor(value))) % classes;
}

type Generator = (row: number, column: number, seed: number, classes: number) => number;

function grid(size: number, seed: number, classes: number, generator: Generator): number[][] {
  return Array.from({ length: size }, (_unusedRow, row) =>
    Array.from({ length: size }, (_unusedColumn, column) => generator(row + 1, column + 1, seed, classes)),
  );
}

function longestRun(rows: readonly (readonly number[])[]): number {
  let longest = 1;
  for (const row of rows) {
    let run = 1;
    for (let index = 1; index < row.length; index += 1) {
      run = row[index] === row[index - 1] ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

/**
 * How many different three-by-three neighbourhoods appear.
 *
 * A better aggregate measure than neighbour correlation, which the old
 * generator passed: its immediate correlations were all close to a half while
 * whole rows were still nearly constant. Reusing a small vocabulary of
 * neighbourhoods is what "structured" actually looks like.
 */
function distinctNeighbourhoods(rows: readonly (readonly number[])[]): number {
  const seen = new Set<string>();
  for (let row = 0; row + 3 <= rows.length; row += 1) {
    for (let column = 0; column + 3 <= (rows[0] as readonly number[]).length; column += 1) {
      const window: number[] = [];
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1)
          window.push((rows[row + dr] as readonly number[])[column + dc] as number);
      }
      seen.add(window.join(''));
    }
  }
  return seen.size;
}

const SIZE = 20;

describe('the preset', () => {
  it('uses the scrambled hash, not a bare product of the indices', () => {
    // Guards the wording as much as the arithmetic: the code explains why the
    // sine is there, and that explanation has to stay true of the code.
    expect(truchetGrid.code).toContain('1○angle');
    expect(truchetGrid.code).not.toContain('∘.×');
  });

  it('starts at a size where one arc can be followed', () => {
    const size = /size←(\d+)/u.exec(truchetGrid.code)?.[1];
    expect(Number(size)).toBe(20);
  });
});

describe('the tile hash', () => {
  it('uses both classes about equally', () => {
    const flat = grid(SIZE, 7, 2, tileAt).flat();
    const ones = flat.filter((value) => value === 1).length / flat.length;
    expect(ones).toBeGreaterThan(0.4);
    expect(ones).toBeLessThan(0.6);
  });

  it('has no row that is nearly all one tile', () => {
    // The symptom that made the old tiling look banded rather than scattered.
    expect(longestRun(grid(SIZE, 7, 2, tileAt))).toBeLessThanOrEqual(10);
  });

  it('scatters better than the generator it replaced, at every seed', () => {
    let improved = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const now = distinctNeighbourhoods(grid(SIZE, seed, 2, tileAt));
      const before = distinctNeighbourhoods(grid(SIZE, seed, 2, previousTileAt));
      if (now > before) improved += 1;
    }
    // Not "on average": a tiling is looked at one seed at a time, and a
    // generator that were better on average while being much worse at some
    // seeds would still show someone a banded picture.
    expect(improved).toBe(60);
  });

  it('has no worse a longest row than tossing a coin would', () => {
    /*
     * Compared against a coin rather than a chosen number.
     *
     * A first version of this asserted the worst run over two hundred seeds was
     * at most twelve, and it failed at fifteen — but a run of fifteen in a
     * twenty-by-twenty grid is roughly what a fair coin gives about once in a
     * hundred and forty grids, so the threshold was wrong and the generator was
     * not. What is worth asserting is that the arithmetic is no more streaky
     * than randomness, which is the claim the preset actually makes.
     */
    const worstOf = (rows: () => readonly (readonly number[])[]) => {
      let worst = 0;
      for (let attempt = 0; attempt < 200; attempt += 1) worst = Math.max(worst, longestRun(rows()));
      return worst;
    };

    let seed = 1;
    const hashed = worstOf(() => grid(SIZE, seed++, 2, tileAt));

    // A fixed-seed generator, so this baseline is the same on every run.
    let state = 0x9e3779b9;
    const coin = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state >>> 31;
    };
    const tossed = worstOf(() => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, coin)));

    expect(hashed).toBeLessThanOrEqual(tossed + 1);
  });

  it('is far less streaky than the generator it replaced', () => {
    // The old one reached eighteen of twenty-eight at its own shipped seed.
    let worstNow = 0;
    let worstBefore = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      worstNow = Math.max(worstNow, longestRun(grid(SIZE, seed, 2, tileAt)));
      worstBefore = Math.max(worstBefore, longestRun(grid(SIZE, seed, 2, previousTileAt)));
    }
    expect(worstNow).toBeLessThan(worstBefore);
  });

  it('gives a completely different arrangement for each seed', () => {
    const shapes = new Set(
      Array.from({ length: 40 }, (_unused, index) =>
        grid(SIZE, index + 1, 2, tileAt)
          .map((row) => row.join(''))
          .join('/'),
      ),
    );
    expect(shapes.size).toBe(40);
  });

  it('stays in range for every tile-shape count offered', () => {
    for (const classes of [2, 3, 4]) {
      const flat = grid(SIZE, 7, classes, tileAt).flat();
      expect(Math.min(...flat)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...flat)).toBeLessThan(classes);
      // All of them actually used, or the control would be a lie.
      expect(new Set(flat).size).toBe(classes);
    }
  });

  it('does not run in columns either', () => {
    // Rows are where the old generator's structure showed, so a fix that only
    // moved the problem into the columns would have looked like a fix.
    const rows = grid(SIZE, 7, 2, tileAt);
    const columns = rows[0]?.map((_unused, column) => rows.map((row) => row[column] as number)) ?? [];
    expect(longestRun(columns)).toBeLessThanOrEqual(12);
  });

  it('uses a wide vocabulary of neighbourhoods on its own terms', () => {
    // An absolute floor as well as the comparison, so this still says something
    // if the old generator is ever deleted from these tests.
    expect(distinctNeighbourhoods(grid(SIZE, 7, 2, tileAt))).toBeGreaterThan(200);
  });
});

describe('the committed fixture', () => {
  /**
   * The interpreter and the model agree.
   *
   * Everything above evaluates the preset's arithmetic in JavaScript, and the
   * end-to-end stub does the same. That is only worth anything if Dyalog's `1○`
   * and `Math.sin` actually produce the same tiles — which they do here, to the
   * last cell. If they ever stop, every claim in this file is about a formula
   * nobody is running.
   */
  it('matches the JavaScript model cell for cell', () => {
    const fixture = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'fixtures', 'truchet-grid.json'), 'utf8'),
    ) as { rows: number; columns: number; values: number[][] };

    const modelled = grid(fixture.rows, 7, 2, tileAt);
    expect(fixture.columns).toBe(fixture.rows);
    expect(fixture.values).toEqual(modelled);
  });
});

describe('the tile-shape control', () => {
  it('offers no more shapes than the renderer has', () => {
    /*
     * The renderer picks a motif with the class modulo four, so a fifth class
     * draws the first shape again. The control used to go to eight, which was
     * only made to look meaningful by tinting the ground per class — a grid of
     * squares over the tiling. Whatever the range is, it cannot exceed what can
     * actually be drawn.
     */
    const classes = truchetGrid.parameters.find((parameter) => parameter.variable === 'classes');
    expect(classes?.max).toBe(MOTIF_COUNT);
  });

  it('does not describe the tiling as random', () => {
    // It is a hash of the position. Calling it random invites the reasonable
    // expectation that the same link would draw something different each time.
    expect(truchetGrid.description).toMatch(/Nothing is random/);
  });
});

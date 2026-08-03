/**
 * Burning Ship against the real interpreter.
 *
 * `npm run test:live`. Excluded from the required checks, like the rest of the
 * live suite — this is APL, so only the real interpreter can answer it.
 *
 * The committed fixture is already checked cell for cell against plain arithmetic
 * offline, in `tests/unit/burningShip.test.ts`. What only the live service can
 * settle is whether the program still runs there and still returns that same
 * matrix: `|` had to be confirmed as supported at all, since the endpoint's glyph
 * set is narrower than Dyalog's and rejects `∈`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { runArtwork } from '@/execution/runArtwork';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { burningShip } from '@/presets/burning-ship';

const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const pause = () => new Promise((resolve) => setTimeout(resolve, 1200));

async function draw(source: string) {
  return runArtwork({
    service: new TryAplExecutionService({ endpoint: ENDPOINT }),
    source,
    limits: LIMITS,
    timeoutMs: 40_000,
  });
}

/** The shipped program with one control line rewritten. */
function withLine(prefix: string, replacement: string): string {
  return burningShip.code
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? replacement : line))
    .join('\n');
}

describe('the shipped Burning Ship', () => {
  it('returns exactly the committed fixture', async () => {
    const fixture = JSON.parse(
      readFileSync(join(REPO_ROOT, burningShip.fixturePath), 'utf8'),
    ) as PresetFixture;
    const expected = fixtureToMatrix(fixture);

    const run = await draw(burningShip.code);

    expect(run.matrix.rows).toBe(expected.rows);
    expect(run.matrix.columns).toBe(expected.columns);
    // Every cell. A sample would not notice a transposition or an off-by-one in
    // the axis, which are the mistakes this is here to catch.
    expect([...run.matrix.values]).toEqual([...expected.values]);
    await pause();
  }, 90_000);

  it('is the absolute values that make the difference, and not the view', async () => {
    /*
     * The same program with `x←|zr ⋄ y←|zi` replaced by names that copy instead of
     * taking magnitudes — which is Mandelbrot's update written in Burning Ship's
     * variables. Editing the step line rather than a control, because the claim
     * under test is about that line: if both returned the same matrix the
     * absolute values would be decoration.
     *
     * Not asserted by the ceiling, and that is worth recording. The first version
     * of this test expected the plain iteration to return nothing here, on the
     * assumption that a view this far out along the real axis is outside the
     * Mandelbrot set. It is not — ¯1.7549 is where the period-3 island sits, so
     * the plain run reaches the ceiling too, on about 4% of the frame against the
     * ship's 11%. What separates them is the shape, so what is measured is how
     * much of the frame disagrees: 82% of cells, computed independently.
     */
    const withoutAbsolute = burningShip.code.replace('x←|zr ⋄ y←|zi', 'x←zr ⋄ y←zi');
    expect(withoutAbsolute).not.toBe(burningShip.code);

    const ship = await draw(burningShip.code);
    await pause();
    const plain = await draw(withoutAbsolute);

    const shipValues = [...ship.matrix.values];
    const plainValues = [...plain.matrix.values];
    expect(plainValues).not.toEqual(shipValues);

    const differing = shipValues.filter((value, index) => value !== plainValues[index]).length;
    expect(differing / shipValues.length).toBeGreaterThan(0.5);
    await pause();
  }, 120_000);

  it('agrees with the mathematics at a handful of named points', async () => {
    /*
     * A small grid, so the whole thing arrives in one request and the values can
     * be read against counts worked out from the iteration directly. The centre
     * cell of a 3-wide axis is the centre of the view, which makes the arithmetic
     * something a reader can follow.
     */
    const source = burningShip.code
      .split('\n')
      .map((line) => {
        if (line.startsWith('size←')) return 'size←3';
        // A ceiling low enough to state, and a span small enough that all nine
        // cells sit in the same part of the shape.
        if (line.startsWith('iterations←')) return 'iterations←8';
        if (line.startsWith('zoom←')) return 'zoom←0.002';
        return line;
      })
      .join('\n');

    const run = await draw(source);

    expect(run.matrix.rows).toBe(3);
    expect(run.matrix.columns).toBe(3);
    // Deep inside the hull at the default centre: every point survives all eight
    // steps, so every cell is the ceiling.
    expect([...run.matrix.values]).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 8]);
    await pause();
  }, 60_000);

  it('puts the hull below the masts, from its own axis lines', async () => {
    /*
     * The orientation, measured on live output rather than on the fixture. The
     * mean count of the top rows must be lower than the middle: the masts thin
     * upwards into fast escapes, and the solid hull sits below them. Nothing in
     * the renderer is involved — this is the matrix as the service returned it.
     */
    const run = await draw(withLine('size←', 'size←64'));
    const { rows, columns, values } = run.matrix;
    const rowMean = (row: number) => {
      let total = 0;
      for (let column = 0; column < columns; column += 1) {
        total += values[row * columns + column] as number;
      }
      return total / columns;
    };

    expect(rowMean(1)).toBeLessThan(rowMean(Math.floor(rows / 2)));
    await pause();
  }, 60_000);
});

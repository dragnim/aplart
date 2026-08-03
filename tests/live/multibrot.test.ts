/**
 * Multibrot against the real interpreter.
 *
 * `npm run test:live`. Excluded from the required checks, like the rest of the live
 * suite — this is APL, so only the real interpreter can answer it.
 *
 * Two things need the real thing. The equivalence at power two is a claim about
 * floating-point arithmetic as much as about algebra: `zr×zr` must equal `zr*2`
 * and `(zr×zi)+zi×zr` must equal `2×zr×zi`, bit for bit, or the two programs would
 * agree in mathematics and differ in the last place. And every supported exponent
 * has to be shown to run at the resolution the preset offers, since the exponent
 * is the one control here that adds work to every step.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { runArtwork } from '@/execution/runArtwork';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { multibrot } from '@/presets/multibrot';

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

/** Any of the family's programs, with the named control lines rewritten. */
function withControls(code: string, values: Readonly<Record<string, string>>): string {
  return code
    .split('\n')
    .map((line) => {
      for (const [name, value] of Object.entries(values)) {
        if (line.startsWith(`${name}←`)) return `${name}←${value}`;
      }
      return line;
    })
    .join('\n');
}

/** Mandelbrot's own default view, which both programs can be moved onto. */
const VIEW = { size: '64', iterations: '48', centreX: '¯0.6', centreY: '0', zoom: '1.4' };

describe('the shipped Multibrot', () => {
  it('returns exactly the committed fixture', async () => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, multibrot.fixturePath), 'utf8')) as PresetFixture;
    const expected = fixtureToMatrix(fixture);

    const run = await draw(multibrot.code);

    expect(run.matrix.rows).toBe(expected.rows);
    expect(run.matrix.columns).toBe(expected.columns);
    expect([...run.matrix.values]).toEqual([...expected.values]);
    await pause();
  }, 90_000);

  it('is Mandelbrot Field cell for cell at power two', async () => {
    /*
     * The equivalence the artwork is built around, stated against the interpreter.
     * Both programs are moved onto the same view, so the only difference left is
     * how the square is arrived at: written into Mandelbrot's step, and reached by
     * one application of `by` here.
     */
    const asSquare = await draw(withControls(multibrot.code, { ...VIEW, power: '2' }));
    await pause();
    const mandelbrot = await draw(withControls(mandelbrotField.code, VIEW));

    expect([...asSquare.matrix.values]).toEqual([...mandelbrot.matrix.values]);
    await pause();
  }, 120_000);

  it('is not Mandelbrot Field at power three', async () => {
    const cubed = await draw(withControls(multibrot.code, { ...VIEW, power: '3' }));
    await pause();
    const mandelbrot = await draw(withControls(mandelbrotField.code, VIEW));

    const a = [...cubed.matrix.values];
    const b = [...mandelbrot.matrix.values];
    expect(a).not.toEqual(b);

    const differing = a.filter((value, index) => value !== b[index]).length;
    expect(differing / a.length).toBeGreaterThan(0.1);
    await pause();
  }, 120_000);

  it('runs every supported exponent at the resolution it offers', async () => {
    /*
     * Two to eight, at 144² — the maximum the Resolution slider allows. The
     * exponent is the one control that adds arithmetic to every step of every
     * cell, so this is where a public maximum would have to be lowered if the
     * workspace could not take it. It can: all seven complete in the same handful
     * of requests as the rest of the family.
     */
    for (const power of [2, 3, 4, 5, 6, 7, 8]) {
      const run = await draw(withControls(multibrot.code, { size: '144', power: String(power) }));
      expect(run.matrix.rows, `power ${String(power)}`).toBe(144);
      expect(run.matrix.columns, `power ${String(power)}`).toBe(144);
      expect(run.stats.max, `power ${String(power)}`).toBeLessThanOrEqual(48);
      expect(run.stats.distinct, `power ${String(power)}`).toBeGreaterThan(5);
      await pause();
    }
  }, 300_000);

  it('adds a lobe with each step of the exponent', async () => {
    /*
     * The visible claim, measured rather than asserted from a picture: an exponent
     * of d leaves d−1 lobes, so the shape at power three has a symmetry the shape
     * at power four does not. Counted as rotational agreement — the matrix rotated
     * by a whole turn divided by d−1 should match itself.
     *
     * Only the two-fold case is checked, because it is the only one that falls on
     * exact cell boundaries: a half turn is a reversal of both axes, which needs no
     * interpolation and so can be compared exactly.
     */
    const cubed = await draw(
      withControls(multibrot.code, { size: '64', power: '3', centreX: '0', centreY: '0', zoom: '1.4' }),
    );
    const { rows, columns, values } = cubed.matrix;

    let mismatched = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const here = values[row * columns + column] as number;
        const turned = values[(rows - 1 - row) * columns + (columns - 1 - column)] as number;
        if (here !== turned) mismatched += 1;
      }
    }
    expect(mismatched).toBe(0);
    await pause();
  }, 60_000);
});

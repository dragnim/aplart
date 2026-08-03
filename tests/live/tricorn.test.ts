/**
 * Tricorn against the real interpreter.
 *
 * `npm run test:live`. Excluded from the required checks, like the rest of the
 * live suite — this is APL, so only the real interpreter can answer it.
 *
 * The fixture is already recomputed cell for cell offline. What only the service
 * can settle is that the shipped program still returns that matrix, and that the
 * minus sign is doing the work: with the sign put back, the same program at the
 * same view must return exactly what Mandelbrot Field returns there.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { runArtwork } from '@/execution/runArtwork';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { tricorn } from '@/presets/tricorn';

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

/**
 * Puts the sign back, on the line that runs.
 *
 * Not `code.replace('ci-2×zr×zi', …)`: a string pattern replaces the first
 * occurrence, and the first occurrence in this program is the comment that quotes
 * Mandelbrot's version for the reader. That edited the comment and left the step
 * conjugated, so the test compared Tricorn against Mandelbrot and called the
 * difference a failure of the claim rather than of the substitution.
 */
function unconjugate(code: string): string {
  const changed = code
    .split('\n')
    .map((line) => (line.startsWith('step←') ? line.replace('ci-2×zr×zi', 'ci+2×zr×zi') : line))
    .join('\n');

  // The step line really is the thing that changed.
  const step = changed.split('\n').find((line) => line.startsWith('step←')) ?? '';
  expect(step).toContain('ci+2×zr×zi');
  expect(step).not.toContain('ci-2×zr×zi');
  return changed;
}

/** Any program's control lines rewritten to Tricorn's default view. */
function atTricornView(code: string, size: number): string {
  return code
    .split('\n')
    .map((line) => {
      if (line.startsWith('size←')) return `size←${String(size)}`;
      if (line.startsWith('iterations←')) return 'iterations←48';
      if (line.startsWith('centreX←')) return 'centreX←¯0.25';
      if (line.startsWith('centreY←')) return 'centreY←0';
      if (line.startsWith('zoom←')) return 'zoom←1.5';
      return line;
    })
    .join('\n');
}

describe('the shipped Tricorn', () => {
  it('returns exactly the committed fixture', async () => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, tricorn.fixturePath), 'utf8')) as PresetFixture;
    const expected = fixtureToMatrix(fixture);

    const run = await draw(tricorn.code);

    expect(run.matrix.rows).toBe(expected.rows);
    expect(run.matrix.columns).toBe(expected.columns);
    // Every cell. A sample would not notice a transposed or shifted axis, which
    // are the mistakes this is here to catch.
    expect([...run.matrix.values]).toEqual([...expected.values]);
    await pause();
  }, 90_000);

  it('becomes Mandelbrot exactly when the sign is put back', async () => {
    /*
     * The strongest available statement of "one minus sign is the whole
     * difference": Tricorn with `ci-` changed to `ci+` must return, cell for cell,
     * what Mandelbrot Field itself returns at the same view. Not merely something
     * similar — the same matrix.
     *
     * Both at 64² rather than 128², because this costs two runs and the claim is
     * about the arithmetic, not the resolution.
     */
    const conjugated = atTricornView(tricorn.code, 64);
    const unconjugated = unconjugate(conjugated);
    expect(unconjugated).not.toBe(conjugated);

    const asMandelbrot = await draw(unconjugated);
    await pause();
    const mandelbrot = await draw(atTricornView(mandelbrotField.code, 64));

    expect([...asMandelbrot.matrix.values]).toEqual([...mandelbrot.matrix.values]);
    await pause();
  }, 120_000);

  it('is not Mandelbrot with the sign as shipped', async () => {
    const tricornRun = await draw(atTricornView(tricorn.code, 64));
    await pause();
    const mandelbrot = await draw(atTricornView(mandelbrotField.code, 64));

    const conjugated = [...tricornRun.matrix.values];
    const plain = [...mandelbrot.matrix.values];
    expect(conjugated).not.toEqual(plain);

    const differing = conjugated.filter((value, index) => value !== plain[index]).length;
    expect(differing / conjugated.length).toBeGreaterThan(0.05);
    await pause();
  }, 120_000);

  it('is symmetric about the real axis, as conjugation requires', async () => {
    // Measured on live output rather than on the fixture: the set maps the upper
    // half-plane onto the lower one, and the view is centred on the axis.
    const run = await draw(atTricornView(tricorn.code, 64));
    const { rows, columns, values } = run.matrix;

    let mismatched = 0;
    for (let row = 0; row < rows / 2; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const top = values[row * columns + column] as number;
        const bottom = values[(rows - 1 - row) * columns + column] as number;
        if (top !== bottom) mismatched += 1;
      }
    }
    expect(mismatched).toBe(0);
    await pause();
  }, 60_000);
});

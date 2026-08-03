/**
 * Once a point has escaped, it must never be counted again.
 *
 * `npm run test:live`. Excluded from the required checks, like the rest of the
 * live suite — this is APL, so only the real interpreter can answer it.
 *
 * The counting used to re-test the escape condition every step rather than
 * record it. That is safe for an orbit that runs to infinity and unsafe for the
 * one actually iterated: the magnitude is clamped to keep an escaped point from
 * overflowing to not-a-number, and a clamped orbit is bounded, so it can fall
 * back inside the escape radius and resume counting.
 *
 * No view the sliders can reach does this. The smallest such `c` has magnitude
 * about 72 and the sliders stop near 4 — but the code is editable, which is the
 * whole premise of the application, so the count must not depend on nobody
 * typing it.
 */

import { describe, expect, it } from 'vitest';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { runArtwork } from '@/execution/runArtwork';
import { mandelbrotField } from '@/presets/mandelbrot-field';

const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };

/**
 * `centreX←¯72.4`, found by sweeping the clamped map for an orbit that returns.
 *
 * Its trace, by hand: z starts at 0 and is counted (1). It becomes ¯72.4, which
 * clamps to ¯9, so the magnitude is 81 and the point has escaped. Next it is
 * ¯72.4 + 81 = 8.6, still out. Then ¯72.4 + 73.96 = 1.56, whose magnitude is
 * 2.43 — inside. Re-testing the condition counts it again; recording the escape
 * does not.
 */
function reentryCase(): string {
  return mandelbrotField.code
    .split('\n')
    .map((line) => {
      if (line.startsWith('size←')) return 'size←8';
      if (line.startsWith('iterations←')) return 'iterations←12';
      if (line.startsWith('centreX←')) return 'centreX←¯72.4';
      if (line.startsWith('centreY←')) return 'centreY←0';
      if (line.startsWith('zoom←')) return 'zoom←0.001';
      return line;
    })
    .join('\n');
}

async function draw(source: string) {
  return runArtwork({
    service: new TryAplExecutionService({ endpoint: ENDPOINT }),
    source,
    limits: LIMITS,
    timeoutMs: 30_000,
  });
}

describe('escape is recorded, not re-tested', () => {
  it('stops counting permanently at the first escape', async () => {
    const run = await draw(reentryCase());
    const values = [...new Set(run.matrix.values)];

    /*
     * One, and only one: the step taken from z = 0 before anything had escaped.
     * Every later step finds the point already marked, whatever its magnitude
     * happens to be by then.
     */
    expect(values).toEqual([1]);
  });

  it('would have counted more without the mask, or this proves nothing', async () => {
    // The same view through the previous formulation, so a change that quietly
    // stopped reproducing the fault is caught rather than passing silently.
    const previous = reentryCase()
      .replace(
        'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}',
        'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}',
      )
      .replace('⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)', '⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)');

    const run = await draw(previous);
    expect(Math.max(...run.matrix.values)).toBeGreaterThan(1);
  });

  it('leaves the default view exactly as it was', async () => {
    // The fault is unreachable through the controls, so the artwork anybody has
    // actually seen must not have moved by a single cell.
    const run = await draw(mandelbrotField.code);
    const stats = { min: Math.min(...run.matrix.values), max: Math.max(...run.matrix.values) };

    expect(run.matrix.rows).toBe(128);
    expect(stats).toEqual({ min: 1, max: 28 });
  });
});

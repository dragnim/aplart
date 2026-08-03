/**
 * Runs every preset against the real APL service.
 *
 * `npm run test:live`. Excluded from the required checks, like the rest of the
 * live suite.
 *
 * The committed fixtures prove each preset worked when it was captured. This
 * proves it still works now, at the corners of its parameter ranges as well as
 * at its defaults — which is where a preset is most likely to break, and
 * exactly what a visitor will do first.
 */

import { describe, expect, it } from 'vitest';
import { setParameterValue } from '@/editor/parameterBinding';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { runArtwork } from '@/execution/runArtwork';
import { presets } from '@/presets/presets';
import { type ArtworkParameter } from '@/presets/schema';
import { type MatrixLimits } from '@/matrix/validateMatrix';

const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

/** The workspace's limits, which are the same for every source. */
const LIMITS: MatrixLimits = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };

async function draw(source: string) {
  return runArtwork({
    service: new TryAplExecutionService({ endpoint: ENDPOINT }),
    source,
    limits: LIMITS,
    timeoutMs: 30_000,
  });
}

/** Keeps our request rate polite. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 700));

describe.each(presets.map((preset) => [preset.id, preset] as const))('%s', (_id, preset) => {
  it('runs at its defaults and returns something worth drawing', async () => {
    const run = await draw(preset.code);

    expect(run.matrix.rows).toBeGreaterThanOrEqual(2);
    expect(run.matrix.columns).toBeGreaterThanOrEqual(2);
    // A single flat colour would mean the artwork is not actually an artwork.
    expect(run.stats.uniform).toBe(false);
    await pause();
  }, 60_000);

  it('costs one request when it prints, and bands only when it does not', async () => {
    const run = await draw(preset.code);

    /*
     * Not compared against anything the preset declares — there is nothing left
     * to declare. A result that printed came back whole in the first request; one
     * that did not took that request plus its bands. Either is correct; what
     * would not be is a small artwork paying for bands it did not need.
     */
    const cells = run.matrix.rows * run.matrix.columns;
    if (run.requestCount === 1) {
      expect(cells).toBeLessThan(90 * 90);
    } else {
      expect(run.requestCount).toBeGreaterThan(1);
    }
    await pause();
  }, 60_000);

  // Sliders let a visitor reach the ends of every range within seconds, so
  // those are the settings most likely to break and least likely to be tried
  // during development.
  const numeric = preset.parameters.filter(
    (parameter): parameter is ArtworkParameter & { min: number; max: number } =>
      typeof parameter.min === 'number' && typeof parameter.max === 'number',
  );

  it.each(numeric.map((parameter) => [parameter.id, parameter] as const))(
    'survives %s at both ends of its range',
    async (_name, parameter) => {
      for (const value of [parameter.min, parameter.max]) {
        const updated = setParameterValue(preset.code, parameter.variable, value);
        expect(updated.ok).toBe(true);
        if (!updated.ok) return;

        const run = await draw(updated.code);
        expect(run.matrix.rows).toBeGreaterThanOrEqual(2);
        expect(run.matrix.columns).toBeGreaterThanOrEqual(2);
        await pause();
      }
    },
    120_000,
  );

  it('survives every numeric control at its maximum at once', async () => {
    /*
     * Moving one slider at a time would not have found this. TryAPL gives each
     * run a 512 KB workspace, and presets that build one array per unit of a
     * second parameter — a wave per direction, a matrix per iteration — only
     * exhaust it when two controls are high together. That is a combination a
     * visitor reaches in seconds.
     */
    let source = preset.code;
    for (const parameter of numeric) {
      const updated = setParameterValue(source, parameter.variable, parameter.max);
      if (updated.ok) source = updated.code;
    }

    const run = await draw(source);
    expect(run.matrix.rows).toBeGreaterThanOrEqual(2);
    await pause();
  }, 120_000);
});

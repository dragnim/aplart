/**
 * Checks that recording escape instead of re-testing it changed nothing else.
 *
 *     npx tsx scripts/verify-escape-mask.ts
 *
 * Three questions, in order of importance:
 *
 *   1. Does the constructed re-entry case now stop counting at first escape?
 *   2. Does every fixture and benchmark view produce the identical matrix?
 *   3. Is it meaningfully slower?
 *
 * A one-off check rather than a suite test: it costs a few dozen live requests,
 * and the evidence belongs in the commit that makes the change.
 */

import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { type NumericMatrix } from '../src/matrix/matrixTypes';
import { mandelbrotField } from '../src/presets/mandelbrot-field';
import { SIZES, VIEWS } from './lib/mandelbrotVariants';

const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };
const GAP_MS = 900;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The step and seed as they were before escape was recorded. */
const OLD_STEP = 'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}';
const OLD_SEED = '⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)';
const NEW_STEP = 'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}';
const NEW_SEED = '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)';

/** The shipped preset with the mask taken back out, for comparison only. */
function withoutMask(code: string): string {
  return code.replace(NEW_STEP, OLD_STEP).replace(NEW_SEED, OLD_SEED);
}

function withParameters(code: string, values: Readonly<Record<string, number>>): string {
  return code
    .split('\n')
    .map((line) => {
      for (const [name, value] of Object.entries(values)) {
        if (line.startsWith(`${name}←`)) {
          return `${name}←${String(value).replace('-', '¯')}`;
        }
      }
      return line;
    })
    .join('\n');
}

const service = new TryAplExecutionService();

async function run(source: string): Promise<{ matrix: NumericMatrix; ms: number }> {
  const startedAt = Date.now();
  const outcome = await runArtwork({
    service,
    source,
    highResolution: true,
    limits: LIMITS,
    timeoutMs: 30_000,
  });
  return { matrix: outcome.matrix, ms: Date.now() - startedAt };
}

function differences(a: NumericMatrix, b: NumericMatrix): number {
  if (a.rows !== b.rows || a.columns !== b.columns) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let index = 0; index < a.values.length; index += 1) {
    if (a.values[index] !== b.values[index]) count += 1;
  }
  return count;
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

async function main(): Promise<number> {
  let failures = 0;

  // ---- 1. The constructed case. ----
  console.log('Re-entry case: centreX←¯72.4, where a clamped orbit falls back inside\n');

  const constructed = withParameters(mandelbrotField.code, {
    size: 8,
    iterations: 8,
    centreX: -72.4,
    centreY: 0,
    zoom: 0.001,
  });

  const withMask = await run(constructed);
  await sleep(GAP_MS);
  const noMask = await run(withoutMask(constructed));
  await sleep(GAP_MS);

  const maskedValues = [...new Set(withMask.matrix.values)];
  const unmaskedValues = [...new Set(noMask.matrix.values)];
  console.log(`  without the mask : ${unmaskedValues.join(', ')}`);
  console.log(`  with the mask    : ${maskedValues.join(', ')}`);

  if (maskedValues.length !== 1 || maskedValues[0] !== 1) {
    console.log('  FAILED — counting did not stop at first escape');
    failures += 1;
  } else if (unmaskedValues.some((value) => value > 1)) {
    console.log('  passed — the old code resumed counting; the new code stops permanently\n');
  } else {
    console.log('  INCONCLUSIVE — the old code did not resume here either\n');
    failures += 1;
  }

  // ---- 2. Equality everywhere it matters. ----
  console.log('Output agreement across the benchmark views and the fixture size\n');

  const cases = [
    // The fixture's exact parameters, so the committed fixture is covered.
    { label: 'fixture (default view)', size: 128, iterations: 28, view: VIEWS[0] as (typeof VIEWS)[number] },
    ...VIEWS.flatMap((view) =>
      [SIZES[0] as number, SIZES[3] as number].flatMap((size) =>
        [16, 60].map((iterations) => ({
          label: `${view.id} ${size}² ×${iterations}`,
          size,
          iterations,
          view,
        })),
      ),
    ),
  ];

  for (const testCase of cases) {
    const parameters = {
      size: testCase.size,
      iterations: testCase.iterations,
      centreX: testCase.view.centreX,
      centreY: testCase.view.centreY,
      zoom: testCase.view.zoom,
    };
    const source = withParameters(mandelbrotField.code, parameters);

    const now = await run(source);
    await sleep(GAP_MS);
    const before = await run(withoutMask(source));
    await sleep(GAP_MS);

    const differing = differences(now.matrix, before.matrix);
    const verdict = differing === 0 ? 'identical' : `${String(differing)} DIFFERING`;
    if (differing !== 0) failures += 1;
    console.log(`  ${testCase.label.padEnd(28)} ${verdict}`);
  }

  // ---- 3. Cost. ----
  console.log('\nCost of the mask, three runs each at 144² × 60\n');

  const timing = withParameters(mandelbrotField.code, {
    size: 144,
    iterations: 60,
    centreX: -0.6,
    centreY: 0,
    zoom: 1.4,
  });

  const withMaskMs: number[] = [];
  const withoutMaskMs: number[] = [];
  for (let repetition = 0; repetition < 3; repetition += 1) {
    // Alternated, so a slow spell does not land on one of them.
    const first = repetition % 2 === 0;
    const a = await run(first ? timing : withoutMask(timing));
    await sleep(GAP_MS);
    const b = await run(first ? withoutMask(timing) : timing);
    await sleep(GAP_MS);
    withMaskMs.push(first ? a.ms : b.ms);
    withoutMaskMs.push(first ? b.ms : a.ms);
  }

  const now = median(withMaskMs);
  const before = median(withoutMaskMs);
  console.log(`  without the mask : ${withoutMaskMs.join(', ')} ms  (median ${String(before)})`);
  console.log(`  with the mask    : ${withMaskMs.join(', ')} ms  (median ${String(now)})`);
  console.log(`  change           : ${(((now - before) / before) * 100).toFixed(0)}%`);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${String(failures)} check(s) failed.`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = await main();

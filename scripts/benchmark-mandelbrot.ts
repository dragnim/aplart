/**
 * Compares two Mandelbrot implementations against the live APL service.
 *
 *     npm run benchmark:mandelbrot
 *     npm run benchmark:mandelbrot -- --repeats 3 --out docs/data/…json
 *
 * Writes raw observations, one JSON line per run, so the summary can be
 * regenerated — and disputed — without running the whole thing again.
 *
 * Two things shape the method, and both come from the service being shared and
 * remote. Timings include network and whatever else the server is doing, so a
 * single measurement says nothing; and running all of one implementation before
 * all of the other would let a slow ten minutes land entirely on one of them.
 * So: rotated order, alternating which variant goes first, several repetitions,
 * medians rather than means, and a warm-up that is thrown away.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AplExecutionRequest,
  type AplExecutionResult,
  type AplExecutionService,
} from '../src/execution/AplExecutionService';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { type NumericMatrix } from '../src/matrix/matrixTypes';
import {
  CEILINGS,
  SIZES,
  VIEWS,
  sourceFor,
  viewParameters,
  type VariantId,
  type ViewKind,
} from './lib/mandelbrotVariants';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

const VARIANTS: readonly VariantId[] = ['full-matrix', 'active-points'];

/** Generous, so a slow response is recorded as slow rather than as a timeout. */
const TIMEOUT_MS = 30_000;
/** Between requests, so a benchmark is not a burst against a free service. */
const REQUEST_GAP_MS = 900;
const LIMITS = { maxRows: 320, maxColumns: 320, maxCells: 102_400 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Wraps the real service to count requests, bytes and gaps.
 *
 * The delay lives here rather than around each run so it applies between every
 * request including the bands within one, which is where a burst would
 * otherwise happen.
 */
class MeasuredService implements AplExecutionService {
  readonly capabilities;
  requests = 0;
  bytes = 0;
  /**
   * Time spent waiting for the service, with the pacing delay excluded.
   *
   * The delay between requests is politeness, not part of what is being
   * compared, and leaving it inside the measurement buried the difference: at
   * 64² both implementations came out at about 1,120 ms, which was two 900 ms
   * gaps and almost nothing else.
   */
  serviceMs = 0;

  private readonly inner: AplExecutionService;

  constructor(inner: AplExecutionService) {
    this.inner = inner;
    this.capabilities = inner.capabilities;
  }

  reset() {
    this.requests = 0;
    this.bytes = 0;
    this.serviceMs = 0;
  }

  async execute(request: AplExecutionRequest): Promise<AplExecutionResult> {
    if (this.requests > 0) await sleep(REQUEST_GAP_MS);
    this.requests += 1;

    const startedAt = Date.now();
    const result = await this.inner.execute(request);
    this.serviceMs += Date.now() - startedAt;

    this.bytes += result.rawOutput.length;
    return result;
  }

  cancel(): void {
    this.inner.cancel();
  }
}

/** FNV-1a over the values, so two runs can be compared without storing them. */
function digest(matrix: NumericMatrix): string {
  let hash = 0x811c9dc5;
  for (const value of matrix.values) {
    // Values are small integers here; the text form keeps this readable and
    // avoids depending on a float bit layout.
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2c;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

interface Observation {
  readonly kind: 'run';
  readonly repetition: number;
  readonly order: number;
  readonly variant: VariantId;
  readonly view: string;
  readonly size: number;
  readonly iterations: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
  readonly ok: boolean;
  /** Round-trip time summed over the run's requests, excluding pacing delays. */
  readonly serviceMs: number | null;
  /** Wall clock including the pacing delays, for the record. */
  readonly durationMs: number | null;
  readonly requestCount: number;
  readonly bytes: number;
  readonly rows: number | null;
  readonly columns: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly digest: string | null;
  readonly errorKind: string | null;
  readonly errorMessage: string | null;
}

interface RunOutcome {
  readonly observation: Observation;
  readonly matrix: NumericMatrix | null;
}

async function measure(
  service: MeasuredService,
  variant: VariantId,
  view: ViewKind,
  size: number,
  iterations: number,
  repetition: number,
  order: number,
): Promise<RunOutcome> {
  const parameters = viewParameters(view, size, iterations);
  const source = sourceFor(variant, parameters);
  service.reset();

  const base = {
    kind: 'run' as const,
    repetition,
    order,
    variant,
    view: view.id,
    size,
    iterations,
    centreX: view.centreX,
    centreY: view.centreY,
    zoom: view.zoom,
  };

  const startedAt = Date.now();
  try {
    const run = await runArtwork({
      service,
      source,
      // As the preset ships: banded transport, so what is timed is what a
      // visitor would actually wait for.
      limits: LIMITS,
      timeoutMs: TIMEOUT_MS,
    });

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of run.matrix.values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }

    return {
      observation: {
        ...base,
        ok: true,
        serviceMs: service.serviceMs,
        durationMs: Date.now() - startedAt,
        requestCount: service.requests,
        bytes: service.bytes,
        rows: run.matrix.rows,
        columns: run.matrix.columns,
        min,
        max,
        digest: digest(run.matrix),
        errorKind: null,
        errorMessage: null,
      },
      matrix: run.matrix,
    };
  } catch (error) {
    const kind = (error as { kind?: string }).kind ?? 'unknown';
    return {
      observation: {
        ...base,
        ok: false,
        serviceMs: service.serviceMs,
        durationMs: Date.now() - startedAt,
        requestCount: service.requests,
        bytes: service.bytes,
        rows: null,
        columns: null,
        min: null,
        max: null,
        digest: null,
        errorKind: kind,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      matrix: null,
    };
  }
}

interface Comparison {
  readonly kind: 'comparison';
  readonly repetition: number;
  readonly view: string;
  readonly size: number;
  readonly iterations: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
  readonly bothSucceeded: boolean;
  readonly sameShape: boolean | null;
  readonly rows: number | null;
  readonly columns: number | null;
  readonly differingCells: number | null;
  readonly maxAbsoluteDifference: number | null;
  /** One-based, as APL indexes and as the inspector reports. */
  readonly firstDifference: { row: number; column: number; a: number; b: number } | null;
}

function compare(
  a: NumericMatrix | null,
  b: NumericMatrix | null,
  context: Omit<
    Comparison,
    | 'kind'
    | 'bothSucceeded'
    | 'sameShape'
    | 'rows'
    | 'columns'
    | 'differingCells'
    | 'maxAbsoluteDifference'
    | 'firstDifference'
  >,
): Comparison {
  if (a === null || b === null) {
    return {
      kind: 'comparison',
      ...context,
      bothSucceeded: false,
      sameShape: null,
      rows: null,
      columns: null,
      differingCells: null,
      maxAbsoluteDifference: null,
      firstDifference: null,
    };
  }

  const sameShape = a.rows === b.rows && a.columns === b.columns;
  if (!sameShape) {
    return {
      kind: 'comparison',
      ...context,
      bothSucceeded: true,
      sameShape: false,
      rows: a.rows,
      columns: a.columns,
      differingCells: null,
      maxAbsoluteDifference: null,
      firstDifference: null,
    };
  }

  let differing = 0;
  let worst = 0;
  let first: Comparison['firstDifference'] = null;

  for (let index = 0; index < a.values.length; index += 1) {
    const left = a.values[index] as number;
    const right = b.values[index] as number;
    if (left === right) continue;

    differing += 1;
    const gap = Math.abs(left - right);
    if (gap > worst) worst = gap;
    first ??= {
      row: Math.floor(index / a.columns) + 1,
      column: (index % a.columns) + 1,
      a: left,
      b: right,
    };
  }

  return {
    kind: 'comparison',
    ...context,
    bothSucceeded: true,
    sameShape: true,
    rows: a.rows,
    columns: a.columns,
    differingCells: differing,
    maxAbsoluteDifference: worst,
    firstDifference: first,
  };
}

interface CeilingProbe {
  readonly kind: 'ceiling';
  readonly variant: VariantId;
  readonly size: number;
  readonly ok: boolean;
  readonly requestCount: number;
  readonly durationMs: number;
  readonly errorKind: string | null;
  readonly errorMessage: string | null;
}

async function main(): Promise<number> {
  const repeats = argument('repeats', 3);
  const outPath = join(REPO_ROOT, stringArgument('out', 'docs/data/mandelbrot-benchmark-raw.jsonl'));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, '');

  const service = new MeasuredService(new TryAplExecutionService());
  const record = async (line: unknown) => appendFile(outPath, `${JSON.stringify(line)}\n`);

  await record({
    kind: 'meta',
    startedAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    repeats,
    requestGapMs: REQUEST_GAP_MS,
    timeoutMs: TIMEOUT_MS,
    sizes: SIZES,
    ceilings: CEILINGS,
    views: VIEWS,
    node: process.version,
    platform: process.platform,
  });

  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Raw observations: ${outPath}\n`);

  /*
   * Warm-up, discarded. The first request of a session pays for connection
   * setup and whatever the service does to wake up, and charging that to
   * whichever implementation happened to go first would be a lie.
   */
  process.stdout.write('Warm-up (discarded) ');
  for (const variant of VARIANTS) {
    await measure(service, variant, VIEWS[0] as ViewKind, 64, 16, 0, 0);
    process.stdout.write('.');
    await sleep(REQUEST_GAP_MS);
  }
  console.log(' done\n');

  const cases = SIZES.flatMap((size) =>
    CEILINGS.flatMap((iterations) => VIEWS.map((view) => ({ size, iterations, view }))),
  );

  let done = 0;
  const total = cases.length * repeats * VARIANTS.length;

  for (let repetition = 1; repetition <= repeats; repetition += 1) {
    // Rotated, so a slow spell on the service does not always land on the same
    // cases, and never on the same cases in the same order.
    const offset = Math.floor((repetition - 1) * (cases.length / repeats));

    for (let step = 0; step < cases.length; step += 1) {
      const testCase = cases[(step + offset) % cases.length];
      if (testCase === undefined) continue;
      const { size, iterations, view } = testCase;

      // Alternated, so neither implementation is always measured first within a
      // pair and always pays for whatever the other one warmed up.
      const order: readonly VariantId[] = (repetition + step) % 2 === 0 ? VARIANTS : [...VARIANTS].reverse();

      const results = new Map<VariantId, NumericMatrix | null>();
      for (const variant of order) {
        const outcome = await measure(service, variant, view, size, iterations, repetition, step);
        await record(outcome.observation);
        results.set(variant, outcome.matrix);
        done += 1;
        await sleep(REQUEST_GAP_MS);
      }

      await record(
        compare(results.get('full-matrix') ?? null, results.get('active-points') ?? null, {
          repetition,
          view: view.id,
          size,
          iterations,
          centreX: view.centreX,
          centreY: view.centreY,
          zoom: view.zoom,
        }),
      );

      const percent = Math.round((100 * done) / total);
      process.stdout.write(
        `\r  ${String(percent).padStart(3)}%  rep ${repetition}/${repeats}  ${view.id} ${size}² ×${iterations}          `,
      );
    }
  }
  console.log('\n');

  /*
   * How large each implementation can go before the workspace refuses.
   *
   * Ascending until two consecutive failures, because one can be a bad minute
   * on a shared service rather than a limit.
   */
  console.log('Probing the resolution ceiling');
  for (const variant of VARIANTS) {
    let consecutiveFailures = 0;
    for (const size of [144, 160, 176, 192, 208, 224, 240]) {
      const outcome = await measure(service, variant, VIEWS[0] as ViewKind, size, 28, 0, 0);
      const probe: CeilingProbe = {
        kind: 'ceiling',
        variant,
        size,
        ok: outcome.observation.ok,
        requestCount: outcome.observation.requestCount,
        durationMs: outcome.observation.durationMs ?? 0,
        errorKind: outcome.observation.errorKind,
        errorMessage: outcome.observation.errorMessage,
      };
      await record(probe);
      console.log(
        `  ${variant.padEnd(14)} ${String(size).padStart(3)}²  ${probe.ok ? 'ok' : `failed (${probe.errorKind ?? '?'})`}`,
      );

      consecutiveFailures = probe.ok ? 0 : consecutiveFailures + 1;
      if (consecutiveFailures >= 2) break;
      await sleep(REQUEST_GAP_MS);
    }
  }

  await record({ kind: 'meta-end', finishedAt: new Date().toISOString() });
  console.log(`\nWritten to ${outPath}`);
  return 0;
}

process.exitCode = await main();

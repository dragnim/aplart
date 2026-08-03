/**
 * Measures what raising Mandelbrot's iteration ceiling costs, against the live service.
 *
 *     npm run benchmark:iterations
 *     npm run benchmark:iterations -- --repeats 3 --out docs/data/…jsonl
 *
 * The method is the algorithm benchmark's, for the same reasons: the service is
 * shared and remote, so a single timing says nothing, and running all of one
 * ceiling before all of another would let a slow ten minutes land entirely on
 * one of them. Hence rotated order, a discarded warm-up per combination,
 * repetitions, medians rather than means, and one raw JSON line per run so the
 * summary can be regenerated — and disputed — without running it again.
 *
 * Two things this deliberately does differently. It runs the shipped
 * `mandelbrot-field.apl` with the view and ceiling written in through the same
 * parameter binding a slider uses, because the question is what a visitor waits
 * for. And it stops rather than pushing through a bad patch: a run of failures
 * or a sustained collapse in latency is an outage, and mixing one into a median
 * would produce a recommendation about the afternoon rather than about the
 * ceiling.
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
import { CEILINGS, SIZES, VIEWS, sourceFor, type IterationView } from './lib/iterationViews';
import { combinationKey, isAbnormal, schedule, stopReason } from './lib/iterationSchedule';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

/** Generous, so a slow response is recorded as slow rather than as a timeout. */
const TIMEOUT_MS = 30_000;
/** Between requests, so a benchmark is not a burst against a free service. */
const REQUEST_GAP_MS = 900;
const LIMITS = { maxRows: 320, maxColumns: 320, maxCells: 102_400 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A clock that only goes forwards.
 *
 * `Date.now()` is wall time and can step backwards when the system clock is
 * corrected. One run of an earlier benchmark recorded a service time of −469 ms
 * and a wall time shorter than its own mandatory pacing, which is exactly that:
 * an NTP adjustment landing mid-run. A duration measured against a monotonic
 * clock cannot be negative however the calendar is adjusted underneath it.
 */
const now = () => performance.now();

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
 * Wraps the real service to count requests and bytes, and to pace them.
 *
 * The delay lives here rather than around each run so it applies between every
 * request including the bands within one, which is where a burst would
 * otherwise happen. `serviceMs` excludes it: the pacing is politeness, not part
 * of what is being measured, and leaving it in swamps the difference.
 */
class MeasuredService implements AplExecutionService {
  readonly capabilities;
  requests = 0;
  bytes = 0;
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

    const startedAt = now();
    const result = await this.inner.execute(request);
    this.serviceMs += now() - startedAt;

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
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2c;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * What the matrix contains, as the two numbers the visual question turns on.
 *
 * `atCeiling` is the fraction of cells that never escaped — the part of the
 * picture a higher ceiling can move. `distinct` is how many different counts
 * are present, which is how many bands the colouring has to work with. Between
 * them they say whether raising the ceiling added anything, without needing an
 * image.
 */
function structure(matrix: NumericMatrix, iterations: number) {
  let atCeiling = 0;
  const seen = new Set<number>();
  for (const value of matrix.values) {
    if (value >= iterations) atCeiling += 1;
    seen.add(value);
  }
  return {
    atCeilingFraction: atCeiling / matrix.values.length,
    distinctValues: seen.size,
  };
}

interface Observation {
  readonly kind: 'run';
  readonly warmUp: boolean;
  readonly repetition: number;
  readonly order: number;
  readonly view: string;
  readonly size: number;
  readonly iterations: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
  readonly ok: boolean;
  /** Round-trip time summed over the run's requests, excluding pacing delays. */
  readonly serviceMs: number | null;
  /**
   * End-to-end wall clock, including this benchmark's pacing delays.
   *
   * Not what a visitor waits for. The application makes its band requests back
   * to back; the 900 ms gaps exist only so a benchmark is not a burst against a
   * free service, and they add about 1.8 s to a three-request run. The visitor-
   * facing figure is `serviceMs`.
   */
  readonly durationMs: number | null;
  readonly requestCount: number;
  readonly bytes: number;
  readonly rows: number | null;
  readonly columns: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly atCeilingFraction: number | null;
  readonly distinctValues: number | null;
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
  view: IterationView,
  size: number,
  iterations: number,
  repetition: number,
  order: number,
  warmUp: boolean,
): Promise<RunOutcome> {
  const source = sourceFor(view, size, iterations);
  service.reset();

  const base = {
    kind: 'run' as const,
    warmUp,
    repetition,
    order,
    view: view.id,
    size,
    iterations,
    centreX: view.centreX,
    centreY: view.centreY,
    zoom: view.zoom,
  };

  const startedAt = now();
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
    const shape = structure(run.matrix, iterations);

    return {
      observation: {
        ...base,
        ok: true,
        serviceMs: Math.round(service.serviceMs),
        durationMs: Math.round(now() - startedAt),
        requestCount: service.requests,
        bytes: service.bytes,
        rows: run.matrix.rows,
        columns: run.matrix.columns,
        min,
        max,
        atCeilingFraction: shape.atCeilingFraction,
        distinctValues: shape.distinctValues,
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
        serviceMs: Math.round(service.serviceMs),
        durationMs: Math.round(now() - startedAt),
        requestCount: service.requests,
        bytes: service.bytes,
        rows: null,
        columns: null,
        min: null,
        max: null,
        atCeilingFraction: null,
        distinctValues: null,
        digest: null,
        errorKind: kind,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      matrix: null,
    };
  }
}

async function main(): Promise<number> {
  const repeats = argument('repeats', 3);
  const stamp = new Date().toISOString().slice(0, 10);
  const out = stringArgument('out', join('docs', 'data', `iteration-benchmark-${stamp}.jsonl`));
  const outPath = join(REPO_ROOT, out);
  const matrixPath = join(REPO_ROOT, '.preview', 'iteration-matrices');

  await mkdir(dirname(outPath), { recursive: true });
  await mkdir(matrixPath, { recursive: true });
  await writeFile(outPath, '', 'utf8');

  const service = new MeasuredService(new TryAplExecutionService({ endpoint: ENDPOINT }));
  const record = async (value: unknown) => appendFile(outPath, `${JSON.stringify(value)}\n`, 'utf8');

  await record({
    kind: 'meta',
    startedAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    repeats,
    sizes: SIZES,
    ceilings: CEILINGS,
    views: VIEWS,
    requestGapMs: REQUEST_GAP_MS,
    timeoutMs: TIMEOUT_MS,
    preset: 'mandelbrot-field',
    note: 'Sources produced from the shipped .apl through setParameterValues.',
  });

  const planned = schedule(repeats);
  let consecutiveFailures = 0;
  let stopped: string | null = null;

  /** Each combination's own expected cost, from its successful warm-up. */
  const baselines = new Map<string, number>();
  /**
   * Combinations of the current run of abnormally slow runs, in order.
   *
   * Keys rather than a count, because the rule requires three *different*
   * combinations: three slow runs of the same one is a slow combination whose
   * warm-up happened to be quick, not a service in trouble.
   */
  let slowStreak: string[] = [];

  /** Combinations whose warm-up has already been run and discarded. */
  const warmed = new Set<string>();
  /** One matrix per view and ceiling at the default resolution, for the montages. */
  const kept = new Set<string>();

  console.log(`${planned.length} measured runs, ${SIZES.length * VIEWS.length * CEILINGS.length} warm-ups`);

  for (let index = 0; index < planned.length; index += 1) {
    const step = planned[index];
    if (step === undefined) continue;
    const { size, view, iterations, repetition } = step;
    const key = combinationKey(view.id, size, iterations);

    // One discarded run per combination, so the first measured timing is not
    // paying for a cold cache or a fresh connection.
    if (!warmed.has(key)) {
      warmed.add(key);
      const warm = await measure(service, view, size, iterations, 0, index, true);
      await record(warm.observation);
      if (warm.observation.ok && warm.observation.durationMs !== null) {
        baselines.set(key, warm.observation.durationMs);
      }
      await sleep(REQUEST_GAP_MS);
    }

    const outcome = await measure(service, view, size, iterations, repetition, index, false);
    await record(outcome.observation);

    const { ok, durationMs } = outcome.observation;
    process.stdout.write(
      `  ${view.id.padEnd(16)} ${String(size).padStart(3)}² i${String(iterations).padStart(2)} ` +
        `r${String(repetition)} ${ok ? `${String(durationMs)} ms` : `FAILED ${String(outcome.observation.errorKind)}`}\n`,
    );

    if (ok) {
      consecutiveFailures = 0;

      /*
       * Abnormal against this combination's own warm-up, and only once enough
       * combinations have one. Any run that is not abnormal clears the streak.
       */
      const abnormal = isAbnormal(durationMs, baselines.get(key), baselines.size);
      slowStreak = abnormal ? [...slowStreak, key] : [];

      // One matrix per view and ceiling at the default resolution, written for
      // the montages. Deliberately not committed.
      const keepKey = `${view.id}:${String(iterations)}`;
      if (size === SIZES[0] && !kept.has(keepKey) && outcome.matrix !== null) {
        kept.add(keepKey);
        await writeFile(
          join(matrixPath, `${view.id}-i${String(iterations)}.json`),
          JSON.stringify({
            view: view.id,
            size,
            iterations,
            centreX: view.centreX,
            centreY: view.centreY,
            zoom: view.zoom,
            rows: outcome.matrix.rows,
            columns: outcome.matrix.columns,
            values: [...outcome.matrix.values],
          }),
          'utf8',
        );
      }
    } else {
      consecutiveFailures += 1;
      slowStreak = [];
    }

    stopped = stopReason(consecutiveFailures, slowStreak);

    if (stopped !== null) {
      /*
       * Stop rather than push on. Everything recorded so far is already on
       * disk and stays there; the run can be resumed later and the two halves
       * reported separately, which is honest in a way that averaging an outage
       * into the result would not be.
       */
      console.error(`\nStopping: ${stopped}. ${String(index + 1)} of ${String(planned.length)} runs done.`);
      await record({
        kind: 'stopped',
        reason: stopped,
        completedRuns: index + 1,
        plannedRuns: planned.length,
      });
      break;
    }

    await sleep(REQUEST_GAP_MS);
  }

  await record({ kind: 'finished', finishedAt: new Date().toISOString(), stopped });
  console.log(`\nWrote ${out}`);
  return stopped === null ? 0 : 1;
}

process.exitCode = await main();

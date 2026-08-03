/**
 * Turns the iteration benchmark's raw records into a report.
 *
 *     npm run benchmark:iterations:report -- --in docs/data/iteration-benchmark-….jsonl
 *     npx prettier --write docs/mandelbrot-iterations.md
 *
 * The second line matters: the tables here are written for correctness rather
 * than for column alignment, and `format:check` is part of the commit gate.
 *
 * Separate from the benchmark so the tables can be regenerated, corrected and
 * argued with without spending another twenty minutes of a shared service's
 * time. Everything here comes from the JSONL; nothing is remembered.
 *
 * Spread is reported beside every median. Three runs against a public endpoint
 * can produce a tidy median over a wide range, and a recommendation that rests
 * on two medians a few per cent apart while the ranges overlap completely is
 * not a measurement — so the minimum and maximum are always shown, and the
 * report says plainly when two ceilings cannot be separated.
 *
 * Service time, not wall time, is what the recommendation rests on. The
 * benchmark waits 900 ms between requests so as not to burst a free service,
 * which adds about 1.8 s to every three-request run; the application makes its
 * band requests back to back. Wall time is reported for the record, and labelled
 * as what it is.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEILINGS, SIZES, VIEWS } from './lib/iterationViews';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything below this line in the report is authored, not generated. */
const SENTINEL = '<!-- written by hand below this line -->';

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

interface Run {
  readonly kind: 'run';
  readonly warmUp: boolean;
  readonly view: string;
  readonly size: number;
  readonly iterations: number;
  readonly ok: boolean;
  readonly serviceMs: number | null;
  readonly durationMs: number | null;
  readonly requestCount: number;
  readonly bytes: number;
  readonly atCeilingFraction: number | null;
  readonly distinctValues: number | null;
  readonly digest: string | null;
  readonly errorKind: string | null;
}

interface Meta {
  readonly kind: 'meta';
  readonly startedAt: string;
  readonly endpoint: string;
  readonly repeats: number;
}

interface Stopped {
  readonly kind: 'stopped';
  readonly reason: string;
  readonly completedRuns: number;
  readonly plannedRuns: number;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number);
}

/** Median absolute deviation: spread that a single outlier cannot inflate. */
function mad(values: readonly number[]): number | null {
  const centre = median(values);
  if (centre === null) return null;
  return median(values.map((value) => Math.abs(value - centre)));
}

interface Summary {
  readonly view: string;
  readonly size: number;
  readonly iterations: number;
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly timedOut: number;
  readonly durations: readonly number[];
  readonly medianDuration: number | null;
  readonly minDuration: number | null;
  readonly maxDuration: number | null;
  readonly madDuration: number | null;
  readonly medianService: number | null;
  readonly minService: number | null;
  readonly maxService: number | null;
  readonly madService: number | null;
  /** Successful runs whose timings were unusable, e.g. a clock step. */
  readonly corrupt: number;
  readonly requests: number | null;
  readonly atCeilingFraction: number | null;
  readonly distinctValues: number | null;
  readonly digests: readonly string[];
}

function summarise(runs: readonly Run[]): Summary[] {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    if (run.warmUp) continue;
    const key = `${run.view}:${String(run.size)}:${String(run.iterations)}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }

  const summaries: Summary[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;

    const ok = group.filter((run) => run.ok);
    /*
     * Failures count towards reliability but their timings are excluded from
     * the medians: a run that gave up after thirty seconds is a reliability
     * fact, and averaging it into a duration would describe neither.
     */
    /*
     * Negative timings are discarded as corrupt rather than treated as fast.
     *
     * A duration cannot be below zero. One can appear when the system clock
     * steps backwards mid-run — an NTP correction — which invalidates that
     * run's timings without saying anything about the service. The run still
     * counts towards reliability, because it did succeed.
     */
    const usable = (value: number | null): value is number => value !== null && value >= 0;
    const durations = ok.map((run) => run.durationMs).filter(usable);
    const service = ok.map((run) => run.serviceMs).filter(usable);
    const corrupt = ok.length - Math.min(durations.length, service.length);

    summaries.push({
      view: first.view,
      size: first.size,
      iterations: first.iterations,
      attempted: group.length,
      succeeded: ok.length,
      failed: group.length - ok.length,
      timedOut: group.filter((run) => !run.ok && run.errorKind === 'timeout').length,
      durations,
      medianDuration: median(durations),
      minDuration: durations.length === 0 ? null : Math.min(...durations),
      maxDuration: durations.length === 0 ? null : Math.max(...durations),
      madDuration: mad(durations),
      medianService: median(service),
      minService: service.length === 0 ? null : Math.min(...service),
      maxService: service.length === 0 ? null : Math.max(...service),
      madService: mad(service),
      corrupt,
      requests: median(ok.map((run) => run.requestCount)),
      atCeilingFraction: ok[0]?.atCeilingFraction ?? null,
      distinctValues: ok[0]?.distinctValues ?? null,
      digests: [...new Set(ok.map((run) => run.digest).filter((value): value is string => value !== null))],
    });
  }
  return summaries;
}

const ms = (value: number | null) => (value === null ? '—' : `${String(Math.round(value))}`);
const pc = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

function label(view: string): string {
  return VIEWS.find((candidate) => candidate.id === view)?.label ?? view;
}

/**
 * Whether two ceilings can be told apart at this sample size.
 *
 * Overlapping ranges mean the medians differ by less than the noise, and the
 * honest report of that is "not distinguishable" rather than a ranking.
 */
function separable(lower: Summary | undefined, higher: Summary | undefined): boolean {
  if (lower === undefined || higher === undefined) return false;
  if (lower.maxService === null || higher.minService === null) return false;
  return higher.minService > lower.maxService;
}

async function main(): Promise<number> {
  const stamp = new Date().toISOString().slice(0, 10);
  const input = stringArgument('in', join('docs', 'data', `iteration-benchmark-${stamp}.jsonl`));
  const output = stringArgument('out', join('docs', 'mandelbrot-iterations.md'));

  const text = await readFile(join(REPO_ROOT, input), 'utf8');
  const records = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Meta | Run | Stopped);

  const meta = records.find((record): record is Meta => record.kind === 'meta');
  const stopped = records.find((record): record is Stopped => record.kind === 'stopped');
  const runs = records.filter((record): record is Run => record.kind === 'run');
  const summaries = summarise(runs);

  const lines: string[] = [];
  const at = (view: string, size: number, iterations: number) =>
    summaries.find(
      (summary) => summary.view === view && summary.size === size && summary.iterations === iterations,
    );

  lines.push('# Mandelbrot iteration review');
  lines.push('');
  lines.push(
    'Measured against the live service, running the shipped `mandelbrot-field.apl` with the view and',
    'ceiling written in through the same parameter binding a slider uses. Generated by',
    '`npm run benchmark:iterations:report`; every number here comes from the raw records beside it.',
  );
  lines.push('');
  lines.push(`- Endpoint: \`${meta?.endpoint ?? 'unknown'}\``);
  lines.push(`- Started: ${meta?.startedAt ?? 'unknown'}`);
  lines.push(`- Raw records: \`${input}\``);
  lines.push(`- Measured runs per combination: ${String(meta?.repeats ?? 0)}, after a discarded warm-up`);
  lines.push(
    `- Total runs recorded: ${String(runs.length)} (${String(runs.filter((run) => run.warmUp).length)} warm-ups)`,
  );
  if (stopped !== undefined) {
    lines.push('');
    lines.push(
      `> **Stopped early.** ${stopped.reason}. ${String(stopped.completedRuns)} of`,
      `> ${String(stopped.plannedRuns)} planned runs completed. The records already written are kept;`,
      '> the remainder should be run separately rather than mixed into these medians.',
    );
  }
  lines.push('');

  lines.push('## Reliability');
  lines.push('');
  const attempted = summaries.reduce((total, summary) => total + summary.attempted, 0);
  const succeeded = summaries.reduce((total, summary) => total + summary.succeeded, 0);
  const timedOut = summaries.reduce((total, summary) => total + summary.timedOut, 0);
  const corrupt = summaries.reduce((total, summary) => total + summary.corrupt, 0);
  lines.push(
    `${String(succeeded)} of ${String(attempted)} measured runs succeeded. ` +
      `${String(attempted - succeeded)} failed, of which ${String(timedOut)} timed out. ` +
      'Failed runs are counted here and excluded from every timing below.',
  );
  if (corrupt > 0) {
    lines.push('');
    lines.push(
      `${String(corrupt)} successful run(s) recorded a negative duration and their timings are`,
      'excluded. A duration cannot be below zero; this is the system clock stepping backwards',
      'mid-run, which invalidates that run’s timings while saying nothing about the service. The',
      'benchmark now measures against a monotonic clock so it cannot recur.',
    );
  }
  lines.push('');

  const failures = summaries.filter((summary) => summary.failed > 0);
  if (failures.length > 0) {
    lines.push('| View | Size | Iterations | Attempted | Failed | Timed out |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const summary of failures) {
      lines.push(
        `| ${label(summary.view)} | ${String(summary.size)} | ${String(summary.iterations)} | ` +
          `${String(summary.attempted)} | ${String(summary.failed)} | ${String(summary.timedOut)} |`,
      );
    }
    lines.push('');
  }

  for (const size of SIZES) {
    lines.push(`## ${String(size)} × ${String(size)}`);
    lines.push('');
    lines.push(
      '**Service time is the figure that matters.** It is the round trip alone, which is what a',
      'visitor waits for after a drag: the application issues its band requests back to back. Wall',
      'time is given for the record and includes this benchmark’s 900 ms pacing between requests —',
      'about 1.8 s of every three-request run that no visitor ever experiences.',
    );
    lines.push('');
    lines.push(
      '| View | Iter | Service ms | Service min–max | MAD | Requests | Wall ms (paced) | At ceiling | Distinct values |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

    for (const view of VIEWS) {
      for (const iterations of CEILINGS) {
        const summary = at(view.id, size, iterations);
        if (summary === undefined) continue;
        lines.push(
          `| ${view.label} | ${String(iterations)} | ${ms(summary.medianService)} | ` +
            `${ms(summary.minService)}–${ms(summary.maxService)} | ${ms(summary.madService)} | ` +
            `${ms(summary.requests)} | ${ms(summary.medianDuration)} | ${pc(summary.atCeilingFraction)} | ` +
            `${String(summary.distinctValues ?? '—')} |`,
        );
      }
    }
    lines.push('');
  }

  lines.push('## Can the ceilings be told apart?');
  lines.push('');
  lines.push(
    'On service time. A pair is separable only when the slower ceiling’s fastest run is still slower',
    'than the quicker ceiling’s slowest. Anything else means the medians differ by less than the noise',
    'at three runs, and the honest answer is that they cannot be told apart rather than a ranking.',
  );
  lines.push('');
  lines.push('| View | Size | 28 → 40 | 40 → 48 | 48 → 60 | 28 → 60 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  const yes = (value: boolean) => (value ? 'separable' : 'not distinguishable');
  for (const size of SIZES) {
    for (const view of VIEWS) {
      lines.push(
        `| ${view.label} | ${String(size)} | ` +
          `${yes(separable(at(view.id, size, 28), at(view.id, size, 40)))} | ` +
          `${yes(separable(at(view.id, size, 40), at(view.id, size, 48)))} | ` +
          `${yes(separable(at(view.id, size, 48), at(view.id, size, 60)))} | ` +
          `${yes(separable(at(view.id, size, 28), at(view.id, size, 60)))} |`,
      );
    }
  }
  lines.push('');

  lines.push('## What a higher ceiling changes in the picture');
  lines.push('');
  lines.push(
    'The two structural numbers, at the default resolution. `At ceiling` is the share of cells that',
    'never escaped — the part of the image a higher ceiling can move. `Distinct values` is how many',
    'different counts the colouring has to work with. Neither depends on the palette.',
  );
  lines.push('');
  lines.push('| View | 28 | 40 | 48 | 60 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const view of VIEWS) {
    const cells = CEILINGS.map((iterations) => {
      const summary = at(view.id, SIZES[0] as number, iterations);
      return summary === undefined
        ? '—'
        : `${pc(summary.atCeilingFraction)} / ${String(summary.distinctValues ?? '—')}`;
    });
    lines.push(`| ${view.label} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('Each cell is `at ceiling / distinct values`.');
  lines.push('');

  lines.push('## Reproducibility');
  lines.push('');
  const unstable = summaries.filter((summary) => summary.digests.length > 1);
  lines.push(
    unstable.length === 0
      ? 'Every combination returned the same matrix on every successful run.'
      : `${String(unstable.length)} combinations returned more than one distinct matrix, which should be investigated before the numbers above are relied on.`,
  );
  lines.push('');

  /*
   * Everything from the sentinel onwards is kept.
   *
   * The tables are generated and the recommendation is written by a person, and
   * both belong in one document. Regenerating must not silently delete the
   * reasoning — and replacing rather than appending means running this twice
   * cannot duplicate anything either.
   */
  const path = join(REPO_ROOT, output);
  const existing = await readFile(path, 'utf8').catch(() => '');
  const kept = existing.includes(SENTINEL) ? existing.slice(existing.indexOf(SENTINEL)) : `${SENTINEL}\n`;

  await writeFile(path, `${lines.join('\n')}\n${kept}`, 'utf8');
  console.log(
    `Wrote ${output} from ${String(runs.length)} records` +
      (existing.includes(SENTINEL) ? ', preserving the hand-written section' : ''),
  );
  return 0;
}

process.exitCode = await main();

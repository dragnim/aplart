/**
 * Turns the raw benchmark observations into the results tables.
 *
 *     npm run benchmark:report
 *
 * Separate from the benchmark so the numbers can be re-read, re-grouped and
 * argued with without spending another half hour of a public service's time.
 *
 * Writes the tables into the report between its generated-table markers, so the
 * prose around them stays hand-written and the numbers cannot drift from the
 * data they came from through someone copying them by hand.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(REPO_ROOT, 'docs/data/mandelbrot-benchmark-raw.jsonl');

/** The report keeps its prose; only the region between these is regenerated. */
const BEGIN = '<!-- BEGIN GENERATED TABLES -->';
const END = '<!-- END GENERATED TABLES -->';

interface Row {
  readonly kind: string;
  readonly [key: string]: unknown;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number);
}

function table(headings: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headings.map((heading, column) =>
    Math.max(heading.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(' | ')} |`;

  return [
    line(headings),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...rows.map(line),
  ].join('\n');
}

const VARIANT_LABEL: Record<string, string> = {
  'full-matrix': 'Full matrix',
  'active-points': 'Active points',
};

async function main(): Promise<number> {
  let text: string;
  try {
    text = await readFile(RAW, 'utf8');
  } catch {
    console.error(`No raw observations at ${RAW}. Run "npm run benchmark:mandelbrot" first.`);
    return 1;
  }

  const rows = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Row);

  const meta = rows.find((row) => row.kind === 'meta');
  const runs = rows.filter((row) => row.kind === 'run' && row.repetition !== 0);
  const comparisons = rows.filter((row) => row.kind === 'comparison');
  const ceilings = rows.filter((row) => row.kind === 'ceiling');

  const out: string[] = [];

  out.push('### Run parameters\n');
  out.push(
    table(
      ['Field', 'Value'],
      [
        ['Started', String(meta?.startedAt ?? 'unknown')],
        ['Finished', String(rows.find((row) => row.kind === 'meta-end')?.finishedAt ?? 'unknown')],
        ['Endpoint', String(meta?.endpoint ?? 'unknown')],
        ['Repetitions', String(meta?.repeats ?? '?')],
        ['Gap between requests', `${String(meta?.requestGapMs ?? '?')} ms`],
        ['Per-request timeout', `${String(meta?.timeoutMs ?? '?')} ms`],
        ['Runs recorded', String(runs.length)],
        ['Node', String(meta?.node ?? '?')],
      ],
    ),
  );

  // ---- Correctness, first, because performance is irrelevant without it. ----

  out.push('\n### Output agreement, every case\n');
  const byCase = new Map<string, Row[]>();
  for (const row of comparisons) {
    const key = `${String(row.view)}|${String(row.size)}|${String(row.iterations)}`;
    byCase.set(key, [...(byCase.get(key) ?? []), row]);
  }

  const agreementRows = [...byCase.entries()]
    .map(([key, group]) => {
      const first = group[0] as Row;
      const differing = group.map((row) => Number(row.differingCells ?? Number.NaN));
      const worst = group.map((row) => Number(row.maxAbsoluteDifference ?? Number.NaN));
      const anyFailed = group.some((row) => row.bothSucceeded === false);
      const firstDifference = group
        .map((row) => row.firstDifference as { row: number; column: number } | null)
        .find((value) => value !== null);

      return {
        key,
        sort: `${String(first.view)}|${String(first.size).padStart(4, '0')}|${String(first.iterations).padStart(3, '0')}`,
        cells: [
          String(first.view),
          `${String(first.size)}×${String(first.size)}`,
          String(first.iterations),
          `${String(first.centreX)}, ${String(first.centreY)}`,
          String(first.zoom),
          anyFailed ? 'run failed' : `${String(Math.max(...differing))}`,
          anyFailed ? '—' : String(Math.max(...worst)),
          firstDifference === undefined || firstDifference === null
            ? '—'
            : `r${String(firstDifference.row)} c${String(firstDifference.column)}`,
        ] as readonly string[],
      };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort));

  out.push(
    table(
      ['View', 'Size', 'Ceiling', 'Centre', 'Span', 'Differing cells', 'Max difference', 'First difference'],
      agreementRows.map((row) => row.cells),
    ),
  );

  const totalDiffering = comparisons.reduce((sum, row) => sum + Number(row.differingCells ?? 0), 0);
  const comparable = comparisons.filter((row) => row.bothSucceeded === true).length;
  out.push(
    `\n${String(comparable)} of ${String(comparisons.length)} cases had both implementations succeed. ` +
      `Differing cells across all of them: **${String(totalDiffering)}**.\n`,
  );

  // ---- Timing. ----

  out.push('\n### Median service time by size and ceiling\n');
  out.push(
    'Round-trip time summed over the requests a run needed, with the benchmark’s own pacing delay excluded.\n',
  );
  const sizes = [...new Set(runs.map((row) => Number(row.size)))].sort((a, b) => a - b);
  const iterations = [...new Set(runs.map((row) => Number(row.iterations)))].sort((a, b) => a - b);

  const timingRows: string[][] = [];
  for (const size of sizes) {
    for (const ceiling of iterations) {
      const cell = (variant: string) =>
        runs.filter(
          (row) => row.variant === variant && Number(row.size) === size && Number(row.iterations) === ceiling,
        );

      const full = cell('full-matrix')
        .filter((row) => row.ok === true)
        .map((row) => Number(row.serviceMs));
      const active = cell('active-points')
        .filter((row) => row.ok === true)
        .map((row) => Number(row.serviceMs));
      if (full.length === 0 || active.length === 0) continue;

      const fullMedian = median(full);
      const activeMedian = median(active);
      const change = ((activeMedian - fullMedian) / fullMedian) * 100;

      timingRows.push([
        `${String(size)}×${String(size)}`,
        String(ceiling),
        `${String(Math.round(fullMedian))}`,
        `${String(Math.round(Math.min(...full)))}–${String(Math.round(Math.max(...full)))}`,
        `${String(Math.round(activeMedian))}`,
        `${String(Math.round(Math.min(...active)))}–${String(Math.round(Math.max(...active)))}`,
        `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`,
      ]);
    }
  }
  out.push(
    table(
      ['Size', 'Ceiling', 'Full median ms', 'Full min–max', 'Active median ms', 'Active min–max', 'Change'],
      timingRows,
    ),
  );

  out.push('\n### Median service time by view\n');
  const views = [...new Set(runs.map((row) => String(row.view)))];
  const viewRows = views.map((view) => {
    const pick = (variant: string) =>
      runs
        .filter((row) => row.view === view && row.variant === variant && row.ok === true)
        .map((row) => Number(row.serviceMs));
    const full = pick('full-matrix');
    const active = pick('active-points');
    const fullMedian = median(full);
    const activeMedian = median(active);
    const change = ((activeMedian - fullMedian) / fullMedian) * 100;

    return [
      view,
      String(full.length),
      String(Math.round(fullMedian)),
      String(Math.round(activeMedian)),
      `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`,
    ];
  });
  out.push(table(['View', 'Runs each', 'Full median ms', 'Active median ms', 'Change'], viewRows));

  // ---- Reliability and transport. ----

  /*
   * Paired, because the medians above compare measurements taken minutes apart
   * on a service whose load nobody controls. Within a pair the two runs are
   * seconds apart on the same case, so "which was faster" survives a slow spell
   * that would move both medians together.
   */
  out.push('\n### Paired comparison, same case and repetition\n');
  out.push(
    'Each pair is one case measured twice within a few seconds. Counting wins avoids attributing a slow minute on a shared service to whichever implementation happened to be measured during it.\n',
  );

  const pairs = new Map<string, { full?: number; active?: number; view: string; size: number }>();
  for (const row of runs) {
    if (row.ok !== true) continue;
    const key = [row.repetition, row.view, row.size, row.iterations].join('|');
    const entry = pairs.get(key) ?? { view: String(row.view), size: Number(row.size) };
    if (row.variant === 'full-matrix') entry.full = Number(row.serviceMs);
    else entry.active = Number(row.serviceMs);
    pairs.set(key, entry);
  }

  const complete = [...pairs.values()].filter((pair) => pair.full !== undefined && pair.active !== undefined);

  const tally = (subset: typeof complete) => {
    let activeWins = 0;
    let fullWins = 0;
    for (const pair of subset) {
      if ((pair.active as number) < (pair.full as number)) activeWins += 1;
      else if ((pair.active as number) > (pair.full as number)) fullWins += 1;
    }
    return { activeWins, fullWins, total: subset.length };
  };

  const overall = tally(complete);
  const rate = (wins: number, total: number) => `${((100 * wins) / Math.max(1, total)).toFixed(0)}%`;
  const pairRows = [
    [
      'All cases',
      String(overall.total),
      String(overall.activeWins),
      String(overall.fullWins),
      rate(overall.activeWins, overall.total),
    ],
    ...views.map((view) => {
      const counted = tally(complete.filter((pair) => pair.view === view));
      return [
        view,
        String(counted.total),
        String(counted.activeWins),
        String(counted.fullWins),
        rate(counted.activeWins, counted.total),
      ];
    }),
  ];
  out.push(table(['Group', 'Pairs', 'Active faster', 'Full faster', 'Active win rate'], pairRows));

  out.push('\n### Median service time by view and size\n');
  out.push('Where the difference between the two is largest, and in which direction.\n');
  const viewSizeRows = views.flatMap((view) =>
    sizes.map((size) => {
      const pick = (variant: string) =>
        runs
          .filter(
            (row) =>
              row.view === view && Number(row.size) === size && row.variant === variant && row.ok === true,
          )
          .map((row) => Number(row.serviceMs));
      const full = median(pick('full-matrix'));
      const active = median(pick('active-points'));
      const change = ((active - full) / full) * 100;
      return [
        view,
        `${String(size)}×${String(size)}`,
        String(Math.round(full)),
        String(Math.round(active)),
        `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`,
      ];
    }),
  );
  out.push(table(['View', 'Size', 'Full median ms', 'Active median ms', 'Change'], viewSizeRows));

  out.push('\n### Failures, requests and response size\n');
  const reliabilityRows = ['full-matrix', 'active-points'].map((variant) => {
    const mine = runs.filter((row) => row.variant === variant);
    const failed = mine.filter((row) => row.ok === false);
    const kinds = [...new Set(failed.map((row) => String(row.errorKind)))];
    const okRuns = mine.filter((row) => row.ok === true);
    const requests = okRuns.map((row) => Number(row.requestCount));
    const bytes = okRuns.map((row) => Number(row.bytes));

    return [
      VARIANT_LABEL[variant] ?? variant,
      String(mine.length),
      String(failed.length),
      kinds.length === 0 ? '—' : kinds.join(', '),
      `${String(Math.min(...requests))}–${String(Math.max(...requests))}`,
      `${String(Math.round(median(bytes)))}`,
    ];
  });
  out.push(
    table(
      ['Implementation', 'Runs', 'Failures', 'Failure kinds', 'Requests per run', 'Median bytes'],
      reliabilityRows,
    ),
  );

  out.push('\n### Requests per run, by size\n');
  const requestRows = sizes.map((size) => {
    const at = (variant: string) =>
      runs
        .filter((row) => row.variant === variant && Number(row.size) === size && row.ok === true)
        .map((row) => Number(row.requestCount));
    const full = at('full-matrix');
    const active = at('active-points');
    const describe = (values: number[]) =>
      values.length === 0 ? '—' : [...new Set(values)].sort((a, b) => a - b).join(', ');
    return [`${String(size)}×${String(size)}`, describe(full), describe(active)];
  });
  out.push(table(['Size', 'Full matrix', 'Active points'], requestRows));

  if (ceilings.length > 0) {
    out.push('\n### Highest resolution reached\n');
    const ceilingRows = ceilings.map((row) => [
      VARIANT_LABEL[String(row.variant)] ?? String(row.variant),
      `${String(row.size)}×${String(row.size)}`,
      row.ok === true ? 'succeeded' : `failed — ${String(row.errorKind)}`,
      row.ok === true ? String(row.requestCount) : '—',
      row.ok === true ? `${String(row.durationMs)} ms` : '—',
    ]);
    out.push(table(['Implementation', 'Size', 'Outcome', 'Requests', 'Time'], ceilingRows));
  }

  const tables = out.join('\n');

  /*
   * Written into the report between markers rather than printed for pasting.
   * A results table that has to be copied by hand is one that eventually
   * disagrees with the data it came from.
   */
  const reportPath = join(REPO_ROOT, 'docs/mandelbrot-benchmark.md');
  try {
    const report = await readFile(reportPath, 'utf8');
    const start = report.indexOf(BEGIN);
    const end = report.indexOf(END);
    if (start !== -1 && end !== -1) {
      await writeFile(
        reportPath,
        `${report.slice(0, start + BEGIN.length)}\n\n${tables}\n\n${report.slice(end)}`,
      );
      console.log(`Tables written into ${reportPath}`);
      return 0;
    }
    console.error(`Markers not found in ${reportPath}; printing instead.`);
  } catch {
    console.error(`No report at ${reportPath}; printing instead.`);
  }

  console.log(tables);
  return 0;
}

process.exitCode = await main();

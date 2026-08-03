/**
 * Measures the adaptive first request against the live service.
 *
 *     npm run prototype:adaptive
 *
 * It answers one question with numbers: how many requests each of the eight
 * artworks takes, and whether a single first request can safely carry a complete
 * small result. The application now uses the module measured here, so these are
 * its own numbers rather than a forecast of them.
 *
 * Every artwork is also fetched a second way — through `runArtwork` against a
 * service reporting caps too small for anything to print, so every cell arrives
 * in a band — and the two results are compared cell for cell, because a request
 * count is worthless if the matrix is wrong.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AplExecutionRequest,
  type AplExecutionResult,
  type AplExecutionService,
} from '@/execution/AplExecutionService';
import { flattenToExpression } from '@/execution/aplSource';
import { TRYAPL_CAPABILITIES, TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { runArtwork } from '@/execution/runArtwork';
import { buildBandExpression, estimateValueWidth, isDrawableType, planBands } from '@/execution/transport';
import { parseMatrix } from '@/matrix/parseMatrix';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { presets } from '@/presets/presets';
import { buildAdaptiveExpression, parseAdaptiveReply } from '@/execution/adaptiveProbe';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const CAPS = TRYAPL_CAPABILITIES;
const LIMITS = { maxRows: 320, maxColumns: 320, maxCells: 102_400 };
const GAP_MS = 900;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const service = new TryAplExecutionService({ endpoint: ENDPOINT });

/**
 * The real endpoint, reported as though it could print only a few lines.
 *
 * The first request then always comes back as metadata, so `runArtwork` fetches
 * every cell in bands. That is the independent route the comparison needs: the
 * band expressions and the reassembly are exercised on their own, against the
 * same live service, whatever the adaptive path decided for the same source.
 */
class BandedOnlyService implements AplExecutionService {
  readonly capabilities = { ...TRYAPL_CAPABILITIES, maxOutputLines: 20 };

  readonly inner: AplExecutionService;

  constructor(inner: AplExecutionService) {
    this.inner = inner;
  }

  async execute(request: AplExecutionRequest): Promise<AplExecutionResult> {
    requests += 1;
    return this.inner.execute(request);
  }

  cancel(): void {
    this.inner.cancel();
  }
}

let requests = 0;
async function send(expression: string): Promise<readonly string[]> {
  if (requests > 0) await sleep(GAP_MS);
  requests += 1;
  const result = await service.execute({ code: expression, timeoutMs: 30_000, freshWorkspace: true });
  return result.outputLines;
}

interface Outcome {
  readonly name: string;
  readonly requests: number;
  readonly route: 'one request' | 'banded' | 'refused';
  readonly lines: number | null;
  readonly width: number | null;
  readonly shape: string;
  readonly note: string;
  readonly matrix: NumericMatrix | null;
}

/** The adaptive path, end to end: one request, then bands only if needed. */
async function adaptive(name: string, source: string): Promise<Outcome> {
  const flattened = flattenToExpression(source);
  if (!flattened.ok) {
    return {
      name,
      requests: 0,
      route: 'refused',
      lines: null,
      width: null,
      shape: '—',
      note: flattened.reason,
      matrix: null,
    };
  }

  const before = requests;
  const reply = parseAdaptiveReply(await send(buildAdaptiveExpression(flattened.statements, CAPS)));

  if (reply.kind === 'error') {
    return {
      name,
      requests: requests - before,
      route: 'refused',
      lines: null,
      width: null,
      shape: '—',
      note: reply.reason,
      matrix: null,
    };
  }

  if (reply.kind === 'matrix') {
    const parsed = parseMatrix(reply.lines);
    return {
      name,
      requests: requests - before,
      route: 'one request',
      lines: reply.lines.length,
      width: Math.max(...reply.lines.map((line) => line.length)),
      shape: parsed.ok ? `${String(parsed.matrix.rows)}×${String(parsed.matrix.columns)}` : '—',
      note: parsed.ok ? '' : parsed.failure.message,
      matrix: parsed.ok ? parsed.matrix : null,
    };
  }

  const shape = reply.shape.join('×');
  if (!isDrawableType(reply.elementType) || reply.rank !== 2 || reply.depth !== 1) {
    return {
      name,
      requests: requests - before,
      route: 'refused',
      lines: reply.lines,
      width: reply.width,
      shape,
      note: `rank ${String(reply.rank)}, depth ${String(reply.depth)}, ${reply.elementType}`,
      matrix: null,
    };
  }

  // Too tall or too wide to print, so the same bands the application already
  // uses — planned from the metadata this one request returned.
  const [rows, columns] = reply.shape;
  const total = (rows ?? 0) * (columns ?? 0);
  const plans = planBands(total, estimateValueWidth(reply.elementType), CAPS);
  const values: number[] = [];

  for (const plan of plans) {
    const band = await send(buildBandExpression(flattened.statements, plan.offset, plan.count, plan.perLine));
    const parsed = parseMatrix(band);
    if (!parsed.ok) {
      return {
        name,
        requests: requests - before,
        route: 'refused',
        lines: reply.lines,
        width: reply.width,
        shape,
        note: `band: ${parsed.failure.message}`,
        matrix: null,
      };
    }
    values.push(...parsed.matrix.values);
  }

  return {
    name,
    requests: requests - before,
    route: 'banded',
    lines: reply.lines,
    width: reply.width,
    shape,
    note: '',
    matrix: {
      rows: rows ?? 0,
      columns: columns ?? 0,
      values: Float64Array.from(values.slice(0, total)),
    },
  };
}

function digest(matrix: NumericMatrix | null): string {
  if (matrix === null) return 'none';
  let hash = 0x811c9dc5;
  for (const value of matrix.values) {
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

/** Sources that sit on the boundaries the decision turns on. */
function boundaryCases(): { name: string; source: string }[] {
  const wide = (columns: number, value: string) => `(1 ${String(columns)})⍴${value}`;
  return [
    { name: '91 lines', source: '(91 4)⍴⍳364' },
    { name: '92 lines', source: '(92 4)⍴⍳368' },
    { name: '93 lines (at cap)', source: '(93 4)⍴⍳372' },
    { name: '94 lines', source: '(94 4)⍴⍳376' },
    // Nine characters each including the separator: 110 columns is 989 wide.
    { name: 'width just under', source: wide(110, '10000000+⍳110') },
    { name: 'width near cap', source: wide(111, '10000000+⍳111') },
    { name: 'width over cap', source: wide(130, '10000000+⍳130') },
    { name: 'boolean small', source: '(8 8)⍴0 1' },
    { name: 'integer small', source: '(8 8)⍴⍳64' },
    { name: 'float small', source: '(8 8)⍴÷⍳64' },
    { name: 'float 128²', source: '(128 128)⍴÷⍳16384' },
    { name: 'integer 128²', source: '(128 128)⍴⍳16384' },
    { name: 'rank 1', source: '⍳20' },
    { name: 'rank 3', source: '(2 3 4)⍴⍳24' },
    { name: 'character', source: "(4 4)⍴'abcd'" },
    { name: 'nested', source: '(2 2)⍴(1 2)(3 4)(5 6)(7 8)' },
  ];
}

async function main(): Promise<number> {
  const rows: string[] = [];
  const startedAt = new Date().toISOString();

  console.log('The eight artworks\n');
  rows.push(
    '## The eight artworks',
    '',
    '| Artwork | Bands only | Adaptive | Route | Lines | Width | Shape | Same matrix |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const preset of presets) {
    // Ground truth by bands alone, which needs no preset metadata either.
    const truth = await runArtwork({
      service: new BandedOnlyService(service),
      source: preset.code,
      limits: LIMITS,
      timeoutMs: 30_000,
    });
    await sleep(GAP_MS);

    const outcome = await adaptive(preset.title, preset.code);
    const same = digest(outcome.matrix) === digest(truth.matrix);
    const banded = truth.requestCount;

    console.log(
      `  ${preset.id.padEnd(20)} banded ${String(banded)}  adaptive ${String(outcome.requests)}  ` +
        `${outcome.route.padEnd(11)} lines ${String(outcome.lines)} width ${String(outcome.width)}  ` +
        `${same ? 'identical' : 'DIFFERENT'}`,
    );
    rows.push(
      `| ${preset.title} | ${String(banded)} | ${String(outcome.requests)} | ${outcome.route} | ` +
        `${String(outcome.lines)} | ${String(outcome.width)} | ${outcome.shape} | ${same ? 'yes' : '**no**'} |`,
    );
    await sleep(GAP_MS);
  }

  console.log('\nBoundaries\n');
  rows.push(
    '',
    '## Boundaries',
    '',
    '| Case | Requests | Route | Lines | Width | Shape | Note |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const probe of boundaryCases()) {
    const outcome = await adaptive(probe.name, probe.source);
    console.log(
      `  ${probe.name.padEnd(20)} ${String(outcome.requests)} req  ${outcome.route.padEnd(11)} ` +
        `lines ${String(outcome.lines)} width ${String(outcome.width)}  ${outcome.note}`,
    );
    rows.push(
      `| ${probe.name} | ${String(outcome.requests)} | ${outcome.route} | ${String(outcome.lines)} | ` +
        `${String(outcome.width)} | ${outcome.shape} | ${outcome.note} |`,
    );
    await sleep(GAP_MS);
  }

  const out = join(REPO_ROOT, 'docs', 'data', 'adaptive-prototype.md');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    [
      '# Adaptive first request — measurements',
      '',
      `Generated by \`npm run prototype:adaptive\` against \`${ENDPOINT}\`, ${startedAt}.`,
      `Service caps: ${String(CAPS.maxOutputLines)} lines of ${String(CAPS.maxLineLength)} characters.`,
      '',
      ...rows,
      '',
      `Total requests spent measuring: ${String(requests)}.`,
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`\nWrote docs/data/adaptive-prototype.md — ${String(requests)} requests total`);
  return 0;
}

process.exitCode = await main();

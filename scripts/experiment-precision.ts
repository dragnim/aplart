/**
 * Does 128-bit decimal arithmetic buy the Mandelbrot preset anything?
 *
 *     npx tsx scripts/experiment-precision.ts
 *
 * TryAPL's default is `⎕FR←645`, binary64, whose coordinates collapse somewhere
 * between a span of 1e¯14 and 1e¯15: at 1e¯15 a 128-wide axis holds 19 distinct
 * values, so 109 adjacent columns are literally the same number and the artwork
 * is stripes of repeated data. Decimal128 has about 34 significant digits
 * instead of 16, which should push that much further out.
 *
 * Whether it is worth offering is a different question from whether it works,
 * and this measures both. Writes raw observations for the report.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { type NumericMatrix } from '../src/matrix/matrixTypes';
import { mandelbrotField } from '../src/presets/mandelbrot-field';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, 'docs/data/precision-experiment-raw.jsonl');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

const LIMITS = { maxRows: 320, maxColumns: 320, maxCells: 102_400 };
const GAP_MS = 900;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const service = new TryAplExecutionService({ endpoint: ENDPOINT });

interface View {
  readonly id: string;
  readonly label: string;
  readonly centreX: string;
  readonly centreY: string;
  readonly zoom: string;
  readonly why: string;
}

/**
 * Coordinates on the boundary near the seahorse valley, taken to enough digits
 * that decimal128 has something to work with. The centre is the same for the
 * two deep views so only the span differs, which is the variable under test.
 */
const CENTRE_X = '¯0.7436438870371587';
const CENTRE_Y = '0.13182590420531198';

const VIEWS: readonly View[] = [
  {
    id: 'wide',
    label: 'Normal wide view',
    centreX: '¯0.6',
    centreY: '0',
    zoom: '1.4',
    why: 'Both precisions should agree exactly. A difference here would be a fault, not a feature.',
  },
  {
    id: 'boundary',
    label: 'Moderate boundary zoom',
    centreX: '¯0.745',
    centreY: '0.1',
    zoom: '0.05',
    why: 'Filament detail well inside what binary64 resolves.',
  },
  {
    id: 'deep',
    label: 'Deep zoom, still sound in binary64',
    centreX: CENTRE_X,
    centreY: CENTRE_Y,
    zoom: '1E¯12',
    why: 'Three orders of magnitude before binary64 coordinates start repeating.',
  },
  {
    id: 'deeper',
    label: 'Deeper zoom, binary64 collapsing',
    centreX: CENTRE_X,
    centreY: CENTRE_Y,
    zoom: '1E¯15',
    why: 'A 128-wide binary64 axis holds 19 distinct values here; 109 adjacent columns repeat.',
  },
];

/** The shipped preset with its controls rewritten, optionally at high precision. */
function sourceFor(view: View, size: number, iterations: number, precision: 645 | 1287): string {
  const body = mandelbrotField.code
    .split('\n')
    .map((line) => {
      if (line.startsWith('size←')) return `size←${String(size)}`;
      if (line.startsWith('iterations←')) return `iterations←${String(iterations)}`;
      if (line.startsWith('centreX←')) return `centreX←${view.centreX}`;
      if (line.startsWith('centreY←')) return `centreY←${view.centreY}`;
      if (line.startsWith('zoom←')) return `zoom←${view.zoom}`;
      return line;
    })
    .join('\n');

  /*
   * First, so every literal after it is read as decimal. Dyalog converts a
   * literal when the line runs rather than when it is tokenised, which is what
   * makes a single-expression submission workable at all — the whole preset
   * arrives as one line joined by diamonds.
   */
  return precision === 1287 ? `⎕FR←1287\n${body}` : body;
}

interface Measured {
  readonly matrix: NumericMatrix | null;
  readonly ms: number;
  readonly requests: number;
  readonly error: string | null;
  readonly errorKind: string | null;
}

async function measure(source: string, banded: boolean): Promise<Measured> {
  const startedAt = Date.now();
  let requests = 0;
  const counting = {
    capabilities: service.capabilities,
    execute: async (request: Parameters<typeof service.execute>[0]) => {
      if (requests > 0) await sleep(GAP_MS);
      requests += 1;
      return service.execute(request);
    },
    cancel: () => service.cancel(),
  };

  try {
    const run = await runArtwork({
      service: counting,
      source,
      highResolution: banded,
      limits: LIMITS,
      timeoutMs: 40_000,
    });
    return { matrix: run.matrix, ms: Date.now() - startedAt, requests, error: null, errorKind: null };
  } catch (error) {
    return {
      matrix: null,
      ms: Date.now() - startedAt,
      requests,
      error: error instanceof Error ? error.message : String(error),
      errorKind: (error as { kind?: string }).kind ?? 'unknown',
    };
  }
}

/**
 * How much of the matrix is repeated neighbours.
 *
 * The signature of coordinate collapse: when adjacent columns map to the same
 * number, they compute the same answer, and the artwork becomes stripes. This
 * counts them, which is what separates "more detail" from "different rounding".
 */
function structure(matrix: NumericMatrix) {
  const { rows, columns, values } = matrix;
  const at = (row: number, column: number) => values[row * columns + column] as number;

  let duplicateColumns = 0;
  for (let column = 1; column < columns; column += 1) {
    let same = true;
    for (let row = 0; row < rows && same; row += 1) same = at(row, column) === at(row, column - 1);
    if (same) duplicateColumns += 1;
  }

  let duplicateRows = 0;
  for (let row = 1; row < rows; row += 1) {
    let same = true;
    for (let column = 0; column < columns && same; column += 1) {
      same = at(row, column) === at(row - 1, column);
    }
    if (same) duplicateRows += 1;
  }

  return { duplicateColumns, duplicateRows, distinct: new Set(values).size };
}

function compare(a: NumericMatrix, b: NumericMatrix) {
  let differing = 0;
  let first: { row: number; column: number; a: number; b: number } | null = null;
  for (let index = 0; index < a.values.length; index += 1) {
    if (a.values[index] === b.values[index]) continue;
    differing += 1;
    first ??= {
      row: Math.floor(index / a.columns) + 1,
      column: (index % a.columns) + 1,
      a: a.values[index] as number,
      b: b.values[index] as number,
    };
  }
  return { differing, first };
}

async function main(): Promise<number> {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, '');
  const record = async (line: unknown) => appendFile(OUT, `${JSON.stringify(line)}\n`);

  await record({
    kind: 'meta',
    startedAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    views: VIEWS,
    node: process.version,
  });

  // ---- What type comes back, which decides whether banding can parse it. ----
  console.log('Result type under each precision\n');
  for (const precision of [645, 1287] as const) {
    const probe = `${precision === 1287 ? '⎕FR←1287 ⋄ ' : ''}size←16 ⋄ cr←(size,size)⍴¯0.6 ⋄ ci←(size,size)⍴0 ⋄ step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)} ⋄ ⎕DR ⊃⌽step⍣28⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)`;
    const reply = await service.execute({ code: probe, timeoutMs: 30_000, freshWorkspace: true });
    const dr = reply.outputLines.join(' ').trim();
    await record({ kind: 'result-type', precision, dataRepresentation: dr });
    console.log(`  ⎕FR ${String(precision).padEnd(5)} → result ⎕DR ${dr}`);
    await sleep(GAP_MS);
  }

  // ---- The main grid. ----
  console.log('\nMatrices, both precisions\n');
  for (const view of VIEWS) {
    for (const size of [64, 128]) {
      for (const iterations of [28, 40, 60]) {
        const standard = await measure(sourceFor(view, size, iterations, 645), false);
        await sleep(GAP_MS);
        const high = await measure(sourceFor(view, size, iterations, 1287), false);
        await sleep(GAP_MS);

        const row = {
          kind: 'grid',
          view: view.id,
          size,
          iterations,
          standard: {
            ok: standard.matrix !== null,
            ms: standard.ms,
            errorKind: standard.errorKind,
            ...(standard.matrix === null ? {} : structure(standard.matrix)),
          },
          high: {
            ok: high.matrix !== null,
            ms: high.ms,
            errorKind: high.errorKind,
            ...(high.matrix === null ? {} : structure(high.matrix)),
          },
          ...(standard.matrix !== null && high.matrix !== null
            ? compare(standard.matrix, high.matrix)
            : { differing: null, first: null }),
        };
        await record(row);

        const describe = (m: Measured) =>
          m.matrix === null ? `failed ${m.errorKind ?? ''}` : `${String(m.ms)}ms`;
        const diff = row.differing === null ? 'n/a' : `${String(row.differing)} differing`;
        console.log(
          `  ${view.id.padEnd(9)} ${String(size).padStart(3)}² ×${String(iterations).padEnd(3)} ` +
            `645 ${describe(standard).padEnd(12)} 1287 ${describe(high).padEnd(12)} ${diff}`,
        );
      }
    }
  }

  // ---- Banded transport. ----
  console.log('\nBanded transport at high precision\n');
  for (const precision of [645, 1287] as const) {
    const banded = await measure(sourceFor(VIEWS[0] as View, 144, 28, precision), true);
    await record({
      kind: 'banded',
      precision,
      ok: banded.matrix !== null,
      requests: banded.requests,
      ms: banded.ms,
      errorKind: banded.errorKind,
      error: banded.error,
    });
    console.log(
      `  ⎕FR ${String(precision).padEnd(5)} 144² banded → ` +
        (banded.matrix === null
          ? `FAILED (${banded.errorKind ?? '?'}) ${banded.error ?? ''}`
          : `ok, ${String(banded.requests)} requests, ${String(banded.ms)}ms`),
    );
    await sleep(GAP_MS);
  }

  // ---- How large each precision can go in one request, and banded. ----
  console.log('\nResolution ceiling\n');
  for (const precision of [645, 1287] as const) {
    for (const banded of [false, true]) {
      let highest = 0;
      let failures = 0;
      for (const size of [64, 90, 112, 128, 144, 160, 176]) {
        const outcome = await measure(sourceFor(VIEWS[0] as View, size, 28, precision), banded);
        await record({
          kind: 'ceiling',
          precision,
          banded,
          size,
          ok: outcome.matrix !== null,
          ms: outcome.ms,
          requests: outcome.requests,
          errorKind: outcome.errorKind,
        });
        if (outcome.matrix !== null) {
          highest = size;
          failures = 0;
        } else {
          failures += 1;
          if (failures >= 2) break;
        }
        await sleep(GAP_MS);
      }
      console.log(
        `  ⎕FR ${String(precision).padEnd(5)} ${banded ? 'banded  ' : 'unbanded'} → highest ${String(highest)}²`,
      );
    }
  }

  await record({ kind: 'meta-end', finishedAt: new Date().toISOString() });
  console.log(`\nWritten to ${OUT}`);
  return 0;
}

process.exitCode = await main();

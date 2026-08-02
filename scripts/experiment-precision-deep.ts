/**
 * The decisive case: a deep boundary view with genuine structure.
 *
 * The first sweep chose coordinates that turned out to be inside the set, so
 * both precisions correctly returned one flat value and the comparison measured
 * nothing. This centre was found by searching for a view whose escape counts
 * actually vary at depth — which, notably, took 300 iterations to find at all.
 */
import { appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { type NumericMatrix } from '../src/matrix/matrixTypes';
import { mandelbrotField } from '../src/presets/mandelbrot-field';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../docs/data/precision-experiment-raw.jsonl');
const service = new TryAplExecutionService();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/*
 * Found by walking the boundary down: at each depth, re-centre on a pixel whose
 * neighbours disagree, so the view stays on the edge of the set instead of
 * drifting into the interior. A centre chosen once and zoomed into blindly ends
 * up inside, where every precision agrees that everything reached the limit.
 */
const CENTRE_X = '¯0.746450000000068004';
const CENTRE_Y = '0.112000000000001473';

function source(zoom: string, size: number, iterations: number, precision: 645 | 1287): string {
  const body = mandelbrotField.code
    .split('\n')
    .map((line) => {
      if (line.startsWith('size←')) return `size←${String(size)}`;
      if (line.startsWith('iterations←')) return `iterations←${String(iterations)}`;
      if (line.startsWith('centreX←')) return `centreX←${CENTRE_X}`;
      if (line.startsWith('centreY←')) return `centreY←${CENTRE_Y}`;
      if (line.startsWith('zoom←')) return `zoom←${zoom}`;
      return line;
    })
    .join('\n');
  return precision === 1287 ? `⎕FR←1287\n${body}` : body;
}

async function run(code: string) {
  const startedAt = Date.now();
  try {
    const out = await runArtwork({
      service,
      source: code,
      highResolution: false,
      limits: { maxRows: 320, maxColumns: 320, maxCells: 102_400 },
      timeoutMs: 90_000,
    });
    return {
      matrix: out.matrix as NumericMatrix | null,
      ms: Date.now() - startedAt,
      error: null as string | null,
    };
  } catch (error) {
    return {
      matrix: null,
      ms: Date.now() - startedAt,
      error: (error as { kind?: string }).kind ?? 'unknown',
    };
  }
}

function shape(m: NumericMatrix) {
  let dupCols = 0;
  for (let c = 1; c < m.columns; c += 1) {
    let same = true;
    for (let r = 0; r < m.rows && same; r += 1) {
      same = m.values[r * m.columns + c] === m.values[r * m.columns + c - 1];
    }
    if (same) dupCols += 1;
  }
  return { distinct: new Set(m.values).size, dupCols };
}

for (const zoom of ['1E¯13', '1E¯14', '1E¯15']) {
  for (const iterations of [60, 600]) {
    const a = await run(source(zoom, 64, iterations, 645));
    await sleep(900);
    const b = await run(source(zoom, 64, iterations, 1287));
    await sleep(900);

    let differing: number | null = null;
    let first: string = '—';
    if (a.matrix && b.matrix) {
      differing = 0;
      for (let i = 0; i < a.matrix.values.length; i += 1) {
        if (a.matrix.values[i] !== b.matrix.values[i]) {
          if (differing === 0) {
            first = `r${Math.floor(i / 64) + 1} c${(i % 64) + 1}: ${String(a.matrix.values[i])} vs ${String(b.matrix.values[i])}`;
          }
          differing += 1;
        }
      }
    }

    const sa = a.matrix ? shape(a.matrix) : null;
    const sb = b.matrix ? shape(b.matrix) : null;
    const row = {
      kind: 'deep-structure',
      zoom,
      iterations,
      size: 64,
      standard: { ok: !!a.matrix, ms: a.ms, error: a.error, ...(sa ?? {}) },
      high: { ok: !!b.matrix, ms: b.ms, error: b.error, ...(sb ?? {}) },
      differing,
      first,
    };
    await appendFile(OUT, `${JSON.stringify(row)}\n`);
    console.log(
      `zoom ${zoom} ×${String(iterations).padEnd(3)} | 645: ${a.matrix ? `${String(sa?.distinct)} distinct, ${String(sa?.dupCols)} dup cols, ${String(a.ms)}ms` : `failed ${String(a.error)}`}`,
    );
    console.log(
      `${''.padEnd(17)}| 1287: ${b.matrix ? `${String(sb?.distinct)} distinct, ${String(sb?.dupCols)} dup cols, ${String(b.ms)}ms` : `failed ${String(b.error)}`}`,
    );
    console.log(`${''.padEnd(17)}| differing ${String(differing)}  first ${first}\n`);
  }
}

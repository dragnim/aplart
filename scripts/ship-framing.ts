/**
 * Fetches candidate Burning Ship viewports from the live service.
 *
 *     npx tsx --import ./scripts/lib/registerRaw.mjs scripts/ship-framing.ts
 *
 * Then draw them with `scripts/ship-viewports.ts` and look. The default view has
 * to be chosen by seeing the ship, and a picture of a matrix the service did not
 * return would prove nothing about the artwork.
 *
 * Sequential, with a pause between runs, because the service is public and
 * shared. Each view at 128² costs the same handful of requests the application
 * itself would spend.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import source from '../src/presets/apl/burning-ship.apl?raw';
import { artworkSource } from '../src/presets/artworkSource';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, '.preview', 'ship');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };
const GAP_MS = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const apl = (value: number) => String(value).replace('-', '¯');

interface View {
  readonly name: string;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
}

/** Candidate framings around the structure the first round found. */
const VIEWS: readonly View[] = [
  { name: 'a-050', centreX: -1.755, centreY: -0.03, zoom: 0.05 },
  { name: 'b-060', centreX: -1.755, centreY: -0.02, zoom: 0.06 },
  { name: 'c-045', centreX: -1.757, centreY: -0.035, zoom: 0.045 },
  { name: 'd-080', centreX: -1.75, centreY: -0.04, zoom: 0.08 },
];

/** The shipped program with its control lines rewritten, as the sliders do. */
function sourceFor(view: View, size: number, iterations: number): string {
  return artworkSource(source)
    .split('\n')
    .map((line) => {
      if (line.startsWith('size←')) return `size←${String(size)}`;
      if (line.startsWith('iterations←')) return `iterations←${String(iterations)}`;
      if (line.startsWith('centreX←')) return `centreX←${apl(view.centreX)}`;
      if (line.startsWith('centreY←')) return `centreY←${apl(view.centreY)}`;
      if (line.startsWith('zoom←')) return `zoom←${apl(view.zoom)}`;
      return line;
    })
    .join('\n');
}

async function main(): Promise<number> {
  await mkdir(OUT, { recursive: true });
  const service = new TryAplExecutionService({ endpoint: ENDPOINT });
  const recorded: Record<string, unknown> = {};

  for (const view of VIEWS) {
    const run = await runArtwork({
      service,
      source: sourceFor(view, 128, 48),
      limits: LIMITS,
      timeoutMs: 40_000,
    });

    recorded[view.name] = { view, size: run.matrix.rows, values: [...run.matrix.values] };
    const atCeiling = [...run.matrix.values].filter((value) => value === 48).length;
    console.log(
      `${view.name.padEnd(7)} ${String(run.stats.min)}..${String(run.stats.max)}  ` +
        `distinct ${String(run.stats.distinct).padStart(3)}  ` +
        `at ceiling ${((100 * atCeiling) / run.matrix.values.length).toFixed(1)}%  ` +
        `${String(run.requestCount)} requests, ${String(run.durationMs)}ms`,
    );
    await sleep(GAP_MS);
  }

  const file = join(OUT, 'framing.json');
  await writeFile(file, JSON.stringify(recorded), 'utf8');
  console.log(`\nWrote ${file.replace(REPO_ROOT, '.')}`);
  return 0;
}

process.exitCode = await main();

/**
 * Fetches candidate viewports for a fractal from the live service.
 *
 *     npm run preset:framing -- burning-ship '¯1.755,¯0.02,0.06' '¯1.755,¯0.03,0.05'
 *
 * Then draw them with `scripts/fractal-viewports.ts` and look. A default view has
 * to be chosen by seeing the artwork, and a picture of a matrix the service did
 * not return would prove nothing about it.
 *
 * Written once and used by each fractal in turn, because the question is always
 * the same one: which centre and span shows the thing the artwork is named for.
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
import { presets } from '../src/presets/presets';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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

/**
 * Candidate views, as `centreX,centreY,zoom` triples on the command line.
 *
 * APL's high minus is accepted as well as a hyphen, so a candidate can be copied
 * straight out of a preset's control lines without being retyped.
 */
function viewsFrom(argv: readonly string[]): readonly View[] {
  return argv.map((triple, index) => {
    const parts = triple.split(',').map((part) => Number(part.trim().replace('¯', '-')));
    const [centreX, centreY, zoom] = parts;
    if (parts.length !== 3 || centreX === undefined || centreY === undefined || zoom === undefined) {
      throw new Error(`expected centreX,centreY,zoom but got "${triple}"`);
    }
    if (!parts.every((part) => Number.isFinite(part))) {
      throw new Error(`not all numbers in "${triple}"`);
    }
    return { name: `v${String(index + 1)}-${String(zoom)}`, centreX, centreY, zoom };
  });
}

/** The shipped program with its control lines rewritten, as the sliders do. */
function sourceFor(code: string, view: View, size: number, iterations: number): string {
  return code
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
  const [presetId, ...triples] = process.argv.slice(2);
  const preset = presets.find((candidate) => candidate.id === presetId);
  if (preset === undefined) {
    console.error(`Pass a preset id and at least one centreX,centreY,zoom triple.`);
    console.error(`Known ids: ${presets.map((candidate) => candidate.id).join(', ')}`);
    return 1;
  }
  if (triples.length === 0) {
    console.error('Pass at least one centreX,centreY,zoom triple.');
    return 1;
  }

  const views = viewsFrom(triples);
  const out = join(REPO_ROOT, '.preview', presetId ?? 'fractal');
  await mkdir(out, { recursive: true });

  const service = new TryAplExecutionService({ endpoint: ENDPOINT });
  const recorded: Record<string, unknown> = {};

  console.log(`${preset.title}, ${String(views.length)} view(s) at 128²
`);

  for (const view of views) {
    const run = await runArtwork({
      service,
      source: sourceFor(preset.code, view, 128, 48),
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

  const file = join(out, 'framing.json');
  await writeFile(file, JSON.stringify(recorded), 'utf8');
  console.log(`\nWrote ${file.replace(REPO_ROOT, '.')}`);
  return 0;
}

process.exitCode = await main();

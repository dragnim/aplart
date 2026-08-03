/**
 * Renders the one view where precision visibly matters, at both precisions.
 *
 *     npx tsx scripts/capture-precision-images.ts
 *
 * Two 64×64 runs at 600 iterations, about eleven seconds each at decimal128.
 * Committed alongside the report because the difference is the sort that has to
 * be seen: the same arithmetic, the same coordinates, and one of them in
 * stripes because adjacent columns are literally the same number.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { matrixStats } from '../src/matrix/matrixStats';
import { mandelbrotField } from '../src/presets/mandelbrot-field';
import { renderArtwork } from '../src/renderer/renderArtwork';
import { getPalette } from '../src/renderer/palettes';
import { encodePng, scaleNearest } from './lib/encodePng';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../docs/images');
const service = new TryAplExecutionService();

function source(precision: 645 | 1287): string {
  const body = mandelbrotField.code
    .split('\n')
    .map((line) => {
      if (line.startsWith('size←')) return 'size←64';
      if (line.startsWith('iterations←')) return 'iterations←600';
      if (line.startsWith('centreX←')) return 'centreX←¯0.746450000000068004';
      if (line.startsWith('centreY←')) return 'centreY←0.112000000000001473';
      if (line.startsWith('zoom←')) return 'zoom←1E¯15';
      return line;
    })
    .join('\n');
  return precision === 1287 ? `⎕FR←1287\n${body}` : body;
}

await mkdir(OUT, { recursive: true });

for (const precision of [645, 1287] as const) {
  const startedAt = Date.now();
  const run = await runArtwork({
    service,
    source: source(precision),
    limits: { maxRows: 320, maxColumns: 320, maxCells: 102_400 },
    timeoutMs: 120_000,
  });

  const stats = matrixStats(run.matrix);
  const image = renderArtwork(run.matrix, stats, {
    mode: 'continuous',
    palette: getPalette('heat'),
  });

  const name = `precision-${precision === 645 ? 'binary64' : 'decimal128'}.png`;
  await writeFile(join(OUT, name), encodePng(scaleNearest(image, 6)));
  console.log(
    `${name}  ${String(Date.now() - startedAt)}ms  ${String(stats.distinct)} distinct, range ${String(stats.min)}–${String(stats.max)}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

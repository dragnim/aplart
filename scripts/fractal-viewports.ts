/**
 * Renders candidate fractal viewports so a default can be chosen by eye.
 *
 *     npm run preset:viewports -- .preview/tricorn/framing.json
 *
 * The matrices come from the live service — this script draws them and nothing
 * else, so what is being judged is the artwork's real output at each view rather
 * than a preview of it. Every candidate is drawn under two palettes, because the
 * choice of view and the choice of ramp are not independent: a shape that reads
 * clearly under one can disappear under another.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrixStats } from '../src/matrix/matrixStats';
import { type NumericMatrix } from '../src/matrix/matrixTypes';
import { DEFAULT_COLOURING } from '../src/renderer/escapeColouring';
import { getPalette } from '../src/renderer/palettes';
import { renderArtwork } from '../src/renderer/renderArtwork';
import { encodePng, scaleNearest, type RgbaSource } from './lib/encodePng';
import { drawLabel, labelHeight } from './lib/label';
import { montage } from './lib/montage';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Written beside the JSON it was given, so each fractal's sheets stay together.
const PALETTES = (process.env.PALETTES ?? 'heat,abyss,ember,poolrooms').split(',');
const CEILING = 48;
const SCALE = Number(process.env.SCALE ?? '2');
const LABEL_SCALE = 2;

interface Recorded {
  readonly view: {
    readonly name: string;
    readonly centreX: number;
    readonly centreY: number;
    readonly zoom: number;
  };
  readonly size: number;
  readonly values: readonly number[];
}

/** One panel: the matrix drawn, scaled up, with a caption underneath. */
function panel(matrix: NumericMatrix, paletteId: string, caption: string): RgbaSource {
  const palette = getPalette(paletteId);
  const stats = matrixStats(matrix);
  const image = renderArtwork(matrix, stats, {
    mode: 'continuous',
    palette,
    // The declared range, so a crop containing few values is not restretched
    // across the whole ramp. That is the production rule as well.
    escape: {
      colouring: { ...DEFAULT_COLOURING, mode: 'smooth' },
      range: { min: 1, max: CEILING },
      entries: palette.colours.length,
    },
  });

  const scaled = scaleNearest(image, SCALE);
  const strip = labelHeight(LABEL_SCALE) + 10;
  const height = scaled.height + strip;
  const data = new Uint8ClampedArray(scaled.width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 18;
    data[index + 1] = 18;
    data[index + 2] = 18;
    data[index + 3] = 255;
  }
  data.set(scaled.data, 0);

  const composed: RgbaSource = { width: scaled.width, height, data };
  drawLabel(composed, caption, 4, scaled.height + 4, { scale: LABEL_SCALE });
  return composed;
}

async function main(): Promise<number> {
  const source = process.argv[2];
  if (source === undefined) {
    console.error('Pass the path to views.json written by the probe.');
    return 1;
  }

  const recorded = JSON.parse(await readFile(source, 'utf8')) as Record<string, Recorded>;
  const out = dirname(join(REPO_ROOT, source));
  await mkdir(out, { recursive: true });

  const cells: RgbaSource[] = [];
  for (const entry of Object.values(recorded)) {
    const matrix: NumericMatrix = {
      rows: entry.size,
      columns: entry.size,
      values: Float64Array.from(entry.values),
    };
    const stats = matrixStats(matrix);
    for (const paletteId of PALETTES) {
      cells.push(
        panel(
          matrix,
          paletteId,
          `${entry.view.name} ${paletteId} c(${String(entry.view.centreX)},${String(entry.view.centreY)}) z${String(entry.view.zoom)}`,
        ),
      );
    }
    console.log(
      `  ${entry.view.name.padEnd(11)} centre (${String(entry.view.centreX)}, ${String(entry.view.centreY)}) ` +
        `span ${String(entry.view.zoom)}  values ${String(stats.min)}..${String(stats.max)}, ${String(stats.distinct)} distinct`,
    );
  }

  const sheet = montage(cells, { columns: PALETTES.length, gap: 12 });
  const file = join(out, 'viewports.png');
  await writeFile(file, encodePng(sheet));
  console.log(`\nWrote ${file.replace(REPO_ROOT, '.')}`);
  return 0;
}

process.exitCode = await main();

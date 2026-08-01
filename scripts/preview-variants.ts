/**
 * Renders a preset at several parameter settings into one montage image.
 *
 *     npm run preview -- modular-bloom modulus 5 7 9 11 13 17
 *     npm run preview -- modular-bloom size 24 48 72 88
 *
 * Choosing good defaults for a generative piece means looking at it, and
 * looking at six variants side by side is far more useful than opening six
 * files. Each variant is run against the real APL service, so what you are
 * judging is the actual artwork.
 *
 * Output goes to .preview/, which is not committed.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setParameterValue } from '../src/editor/parameterBinding';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { getPreset } from '../src/presets/presets';
import { renderToRgba } from '../src/renderer/colourMapping';
import { getPalette } from '../src/renderer/palettes';
import { encodePng, scaleNearest, type RgbaSource } from './lib/encodePng';
import { montage } from './lib/montage';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };
const CELL_SIZE = 256;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  const [presetId, variable, ...rawValues] = process.argv.slice(2);

  if (presetId === undefined || variable === undefined || rawValues.length === 0) {
    console.error('Usage: npm run preview -- <presetId> <variable> <value> [value...]');
    return 1;
  }

  const preset = getPreset(presetId);
  if (preset === undefined) {
    console.error(`No preset called "${presetId}".`);
    return 1;
  }

  const images: RgbaSource[] = [];

  for (const rawValue of rawValues) {
    const value = Number(rawValue);
    const updated = setParameterValue(preset.code, variable, value);
    if (!updated.ok) {
      console.error(`"${variable}" is not a top-level assignment in ${presetId}.`);
      return 1;
    }

    process.stdout.write(`  ${variable}=${rawValue} `.padEnd(20));

    const run = await runArtwork({
      service: new TryAplExecutionService({ endpoint: ENDPOINT }),
      source: updated.code,
      highResolution: preset.outputLimits?.highResolution ?? false,
      limits: LIMITS,
      timeoutMs: 30_000,
    });

    const image = renderToRgba(run.matrix, run.stats, {
      mode: preset.renderMode,
      palette: getPalette(preset.defaultPaletteId),
    });

    const factor = Math.max(1, Math.floor(CELL_SIZE / Math.max(image.width, image.height)));
    images.push(scaleNearest(image, factor));

    console.log(`${run.matrix.rows}x${run.matrix.columns}, values ${run.stats.min}..${run.stats.max}`);
    await sleep(700);
  }

  const sheet = montage(images, { columns: Math.min(images.length, 3) });
  const path = join(REPO_ROOT, '.preview', `${presetId}-${variable}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encodePng(sheet));

  console.log(`\nWrote ${path}`);
  console.log(`Order: ${rawValues.join(', ')}`);
  return 0;
}

process.exit(await main());

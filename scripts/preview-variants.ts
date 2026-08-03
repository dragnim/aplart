/**
 * Renders a preset at several parameter settings into one montage image.
 *
 *     npm run preset:variants -- modular-bloom modulus 5 7 9 11 13 17
 *     npm run preset:variants -- modular-bloom size 24 48 72 88
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
import { renderArtwork } from '../src/renderer/renderArtwork';
import { getPalette } from '../src/renderer/palettes';
import { encodePng, scaleNearest, type RgbaSource } from './lib/encodePng';
import { montage } from './lib/montage';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };
const CELL_SIZE = 256;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  const [presetId, variable, ...rest] = process.argv.slice(2);

  /*
   * Anything of the form name=value is held fixed for every variant, so a sweep
   * can be repeated against a different starting point — the same seven tile
   * counts at a second seed, say, which is the only way to tell a real
   * difference between them from one lucky arrangement.
   */
  const rawValues = rest.filter((argument) => !argument.includes('='));
  const fixed = rest
    .filter((argument) => argument.includes('='))
    .map((argument) => argument.split('=', 2) as [string, string]);

  if (presetId === undefined || variable === undefined || rawValues.length === 0) {
    console.error(
      'Usage: npm run preset:variants -- <presetId> <variable> <value> [value...] [name=value...]',
    );
    return 1;
  }

  const preset = getPreset(presetId);
  if (preset === undefined) {
    console.error(`No preset called "${presetId}".`);
    return 1;
  }

  let baseCode = preset.code;
  for (const [name, value] of fixed) {
    const pinned = setParameterValue(baseCode, name, Number(value));
    if (!pinned.ok) {
      console.error(`"${name}" is not a top-level assignment in ${presetId}.`);
      return 1;
    }
    baseCode = pinned.code;
  }

  const images: RgbaSource[] = [];

  for (const rawValue of rawValues) {
    const value = Number(rawValue);
    const updated = setParameterValue(baseCode, variable, value);
    if (!updated.ok) {
      console.error(`"${variable}" is not a top-level assignment in ${presetId}.`);
      return 1;
    }

    process.stdout.write(`  ${variable}=${rawValue} `.padEnd(20));

    const run = await runArtwork({
      service: new TryAplExecutionService({ endpoint: ENDPOINT }),
      source: updated.code,
      limits: LIMITS,
      timeoutMs: 30_000,
    });

    const image = renderArtwork(run.matrix, run.stats, {
      mode: preset.renderMode,
      palette: getPalette(preset.defaultPaletteId),
    });

    const factor = Math.max(1, Math.floor(CELL_SIZE / Math.max(image.width, image.height)));
    images.push(scaleNearest(image, factor));

    console.log(`${run.matrix.rows}x${run.matrix.columns}, values ${run.stats.min}..${run.stats.max}`);
    await sleep(700);
  }

  const sheet = montage(images, { columns: Math.min(images.length, 4) });
  const suffix = fixed.map(([name, value]) => `-${name}${value}`).join('');
  const path = join(REPO_ROOT, '.preview', `${presetId}-${variable}${suffix}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encodePng(sheet));

  console.log(`\nWrote ${path}`);
  console.log(`Order: ${rawValues.join(', ')}`);
  return 0;
}

process.exit(await main());

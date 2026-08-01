/**
 * Renders every preset's fixture into one contact sheet.
 *
 *     npm run preset:sheet
 *
 * Judging a gallery means seeing the pieces together — whether they read as
 * one collection, whether two of them are too similar, whether one is dull
 * next to the rest. That is not visible one file at a time.
 *
 * Output goes to .preview/, which is not committed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrixStats } from '../src/matrix/matrixStats';
import { fixtureToMatrix, type PresetFixture } from '../src/presets/fixtures';
import { presets } from '../src/presets/presets';
import { renderToRgba } from '../src/renderer/colourMapping';
import { getPalette } from '../src/renderer/palettes';
import { encodePng, scaleNearest, type RgbaSource } from './lib/encodePng';
import { montage } from './lib/montage';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CELL = 260;

async function main(): Promise<number> {
  const images: RgbaSource[] = [];

  for (const preset of presets) {
    const raw = await readFile(join(REPO_ROOT, preset.fixturePath), 'utf8');
    const fixture = JSON.parse(raw) as PresetFixture;
    const matrix = fixtureToMatrix(fixture);

    const image = renderToRgba(matrix, matrixStats(matrix), {
      mode: preset.renderMode,
      palette: getPalette(preset.defaultPaletteId),
    });

    const factor = Math.max(1, Math.floor(CELL / Math.max(image.width, image.height)));
    images.push(scaleNearest(image, factor));
    console.log(`  ${preset.id.padEnd(22)} ${preset.defaultPaletteId.padEnd(11)} ${preset.renderMode}`);
  }

  const sheet = montage(images, { columns: 4, gap: 10, background: [244, 243, 241] });
  const path = join(REPO_ROOT, '.preview', 'contact-sheet.png');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encodePng(sheet));

  console.log(`\nWrote ${path}`);
  return 0;
}

process.exit(await main());

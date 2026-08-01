/**
 * Renders gallery thumbnails from the committed fixtures.
 *
 *     npm run generate:thumbnails
 *
 * The thumbnails are generated from real APL output — the fixture is what the
 * preset's code returned from the live service — and committed, so the gallery
 * loads instantly and works offline without running anything.
 *
 * No network access is needed. Refresh the fixtures first if a preset's code
 * has changed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrixStats } from '../src/matrix/matrixStats';
import { fixtureToMatrix, validateFixture, type PresetFixture } from '../src/presets/fixtures';
import { presets } from '../src/presets/presets';
import { renderToRgba } from '../src/renderer/colourMapping';
import { getPalette } from '../src/renderer/palettes';
import { encodePng, scaleNearest } from './lib/encodePng';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Thumbnails are displayed at roughly 280px; 512 keeps them sharp when zoomed. */
const TARGET_SIZE = 512;

async function main(): Promise<number> {
  if (presets.length === 0) {
    console.log('No presets registered yet; nothing to generate.');
    return 0;
  }

  let failures = 0;

  for (const preset of presets) {
    process.stdout.write(`  ${preset.id.padEnd(22)} `);

    try {
      const raw = await readFile(join(REPO_ROOT, preset.fixturePath), 'utf8');
      const fixture = JSON.parse(raw) as PresetFixture;

      const validation = validateFixture(fixture, preset.code);
      if (!validation.ok) {
        console.log(`FAILED: the fixture ${validation.reason}`);
        failures += 1;
        continue;
      }

      const matrix = fixtureToMatrix(fixture);
      const image = renderToRgba(matrix, matrixStats(matrix), {
        mode: preset.renderMode,
        palette: getPalette(preset.defaultPaletteId),
      });

      // An integer factor only: a fractional scale would blur cell edges, and
      // the whole point of these pictures is that the cells are visible.
      const factor = Math.max(1, Math.floor(TARGET_SIZE / Math.max(image.width, image.height)));
      const scaled = scaleNearest(image, factor);

      const path = join(REPO_ROOT, 'public', preset.thumbnailPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, encodePng(scaled));

      console.log(`${scaled.width}x${scaled.height} from a ${matrix.rows}x${matrix.columns} fixture`);
    } catch (error) {
      failures += 1;
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(failures === 0 ? '\nAll thumbnails generated.' : `\n${failures} preset(s) failed.`);
  return failures === 0 ? 0 : 1;
}

process.exit(await main());

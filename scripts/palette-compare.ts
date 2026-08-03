/**
 * Renders one artwork under several palettes and both display modes, side by side.
 *
 *     npm run preset:compare -- --preset mandelbrot-field
 *     npm run preset:compare -- --preset truchet-grid --palettes ember,abyss --display pixel
 *     npm run preset:compare -- --matrices .preview/iteration-matrices --rows iterations
 *
 * For choosing a default, or a thumbnail, by looking rather than by arguing. The
 * pictures come from the production renderer and the production palettes, so
 * what appears here is what the application would draw — with one exception,
 * stated plainly in the montage itself: Smooth is a bilinear sample rather than
 * a particular browser's filter, so those panels are labelled
 * REPRESENTATIVE INTERPOLATION.
 *
 * Writes only into `.preview/`, which is not tracked. Nothing here is reachable
 * from the application bundle and nothing it does changes production state.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrixStats } from '../src/matrix/matrixStats';
import { type NumericMatrix } from '../src/matrix/matrixTypes';
import { fixtureToMatrix, type PresetFixture } from '../src/presets/fixtures';
import { getPreset, presets } from '../src/presets/presets';
import { DEFAULT_COLOURING, type ColouringMode } from '../src/renderer/escapeColouring';
import { getPalette, palettes } from '../src/renderer/palettes';
import { renderArtwork } from '../src/renderer/renderArtwork';
import { encodePng, scaleBilinear, scaleNearest, type RgbaSource } from './lib/encodePng';
import { drawLabel, labelHeight } from './lib/label';
import { montage } from './lib/montage';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = join(REPO_ROOT, '.preview', 'compare');

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function list(name: string, fallback: readonly string[]): readonly string[] {
  const raw = argument(name, '');
  return raw === '' ? fallback : raw.split(',').map((entry) => entry.trim());
}

/** A matrix to draw, and what to call it. */
interface Subject {
  readonly id: string;
  readonly caption: string;
  readonly matrix: NumericMatrix;
  /** The ceiling its values were counted to, when it has one. */
  readonly iterations?: number;
}

/** One rendered panel, already scaled and captioned. */
interface Panel {
  readonly image: RgbaSource;
  readonly caption: string;
}

/**
 * Reads matrices the iteration benchmark saved.
 *
 * Real service output, so a comparison of ceilings is a comparison of what the
 * APL actually returned rather than of anything recomputed here.
 */
async function subjectsFromMatrices(directory: string): Promise<Subject[]> {
  const path = join(REPO_ROOT, directory);
  const names = (await readdir(path)).filter((name) => name.endsWith('.json')).sort();

  const subjects: Subject[] = [];
  for (const name of names) {
    const parsed = JSON.parse(await readFile(join(path, name), 'utf8')) as {
      view: string;
      iterations: number;
      rows: number;
      columns: number;
      values: number[];
    };
    subjects.push({
      id: `${parsed.view}-i${String(parsed.iterations)}`,
      caption: `${parsed.view} i${String(parsed.iterations)}`,
      iterations: parsed.iterations,
      matrix: {
        rows: parsed.rows,
        columns: parsed.columns,
        values: Float64Array.from(parsed.values),
      },
    });
  }
  return subjects;
}

/** The preset's committed fixture, for everything that is not a benchmark run. */
async function subjectFromFixture(presetId: string): Promise<Subject> {
  const preset = getPreset(presetId);
  if (preset === undefined) {
    throw new Error(`No such preset: ${presetId}. Known: ${presets.map((entry) => entry.id).join(', ')}`);
  }
  const fixture = JSON.parse(await readFile(join(REPO_ROOT, preset.fixturePath), 'utf8')) as PresetFixture;
  return { id: preset.id, caption: preset.title, matrix: fixtureToMatrix(fixture) };
}

function renderPanel(
  subject: Subject,
  presetId: string,
  paletteId: string,
  smooth: boolean,
  colouring: ColouringMode,
  scale: number,
): Panel {
  const preset = getPreset(presetId);
  const palette = getPalette(paletteId);
  const stats = matrixStats(subject.matrix);

  const image = renderArtwork(subject.matrix, stats, {
    mode: preset?.renderMode ?? 'continuous',
    palette,
    /*
     * The declared range, when the preset has one, so a ceiling of 60 does not
     * simply restretch the ramp over whatever this particular crop contains.
     * That is the production rule too: the range belongs to the calculation.
     */
    ...(preset?.valueRange === undefined
      ? {}
      : {
          escape: {
            colouring: { ...DEFAULT_COLOURING, mode: colouring },
            range: { min: preset.valueRange.min, max: subject.iterations ?? stats.max },
            entries: palette.colours.length,
          },
        }),
  });

  return {
    image: smooth ? scaleBilinear(image, scale) : scaleNearest(image, scale),
    caption: `${palette.name} ${smooth ? 'smooth' : 'pixel'}`,
  };
}

/** Adds a caption strip beneath a panel, so a montage cell explains itself. */
function captioned(panel: Panel, extra?: string): RgbaSource {
  const scale = 2;
  const strip = labelHeight(scale) + 10;
  const height = panel.image.height + strip;
  const data = new Uint8ClampedArray(panel.image.width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 18;
    data[index + 1] = 18;
    data[index + 2] = 18;
    data[index + 3] = 255;
  }
  data.set(panel.image.data, 0);

  const composed = { width: panel.image.width, height, data };
  drawLabel(composed, panel.caption, 4, panel.image.height + 4, { scale });
  if (extra !== undefined) {
    drawLabel(composed, extra, 4, 4, { scale, colour: [255, 200, 120] });
  }
  return composed;
}

async function main(): Promise<number> {
  const presetId = argument('preset', 'mandelbrot-field');
  const paletteIds = list(
    'palettes',
    presets.length === 0 ? ['ember'] : ['heat', 'abyss'].filter((id) => palettes.some((p) => p.id === id)),
  );
  const displays = list('display', ['pixel', 'smooth']);
  const colouring = argument('colouring', 'smooth') as ColouringMode;
  const scale = Number(argument('scale', '3'));
  const matrices = argument('matrices', '');
  const outName = argument('out', matrices === '' ? presetId : 'iterations');

  await mkdir(OUT_ROOT, { recursive: true });

  const subjects =
    matrices === '' ? [await subjectFromFixture(presetId)] : await subjectsFromMatrices(matrices);
  if (subjects.length === 0) {
    console.error('Nothing to compare: no fixture and no saved matrices.');
    return 1;
  }

  /*
   * Grouped by view when the subjects came from the benchmark, so each sheet is
   * one view with a row per ceiling — three readable montages rather than one
   * wall of forty-eight panels.
   */
  const groups = new Map<string, Subject[]>();
  for (const subject of subjects) {
    const view = subject.id.replace(/-i\d+$/u, '');
    groups.set(view, [...(groups.get(view) ?? []), subject]);
  }

  for (const [view, group] of [...groups].sort(([first], [second]) => first.localeCompare(second))) {
    const ordered = [...group].sort((first, second) => (first.iterations ?? 0) - (second.iterations ?? 0));

    const cells: RgbaSource[] = [];
    for (const subject of ordered) {
      for (const paletteId of paletteIds) {
        for (const display of displays) {
          const panel = renderPanel(subject, presetId, paletteId, display === 'smooth', colouring, scale);
          cells.push(
            captioned(panel, subject.iterations === undefined ? undefined : `i${String(subject.iterations)}`),
          );
        }
      }
    }

    const sheet = montage(cells, { columns: paletteIds.length * displays.length, gap: 10 });
    const file = join(OUT_ROOT, `${outName}-${view}.png`);
    await writeFile(file, encodePng(sheet));
    console.log(
      `  ${view.padEnd(18)} ${String(ordered.length)} rows × ${String(paletteIds.length * displays.length)} columns  →  ${file.replace(REPO_ROOT, '.')}`,
    );
  }

  console.log('\nColumns:', paletteIds.flatMap((id) => displays.map((d) => `${id} ${d}`)).join(' | '));
  if (displays.includes('smooth')) {
    console.log('Smooth panels are REPRESENTATIVE INTERPOLATION: bilinear, not a browser’s own filter.');
  }
  return 0;
}

process.exitCode = await main();

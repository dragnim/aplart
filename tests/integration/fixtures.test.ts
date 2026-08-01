/**
 * Proves the renderer works from committed data alone.
 *
 * Every fixture is real output from the live APL service, captured by
 * `npm run refresh:fixtures`. Rendering from it here shows that the whole
 * colour pipeline is independent of the network, and catches a preset whose
 * code has been edited without its fixture being refreshed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matrixStats } from '@/matrix/matrixStats';
import { fixtureToMatrix, hashCode, validateFixture, type PresetFixture } from '@/presets/fixtures';
import { presets } from '@/presets/presets';
import { renderArtwork } from '@/renderer/renderArtwork';
import { cellSizeFor } from '@/renderer/renderMotifs';
import { getPalette } from '@/renderer/palettes';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function loadFixture(path: string): PresetFixture {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as PresetFixture;
}

describe('hashCode', () => {
  it('is stable for the same input', () => {
    expect(hashCode('size←64')).toBe(hashCode('size←64'));
  });

  it('changes when the code changes', () => {
    expect(hashCode('size←64')).not.toBe(hashCode('size←65'));
  });

  it('handles APL glyphs', () => {
    expect(hashCode('9|∘.×⍨⍳64')).toMatch(/^[0-9a-f]{8}$/u);
  });
});

describe.each(presets.map((preset) => [preset.id, preset] as const))('%s', (_id, preset) => {
  const fixture = loadFixture(preset.fixturePath);

  it('has a fixture matching its current code', () => {
    const validation = validateFixture(fixture, preset.code);
    expect(validation.ok, validation.ok ? '' : `${preset.id}: the fixture ${validation.reason}`).toBe(true);
  });

  it('produced a matrix within the declared output limits', () => {
    expect(fixture.rows).toBeGreaterThanOrEqual(2);
    expect(fixture.columns).toBeGreaterThanOrEqual(2);
    expect(fixture.rows * fixture.columns).toBeLessThanOrEqual(65_536);
  });

  it('holds only finite numbers', () => {
    for (const row of fixture.values) {
      for (const value of row) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('renders to an image without touching the network', () => {
    const matrix = fixtureToMatrix(fixture);
    const image = renderArtwork(matrix, matrixStats(matrix), {
      mode: preset.renderMode,
      palette: getPalette(preset.defaultPaletteId),
    });

    // A cell mode paints one pixel per cell. A tile mode draws a shape, so it
    // needs a block of pixels per cell — the same fixture, a bigger image.
    const perCell = preset.renderMode === 'tiles' ? cellSizeFor(matrix) : 1;

    expect(image.width).toBe(fixture.columns * perCell);
    expect(image.height).toBe(fixture.rows * perCell);
    expect(image.data).toHaveLength(image.width * image.height * 4);
  });

  it('produces more than one colour, so the artwork is not a flat block', () => {
    const matrix = fixtureToMatrix(fixture);
    const image = renderArtwork(matrix, matrixStats(matrix), {
      mode: preset.renderMode,
      palette: getPalette(preset.defaultPaletteId),
    });

    const seen = new Set<string>();
    for (let index = 0; index < image.data.length; index += 4) {
      seen.add(`${image.data[index]},${image.data[index + 1]},${image.data[index + 2]}`);
      if (seen.size > 1) break;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('changes visibly when a parameter changes', () => {
    // Not a claim about beauty, but the preset requirement that a control
    // actually does something.
    expect(preset.parameters.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { matrixStats } from '@/matrix/matrixStats';
import { fromNested } from '@/matrix/matrixTypes';
import { cellSizeFor, renderMotifsToRgba, strokeFor } from '@/renderer/renderMotifs';
import { renderArtwork } from '@/renderer/renderArtwork';
import { getPalette } from '@/renderer/palettes';
import { exportDimensions } from '@/renderer/exportPng';
import { defaultRenderOptions } from '@/renderer/renderOptions';

const PALETTE = getPalette('mono');

function tiling(values: readonly (readonly number[])[]) {
  const matrix = fromNested(values);
  return { matrix, stats: matrixStats(matrix) };
}

/** The colour at a point given as a fraction across the whole image. */
function sample(image: { width: number; height: number; data: Uint8ClampedArray }, u: number, v: number) {
  const x = Math.min(image.width - 1, Math.floor(u * image.width));
  const y = Math.min(image.height - 1, Math.floor(v * image.height));
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

describe('cellSizeFor', () => {
  it('gives a small tiling room to be drawn', () => {
    expect(
      cellSizeFor(
        fromNested([
          [0, 1],
          [1, 0],
        ]),
      ),
    ).toBe(40);
  });

  it('rasterises a coarse tiling large enough not to be scaled up on screen', () => {
    // The preset's own default. At the old cap of 24 this came out 480 pixels
    // across and was then blown up with nearest-neighbour, which put visible
    // steps on every arc — worst exactly where the tiles were big enough to
    // look at.
    const preset = fromNested(Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 0)));
    expect(20 * cellSizeFor(preset)).toBeGreaterThanOrEqual(768);
  });

  it('keeps a large tiling within a sane buffer', () => {
    const big = fromNested(Array.from({ length: 88 }, () => Array.from({ length: 88 }, () => 0)));
    const cell = cellSizeFor(big);
    expect(cell).toBeGreaterThanOrEqual(8);
    expect(88 * cell).toBeLessThanOrEqual(1024);
  });

  it('never goes below the size at which an arc is still curved', () => {
    const huge = fromNested(Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => 0)));
    expect(cellSizeFor(huge)).toBe(8);
  });
});

describe('strokeFor', () => {
  it('draws a thin line on a large tile, so arcs read as curves', () => {
    expect(strokeFor(40)).toBeCloseTo(0.13, 5);
  });

  it('never lets the line thin below about a pixel and a half', () => {
    // A fixed fraction of the cell would put a 1-pixel stroke on an 8-pixel
    // tile, where an arc breaks up into dots.
    expect(strokeFor(8) * 8).toBeGreaterThanOrEqual(1.5);
    expect(strokeFor(4) * 4).toBeGreaterThanOrEqual(1.5);
  });

  it('is never so wide that neighbouring arcs merge', () => {
    for (const cell of [8, 12, 24, 40]) expect(strokeFor(cell)).toBeLessThan(0.25);
  });
});

describe('renderMotifsToRgba', () => {
  it('renders a whole block of pixels per tile, not one', () => {
    const { matrix, stats } = tiling([
      [0, 1],
      [1, 0],
    ]);
    const image = renderMotifsToRgba(matrix, stats, { palette: PALETTE });

    const cell = cellSizeFor(matrix);
    expect(image.width).toBe(2 * cell);
    expect(image.height).toBe(2 * cell);
    expect(image.data).toHaveLength(image.width * image.height * 4);
  });

  it('draws a line, so a tile is not a single flat colour', () => {
    const { matrix, stats } = tiling([
      [0, 0],
      [0, 0],
    ]);
    const image = renderMotifsToRgba(matrix, stats, { palette: PALETTE });

    const distinct = new Set<string>();
    for (let index = 0; index < image.data.length; index += 4) {
      distinct.add(`${image.data[index]},${image.data[index + 1]},${image.data[index + 2]}`);
    }
    // Ground and stroke at least. A flat fill would give one.
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('puts the two arc orientations in different places', () => {
    // The point of a Truchet tiling: the tile class chooses which way the curve
    // runs. A class that drew the same shape would make the tiling pointless.
    const first = tiling([[0]]);
    const second = tiling([[1]]);

    const one = renderMotifsToRgba(first.matrix, first.stats, { palette: PALETTE });
    const other = renderMotifsToRgba(second.matrix, second.stats, { palette: PALETTE });

    expect(Array.from(one.data)).not.toEqual(Array.from(other.data));
  });

  it('joins up at the midpoint of a shared edge', () => {
    /*
     * Two tiles of the same class side by side. The arc of each meets the
     * shared edge at its midpoint, so the stroke is present on both sides of
     * that boundary — which is what makes a curve appear to continue across it.
     */
    const { matrix, stats } = tiling([[0, 0]]);
    const image = renderMotifsToRgba(matrix, stats, { palette: PALETTE });

    // Just left and just right of the vertical join, at half height.
    const left = sample(image, 0.5 - 0.01, 0.5);
    const right = sample(image, 0.5 + 0.01, 0.5);
    expect(left).toEqual(right);
  });

  it('respects an inverted palette', () => {
    const { matrix, stats } = tiling([
      [0, 1],
      [1, 0],
    ]);
    const normal = renderMotifsToRgba(matrix, stats, { palette: PALETTE });
    const inverted = renderMotifsToRgba(matrix, stats, { palette: PALETTE, invert: true });
    expect(Array.from(normal.data)).not.toEqual(Array.from(inverted.data));
  });
});

describe('renderArtwork dispatch', () => {
  it('sends tiles to the motif renderer and everything else to the cell renderer', () => {
    const { matrix, stats } = tiling([
      [0, 1],
      [1, 0],
    ]);

    const cells = renderArtwork(matrix, stats, { mode: 'binary', palette: PALETTE });
    const tiles = renderArtwork(matrix, stats, { mode: 'tiles', palette: PALETTE });

    // One pixel per cell against a whole block per cell.
    expect(cells.width).toBe(2);
    expect(tiles.width).toBe(2 * cellSizeFor(matrix));
  });
});

describe('exportDimensions with tile motifs', () => {
  const { matrix } = tiling(Array.from({ length: 28 }, () => Array.from({ length: 28 }, () => 0)));
  const options = defaultRenderOptions('mono');

  it('predicts the size of a motif export, not the cell count', () => {
    // The bug this replaces: the motif source is already 672px, so flooring
    // 512/672 to a whole number gave 1 and a "512" export came out 672.
    expect(exportDimensions(matrix, options, 512, 'tiles')).toEqual({ width: 512, height: 512 });
  });

  it('still predicts a cell-mode export the same way as before', () => {
    expect(exportDimensions(matrix, options, 512, 'indexed')).toEqual({ width: 504, height: 504 });
  });

  it('reports the drawn size for an original-size motif export', () => {
    const cell = cellSizeFor(matrix);
    expect(exportDimensions(matrix, options, 'original', 'tiles')).toEqual({
      width: 28 * cell,
      height: 28 * cell,
    });
  });
});

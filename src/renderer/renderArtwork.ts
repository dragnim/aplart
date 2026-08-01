/**
 * The one place a matrix becomes pixels.
 *
 * Every consumer goes through here — the canvas, the PNG export, the gallery
 * thumbnails, the contact sheet — so a render mode added in one of them cannot
 * be missing from the others. Before this existed each of those called
 * `renderToRgba` directly, which would have meant four places to remember when
 * tile motifs arrived.
 */

import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type RenderMode } from '@/presets/schema';
import { renderToRgba, type RgbaImage } from './colourMapping';
import { renderMotifsToRgba } from './renderMotifs';
import { type Palette } from './palettes';

export interface RenderArtworkOptions {
  readonly mode: RenderMode;
  readonly palette: Palette;
  readonly invert?: boolean | undefined;
}

/**
 * Renders a matrix to pixels.
 *
 * Most modes paint one pixel per cell and leave scaling to the canvas. `tiles`
 * is different: a motif needs several pixels to be a shape at all, so it
 * returns a larger image. Callers already letterbox whatever they are given, so
 * neither has to know which it received.
 */
export function renderArtwork(
  matrix: NumericMatrix,
  stats: MatrixStats,
  options: RenderArtworkOptions,
): RgbaImage {
  if (options.mode === 'tiles') {
    return renderMotifsToRgba(matrix, stats, {
      palette: options.palette,
      ...(options.invert === undefined ? {} : { invert: options.invert }),
    });
  }

  return renderToRgba(matrix, stats, {
    // Narrowed by the check above: everything reaching here is a cell mode.
    mode: options.mode,
    palette: options.palette,
    ...(options.invert === undefined ? {} : { invert: options.invert }),
  });
}

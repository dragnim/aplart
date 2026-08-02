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
import { renderToRgba, renderWithMapper, type RgbaImage } from './colourMapping';
import { createEscapeMapper, type Colouring, type ValueRange } from './escapeColouring';
import { renderMotifsToRgba } from './renderMotifs';
import { type Palette } from './palettes';

export interface RenderArtworkOptions {
  readonly mode: RenderMode;
  readonly palette: Palette;
  readonly invert?: boolean | undefined;
  /**
   * How escape counts become colours, and the range they are counted over.
   *
   * Present only for a preset that declares a value range. Everything else
   * keeps normalising against what its own matrix contains, which is right for
   * an artwork whose values have no known bounds.
   */
  readonly escape?:
    | {
        readonly colouring: Colouring;
        readonly range: ValueRange;
        /** Palette entries *before* animation extends the ramp. */
        readonly entries: number;
      }
    | undefined;
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

  if (options.escape !== undefined) {
    /*
     * A declared range, so the colour of a value does not depend on which crop
     * it happens to be in. This is the only path that ignores `stats`, and
     * deliberately: the statistics describe this result, and the point is to
     * colour by what the calculation can produce.
     */
    return renderWithMapper(
      matrix,
      createEscapeMapper({
        palette: options.palette,
        entries: options.escape.entries,
        colouring: options.escape.colouring,
        range: options.escape.range,
        ...(options.invert === undefined ? {} : { invert: options.invert }),
      }),
    );
  }

  return renderToRgba(matrix, stats, {
    // Narrowed by the check above: everything reaching here is a cell mode.
    mode: options.mode,
    palette: options.palette,
    ...(options.invert === undefined ? {} : { invert: options.invert }),
  });
}

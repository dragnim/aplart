/**
 * Drawing tile motifs instead of flat cells.
 *
 * A Truchet tiling is not a grid of colours — it is a grid of *shapes* whose
 * edges line up, so the eye follows continuous curves across tile boundaries
 * that no single tile contains. Painting one flat colour per cell throws that
 * away and leaves a coloured matrix.
 *
 * Rasterised by hand into an RGBA buffer rather than drawn with canvas paths.
 * That is deliberate: the gallery thumbnails are generated in Node, where
 * there is no canvas, and the screen, the export and the thumbnail must all be
 * the same picture. A distance test per pixel is enough for arcs and
 * diagonals, and it keeps this module pure.
 */

import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { parseHexColour } from './colourMapping';
import { type Palette } from './palettes';
import { type RgbaImage } from './colourMapping';

/**
 * Pixels per tile, chosen from the matrix size.
 *
 * A fixed size would make a 20-tile piece tiny and an 88-tile piece enormous.
 * Aiming at roughly a thousand pixels across keeps arcs smooth while bounding
 * the buffer.
 *
 * The cap was 24 and the target 768, which meant a deliberately coarse tiling
 * was rasterised small and then scaled up on screen — nearest-neighbour, so the
 * curves came out visibly stepped exactly when the tiles were large enough to
 * look at properly.
 */
export function cellSizeFor(matrix: NumericMatrix): number {
  const longest = Math.max(matrix.rows, matrix.columns);
  return Math.min(40, Math.max(8, Math.floor(1000 / longest)));
}

/**
 * How wide the drawn line is, as a fraction of a cell.
 *
 * A line at a fixed fraction of the cell cannot be right at both ends of the
 * range: 0.19 read as a confident stroke on a small tile and as a heavy band on
 * a large one, which turned neighbouring arcs into a mesh of blobs rather than
 * curves that could be followed. So the fraction is thin, with a floor of about
 * a pixel and a half — below that a stroke starts to break up, and no amount of
 * thinness is worth an arc that disappears.
 */
export function strokeFor(cell: number): number {
  return Math.max(0.13, 1.6 / cell);
}

/**
 * The four motifs, keyed by tile class.
 *
 * Classes 0 and 1 are the two quarter-arc orientations of a classic Truchet
 * tiling — the pair that produces flowing curves. Classes 2 and 3 are the two
 * diagonals, which break the flow up and give a piece with more tile classes
 * something coarser to contrast against.
 *
 * Four is therefore the most a tiling can usefully ask for: the class is taken
 * modulo this list, so a fifth class draws the first shape again. A preset
 * offering more would be promising shapes that do not exist. Adding real ones —
 * a straight through the middle joins the arcs at the same edge midpoints, and
 * would be the honest way to extend the range — is a change to make
 * deliberately, not by widening a slider.
 */
type Motif = 'arcsNwSe' | 'arcsNeSw' | 'diagonalNwSe' | 'diagonalNeSw';

const MOTIFS: readonly Motif[] = ['arcsNwSe', 'arcsNeSw', 'diagonalNwSe', 'diagonalNeSw'];

/**
 * Whether a point inside a tile is on the drawn line.
 *
 * `u` and `v` run from 0 to 1 across the tile. The arcs are quarter circles of
 * radius one half centred on opposite corners, which is what makes them meet
 * exactly at the midpoint of each edge and join up with the neighbouring tile.
 */
function onStroke(motif: Motif, u: number, v: number, stroke: number): boolean {
  switch (motif) {
    case 'arcsNwSe':
      return nearRing(u, v, 0, 0, stroke) || nearRing(u, v, 1, 1, stroke);
    case 'arcsNeSw':
      return nearRing(u, v, 1, 0, stroke) || nearRing(u, v, 0, 1, stroke);
    /*
     * The perpendicular distance to the line, not the difference of the
     * coordinates — those differ by a factor of √2. The old form compared
     * `|u-v|` against `stroke × 0.75`, which drew the diagonals 6% wider than
     * the arcs: close enough to look deliberate, and not.
     */
    case 'diagonalNwSe':
      return Math.abs(u - v) * Math.SQRT1_2 < stroke / 2;
    case 'diagonalNeSw':
      return Math.abs(u + v - 1) * Math.SQRT1_2 < stroke / 2;
  }
}

function nearRing(u: number, v: number, centreU: number, centreV: number, stroke: number): boolean {
  const distance = Math.hypot(u - centreU, v - centreV);
  return Math.abs(distance - 0.5) < stroke / 2;
}

/**
 * Renders a matrix as tile motifs.
 *
 * The value in each cell chooses the motif. Colour still comes from the
 * palette, so the appearance controls keep working: the line takes a light
 * entry and the tile behind it a dark one, which is what makes the curves read
 * at a glance.
 */
export function renderMotifsToRgba(
  matrix: NumericMatrix,
  /*
   * Unused, and kept anyway: every renderer takes the same pair so the
   * dispatcher can call any of them without knowing which. The other modes map
   * a value's position within the range onto a colour; a tiling maps it onto a
   * shape, and a shape does not care what the range is.
   */
  _stats: MatrixStats,
  options: { readonly palette: Palette; readonly invert?: boolean },
): RgbaImage {
  const cell = cellSizeFor(matrix);
  const stroke = strokeFor(cell);
  const width = matrix.columns * cell;
  const height = matrix.rows * cell;
  const data = new Uint8ClampedArray(width * height * 4);

  const stops = options.palette.colours.map(parseHexColour);
  const ramp = options.invert === true ? [...stops].reverse() : stops;

  // The tile behind the line, and the line itself. Taken from opposite ends of
  // the ramp so the contrast is as high as the palette allows.
  const background = ramp[1] ?? ramp[0];
  const foreground = ramp[ramp.length - 1];

  // Every shipped palette has at least two colours, and a test enforces that.
  // Checked rather than asserted so a hand-written palette fails loudly here
  // instead of painting transparent tiles.
  if (background === undefined || foreground === undefined) {
    throw new Error(`The palette "${options.palette.id}" has no colours to draw with.`);
  }

  /*
   * The ground is flat. No per-cell tint at all.
   *
   * It was tried at 0.12 and then at 0.05, and both drew a grid of faint
   * squares across the piece — which is precisely the thing the motifs exist to
   * disguise. A Truchet tiling is meant to read as paths flowing over one
   * surface, not as something assembled tile by tile, and no amount of
   * shading is worth giving that away. Shape carries the variety.
   */
  for (let row = 0; row < matrix.rows; row += 1) {
    for (let column = 0; column < matrix.columns; column += 1) {
      const value = matrix.values[row * matrix.columns + column] as number;
      const index = ((Math.round(value) % MOTIFS.length) + MOTIFS.length) % MOTIFS.length;
      const motif = MOTIFS[index] as Motif;

      for (let y = 0; y < cell; y += 1) {
        // Sampled at pixel centres, so a motif is not lopsided by half a pixel.
        const v = (y + 0.5) / cell;
        for (let x = 0; x < cell; x += 1) {
          const u = (x + 0.5) / cell;
          const colour = onStroke(motif, u, v, stroke) ? foreground : background;

          const offset = ((row * cell + y) * width + column * cell + x) * 4;
          data[offset] = colour.r;
          data[offset + 1] = colour.g;
          data[offset + 2] = colour.b;
          data[offset + 3] = 255;
        }
      }
    }
  }

  return { width, height, data };
}

/**
 * Painting a matrix onto a canvas.
 *
 * The matrix is rendered once at one pixel per cell, then scaled up. Doing it
 * that way keeps the colour mapping independent of the display size, so
 * resizing the window never re-colours anything, and nearest-neighbour scaling
 * gives cell-based artwork the crisp edges it needs.
 */

import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type RenderMode } from '@/presets/schema';
import { cellBounds, displayedShape, type SourceCell } from './displayMapping';
import { type Palette } from './palettes';
import { tileCounts, tileGrid, tileParity, tileRect, type TileGrid } from './tiling';
import { renderArtwork, type RenderArtworkOptions } from './renderArtwork';
import { paletteFor, transformMatrix, type RenderOptions } from './renderOptions';

export interface DrawRequest {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
  /**
   * The palette to draw with, instead of the one the options describe.
   *
   * Set only while an animation is running, where the palette for a frame is
   * derived from the saved one and a phase. Everything else leaves it out and
   * gets the saved palette — which is why pausing draws exactly what was saved
   * rather than something close to it.
   */
  readonly palette?: Palette;
  /** How escape counts become colours, for a preset that declares a range. */
  readonly escape?: RenderArtworkOptions['escape'];
}

/**
 * Builds the one-pixel-per-cell image for a matrix.
 *
 * Exported separately from drawing so the PNG export and the thumbnail script
 * can share exactly the same pixels as the screen.
 */
export function buildArtworkImage(request: DrawRequest) {
  const transformed = transformMatrix(request.matrix, request.options);
  const palette = request.palette ?? paletteFor(request.options);

  return {
    image: renderArtwork(transformed, request.stats, {
      mode: request.mode,
      palette,
      invert: request.options.invert,
      escape: request.escape,
    }),
    palette,
    transformed,
  };
}

/**
 * Draws an artwork into a canvas, fitted to the available box.
 *
 * `cssWidth` and `cssHeight` are the layout size; `devicePixelRatio` scales the
 * backing store so the result is sharp on high-density displays.
 */
export function drawArtwork(
  canvas: HTMLCanvasElement,
  request: DrawRequest,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1,
): void {
  const { image, palette } = buildArtworkImage(request);

  const pixelWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
  const pixelHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));

  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const context = canvas.getContext('2d');
  if (context === null) return;

  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.fillStyle = palette.background ?? '#000000';
  context.fillRect(0, 0, pixelWidth, pixelHeight);

  const source = toSourceCanvas(image);

  /*
   * Letterbox rather than stretch: an artwork's aspect ratio is part of it.
   * Shared with the hit-testing, which has to agree with this exactly — and now
   * shared through the tile grid, which reduces to a single letterboxed cell
   * when nothing is being repeated.
   */
  const { columns, rows } = tileCounts(request.options.tiling);
  const grid = tileGrid(
    image.width,
    image.height,
    columns,
    rows,
    pixelWidth,
    pixelHeight,
    request.options.tiling?.scale ?? 1,
    request.options.tiling?.mode === 'mirror-repeat',
  );
  const box = grid.region;

  context.imageSmoothingEnabled = request.options.smoothScaling;
  if (request.options.smoothScaling) context.imageSmoothingQuality = 'high';

  /*
   * A "nothing here yet" hatch, laid down before the artwork.
   *
   * Cells that have not arrived from a banded run are transparent, and letting
   * the background show through them is not enough: on the heat palette the
   * background is black and so is the lowest value, so an undelivered region
   * looked exactly like a large flat area of real result. Stripes cannot be
   * mistaken for data, because no palette produces them.
   *
   * Painted unconditionally rather than behind a flag. It is only ever visible
   * where a cell is absent, so a finished artwork covers every pixel of it, and
   * there is no state to get wrong.
   */
  const hatch = pendingPattern(context);
  if (hatch !== null) {
    context.save();
    context.fillStyle = hatch;
    context.fillRect(box.left, box.top, box.width, box.height);
    context.restore();
  }

  /*
   * One rendered tile, drawn once per copy. The matrix is parsed once, the
   * image is built once and the statistics are computed once however many
   * copies are on screen — a repeat is a drawing operation, not a re-render.
   */
  context.save();
  /*
   * Clipped to the artwork region. A scale above 100% makes the outermost
   * copies overhang, and without this they would spill across the letterboxed
   * mat and out to the edge of the canvas — the artwork would stop having a
   * shape.
   */
  context.beginPath();
  context.rect(box.left, box.top, box.width, box.height);
  context.clip();

  composeTiles(context, source, grid);

  /*
   * Guides last, over the finished composition and inside the same clip.
   *
   * Drawn from the grid's own boundary positions, not from a second calculation
   * — a guide a pixel away from the join it marks would be worse than none,
   * because somebody is looking at it precisely to judge that join.
   */
  if (request.options.tiling?.showSeamGuides === true && grid.columns * grid.rows > 1) {
    drawSeamGuides(context, grid, devicePixelRatio);
  }

  context.restore();
}

/**
 * Thin lines on the tile boundaries.
 *
 * Two strokes, dark under light, so the line is findable on a pale artwork and
 * a dark one without belonging to either palette. Only the internal boundaries:
 * the outside of the composition is where the artwork stops, not a join.
 */
function drawSeamGuides(
  context: CanvasRenderingContext2D,
  grid: ReturnType<typeof tileGrid>,
  devicePixelRatio: number,
): void {
  const top = grid.ys[0] ?? 0;
  const bottom = grid.ys[grid.rows] ?? top;
  const left = grid.xs[0] ?? 0;
  const right = grid.xs[grid.columns] ?? left;

  const line = (x0: number, y0: number, x1: number, y1: number) => {
    context.beginPath();
    // Half a pixel over, so a one-pixel stroke lands on the pixel rather than
    // straddling two and coming out as a two-pixel smudge.
    context.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
    context.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    context.stroke();
  };

  context.save();
  for (const [colour, width] of [
    ['rgb(0 0 0 / 55%)', 3],
    ['rgb(255 255 255 / 90%)', 1],
  ] as const) {
    context.strokeStyle = colour;
    context.lineWidth = width * devicePixelRatio;
    for (let column = 1; column < grid.columns; column += 1) {
      const x = grid.xs[column] ?? 0;
      line(x, top, x, bottom);
    }
    for (let row = 1; row < grid.rows; row += 1) {
      const y = grid.ys[row] ?? 0;
      line(left, y, right, y);
    }
  }
  context.restore();
}

/** Whatever `createCanvas` produces here — offscreen where available. */
type SourceCanvas = ReturnType<typeof createCanvas>;

/**
 * Draws one prepared tile across a grid, reflecting alternate copies.
 *
 * Shared by the screen and the export so a saved composition cannot drift from
 * the one on screen. Clipped to the artwork region, so a tile scale above 100%
 * overhangs and is trimmed rather than spilling onto the mat.
 *
 * The reflected orientations are built once for the whole composition — four
 * canvases whatever the count, so a hundred copies cost a hundred ordinary
 * draws and not a hundred transforms.
 *
 * Four separate canvases rather than the single 2 × 2 super-tile the obvious
 * design suggests. A super-tile would be sampled by sub-rectangle, and with
 * smooth scaling on, sampling a sub-rectangle bleeds a little of the
 * neighbouring quadrant across the join — the artefact this whole area exists
 * to avoid. Separate canvases have no neighbour to bleed from.
 */
export function composeTiles(context: CanvasRenderingContext2D, source: SourceCanvas, grid: TileGrid): void {
  const { region } = grid;

  context.save();
  context.beginPath();
  context.rect(region.left, region.top, region.width, region.height);
  context.clip();

  const oriented = grid.mirrored ? reflections(source) : null;

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const cell = tileRect(grid, column, row);
      if (cell.width <= 0 || cell.height <= 0) continue;

      /*
       * Placed at the grid's rounded boundaries, whether reflected or not. The
       * reflection happens inside the source, so the destination rectangle is
       * untouched and mirroring cannot reintroduce a half-pixel seam.
       */
      const parity = tileParity(grid, column, row);
      const from = oriented === null ? source : pickReflection(oriented, parity);
      context.drawImage(from, cell.left, cell.top, cell.width, cell.height);
    }
  }

  context.restore();
}

interface Reflections {
  readonly plain: SourceCanvas;
  readonly flipX: SourceCanvas;
  readonly flipY: SourceCanvas;
  readonly flipXY: SourceCanvas;
}

function pickReflection(all: Reflections, parity: { mirrorX: boolean; mirrorY: boolean }) {
  if (parity.mirrorX && parity.mirrorY) return all.flipXY;
  if (parity.mirrorX) return all.flipX;
  if (parity.mirrorY) return all.flipY;
  return all.plain;
}

/** The base tile and its three reflections, each on its own canvas. */
function reflections(source: SourceCanvas): Reflections {
  const flip = (horizontally: boolean, vertically: boolean) => {
    const canvas = createCanvas(source.width, source.height);
    const context = canvas.getContext('2d');
    if (context === null) return source;

    context.translate(horizontally ? source.width : 0, vertically ? source.height : 0);
    context.scale(horizontally ? -1 : 1, vertically ? -1 : 1);
    context.drawImage(source, 0, 0);
    return canvas;
  };

  return {
    plain: source,
    flipX: flip(true, false),
    flipY: flip(false, true),
    flipXY: flip(true, true),
  };
}

/** The stripe tile, built once and reused for every frame. */
let pendingTile: HTMLCanvasElement | null = null;

function pendingPattern(context: CanvasRenderingContext2D): CanvasPattern | null {
  if (pendingTile === null) {
    if (typeof document === 'undefined') return null;
    const tile = document.createElement('canvas');
    tile.width = 12;
    tile.height = 12;
    const tileContext = tile.getContext('2d');
    if (tileContext === null) return null;

    // Grey on grey, so it sits quietly over a dark palette background and a
    // pale one alike without suggesting a colour of its own.
    tileContext.fillStyle = 'rgba(128, 128, 128, 0.16)';
    tileContext.fillRect(0, 0, 12, 12);
    tileContext.strokeStyle = 'rgba(128, 128, 128, 0.28)';
    tileContext.lineWidth = 4;
    tileContext.beginPath();
    tileContext.moveTo(-6, 6);
    tileContext.lineTo(6, -6);
    tileContext.moveTo(0, 12);
    tileContext.lineTo(12, 0);
    tileContext.moveTo(6, 18);
    tileContext.lineTo(18, 6);
    tileContext.stroke();
    pendingTile = tile;
  }

  return context.createPattern(pendingTile, 'repeat');
}

/**
 * Outlines one cell on an already-drawn canvas.
 *
 * Drawn onto the canvas rather than positioned over it as an element: the
 * letterbox geometry is already worked out here, and a DOM overlay would have to
 * measure the frame and rediscover it. Deliberately a separate call from
 * `drawArtwork` so it cannot reach the export, which renders from the matrix and
 * never reads the screen — a marker in a saved image would be a surprise.
 *
 * Two strokes, light over dark, so the cell is findable on a pale artwork and a
 * dark one without tinting what is inside it.
 */
export function drawCellMarker(
  canvas: HTMLCanvasElement,
  cell: SourceCell,
  matrix: NumericMatrix,
  options: RenderOptions,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1,
): void {
  const context = canvas.getContext('2d');
  if (context === null) return;

  const shown = displayedShape(matrix.rows, matrix.columns, options);
  const { columns, rows } = tileCounts(options.tiling);
  const grid = tileGrid(
    shown.columns,
    shown.rows,
    columns,
    rows,
    Math.round(cssWidth * devicePixelRatio),
    Math.round(cssHeight * devicePixelRatio),
    options.tiling?.scale ?? 1,
    options.tiling?.mode === 'mirror-repeat',
  );
  if (grid.region.width === 0 || grid.region.height === 0) return;

  const bounds = cellBounds(cell, matrix.rows, matrix.columns, options);

  /*
   * Marked on every copy rather than on the one that was pressed.
   *
   * All of them show the same cell — that is what a repeat is — so marking one
   * would suggest the others were a different cell, and the inspector goes out
   * of its way to say they are not. Which copy the press landed on is not
   * remembered anywhere, and deliberately: it is not part of the artwork.
   */
  // Clipped like the artwork, so a marker on a copy the scale pushed past the
  // edge is cut off with it rather than floating on the mat.
  context.save();
  context.beginPath();
  context.rect(grid.region.left, grid.region.top, grid.region.width, grid.region.height);
  context.clip();

  /*
   * Quieter the more copies there are, and equally quiet on all of them.
   *
   * One marker on one artwork should be easy to find. A hundred of them, each
   * inflated to a ten-pixel minimum over a four-pixel cell, stop being a
   * selection and become a regular grid of squares that reads as part of the
   * pattern — which at 5 × 5 and half scale is exactly what happened.
   *
   * Emphasis drops for every copy together rather than picking one to be the
   * real one: they all show the same cell, and suggesting otherwise would be a
   * claim about the artwork that is not true.
   */
  const copies = grid.columns * grid.rows;
  /*
   * A gentle taper on top of that. Dropping the inflation does most of the
   * work — a marker that matches its cell can never be louder than one cell of
   * the artwork — so this only takes the edge off the lattice a hundred
   * identically placed outlines would otherwise make. Taken too far it stops
   * being findable, which is the opposite failure and just as useless.
   */
  const emphasis = copies === 1 ? 1 : Math.max(0.7, 1 - (copies - 1) * 0.02);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const box = tileRect(grid, column, row);
      if (box.width <= 0 || box.height <= 0) continue;

      /*
       * Marked where the cell actually appears in this copy. A reflected copy
       * shows it on the other side, and a marker left at the unreflected
       * position would point at a different cell of the artwork.
       */
      const parity = tileParity(grid, column, row);
      const placed = {
        left: parity.mirrorX ? 1 - bounds.left - bounds.width : bounds.left,
        top: parity.mirrorY ? 1 - bounds.top - bounds.height : bounds.top,
        width: bounds.width,
        height: bounds.height,
      };
      markCell(context, box, placed, devicePixelRatio, copies === 1, emphasis);
    }
  }
  context.restore();
}

function markCell(
  context: CanvasRenderingContext2D,
  box: { left: number; top: number; width: number; height: number },
  bounds: { left: number; top: number; width: number; height: number },
  devicePixelRatio: number,
  growToMinimum: boolean,
  emphasis: number,
): void {
  const left = box.left + bounds.left * box.width;
  const top = box.top + bounds.top * box.height;
  const width = bounds.width * box.width;
  const height = bounds.height * box.height;

  /*
   * A minimum size in pixels. At two hundred cells across a single cell is a
   * couple of pixels, and an outline of a two-pixel square is a dot that cannot
   * be told from a stray mark; the marker grows around the cell's centre instead.
   */
  const minimum = 10 * devicePixelRatio;
  // Only worth inflating when there is one of them. Across many copies the
  // inflation is what turns markers into a pattern.
  const grow = growToMinimum ? Math.max(0, (minimum - Math.min(width, height)) / 2) : 0;

  context.save();
  context.globalAlpha = emphasis;
  context.lineWidth = Math.max(1, devicePixelRatio);
  context.strokeStyle = 'rgb(0 0 0 / 70%)';
  context.strokeRect(
    left - grow - context.lineWidth,
    top - grow - context.lineWidth,
    width + 2 * grow + 2 * context.lineWidth,
    height + 2 * grow + 2 * context.lineWidth,
  );
  context.strokeStyle = 'rgb(255 255 255 / 95%)';
  context.strokeRect(left - grow, top - grow, width + 2 * grow, height + 2 * grow);
  context.restore();
}

/**
 * Wraps the pixel data in a canvas that `drawImage` can scale.
 *
 * `putImageData` ignores scaling and clipping, so the data has to go through
 * an intermediate canvas of its own to be resized at all.
 */
export function toSourceCanvas(image: { width: number; height: number; data: Uint8ClampedArray }) {
  const source = createCanvas(image.width, image.height);
  const context = source.getContext('2d');
  if (context !== null) {
    // Built through createImageData and copied into, rather than constructed
    // from the array directly: the ImageData constructor insists on a buffer
    // that is definitely not shared.
    const imageData = context.createImageData(image.width, image.height);
    imageData.data.set(image.data);
    context.putImageData(imageData, 0, 0);
  }
  return source;
}

/** Prefers an offscreen canvas where available, falling back to a detached element. */
function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

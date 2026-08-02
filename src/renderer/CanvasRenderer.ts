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
import { fitArtwork } from './fitArtwork';
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

  // Letterbox rather than stretch: an artwork's aspect ratio is part of it.
  // Shared with the hit-testing, which has to agree with this exactly.
  const box = fitArtwork(image.width, image.height, pixelWidth, pixelHeight);

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

  context.drawImage(source, box.left, box.top, box.width, box.height);
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
  const box = fitArtwork(
    shown.columns,
    shown.rows,
    Math.round(cssWidth * devicePixelRatio),
    Math.round(cssHeight * devicePixelRatio),
  );
  if (box.width === 0 || box.height === 0) return;

  const bounds = cellBounds(cell, matrix.rows, matrix.columns, options);
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
  const grow = Math.max(0, (minimum - Math.min(width, height)) / 2);

  context.save();
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

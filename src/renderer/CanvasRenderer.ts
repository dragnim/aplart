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
import { renderToRgba } from './colourMapping';
import { getPalette } from './palettes';
import { transformMatrix, type RenderOptions } from './renderOptions';

export interface DrawRequest {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
}

/**
 * Builds the one-pixel-per-cell image for a matrix.
 *
 * Exported separately from drawing so the PNG export and the thumbnail script
 * can share exactly the same pixels as the screen.
 */
export function buildArtworkImage(request: DrawRequest) {
  const transformed = transformMatrix(request.matrix, request.options);
  const palette = getPalette(request.options.paletteId);

  return {
    image: renderToRgba(transformed, request.stats, {
      mode: request.mode,
      palette,
      invert: request.options.invert,
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
  const scale = Math.min(pixelWidth / image.width, pixelHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (pixelWidth - drawWidth) / 2;
  const offsetY = (pixelHeight - drawHeight) / 2;

  context.imageSmoothingEnabled = request.options.smoothScaling;
  if (request.options.smoothScaling) context.imageSmoothingQuality = 'high';

  context.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
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

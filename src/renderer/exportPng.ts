/**
 * PNG export.
 *
 * Rendered on an off-screen canvas at the requested size rather than by
 * scaling whatever is on screen, so the export never depends on the window
 * size and pixel artwork keeps its hard edges.
 */

import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type RenderMode } from '@/presets/schema';
import { buildArtworkImage, toSourceCanvas } from './CanvasRenderer';
import { type RenderOptions } from './renderOptions';

export type ExportSize = 512 | 1024 | 2048 | 'original';

export interface ExportRequest {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
  readonly size: ExportSize;
  readonly caption?: string | undefined;
  readonly title: string;
}

/**
 * Builds a safe, descriptive file name.
 *
 * Anything that is not a plain letter, digit or hyphen is dropped: the title
 * can contain whatever a user typed, and it must not be able to produce a path
 * separator, a leading dot, or a name a filesystem will refuse.
 */
export function exportFilename(title: string, size: ExportSize): string {
  const slug =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 60) || 'artwork';

  const suffix = size === 'original' ? 'original' : `${size}px`;
  return `apl-art-${slug}-${suffix}.png`;
}

/** The pixel dimensions an export will produce, for showing before it runs. */
export function exportDimensions(
  matrix: NumericMatrix,
  options: RenderOptions,
  size: ExportSize,
): { width: number; height: number } {
  const turned = options.rotation === 90 || options.rotation === 270;
  const cellsWide = turned ? matrix.rows : matrix.columns;
  const cellsHigh = turned ? matrix.columns : matrix.rows;

  if (size === 'original') return { width: cellsWide, height: cellsHigh };

  const scale = scaleFor(cellsWide, cellsHigh, size);
  return { width: cellsWide * scale, height: cellsHigh * scale };
}

/**
 * An integer scale factor, so cells stay square and edges stay hard.
 *
 * A fractional factor would leave some cells one pixel wider than their
 * neighbours, which is very visible on a regular grid.
 */
function scaleFor(width: number, height: number, target: number): number {
  return Math.max(1, Math.floor(target / Math.max(width, height)));
}

export async function exportArtworkPng(request: ExportRequest): Promise<Blob> {
  const { image, palette } = buildArtworkImage(request);

  const scale = request.size === 'original' ? 1 : scaleFor(image.width, image.height, request.size);
  const artworkWidth = image.width * scale;
  const artworkHeight = image.height * scale;

  const caption = request.caption?.trim();
  const captionHeight =
    caption === undefined || caption === '' ? 0 : Math.max(28, Math.round(artworkHeight * 0.08));

  const canvas = document.createElement('canvas');
  canvas.width = artworkWidth;
  canvas.height = artworkHeight + captionHeight;

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser could not provide a canvas to export with.');

  context.fillStyle = palette.background ?? '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Nearest-neighbour unless the artwork was explicitly set to smooth.
  context.imageSmoothingEnabled = request.options.smoothScaling;
  if (request.options.smoothScaling) context.imageSmoothingQuality = 'high';
  context.drawImage(toSourceCanvas(image), 0, 0, artworkWidth, artworkHeight);

  if (caption !== undefined && caption !== '') {
    context.imageSmoothingEnabled = true;
    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.font = `${Math.round(captionHeight * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(caption, artworkWidth / 2, artworkHeight + captionHeight / 2, artworkWidth * 0.92);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('The image could not be encoded.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/** Triggers a download without leaking the object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking immediately can cancel the download in
  // some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

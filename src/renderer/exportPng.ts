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
import { buildArtworkImage, composeTiles, toSourceCanvas, type DrawRequest } from './CanvasRenderer';
import { isRepeating, tileCounts, tileGrid, type TilingMode } from './tiling';
import { type Palette } from './palettes';
import { cellSizeFor } from './renderMotifs';
import { type RenderOptions } from './renderOptions';

export type ExportSize = 512 | 1024 | 2048 | 'original';

export interface ExportRequest {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
  /**
   * The palette to draw with, instead of the one the options describe.
   *
   * Passed while an animation is running, so a saved image is the frame that
   * was on screen. `buildArtworkImage` takes the same field, which is why this
   * needs no code of its own.
   */
  readonly palette?: Palette;
  /** As on the canvas, so a saved image is coloured the same way. */
  readonly escape?: DrawRequest['escape'];
  /**
   * One tile, or the composition currently on screen.
   *
   * `tile` is the behaviour that has always been here and stays exactly as it
   * was. `tiling` repeats the same finished tile using the settings already
   * chosen in the Tiling section — the export panel does not ask again.
   */
  readonly composition?: 'tile' | 'tiling';
  /** Exact output pixels, overriding `size`. Square sizes come from `size`. */
  readonly output?: { readonly width: number; readonly height: number };
  readonly size: ExportSize;
  /**
   * Lines printed beneath the artwork. Omitted or empty means no caption at
   * all, and no extra height — the specification is explicit that a caption is
   * off by default.
   */
  readonly caption?: readonly string[] | undefined;
  readonly title: string;
}

/**
 * Builds a safe, descriptive file name.
 *
 * Anything that is not a plain letter, digit or hyphen is dropped: the title
 * can contain whatever a user typed, and it must not be able to produce a path
 * separator, a leading dot, or a name a filesystem will refuse.
 */
export function exportFilename(
  title: string,
  size: ExportSize,
  composition?: { readonly mode: TilingMode; readonly columns: number; readonly rows: number },
): string {
  const slug =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 60) || 'artwork';

  const suffix = size === 'original' ? 'original' : `${size}px`;

  /*
   * The composition in the name, but only when there is one. A single tile
   * keeps the name it has always had — somebody with a folder of these should
   * not find the next one filed differently for no reason they asked for.
   */
  if (composition !== undefined && composition.mode !== 'single') {
    const kind = composition.mode === 'mirror-repeat' ? 'mirror-repeat' : 'repeat';
    const grid = `${String(composition.columns)}x${String(composition.rows)}`;
    return `apl-art-${slug}-${kind}-${grid}-${suffix}.png`;
  }

  return `apl-art-${slug}-${suffix}.png`;
}

/**
 * The pixel dimensions an export will produce, for showing before it runs.
 *
 * The mode is needed, not just the matrix: a cell mode renders one pixel per
 * cell, but tile motifs render a whole block per cell, so predicting from the
 * cell count alone would be wrong by more than an order of magnitude.
 */
export function exportDimensions(
  matrix: NumericMatrix,
  options: RenderOptions,
  size: ExportSize,
  mode: RenderMode = 'indexed',
): { width: number; height: number } {
  const turned = options.rotation === 90 || options.rotation === 270;
  const cellsWide = turned ? matrix.rows : matrix.columns;
  const cellsHigh = turned ? matrix.columns : matrix.rows;

  const perCell = mode === 'tiles' ? cellSizeFor(matrix) : 1;
  const sourceWidth = cellsWide * perCell;
  const sourceHeight = cellsHigh * perCell;

  if (size === 'original') return { width: sourceWidth, height: sourceHeight };

  const scale = scaleFor(sourceWidth, sourceHeight, size);
  return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) };
}

/**
 * The factor that takes a rendered image to the requested size.
 *
 * Scaling up uses a whole number, so cells stay square and edges stay hard: a
 * fractional factor would leave some cells a pixel wider than their
 * neighbours, which is glaring on a regular grid.
 *
 * Scaling *down* has to be allowed to be fractional. A mode that draws shapes
 * rather than cells — tile motifs — already produces a large image, so a
 * 28-tile Truchet arrives here 672 pixels across. Flooring that to a whole
 * number gave 1, and asking for a 512 pixel export quietly produced 672.
 */
function scaleFor(width: number, height: number, target: number): number {
  const exact = target / Math.max(width, height);
  return exact >= 1 ? Math.floor(exact) : exact;
}

export async function exportArtworkPng(request: ExportRequest): Promise<Blob> {
  const { image, palette } = buildArtworkImage(request);

  const tiled = request.composition === 'tiling' && isRepeating(request.options.tiling);

  /*
   * The requested size, honoured exactly.
   *
   * Boundaries are worked out afresh for these dimensions rather than scaled
   * from the ones on screen: the canvas is a different size, and reusing its
   * positions would land the joins fractionally off and put back the seam that
   * shared rounding exists to prevent.
   */
  const requested =
    request.output ??
    (tiled && request.size !== 'original' ? { width: request.size, height: request.size } : null);

  const scale = request.size === 'original' ? 1 : scaleFor(image.width, image.height, request.size);
  const artworkWidth = requested?.width ?? Math.round(image.width * scale);
  const artworkHeight = requested?.height ?? Math.round(image.height * scale);

  const caption = (request.caption ?? []).map((line) => line.trim()).filter((line) => line !== '');

  // Scaled to the artwork rather than fixed, so a 2048px export does not get a
  // caption sized for a thumbnail. Floored so a small export stays legible.
  const lineHeight = caption.length === 0 ? 0 : Math.max(22, Math.round(artworkHeight * 0.055));
  const captionHeight = caption.length === 0 ? 0 : lineHeight * caption.length + lineHeight * 0.6;

  const canvas = document.createElement('canvas');
  canvas.width = artworkWidth;
  canvas.height = artworkHeight + captionHeight;

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser could not provide a canvas to export with.');

  context.fillStyle = palette.background ?? '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);

  /*
   * Nearest-neighbour when enlarging, so cell edges stay hard.
   *
   * Reducing is different: a drawn motif being sampled down without smoothing
   * loses parts of its strokes and comes out ragged, so smoothing is used
   * regardless of the appearance setting. That setting is about how the artwork
   * looks enlarged, which is not the situation here.
   */
  const reducing = scale < 1;
  context.imageSmoothingEnabled = reducing || request.options.smoothScaling;
  if (context.imageSmoothingEnabled) context.imageSmoothingQuality = 'high';

  const source = toSourceCanvas(image);
  if (tiled) {
    /*
     * The same grid arithmetic and the same composition as the screen, applied
     * to the export's own pixels. Nothing is copied from the visible canvas.
     */
    const { columns, rows } = tileCounts(request.options.tiling);
    const grid = tileGrid(
      image.width,
      image.height,
      columns,
      rows,
      artworkWidth,
      artworkHeight,
      request.options.tiling?.scale ?? 1,
      request.options.tiling?.mode === 'mirror-repeat',
    );
    composeTiles(context, source, grid);
  } else {
    context.drawImage(source, 0, 0, artworkWidth, artworkHeight);
  }

  if (caption.length > 0) {
    context.imageSmoothingEnabled = true;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    caption.forEach((line, index) => {
      // The first line names the piece, so it carries the emphasis; the rest
      // are supporting detail and sit back a little.
      const first = index === 0;
      context.fillStyle = first ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.68)';
      context.font = `${first ? 600 : 400} ${Math.round(lineHeight * (first ? 0.5 : 0.42))}px ui-sans-serif, system-ui, sans-serif`;
      context.fillText(
        line,
        artworkWidth / 2,
        artworkHeight + lineHeight * 0.5 + lineHeight * index + lineHeight * 0.15,
        artworkWidth * 0.92,
      );
    });
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

/**
 * Repeating the finished artwork across the viewport.
 *
 * Browser-side composition and nothing more. The matrix is untouched, no APL
 * runs, and one rendered tile is drawn several times — so this is an appearance
 * setting in the same sense as the palette, and belongs beside it.
 *
 * Repeating an artwork is not the same as the artwork being tileable. Nothing
 * here inspects whether the edges actually join, and nothing here should ever
 * be described as making them join: a preset earns that claim from its own APL,
 * not from being drawn more than once.
 *
 * Drawing and hit-testing both come through `tileGrid`, for the same reason the
 * letterbox already has one implementation shared between them. Two versions of
 * this arithmetic would agree until the first fractional viewport, and then a
 * press would land one tile away from where it looked.
 */

import { fitArtwork, type FittedBox } from './fitArtwork';

/**
 * How the artwork is repeated.
 *
 * `mirror-repeat` reflects alternate copies so neighbours meet along a shared
 * edge. That is a composition trick and nothing more: the artwork is unchanged,
 * its edges still do not join, and a mirrored repeat must never be described as
 * seamless generation. It hides a seam by reflecting one side onto the other,
 * which is a different claim from the two sides matching.
 *
 * Any mode this build cannot draw still falls back to a single copy, so a link
 * from a later version is never restored as something it is not.
 */
export type TilingMode = 'single' | 'repeat' | 'mirror-repeat';

export const TILING_MODES: readonly TilingMode[] = ['single', 'repeat', 'mirror-repeat'];

export interface TilingView {
  readonly mode: TilingMode;
  readonly columns: number;
  readonly rows: number;
  /**
   * How large each copy is drawn, relative to the grid count.
   *
   * The count says how many copies span the artwork at 100%; the scale then
   * multiplies each copy's size. Halving it therefore shows twice as many
   * copies, and doubling it shows half as many, larger — with whatever falls
   * outside the artwork region clipped at its edges. Both controls change how
   * many copies you see, which is why the interface says so in words.
   */
  readonly scale: number;
}

export const DEFAULT_TILING: TilingView = {
  mode: 'single',
  columns: 3,
  rows: 3,
  scale: 1,
};

export const MIN_TILES = 1;
export const MAX_TILES = 8;
export const MIN_TILE_SCALE = 0.25;
export const MAX_TILE_SCALE = 4;

/** The counts the interface offers, as square grids. */
export const TILE_COUNTS: readonly number[] = [2, 3, 5];

/**
 * The sizes the interface offers.
 *
 * Discrete rather than a slider, because a handful of round numbers is easier
 * to reason about than a continuum and every value here is one somebody might
 * actually name. Several of them divide the default count of three into whole
 * copies — 50, 75, 100 and 150 per cent all land flush — so the common cases
 * show no clipped edge; the rest overhang, which is expected and is why the
 * grid is centred and clipped rather than nudged to fit.
 */
export const TILE_SCALES: readonly number[] = [0.5, 0.75, 1, 1.5, 2];

function whole(value: unknown, fallback: number, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(high, Math.max(low, Math.round(value)));
}

function within(value: unknown, fallback: number, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(high, Math.max(low, value));
}

/**
 * Reads a tiling setting from something untrusted.
 *
 * Repairs rather than refuses, and falls back to Single for anything it does
 * not recognise — including a mode from a later version of the application.
 * Showing one copy of the artwork is never wrong; showing a repeat somebody did
 * not ask for, or claiming a composition this build cannot draw, would be.
 */
export function normaliseTiling(value: unknown): TilingView {
  if (typeof value !== 'object' || value === null) return DEFAULT_TILING;

  const record = value as Record<string, unknown>;
  const mode = TILING_MODES.find((candidate) => candidate === record.mode) ?? 'single';

  return {
    mode,
    columns: whole(record.columns, DEFAULT_TILING.columns, MIN_TILES, MAX_TILES),
    rows: whole(record.rows, DEFAULT_TILING.rows, MIN_TILES, MAX_TILES),
    scale: within(record.scale, DEFAULT_TILING.scale, MIN_TILE_SCALE, MAX_TILE_SCALE),
  };
}

/** Whether anything is actually repeated, so callers can take the plain path. */
export function isRepeating(tiling: TilingView | undefined): boolean {
  return tiling !== undefined && tiling.mode !== 'single' && (tiling.columns > 1 || tiling.rows > 1);
}

/** How many copies across and down are drawn, whatever the mode says. */
export function tileCounts(tiling: TilingView | undefined): { columns: number; rows: number } {
  if (!isRepeating(tiling)) return { columns: 1, rows: 1 };
  return { columns: (tiling as TilingView).columns, rows: (tiling as TilingView).rows };
}

export interface TileRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TileParity {
  readonly mirrorX: boolean;
  readonly mirrorY: boolean;
}

export interface TileGrid {
  /** Whether alternate copies are reflected. Read from here by everything. */
  readonly mirrored: boolean;
  /**
   * The artwork region: where copies may be drawn, and nothing outside it.
   *
   * Fixed by the grid count alone, so changing the scale changes how densely
   * the region is filled without moving or resizing the region itself. Anything
   * a scale pushes past its edges is clipped rather than allowed onto the mat.
   */
  readonly region: FittedBox;
  /** Kept for callers that letterboxed a single copy before any of this. */
  readonly box: FittedBox;
  readonly columns: number;
  readonly rows: number;
  /** Boundary positions, so neighbours share an edge exactly. */
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

/**
 * How many whole or partial copies of `size` are needed to cover `extent`.
 *
 * The tolerance matters: at a scale that divides the count exactly — every one
 * the interface offers does — floating point can leave the quotient a hair above
 * a whole number and ask for one more copy than is needed, which would clip an
 * edge that ought to land flush.
 */
function copiesToCover(extent: number, size: number): number {
  if (!(size > 0)) return 1;
  return Math.max(1, Math.ceil(extent / size - 1e-9));
}

/**
 * Where every copy goes.
 *
 * The region is letterboxed exactly as a single artwork is, so a 3 × 3 repeat of
 * a square tile occupies the space one copy would and every copy keeps the
 * artwork's aspect ratio. The scale then multiplies each copy's size within that
 * region: smaller copies mean more of them, larger copies mean fewer and the
 * outermost are clipped. The grid is centred, so clipping is symmetrical rather
 * than all falling on one edge.
 *
 * Boundaries are rounded, not widths. Rounding each width independently leaves a
 * tile ending at 100.4 next to one starting at 100.6, and the half-pixel between
 * them is a seam — a thin line of background running down the artwork, which on
 * a repeating pattern is exactly the artefact somebody is looking for and
 * exactly what they must not be shown by accident. Sharing the rounded boundary
 * makes the gap impossible rather than unlikely.
 */
export function tileGrid(
  tileWidth: number,
  tileHeight: number,
  columns: number,
  rows: number,
  boxWidth: number,
  boxHeight: number,
  scale = 1,
  mirrored = false,
): TileGrid {
  const across = Math.max(1, Math.round(columns));
  const down = Math.max(1, Math.round(rows));
  const region = fitArtwork(tileWidth * across, tileHeight * down, boxWidth, boxHeight);

  const size = Math.min(MAX_TILE_SCALE, Math.max(MIN_TILE_SCALE, scale));
  const drawnWidth = (region.width / across) * size;
  const drawnHeight = (region.height / down) * size;

  const wide = copiesToCover(region.width, drawnWidth);
  const tall = copiesToCover(region.height, drawnHeight);

  // Centred, so a scale that does not divide evenly clips both edges equally.
  const originX = region.left + (region.width - wide * drawnWidth) / 2;
  const originY = region.top + (region.height - tall * drawnHeight) / 2;

  const xs: number[] = [];
  for (let index = 0; index <= wide; index += 1) xs.push(Math.round(originX + drawnWidth * index));

  const ys: number[] = [];
  for (let index = 0; index <= tall; index += 1) ys.push(Math.round(originY + drawnHeight * index));

  return { mirrored, region, box: region, columns: wide, rows: tall, xs, ys };
}

/** The rectangle for one copy, in the same units the grid was built in. */
export function tileRect(grid: TileGrid, column: number, row: number): TileRect {
  const left = grid.xs[column] ?? 0;
  const right = grid.xs[column + 1] ?? left;
  const top = grid.ys[row] ?? 0;
  const bottom = grid.ys[row + 1] ?? top;

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Whether a copy is reflected, by its position in the grid.
 *
 * Odd columns are flipped horizontally and odd rows vertically, so every copy
 * meets its neighbours along an edge each of them shares. Derived from the grid
 * rather than passed around, because the drawing and the hit-testing have to
 * agree about it and the surest way is for there to be one answer.
 */
export function tileParity(grid: TileGrid, column: number, row: number): TileParity {
  if (!grid.mirrored) return { mirrorX: false, mirrorY: false };
  return { mirrorX: column % 2 === 1, mirrorY: row % 2 === 1 };
}

/**
 * Undoes a copy's reflection, turning where a point looks into where it is.
 *
 * Composition-level only. The artwork's own Rotate and Mirror settings are
 * applied when the base tile is rendered and are reversed further along by
 * `displayToSource`; this is the outer layer, and the two must not be confused
 * — reflecting here would otherwise cancel a mirror the user had chosen.
 */
export function unreflect(point: { u: number; v: number }, parity: TileParity) {
  return {
    u: parity.mirrorX ? 1 - point.u : point.u,
    v: parity.mirrorY ? 1 - point.v : point.v,
  };
}

export interface TileHit {
  readonly column: number;
  readonly row: number;
  /** Where the point falls inside that copy, from 0 to 1. */
  readonly u: number;
  readonly v: number;
}

/**
 * Which copy a point landed on, and where within it.
 *
 * A point outside the artwork region returns null rather than the nearest copy,
 * so a press on the mat beside the artwork misses instead of being rounded onto
 * an edge cell.
 *
 * On an internal boundary the higher copy wins, because that is what is drawn
 * there: a copy is painted from its left edge for its own width, so the shared
 * pixel belongs to the one on the right. The two conventions have to agree — at
 * u = 1 the artwork's last column is named and at u = 0 its first, so a
 * disagreement here puts the reading at the opposite edge of the artwork from
 * the pixel under the pointer. The final boundary is the exception and belongs
 * to the last copy, there being nothing beyond it.
 */
export function tileAt(grid: TileGrid, x: number, y: number): TileHit | null {
  const { region } = grid;
  if (region.width <= 0 || region.height <= 0) return null;
  if (x < region.left || x > region.left + region.width) return null;
  if (y < region.top || y > region.top + region.height) return null;

  const find = (value: number, edges: readonly number[], count: number) => {
    for (let index = 0; index < count; index += 1) {
      const start = edges[index] ?? 0;
      const end = edges[index + 1] ?? start;
      // Strictly less, so the shared pixel goes to the next copy along, as drawn.
      if (value < end) return { index, start, end };
    }
    const start = edges[count - 1] ?? 0;
    return { index: count - 1, start, end: edges[count] ?? start };
  };

  const across = find(x, grid.xs, grid.columns);
  const down = find(y, grid.ys, grid.rows);
  if (across.end === across.start || down.end === down.start) return null;

  return {
    column: across.index,
    row: down.index,
    u: Math.min(1, Math.max(0, (x - across.start) / (across.end - across.start))),
    v: Math.min(1, Math.max(0, (y - down.start) / (down.end - down.start))),
  };
}

/** How the repeat is described where a sentence is better than a picture. */
export function describeTiling(tiling: TilingView): string {
  if (!isRepeating(tiling)) return 'Single copy.';

  const kind = tiling.mode === 'mirror-repeat' ? 'Mirrored repeat preview' : 'Repeat preview';
  const grid = `${kind}, ${String(tiling.columns)} columns by ${String(tiling.rows)} rows`;
  return tiling.scale === 1
    ? `${grid}.`
    : `${grid}, each copy at ${String(Math.round(tiling.scale * 100))} per cent.`;
}

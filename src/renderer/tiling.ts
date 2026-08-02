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
 * `mirror-repeat` is deliberately absent until the composition that reflects
 * alternate copies exists. A mode the renderer cannot draw would be restored
 * from a shared link as something it is not.
 */
export type TilingMode = 'single' | 'repeat';

export const TILING_MODES: readonly TilingMode[] = ['single', 'repeat'];

export interface TilingView {
  readonly mode: TilingMode;
  readonly columns: number;
  readonly rows: number;
  /** How large each copy is drawn. Reserved; no control offers it yet. */
  readonly scale: number;
  /** Thin lines on the tile boundaries. Reserved; no control offers it yet. */
  readonly showSeamGuides: boolean;
}

export const DEFAULT_TILING: TilingView = {
  mode: 'single',
  columns: 3,
  rows: 3,
  scale: 1,
  showSeamGuides: false,
};

export const MIN_TILES = 1;
export const MAX_TILES = 8;
export const MIN_TILE_SCALE = 0.25;
export const MAX_TILE_SCALE = 4;

/** The counts the interface offers, as square grids. */
export const TILE_COUNTS: readonly number[] = [2, 3, 5];

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
    showSeamGuides: record.showSeamGuides === true,
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

export interface TileGrid {
  /** The whole composition, letterboxed into the box it was given. */
  readonly box: FittedBox;
  readonly columns: number;
  readonly rows: number;
  /** Boundary positions, so neighbours share an edge exactly. */
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

/**
 * Where every copy goes.
 *
 * The composition as a whole is letterboxed exactly as a single artwork is, so
 * a 3 × 3 repeat of a square tile occupies the same space one copy would and
 * every copy keeps the artwork's aspect ratio.
 *
 * Boundaries are rounded, not widths. Rounding each width independently leaves
 * a tile ending at 100.4 next to one starting at 100.6, and the half-pixel
 * between them is a seam — a thin line of background running down the artwork,
 * which on a repeating pattern is exactly the artefact somebody is looking for
 * and exactly what they must not be shown by accident. Sharing the rounded
 * boundary makes the gap impossible rather than unlikely.
 */
export function tileGrid(
  tileWidth: number,
  tileHeight: number,
  columns: number,
  rows: number,
  boxWidth: number,
  boxHeight: number,
): TileGrid {
  const across = Math.max(1, Math.round(columns));
  const down = Math.max(1, Math.round(rows));
  const box = fitArtwork(tileWidth * across, tileHeight * down, boxWidth, boxHeight);

  const xs: number[] = [];
  for (let index = 0; index <= across; index += 1) {
    xs.push(Math.round(box.left + (box.width * index) / across));
  }

  const ys: number[] = [];
  for (let index = 0; index <= down; index += 1) {
    ys.push(Math.round(box.top + (box.height * index) / down));
  }

  return { box, columns: across, rows: down, xs, ys };
}

/** The rectangle for one copy, in the same units the grid was built in. */
export function tileRect(grid: TileGrid, column: number, row: number): TileRect {
  const left = grid.xs[column] ?? 0;
  const right = grid.xs[column + 1] ?? left;
  const top = grid.ys[row] ?? 0;
  const bottom = grid.ys[row + 1] ?? top;

  return { left, top, width: right - left, height: bottom - top };
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
 * Deliberately unclamped in the sense that matters: a point outside the
 * composition returns null rather than the nearest copy, so a press on the mat
 * beside the artwork misses instead of being rounded onto an edge cell. Inside
 * a copy, the fraction is clamped, because a boundary pixel belongs to one of
 * the two copies that share it and either answer names the same source cell.
 */
export function tileAt(grid: TileGrid, x: number, y: number): TileHit | null {
  const first = grid.xs[0] ?? 0;
  const last = grid.xs[grid.columns] ?? first;
  const top = grid.ys[0] ?? 0;
  const bottom = grid.ys[grid.rows] ?? top;

  if (x < first || x > last || y < top || y > bottom) return null;
  if (last === first || bottom === top) return null;

  const find = (value: number, edges: readonly number[], count: number) => {
    for (let index = 0; index < count; index += 1) {
      const start = edges[index] ?? 0;
      const end = edges[index + 1] ?? start;
      if (value <= end) return { index, start, end };
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
  return `Repeat preview, ${String(tiling.columns)} columns by ${String(tiling.rows)} rows.`;
}

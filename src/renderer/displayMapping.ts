/**
 * From a position on screen back to a position in the matrix.
 *
 * Rotation and mirroring are applied to the data before it is drawn, so a
 * pointer landing on the artwork is not pointing at the matrix cell with those
 * coordinates. Anything that interprets a press — zooming into a region,
 * reading out a value — has to undo the presentation first.
 *
 * Positions are fractions in [0, 1]: `u` across, `v` down. Fractions rather
 * than indices because the caller has a pointer position, not a cell, and
 * because the same mapping then serves a 128-cell matrix and a 4-cell one.
 */

import { type RenderOptions } from './renderOptions';

export interface Fraction {
  readonly u: number;
  readonly v: number;
}

/** Two corners of a region, as fractions of the source matrix. Unordered. */
export interface SourceRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The shape the viewer sees, which a quarter turn transposes.
 *
 * Worth a named function because it is the one place the two shapes can be
 * confused: the letterboxing is decided by the displayed shape, while a cell is
 * indexed in the source shape, and using either for the other is wrong only when
 * the artwork is turned — and then silently.
 */
export function displayedShape(
  rows: number,
  columns: number,
  options: RenderOptions,
): { readonly rows: number; readonly columns: number } {
  const turned = options.rotation === 90 || options.rotation === 270;
  return turned ? { rows: columns, columns: rows } : { rows, columns };
}

/**
 * A cell of the source matrix, one-based — the way APL indexes it, and the way
 * anyone reading the code would count.
 */
export interface SourceCell {
  readonly row: number;
  readonly column: number;
}

/**
 * Which cell a position in the artwork falls on, or null if it misses.
 *
 * Null rather than the nearest edge cell. The artwork is letterboxed inside the
 * canvas, so a press can land on the mat beside it, and answering "column 1"
 * for a press that was plainly not on the picture would be a small lie that
 * looks like a bug.
 */
export function sourceCellAt(point: Fraction, rows: number, columns: number): SourceCell | null {
  if (point.u < 0 || point.u > 1 || point.v < 0 || point.v > 1) return null;
  if (rows <= 0 || columns <= 0) return null;

  return {
    // The far edge belongs to the last cell rather than to a cell past the end.
    row: Math.min(rows, Math.floor(point.v * rows) + 1),
    column: Math.min(columns, Math.floor(point.u * columns) + 1),
  };
}

/**
 * The forward transform mirrors and then rotates, so this unrotates and then
 * unmirrors. Getting that order the wrong way round is wrong only when both a
 * mirror and an odd rotation are in play, which is exactly the case nobody
 * tries by hand.
 */
export function displayToSource(point: Fraction, options: RenderOptions): Fraction {
  const { u, v } = point;

  let su: number;
  let sv: number;
  switch (options.rotation) {
    case 0:
      su = u;
      sv = v;
      break;
    case 90:
      // Forward: a source column becomes a display row, and a source row
      // becomes a display column counted from the right.
      su = v;
      sv = 1 - u;
      break;
    case 180:
      su = 1 - u;
      sv = 1 - v;
      break;
    case 270:
      su = 1 - v;
      sv = u;
      break;
  }

  // Mirrors are their own inverse.
  return {
    u: options.mirrorHorizontally ? 1 - su : su,
    v: options.mirrorVertically ? 1 - sv : sv,
  };
}

/**
 * Where a cell sits within the drawn artwork, as fractions of it.
 *
 * Both corners go through the presentation and are then re-ordered, because a
 * quarter turn swaps which corner is which — taking the first as top-left would
 * give a rectangle with negative width at half the rotations.
 */
export function cellBounds(
  cell: SourceCell,
  rows: number,
  columns: number,
  options: RenderOptions,
): { readonly left: number; readonly top: number; readonly width: number; readonly height: number } {
  const near = sourceToDisplay({ u: (cell.column - 1) / columns, v: (cell.row - 1) / rows }, options);
  const far = sourceToDisplay({ u: cell.column / columns, v: cell.row / rows }, options);

  const left = Math.min(near.u, far.u);
  const top = Math.min(near.v, far.v);
  return {
    left,
    top,
    width: Math.abs(far.u - near.u),
    height: Math.abs(far.v - near.v),
  };
}

/**
 * The other direction: where a position in the matrix ends up on screen.
 *
 * Needed to draw a marker on a cell that was chosen earlier. The cell is
 * remembered in the matrix's own coordinates, so that turning or mirroring the
 * artwork afterwards moves the marker to wherever that cell has gone rather
 * than leaving it pointing at a different one.
 */
export function sourceToDisplay(point: Fraction, options: RenderOptions): Fraction {
  // Mirrors first, matching the forward transform, then the rotation.
  const mu = options.mirrorHorizontally ? 1 - point.u : point.u;
  const mv = options.mirrorVertically ? 1 - point.v : point.v;

  switch (options.rotation) {
    case 0:
      return { u: mu, v: mv };
    case 90:
      return { u: 1 - mv, v: mu };
    case 180:
      return { u: 1 - mu, v: 1 - mv };
    case 270:
      return { u: mv, v: 1 - mu };
  }
}

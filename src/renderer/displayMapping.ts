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

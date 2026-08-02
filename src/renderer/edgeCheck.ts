/**
 * Comparing a tile's opposite edges.
 *
 * What this is, exactly: a comparison of the rendered pixels along the left
 * edge against those along the right, and the top against the bottom. Nothing
 * more. It is a useful thing to be told and it is not a proof, and the
 * difference matters enough that the interface says so every time it reports a
 * result — a browser looking at pixels cannot establish that an APL expression
 * is periodic, and must not be allowed to imply it has.
 *
 * The tile analysed is the finished base tile: after the artwork's own Rotate
 * and Mirror settings, before any repeat composition. That ordering is the
 * whole point. Mirror repeat makes a join disappear by reflecting one side onto
 * the other, so analysing the composed result would report a match for an
 * artwork whose edges do not match at all — the reflection would be marking its
 * own homework.
 *
 * A caveat worth carrying forward: equal edges are one way to tile and not the
 * only one. A pattern whose coordinates wrap has a *continuous* join rather
 * than an identical one, and a motif tiling can connect at edge midpoints with
 * quite different pixels either side. Both would be reported here as a
 * mismatch, correctly by this test's own definition and misleadingly if the
 * result were read as "cannot be tiled".
 */

import { type RgbaImage } from './colourMapping';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type Palette } from './palettes';

export type EdgeVerdict = 'exact' | 'tolerant' | 'mismatch';

export interface EdgeComparison {
  readonly verdict: EdgeVerdict;
  readonly differingPixels: number;
  readonly comparedPixels: number;
  /** The largest single-channel difference found, 0 to 255. */
  readonly maximumDifference: number;
  readonly meanDifference: number;
}

export interface EdgeCheck {
  /** Left edge against right edge. */
  readonly horizontal: EdgeComparison;
  /** Top edge against bottom edge. */
  readonly vertical: EdgeComparison;
  /**
   * What was actually compared.
   *
   * `values` is the matrix itself and depends on nothing else — no palette, no
   * animation phase, no rasterisation. `rendering` is a fixed diagnostic image,
   * used where colour comes from shape rather than from value and there is no
   * number to compare; it is equally phase-independent, and the wording says it
   * is a rendering so nobody reads more into it.
   */
  readonly basis: 'values' | 'rendering';
}

/**
 * How far apart two channel values may be and still count as the same.
 *
 * Motif rendering draws anti-aliased arcs, so two edges that meet perfectly can
 * still differ by a shade where a curve is resolved slightly differently on
 * each side. Eight of 255 is about three per cent — below anything the eye
 * picks out as a line, and far below the gulf between an arc and no arc.
 */
export const EDGE_TOLERANCE = 8;

function compare(
  data: Uint8ClampedArray,
  count: number,
  indexA: (step: number) => number,
  indexB: (step: number) => number,
): EdgeComparison {
  let differing = 0;
  let worst = 0;
  let total = 0;

  for (let step = 0; step < count; step += 1) {
    const a = indexA(step) * 4;
    const b = indexB(step) * 4;

    let gap = 0;
    // Alpha too: a transparent cell against an opaque one is a difference the
    // eye sees, even where the colour channels happen to agree.
    for (let channel = 0; channel < 4; channel += 1) {
      gap = Math.max(gap, Math.abs((data[a + channel] as number) - (data[b + channel] as number)));
    }

    if (gap > 0) differing += 1;
    if (gap > worst) worst = gap;
    total += gap;
  }

  /*
   * One rule: how far apart the furthest pair of pixels is.
   *
   * A count of differing pixels was tried alongside it and dropped. Where a
   * motif's curve meets an edge, a genuine match can differ by a shade along
   * most of that edge — so a cap on *how many* pixels may differ rejects
   * exactly the case the tolerance exists for, while adding a second threshold
   * to explain. How far out the worst pixel is answers the question on its own.
   */
  const verdict: EdgeVerdict = differing === 0 ? 'exact' : worst <= EDGE_TOLERANCE ? 'tolerant' : 'mismatch';

  return {
    verdict,
    differingPixels: differing,
    comparedPixels: count,
    maximumDifference: worst,
    meanDifference: count === 0 ? 0 : total / count,
  };
}

/**
 * Compares the matrix's own edge values.
 *
 * The answer that depends on nothing else. Two values are equal or they are
 * not, so there is no tolerance here and none is wanted — and because no
 * palette is involved, no palette animation can move the answer.
 *
 * Comparing colours instead would make the result a property of the palette:
 * two different values can be given the same colour by one ramp and different
 * colours by another, or by the same ramp at another animation phase. The
 * question people are asking is about the artwork.
 *
 * The matrix passed in must already be the finished base tile — transformed by
 * the artwork's own Rotate and Mirror settings, and never composed.
 */
export function checkEdgeValues(matrix: NumericMatrix): EdgeCheck | null {
  const { rows, columns, values } = matrix;
  if (rows < 2 || columns < 2) return null;

  const count = (total: number, at: (step: number) => number, other: (step: number) => number) => {
    let differing = 0;
    let worst = 0;
    for (let step = 0; step < total; step += 1) {
      const a = values[at(step)] as number;
      const b = values[other(step)] as number;
      if (a === b) continue;
      differing += 1;
      worst = Math.max(worst, Math.abs(a - b));
    }
    return {
      verdict: (differing === 0 ? 'exact' : 'mismatch') as EdgeVerdict,
      differingPixels: differing,
      comparedPixels: total,
      maximumDifference: worst,
      meanDifference: 0,
    };
  };

  return {
    basis: 'values',
    horizontal: count(
      rows,
      (row) => row * columns,
      (row) => row * columns + columns - 1,
    ),
    vertical: count(
      columns,
      (column) => column,
      (column) => (rows - 1) * columns + column,
    ),
  };
}

/**
 * A palette that turns a motif tiling into ink and paper and nothing else.
 *
 * Three entries because the motif renderer takes its ground from the second
 * colour and its line from the last; with two they would be the same colour and
 * the diagnostic image would come out blank.
 */
export const DIAGNOSTIC_PALETTE: Palette = {
  id: 'edge-check',
  name: 'Edge check',
  colours: ['#000000', '#000000', '#ffffff'],
};

/**
 * Compares the outermost row and column of a rendering against their opposites.
 *
 * For a motif tiling, where the colour of a pixel comes from the shape drawn
 * over it rather than from a value, there is no number to compare — so a
 * rendering is compared instead, and it is rendered with a fixed palette so the
 * answer cannot move with the artwork's own colours or their animation.
 *
 * The whole edge, not a sample of it and certainly not a corner: a tiling can
 * agree at its corners and disagree everywhere between them, and one pixel
 * would report that as a match.
 */
export function checkEdgeRendering(image: RgbaImage): EdgeCheck | null {
  const { width, height, data } = image;
  if (width < 2 || height < 2) return null;

  return {
    basis: 'rendering',
    horizontal: compare(
      data,
      height,
      (row) => row * width,
      (row) => row * width + width - 1,
    ),
    vertical: compare(
      data,
      width,
      (column) => column,
      (column) => (height - 1) * width + column,
    ),
  };
}

/** What to say about one pair of edges. */
export function describeEdge(pair: 'horizontal' | 'vertical', comparison: EdgeComparison): string {
  const edges = pair === 'horizontal' ? 'Left and right edges' : 'Top and bottom edges';

  switch (comparison.verdict) {
    case 'exact':
      return `${edges} match exactly.`;
    case 'tolerant':
      return `${edges} appear to match within rendering tolerance.`;
    case 'mismatch':
      return `${edges} do not match.`;
  }
}

/**
 * The qualification that goes with every result, without exception.
 *
 * Worded for what was actually compared. Saying "the rendered edges" of a value
 * comparison would understate it, and saying anything less than "a rendering" of
 * the motif path would overstate that one — and both would be a step towards
 * the claim this must never make.
 */
export function edgeCheckCaveat(basis: 'values' | 'rendering'): string {
  return basis === 'values'
    ? 'This compares the values along the edges of this result. It is not proof of mathematical seamlessness.'
    : 'This compares a fixed diagnostic rendering of the edges, not the artwork’s colours. It is not proof of mathematical seamlessness.';
}

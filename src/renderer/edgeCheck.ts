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
 * Compares the outermost row and column against their opposites.
 *
 * The whole edge, not a sample of it and certainly not a corner: a tiling can
 * agree at its corners and disagree everywhere between them, and one pixel
 * would report that as a match.
 */
export function checkEdges(image: RgbaImage): EdgeCheck | null {
  const { width, height, data } = image;
  if (width < 2 || height < 2) return null;

  return {
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

/** The qualification that goes with every result, without exception. */
export const EDGE_CHECK_CAVEAT =
  'This checks the rendered edges. It is not proof of mathematical seamlessness.';

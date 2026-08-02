/**
 * Where a motif meets the edges of its tile.
 *
 * Separated from the renderer so the question "do these shapes join?" can be
 * answered by computing rather than by looking at a picture of one result. A
 * rendered tiling can have matching edges by luck of the seed; whether *any*
 * tile can sit beside *any* other is a property of the four shapes, and this is
 * where that property lives.
 *
 * The stroke test is the renderer's own, imported rather than restated — a copy
 * would drift, and then this would be proving something about a shape nobody
 * draws.
 */

import { onStroke, type Motif } from './renderMotifs';

export { MOTIFS, type Motif } from './renderMotifs';

export type TileEdge = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeSpan {
  readonly start: number;
  readonly end: number;
}

/** Fine enough to separate spans a hundredth of a tile apart. */
const SAMPLES = 2000;

function pointOn(edge: TileEdge, along: number): readonly [number, number] {
  switch (edge) {
    case 'left':
      return [0, along];
    case 'right':
      return [1, along];
    case 'top':
      return [along, 0];
    case 'bottom':
      return [along, 1];
  }
}

/**
 * The stretches of an edge that the drawn line covers.
 *
 * Sampled rather than solved. The shapes are simple enough to solve by hand,
 * but sampling asks the renderer itself where the ink is, so the answer stays
 * true if a motif is ever redefined.
 */
export function edgeSignature(motif: Motif, edge: TileEdge, stroke = 0.13): EdgeSpan[] {
  const spans: EdgeSpan[] = [];
  let start: number | null = null;

  for (let index = 0; index <= SAMPLES; index += 1) {
    const along = index / SAMPLES;
    const [u, v] = pointOn(edge, along);
    const inked = onStroke(motif, u, v, stroke);

    if (inked && start === null) start = along;
    if (!inked && start !== null) {
      spans.push({ start, end: (index - 1) / SAMPLES });
      start = null;
    }
  }
  if (start !== null) spans.push({ start, end: 1 });

  return spans;
}

/**
 * Whether two tiles meet without the line stopping.
 *
 * `first` is the left or upper tile. The shared edge is its right or bottom,
 * and the second tile's left or top; the line continues exactly when the ink
 * arrives at the same places from both sides.
 *
 * A tolerance of one sample, because the two signatures are computed from
 * different curves and a boundary can land a sample either side of the same
 * point without meaning anything.
 */
export function joinsCleanly(
  first: Motif,
  second: Motif,
  direction: 'horizontal' | 'vertical',
  stroke = 0.13,
): boolean {
  const leaving = edgeSignature(first, direction === 'horizontal' ? 'right' : 'bottom', stroke);
  const arriving = edgeSignature(second, direction === 'horizontal' ? 'left' : 'top', stroke);

  if (leaving.length !== arriving.length) return false;

  const tolerance = 2 / SAMPLES;
  return leaving.every((span, index) => {
    const other = arriving[index];
    if (other === undefined) return false;
    return Math.abs(span.start - other.start) <= tolerance && Math.abs(span.end - other.end) <= tolerance;
  });
}

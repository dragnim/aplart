/**
 * Where the value reading sits over the artwork.
 *
 * A reading that covers the cell it describes makes somebody dismiss it to see
 * the thing they just asked about, which defeats the point of pressing the cell.
 * So it moves: the corner furthest from the selection, measured across the whole
 * artwork region rather than within one repeated copy.
 */

export type PanelCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** The corner furthest from a point, both given as fractions of the artwork. */
export function furthestCorner(point: { u: number; v: number } | null): PanelCorner {
  // The middle is a tie either way; the foot is where the panel has always been.
  if (point === null) return 'bottom-left';
  return `${point.v < 0.5 ? 'bottom' : 'top'}-${point.u < 0.5 ? 'right' : 'left'}` as PanelCorner;
}

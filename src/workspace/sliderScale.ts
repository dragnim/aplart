/**
 * Sliders whose steps are proportions rather than amounts.
 *
 * A span control running from 0.002 to 2 cannot have a useful fixed step. At
 * 0.05 a single press moves the widest view by a thirtieth and the narrowest by
 * twenty-five times — so a deliberate deep zoom, arrived at by dragging on the
 * artwork, was one arrow key away from being thrown away. At 0.001 the press is
 * safe but crossing the range takes two thousand of them.
 *
 * So the slider carries a position, and the position maps to a value
 * geometrically: every step is the same *ratio*, which is the only thing that
 * means the same at both ends.
 *
 * The code still holds a plain decimal number. This is a property of the
 * control, not of the artwork.
 */

/**
 * How many stops the slider has.
 *
 * Two hundred over a thousandfold range makes each step about 3.5%, and about
 * twenty presses to halve or double. Fine enough not to destroy a chosen view,
 * coarse enough to cross the range deliberately.
 */
export const LOG_SLIDER_POSITIONS = 200;

/** Three significant figures: enough for any view, short enough to read. */
function toSignificantFigures(value: number, figures = 3): number {
  if (value === 0) return 0;
  return Number(value.toPrecision(figures));
}

export function toSliderPosition(value: number, min: number, max: number): number {
  if (!(min > 0) || !(max > min)) return 0;

  const clamped = Math.min(max, Math.max(min, value));
  const fraction = Math.log(clamped / min) / Math.log(max / min);
  return Math.round(fraction * LOG_SLIDER_POSITIONS);
}

export function fromSliderPosition(position: number, min: number, max: number): number {
  if (!(min > 0) || !(max > min)) return min;

  // The ends are returned exactly, so dragging to either extreme gives the
  // declared limit rather than something three figures away from it.
  if (position <= 0) return min;
  if (position >= LOG_SLIDER_POSITIONS) return max;

  const fraction = position / LOG_SLIDER_POSITIONS;
  return toSignificantFigures(min * Math.pow(max / min, fraction));
}

/**
 * Reading an escape count as a colour.
 *
 * The point of all of this is one property: the same iteration value gets the
 * same colour in every view that shares an iteration ceiling. Normalising each
 * crop against its own observed range would mean a value of 12 changing colour
 * as you moved about, which makes comparing two views impossible and makes
 * zooming feel like the artwork is being repainted rather than explored.
 *
 * So the range comes from what the calculation can produce, read from the
 * visible APL — not from what this particular matrix happens to contain.
 *
 * None of these modes can add detail to a matrix that has none. A view entirely
 * at the ceiling is one value everywhere and stays one flat colour under every
 * mode here, which is correct; the interface says so in words rather than the
 * renderer inventing variation that the numbers do not contain.
 */

import { parseHexColour, sampleGradient, type Rgb } from './colourMapping';
import { type Palette } from './palettes';

export type ColouringMode = 'smooth' | 'bands' | 'repeating' | 'insideOutside' | 'threshold';

export const COLOURING_MODES: readonly ColouringMode[] = [
  'smooth',
  'bands',
  'repeating',
  'insideOutside',
  'threshold',
];

export interface Colouring {
  readonly mode: ColouringMode;
  /** Iteration values per band in the repeating mode. At least one. */
  readonly bandWidth: number;
  /**
   * How many equal bands the threshold mode cuts the range into.
   *
   * A count rather than a list of iteration values, which is what keeps it
   * valid when the ceiling changes: eight bands are eight bands whether the
   * range runs to 28 or to 60. Stored thresholds would have had to be checked
   * and adjusted every time, and one left above the new maximum would produce a
   * band that no value could ever fall into.
   */
  readonly thresholdBands: number;
}

export const DEFAULT_COLOURING: Colouring = { mode: 'smooth', bandWidth: 4, thresholdBands: 6 };

export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

export function describeColouring(mode: ColouringMode): string {
  switch (mode) {
    case 'smooth':
      return 'Smooth gradient';
    case 'bands':
      return 'Iteration bands';
    case 'repeating':
      return 'Repeating bands';
    case 'insideOutside':
      return 'Reached the limit or not';
    case 'threshold':
      return 'Threshold bands';
  }
}

export const MIN_BAND_WIDTH = 1;
export const MAX_BAND_WIDTH = 64;
export const MIN_THRESHOLD_BANDS = 2;
export const MAX_THRESHOLD_BANDS = 24;

function whole(value: unknown, fallback: number, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(high, Math.max(low, Math.round(value)));
}

/**
 * Reads a colouring from something untrusted, filling in anything unusable.
 *
 * Unlike a palette, a broken colouring has a sensible neighbour: every field
 * has a default that draws the same artwork somebody would have seen before any
 * of this existed. So it repairs rather than refusing.
 */
export function normaliseColouring(value: unknown): Colouring | null {
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const mode = COLOURING_MODES.find((candidate) => candidate === record.mode);
  if (mode === undefined) return null;

  return {
    mode,
    bandWidth: whole(record.bandWidth, DEFAULT_COLOURING.bandWidth, MIN_BAND_WIDTH, MAX_BAND_WIDTH),
    thresholdBands: whole(
      record.thresholdBands,
      DEFAULT_COLOURING.thresholdBands,
      MIN_THRESHOLD_BANDS,
      MAX_THRESHOLD_BANDS,
    ),
  };
}

/** Where a value sits in the range the calculation can produce, from 0 to 1. */
export function positionOf(value: number, range: ValueRange): number {
  const span = range.max - range.min;
  // A range of nothing has no position to speak of; the middle of the ramp is
  // the least misleading answer, and matches what a uniform matrix already did.
  if (!(span > 0)) return 0.5;
  return Math.min(1, Math.max(0, (value - range.min) / span));
}

/** How many bands the mode divides the palette into, or null when it has none. */
export function bandCountFor(colouring: Colouring, entries: number): number | null {
  switch (colouring.mode) {
    case 'bands':
    case 'repeating':
      return entries;
    case 'threshold':
      return colouring.thresholdBands;
    case 'smooth':
    case 'insideOutside':
      return null;
  }
}

/**
 * Which band a value falls in, or null when the mode has no bands.
 *
 * Exposed for the inspector, so that what it says about a cell and what the
 * renderer drew are the same arithmetic rather than two descriptions of it.
 */
export function bandNumberFor(
  value: number,
  range: ValueRange,
  colouring: Colouring,
  entries: number,
): number | null {
  switch (colouring.mode) {
    case 'bands':
      return Math.min(entries - 1, Math.floor(positionOf(value, range) * entries)) + 1;
    case 'repeating':
      return (Math.floor((value - range.min) / Math.max(MIN_BAND_WIDTH, colouring.bandWidth)) % entries) + 1;
    case 'threshold':
      return (
        Math.min(
          colouring.thresholdBands - 1,
          Math.floor(positionOf(value, range) * colouring.thresholdBands),
        ) + 1
      );
    case 'smooth':
    case 'insideOutside':
      return null;
  }
}

/**
 * Turns an escape count into a colour.
 *
 * `entries` is the number of colours in the *base* palette, and is deliberately
 * separate from the palette passed in. While an animation runs the palette it
 * is given has extra stops in it to close the seam, and indexing bands by the
 * array's length would move every band boundary from frame to frame — the bands
 * would appear to breathe. Bands are placed by position; only the colours that
 * land on them move.
 */
export function createEscapeMapper(options: {
  readonly palette: Palette;
  readonly entries: number;
  readonly colouring: Colouring;
  readonly range: ValueRange;
  readonly invert?: boolean;
}): (value: number) => Rgb {
  const { palette, colouring, range } = options;
  const entries = Math.max(1, Math.round(options.entries));

  const stops = palette.colours.map(parseHexColour);
  const ramp = options.invert === true ? [...stops].reverse() : stops;

  const declared = palette.positions;
  const positions =
    declared === undefined
      ? undefined
      : options.invert === true
        ? [...declared].reverse().map((position) => 1 - position)
        : declared;

  const at = (fraction: number) => sampleGradient(ramp, fraction, positions);
  /** The colour for band `index` of `count`, spread across the whole ramp. */
  const band = (index: number, count: number) => at(count <= 1 ? 0.5 : index / (count - 1));

  switch (colouring.mode) {
    case 'smooth':
      return (value: number) => at(positionOf(value, range));

    case 'bands':
      return (value: number) => {
        const index = Math.min(entries - 1, Math.floor(positionOf(value, range) * entries));
        return band(index, entries);
      };

    case 'repeating': {
      const width = Math.max(MIN_BAND_WIDTH, Math.round(colouring.bandWidth));
      return (value: number) => {
        // Floored towards the range's start, so the first band begins exactly
        // at the lowest value the calculation can produce rather than at zero.
        const step = Math.floor((value - range.min) / width);
        const index = ((step % entries) + entries) % entries;
        return band(index, entries);
      };
    }

    case 'insideOutside':
      /*
       * "Reached the limit", not "inside the set". The calculation stopped
       * counting; it did not prove anything. A point that would have escaped on
       * the twenty-ninth iteration is indistinguishable here from one that
       * never escapes, and saying otherwise would be a claim the arithmetic
       * cannot support.
       */
      return (value: number) => (value >= range.max ? at(1) : at(0));

    case 'threshold': {
      const count = Math.max(MIN_THRESHOLD_BANDS, Math.round(colouring.thresholdBands));
      return (value: number) => {
        const index = Math.min(count - 1, Math.floor(positionOf(value, range) * count));
        return band(index, count);
      };
    }
  }
}

/**
 * Turning numbers into pixels.
 *
 * Pure functions over a matrix and a palette. Nothing here touches the DOM, so
 * the same code produces the on-screen canvas, the exported PNG and the
 * committed gallery thumbnails, and every rule is unit-testable.
 */

import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type RenderMode } from '@/presets/schema';
import { type Palette } from './palettes';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parses `#rgb` or `#rrggbb`. Throws on anything else: palettes are ours to get right. */
export function parseHexColour(hex: string): Rgb {
  const value = hex.trim().replace(/^#/u, '');

  const expanded = value.length === 3 ? [...value].map((character) => character + character).join('') : value;

  if (!/^[0-9a-f]{6}$/iu.test(expanded)) {
    throw new Error(`"${hex}" is not a valid hex colour`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

export function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}

/**
 * Samples a palette as a continuous gradient at `position` in 0..1.
 *
 * The entries are treated as evenly spaced stops and interpolated between.
 */
export function sampleGradient(
  stops: readonly Rgb[],
  position: number,
  /**
   * Where each stop sits, from 0 to 1, ascending. Omit for evenly spaced.
   */
  positions?: readonly number[],
): Rgb {
  if (stops.length === 0) return { r: 0, g: 0, b: 0 };
  if (stops.length === 1) return stops[0] as Rgb;

  const at = clamp01(position);

  if (positions === undefined || positions.length !== stops.length) {
    const scaled = at * (stops.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(lower + 1, stops.length - 1);
    return mixRgb(stops[lower] as Rgb, stops[upper] as Rgb, scaled - lower);
  }

  // Before the first stop and after the last, the ramp holds its end colour
  // rather than fading to nothing.
  if (at <= (positions[0] as number)) return stops[0] as Rgb;
  const lastIndex = stops.length - 1;
  if (at >= (positions[lastIndex] as number)) return stops[lastIndex] as Rgb;

  let upper = 1;
  while (upper < lastIndex && (positions[upper] as number) < at) upper += 1;

  const lowerPosition = positions[upper - 1] as number;
  const upperPosition = positions[upper] as number;
  const span = upperPosition - lowerPosition;

  /*
   * Two stops in the same place make a hard edge, and dividing by the nothing
   * between them would give NaN. The later one wins, which is what "the same
   * place" has to mean if it is to mean anything.
   */
  if (span <= 0) return stops[upper] as Rgb;

  return mixRgb(stops[upper - 1] as Rgb, stops[upper] as Rgb, (at - lowerPosition) / span);
}

/**
 * The modes that map a value to a single colour.
 *
 * 'tiles' is deliberately excluded: it draws a shape rather than filling a
 * cell, so it has no per-value colour to look up. Saying so in the type means
 * adding another cell mode later cannot silently fall through this switch.
 */
export type CellRenderMode = Exclude<RenderMode, 'tiles'>;

export interface ColourMappingOptions {
  readonly mode: CellRenderMode;
  readonly palette: Palette;
  /** Reverse the ramp. A presentation choice; it never re-runs the APL. */
  readonly invert?: boolean;
  /** Bands used by threshold mode. Defaults to the palette length. */
  readonly bands?: number;
}

/**
 * Builds the lookup that turns one cell value into a colour.
 *
 * Returned as a function rather than applied directly so the caller can walk
 * the matrix once, in whatever order suits it.
 */
export function createColourMapper(
  stats: MatrixStats,
  options: ColourMappingOptions,
): (value: number) => Rgb {
  const stops = options.palette.colours.map(parseHexColour);
  const ramp = options.invert === true ? [...stops].reverse() : stops;
  const { min, max, uniform } = stats;

  /*
   * Inverting reverses the colours, so the positions have to be mirrored to
   * match: a stop a tenth of the way along becomes a stop a tenth from the end.
   * Reversing the colours alone would move every stop as well as recolouring
   * it, which is not what the control says it does.
   */
  const declared = options.palette.positions;
  const positions =
    declared === undefined
      ? undefined
      : options.invert === true
        ? [...declared].reverse().map((position) => 1 - position)
        : declared;

  switch (options.mode) {
    case 'indexed': {
      // Values index the palette directly, wrapping round. The double modulo
      // keeps negative values on the ramp instead of off the end of it.
      const length = ramp.length;
      return (value: number) => {
        const index = ((Math.round(value) % length) + length) % length;
        return ramp[index] as Rgb;
      };
    }

    case 'continuous': {
      // A uniform matrix has no range to normalise against; dividing by zero
      // would give NaN, so the midpoint of the ramp is used instead.
      if (uniform) {
        const midpoint = sampleGradient(ramp, 0.5, positions);
        return () => midpoint;
      }
      const span = max - min;
      return (value: number) => sampleGradient(ramp, (value - min) / span, positions);
    }

    case 'binary': {
      // The specification says the first and second colours. In practice these
      // ramps are eight-step gradients, so adjacent entries are nearly
      // identical and a binary render would be almost invisible. The two ends
      // of the ramp are used instead, which is what the mode is for.
      const off = ramp[0] as Rgb;
      const on = ramp[ramp.length - 1] as Rgb;
      return (value: number) => (value === 0 ? off : on);
    }

    case 'threshold': {
      const bands = Math.max(2, options.bands ?? ramp.length);
      if (uniform) {
        const midpoint = ramp[Math.floor(ramp.length / 2)] as Rgb;
        return () => midpoint;
      }
      const span = max - min;
      return (value: number) => {
        const position = (value - min) / span;
        // The top value must land in the last band rather than one past it.
        const band = Math.min(bands - 1, Math.floor(position * bands));
        // Positions apply here too: a band takes the colour that sits at its
        // place along the ramp, wherever the stops put it.
        return sampleGradient(ramp, bands === 1 ? 0.5 : band / (bands - 1), positions);
      };
    }
  }
}

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, four bytes per pixel. */
  readonly data: Uint8ClampedArray;
}

/** Renders a matrix at one pixel per cell. Scaling is the canvas's job. */
export function renderToRgba(
  matrix: NumericMatrix,
  stats: MatrixStats,
  options: ColourMappingOptions,
): RgbaImage {
  const mapper = createColourMapper(stats, options);
  const { rows, columns, values } = matrix;
  const data = new Uint8ClampedArray(rows * columns * 4);

  for (let index = 0; index < values.length; index += 1) {
    const { r, g, b } = mapper(values[index] as number);
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  }

  return { width: columns, height: rows, data };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

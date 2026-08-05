/**
 * Just enough OKLCH to adjust a colour without wrecking it.
 *
 * Interface accents are derived from palette colours by moving lightness and
 * chroma until they are readable, and doing that in sRGB does not work: halving
 * the channels of a yellow makes it olive, and lightening a blue in HSL makes it
 * grey before it makes it pale. OKLab is near enough to perceptually uniform
 * that "same hue, lighter" and "same hue, less intense" mean what they say, so a
 * derived accent still looks like the palette colour it came from.
 *
 * A small module rather than a colour library: what is needed here is two
 * conversions, a gamut mapping and a distance, and the transforms are published
 * constants. The alternative is a dependency an order of magnitude larger than
 * this file for the part of it we would use.
 *
 * Björn Ottosson's OKLab, https://bottosson.github.io/posts/oklab/, with the
 * sRGB transfer function from IEC 61966-2-1. WCAG contrast lives next door in
 * `contrast.ts` and keeps its own luminance maths, which is a different formula
 * for a different purpose and must not be merged with this one.
 */

import { parseHex, type Rgb } from './contrast';

export interface Oklch {
  /** Perceptual lightness, 0 (black) to 1 (white). */
  readonly l: number;
  /** Chroma, 0 (grey) upwards; about 0.37 is the most sRGB can hold. */
  readonly c: number;
  /** Hue angle in degrees, 0 to 360. Meaningless when chroma is 0. */
  readonly h: number;
}

interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** sRGB 0–255 to linear-light 0–1. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear-light 0–1 back to sRGB 0–255, unclamped so callers can detect gamut. */
function fromLinear(channel: number): number {
  const c = channel <= 0.003_130_8 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return c * 255;
}

function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.412_221_470_8 * lr + 0.536_332_536_3 * lg + 0.051_445_992_9 * lb);
  const m = Math.cbrt(0.211_903_498_2 * lr + 0.680_699_545_1 * lg + 0.107_396_956_6 * lb);
  const s = Math.cbrt(0.088_302_461_9 * lr + 0.281_718_837_6 * lg + 0.629_978_700_5 * lb);

  return {
    l: 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    a: 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    b: 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  };
}

/** Linear-light RGB, which may fall outside 0–1 when the colour is out of gamut. */
function oklabToLinearRgb({ l, a, b }: Oklab): { r: number; g: number; b: number } {
  const lp = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mp = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sp = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  return {
    r: 4.076_741_662_1 * lp - 3.307_711_591_3 * mp + 0.230_969_929_2 * sp,
    g: -1.268_438_004_6 * lp + 2.609_757_401_1 * mp - 0.341_319_396_5 * sp,
    b: -0.004_196_086_3 * lp - 0.703_418_614_7 * mp + 1.707_614_701 * sp,
  };
}

function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const radians = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function hexToOklch(hex: string): Oklch {
  const { l, a, b } = rgbToOklab(parseHex(hex));
  const c = Math.hypot(a, b);
  // Hue is undefined for a grey; 0 keeps it deterministic and harmless, since
  // chroma 0 means the angle is never read back out.
  const h = c < 1e-6 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

const IN_GAMUT_EPSILON = 1e-4;

function inGamut({ r, g, b }: { r: number; g: number; b: number }): boolean {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= -IN_GAMUT_EPSILON && max <= 1 + IN_GAMUT_EPSILON;
}

/**
 * Serialises to a hex colour a browser can actually paint.
 *
 * Out-of-gamut colours are brought in by reducing chroma and keeping lightness
 * and hue, which is the mapping that preserves what a person would call "the
 * same colour, less vivid". Clipping channels instead shifts the hue — a clipped
 * saturated blue turns violet — and clipping *lightness* would break the
 * contrast guarantees the caller has just established.
 */
export function oklchToHex(colour: Oklch): string {
  const l = clamp(colour.l, 0, 1);
  const h = ((colour.h % 360) + 360) % 360;
  const wanted = Math.max(0, colour.c);

  let low = 0;
  let high = wanted;
  if (!inGamut(oklabToLinearRgb(oklchToOklab({ l, c: wanted, h })))) {
    // Twenty halvings put the error far below one 8-bit step, and the count is
    // fixed so the result cannot depend on how the search happens to converge.
    for (let step = 0; step < 20; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklabToLinearRgb(oklchToOklab({ l, c: mid, h })))) low = mid;
      else high = mid;
    }
  } else {
    low = wanted;
  }

  const linear = oklabToLinearRgb(oklchToOklab({ l, c: low, h }));
  const channel = (value: number) => {
    const eight = Math.round(clamp(fromLinear(clamp(value, 0, 1)), 0, 255));
    return eight.toString(16).padStart(2, '0');
  };
  return `#${channel(linear.r)}${channel(linear.g)}${channel(linear.b)}`;
}

/** How far apart two colours look, as a Euclidean distance in OKLab. */
export function deltaEok(a: Oklch, b: Oklch): number {
  const first = oklchToOklab(a);
  const second = oklchToOklab(b);
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

export function withLightness(colour: Oklch, l: number): Oklch {
  return { l: clamp(l, 0, 1), c: colour.c, h: colour.h };
}

export function withChroma(colour: Oklch, c: number): Oklch {
  return { l: colour.l, c: Math.max(0, c), h: colour.h };
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

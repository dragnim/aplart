/**
 * WCAG contrast ratios.
 *
 * Implemented rather than eyeballed, so the design tokens can be checked by a
 * test instead of by intention. The formulae are from WCAG 2.2: relative
 * luminance in §Relative luminance, contrast ratio in §Contrast ratio.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace(/^#/u, '');
  const expanded = value.length === 3 ? [...value].map((character) => character + character).join('') : value;

  if (!/^[0-9a-f]{6}$/iu.test(expanded)) throw new Error(`"${hex}" is not a hex colour`);

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/** Flattens a translucent colour over a background, as the screen would. */
export function over(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const first = typeof a === 'string' ? parseHex(a) : a;
  const second = typeof b === 'string' ? parseHex(b) : b;

  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));

  return (lighter + 0.05) / (darker + 0.05);
}

/** 4.5:1 for body text, 3:1 for large text and non-text indicators. */
export const AA_BODY = 4.5;
export const AA_LARGE = 3;

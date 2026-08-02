/**
 * Colour palettes.
 *
 * Each palette is an ordered ramp. Indexed rendering picks entries directly;
 * continuous rendering treats them as gradient stops and interpolates between
 * them. Ramps are ordered dark to light so that a continuous render reads as
 * having depth rather than as arbitrary colour.
 */

export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly colours: readonly string[];
  /**
   * Where each colour sits along the ramp, from 0 to 1, ascending.
   *
   * Absent on every palette that ships, which means evenly spaced — the
   * behaviour these ramps were designed around, and unchanged by this existing.
   * A custom palette sets it, because moving a stop is most of the point of
   * making one.
   */
  readonly positions?: readonly number[];
  /** Shown behind the artwork where cells are transparent or the canvas is letterboxed. */
  readonly background?: string;
}

export const palettes: readonly Palette[] = [
  {
    id: 'ember',
    name: 'Ember',
    // A warm ramp built around #ff6a13, used as an accent within the gradient
    // rather than as a flat fill. Named for what it looks like: this is a
    // colour choice, not a badge.
    colours: ['#160f0a', '#3a1f0e', '#6b3410', '#a34910', '#ff6a13', '#ff9553', '#ffc39a', '#fff1e4'],
    background: '#160f0a',
  },
  {
    id: 'mono',
    name: 'Mono',
    colours: ['#111111', '#2e2e2e', '#4c4c4c', '#6b6b6b', '#8d8d8d', '#b0b0b0', '#d4d4d4', '#f7f7f7'],
    background: '#111111',
  },
  {
    id: 'poolrooms',
    name: 'Poolrooms',
    // Pale chlorinated blue-green, lit from below.
    colours: ['#04262b', '#0a4750', '#0f6b74', '#199b9d', '#3fc7c0', '#7ee0d6', '#b8f0ea', '#eafbf8'],
    background: '#04262b',
  },
  {
    id: 'neon',
    name: 'Neon',
    colours: ['#0a0118', '#2b0a4d', '#5c108f', '#9b1fc4', '#d926c9', '#ff43b0', '#ff8fd0', '#b9f7ff'],
    background: '#0a0118',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colours: ['#1b1035', '#432160', '#7b2f76', '#b4406b', '#e05f4f', '#f68b3c', '#fbb63f', '#ffe9a8'],
    background: '#1b1035',
  },
  {
    id: 'forest',
    name: 'Forest',
    colours: ['#0a1a11', '#123120', '#1d4b2c', '#2f6b37', '#4b8d3f', '#74ad4c', '#a7cc69', '#dcecb4'],
    background: '#0a1a11',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    colours: ['#04162e', '#0a2647', '#123a68', '#1c548c', '#2a72b0', '#4a95cf', '#84bde6', '#d6ecfa'],
    background: '#04162e',
  },
  {
    id: 'heat',
    name: 'Heat',
    colours: ['#000004', '#2c1160', '#711f81', '#b6377a', '#ee605e', '#fb9d3f', '#fbd424', '#fcfea4'],
    background: '#000004',
  },
];

const byId = new Map(palettes.map((palette) => [palette.id, palette]));

export const DEFAULT_PALETTE_ID = 'ember';

/**
 * Palette identifiers that have been renamed.
 *
 * Shared links are permanent — someone can post one and it may be opened years
 * later — and saved projects outlive a rename too. Both carry a palette id, so
 * a rename has to be a redirect rather than a break.
 */
const RENAMED: Readonly<Record<string, string>> = {
  dyalog: 'ember',
};

/**
 * Resolves an id that may predate a rename.
 *
 * Applied wherever a stored or shared id enters the application, so nothing
 * downstream has to know the old names existed.
 */
export function canonicalPaletteId(id: string): string {
  return RENAMED[id] ?? id;
}

export function getPalette(id: string): Palette {
  return byId.get(canonicalPaletteId(id)) ?? (palettes[0] as Palette);
}

export function paletteExists(id: string): boolean {
  return byId.has(canonicalPaletteId(id));
}

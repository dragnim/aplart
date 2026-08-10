/**
 * The palettes this page offers, and the one that belongs only to it.
 *
 * Life takes most of its colours from the site's own registry, where they are
 * ramps designed for artworks that map a range of values onto them. Classic is
 * not that and could not be: it is one colour, because the traditional Game of
 * Life has one — white cells on black, every cell the same white however long it
 * has been there.
 *
 * So it lives here rather than in `renderer/palettes`. A single-entry ramp is a
 * sensible thing for a world of living and dead cells and a useless thing for an
 * artwork with a hundred values to distinguish, and putting it in the shared
 * registry would offer it to every palette control in the application.
 */

import { getPalette, type Palette } from '@/renderer/palettes';

/**
 * The traditional look, and the only palette here that says nothing about age.
 *
 * One colour is the whole mechanism. The renderer picks a shade by counting back
 * from the brightest entry by the cell's age and clamping to the ramp, so a ramp
 * with one entry answers with that entry whatever the age is. Nothing special
 * happens for Classic anywhere in the drawing code, and nothing needs to: the
 * cells still age exactly as before, and this palette simply has nowhere to show
 * it.
 */
export const CLASSIC: Palette = {
  id: 'classic',
  name: 'Classic',
  colours: ['#ffffff'],
  background: '#000000',
};

/**
 * In the order the control offers them.
 *
 * Sunset first because it is what the page opens on, Classic second because it
 * is the other obvious answer to "what should Life look like" — and the rest
 * after, as they were.
 */
const LIFE_PALETTE_IDS = [
  'sunset',
  CLASSIC.id,
  'ember',
  'neon',
  'poolrooms',
  'heat',
  'forest',
  'blueprint',
] as const;

export const LIFE_PALETTES: readonly Palette[] = LIFE_PALETTE_IDS.map((id) =>
  id === CLASSIC.id ? CLASSIC : getPalette(id),
);

/**
 * The palette an id names, for this page.
 *
 * Falls back the way the registry does, so an unknown id shows something rather
 * than nothing — but checks Classic first, since the registry has never heard of
 * it and would answer with its own first palette instead.
 */
export function lifePalette(id: string): Palette {
  return id === CLASSIC.id ? CLASSIC : getPalette(id);
}

/**
 * The ramp the interface should take its accent from, or null for none.
 *
 * A ramp of one colour is not enough to derive a set of interface colours from,
 * and white would not be an accent in any case. Classic therefore publishes
 * nothing and the interface keeps APL Art's own colour, which is the honest
 * answer: this palette has no hue to lend.
 */
export function accentRampFor(palette: Palette): Palette | null {
  return palette.colours.length > 1 ? palette : null;
}

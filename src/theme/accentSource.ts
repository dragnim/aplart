/**
 * Which palette the interface takes its accent from, and when it takes nothing.
 *
 * Separate from the derivation and from the React plumbing because it is a rule
 * rather than either: *when* is a palette a thing the interface should follow?
 * The answer differs from the renderer's, which is why this is not
 * `paletteFor`. A custom palette whose stops are half-typed makes `paletteFor`
 * answer with the default ramp, because the canvas has to draw something. The
 * interface has a better option — keep the colours it already has — so this
 * reports nothing at all and leaves that decision to the caller holding the
 * previous theme.
 */

import { CUSTOM_PALETTE_ID, paletteFromStops, stopsAreUsable } from '@/renderer/customPalette';
import { getPalette, type Palette } from '@/renderer/palettes';
import { type RenderOptions } from '@/renderer/renderOptions';

/**
 * The palette to derive interface colours from, or null for "nothing new".
 *
 * Null means the caller should keep whatever theme it has: an unusable custom
 * palette is a moment mid-edit, not a request for a different interface.
 */
export function accentPaletteFor(options: RenderOptions): Palette | null {
  if (options.paletteId === CUSTOM_PALETTE_ID) {
    return stopsAreUsable(options.customStops) ? paletteFromStops(options.customStops) : null;
  }

  // Named ramps go through the registry, which resolves renamed identifiers, so
  // an old `dyalog` link themes itself as Ember rather than as a stranger.
  return getPalette(options.paletteId);
}

/**
 * A value that changes exactly when the derived theme would.
 *
 * The colours and nothing else: stop positions do not affect any token, so
 * dragging a stop along the ramp must not recompute the theme, and two stops
 * sharing a position is not a change either.
 */
export function paletteSignature(palette: Palette | null): string {
  return palette === null ? '' : palette.colours.join(',');
}

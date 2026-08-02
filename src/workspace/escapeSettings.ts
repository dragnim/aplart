/**
 * Working out how a preset's values should be coloured.
 *
 * The range comes from two places, and both matter: the preset declares what
 * kind of numbers it produces, and the *visible code* says where the ceiling
 * currently is. Raising the iteration count therefore changes the colouring,
 * because it has changed what the numbers mean — which is the honest behaviour
 * and the reason the ceiling is read rather than remembered.
 */

import { numberAssignedTo } from '@/editor/parameterBinding';
import { type ArtworkPreset } from '@/presets/schema';
import { DEFAULT_COLOURING, type Colouring, type ValueRange } from '@/renderer/escapeColouring';
import { paletteFor, type RenderOptions } from '@/renderer/renderOptions';

export interface EscapeSettings {
  readonly colouring: Colouring;
  readonly range: ValueRange;
  /** Palette entries before an animation extends the ramp to close its seam. */
  readonly entries: number;
}

/** The range the calculation can produce, as the code currently sets it. */
export function valueRangeFor(preset: ArtworkPreset, code: string): ValueRange | null {
  const declared = preset.valueRange;
  if (declared === undefined) return null;

  const max = numberAssignedTo(code, declared.maxVariable);
  // A ceiling that has been rewritten into an expression is not a number this
  // can colour against, so the artwork falls back to its own statistics rather
  // than to a guess.
  if (max === null || max <= declared.min) return null;

  return { min: declared.min, max };
}

/**
 * Everything the renderer needs to colour by escape count, or undefined.
 *
 * Undefined for every preset that has not declared a range, which is all of
 * them but one — those keep normalising against their own contents, which is
 * right when the values have no known bounds.
 */
export function escapeSettingsFor(
  preset: ArtworkPreset,
  code: string,
  options: RenderOptions,
): EscapeSettings | undefined {
  const range = valueRangeFor(preset, code);
  if (range === null) return undefined;

  return {
    colouring: options.colouring ?? DEFAULT_COLOURING,
    range,
    /*
     * The base palette's length, not the one being drawn with. An animation
     * adds stops to close the rotation's seam, and counting those would move
     * every band boundary from frame to frame — the bands would breathe.
     */
    entries: paletteFor(options).colours.length,
  };
}

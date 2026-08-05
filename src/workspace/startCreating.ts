/**
 * Starting from "Start creating".
 *
 * The gallery's primary action opens an artwork that is already somewhere worth
 * being, rather than at its default. What varies it is a seed, carried in the
 * link — and everything here is a pure function of that seed, which is what makes
 * the state the URL describes the state you get: reloading, copying the link,
 * pressing Back and re-rendering all produce the same artwork, because none of
 * them changes the seed.
 *
 * Nothing is stored and nothing is invented. The variation comes from the
 * preset's curated recipes and the existing seeded randomiser; applying it is the
 * same rewrite a slider performs, on the preset's own source.
 */

import { setParameterValues } from '@/editor/parameterBinding';
import { type ArtworkPreset } from '@/presets/schema';
import { generateInstantPlayVariation } from './instantPlayVariation';

export interface StartedArtwork {
  /** The seed the variation came from, so a share link can carry it. */
  readonly seed: number;
  /** Which curated recipe it stands on, for the stages that offer another. */
  readonly recipeId: string;
  /** The preset's own APL with the varied values written in. */
  readonly code: string;
}

/**
 * The seed a `play` parameter names, or null if it names none.
 *
 * Strict, because this is a URL and anything at all can appear in one. A
 * fractional, negative, oversized or non-numeric value is refused rather than
 * coerced: `seededRandom` takes an unsigned 32-bit integer, and silently
 * rounding somebody's link into a different artwork is worse than opening the
 * artwork's own default.
 */
export function readPlaySeed(play: string | null): number | null {
  if (play === null || !/^\d+$/u.test(play)) return null;

  const seed = Number(play);
  if (!Number.isSafeInteger(seed) || seed > 0xffff_ffff) return null;

  return seed;
}

/**
 * The artwork a new session begins with, or null if this preset offers none.
 *
 * A preset without Instant Play returns null, and the caller opens it the
 * ordinary way — a `play` link aimed at the wrong artwork degrades to that
 * artwork rather than to an error.
 */
export function startCreating(preset: ArtworkPreset, seed: number): StartedArtwork | null {
  const variation = generateInstantPlayVariation(preset, seed);
  if (variation === null) return null;

  return {
    seed: variation.seed,
    recipeId: variation.recipeId,
    code: setParameterValues(preset.code, variation.values),
  };
}

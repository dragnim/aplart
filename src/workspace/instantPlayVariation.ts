/**
 * Choosing an Instant Play variation.
 *
 * A pure function of the preset, a seed and what was on screen before, so a
 * variation can be reproduced from a shared link, asserted in a test, and
 * generated again without a browser. The seed is the same kind the existing
 * randomiser uses and travels in the same share field, so nothing new has to be
 * stored anywhere.
 *
 * Curated rather than uniform. Sampling every valid combination lands too often
 * on the dull corners — a modulus of two, a multiplier that speckles the whole
 * grid — so a recipe picks a place worth standing and drift decides how far to
 * step from it. That keeps the results varied without letting them be bad.
 */

import { parameterForControl, playRange, playStep, type InstantPlayRecipe } from '@/presets/instantPlay';
import { type ArtworkPreset } from '@/presets/schema';
import { type ParameterValue } from '@/editor/parameterBinding';
import { seededRandom, snapWithin } from './randomise';

export interface InstantPlayVariation {
  /** Which recipe this came from, so the next variation can avoid repeating it. */
  readonly recipeId: string;
  /** The seed that produced it. Carried in the share state as usual. */
  readonly seed: number;
  /** Values by APL variable, ready for `setParameterValues`. */
  readonly values: ReadonlyMap<string, ParameterValue>;
}

/** A fresh seed, when the caller has no reason to prefer a particular one. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffff_ffff);
}

function chooseRecipe(
  recipes: readonly InstantPlayRecipe[],
  random: () => number,
  avoid: string | undefined,
): InstantPlayRecipe | undefined {
  /*
   * Anything but the one already showing. Validation guarantees at least two
   * recipes, so this can only empty the list if the caller names something that
   * is not in it — in which case every recipe is fair game again.
   */
  const candidates = recipes.filter((recipe) => recipe.id !== avoid);
  const pool = candidates.length > 0 ? candidates : recipes;

  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

/**
 * The variation to open with, or to move to.
 *
 * Returns null for a preset that has not opted in, which is the caller's signal
 * to fall back to opening it the ordinary way.
 */
export function generateInstantPlayVariation(
  preset: ArtworkPreset,
  seed: number,
  previousRecipeId?: string,
): InstantPlayVariation | null {
  const config = preset.instantPlay;
  if (config === undefined) return null;

  const random = seededRandom(seed);
  const recipe = chooseRecipe(config.recipes, random, previousRecipeId);
  if (recipe === undefined) return null;

  const values = new Map<string, ParameterValue>();

  for (const control of config.controls) {
    const parameter = parameterForControl(preset, control);
    if (parameter === undefined) continue;

    const base = recipe.values[control.parameterId];
    if (typeof base !== 'number') continue;

    const range = playRange(parameter, control);
    const step = playStep(parameter);
    const drift = recipe.drift?.[control.parameterId] ?? 0;

    /*
     * One draw per control, whether or not this recipe allows the control to
     * drift. Drawing only when drift is set would make the length of the random
     * stream depend on the recipe, so adding drift to one control would silently
     * change every value after it.
     */
    const draw = random();
    const offset = drift > 0 ? (draw * 2 - 1) * drift : 0;
    values.set(parameter.variable, snapWithin(base + offset, range.min, range.max, step));
  }

  return { recipeId: recipe.id, seed, values };
}

/**
 * Instant Play configuration: how a preset presents itself as a toy.
 *
 * A preset that opts in declares a handful of creative controls and a set of
 * curated recipes. Neither introduces a second source of truth. A control names
 * an existing parameter and may relabel it, narrow its range and describe it in
 * words that mean something to somebody who has never seen APL; the parameter's
 * variable, step, limits and binding to the source stay authoritative. A recipe
 * is a combination somebody has looked at and judged worth opening with.
 *
 * The narrowing is the point of the range. Play should be dependable rather than
 * complete: a control can offer 32–72 of a technical 8–88 because the ends are
 * where the artwork stops being interesting, and the full range is still there in
 * the workspace.
 */

import { type ArtworkParameter, type ArtworkPreset } from './schema';

/** No more than this many controls may face somebody in Play. */
export const MAX_INSTANT_PLAY_CONTROLS = 4;

export interface InstantPlayRange {
  readonly min: number;
  readonly max: number;
}

export interface InstantPlayEndpoints {
  readonly low: string;
  readonly high: string;
}

export interface InstantPlayControl {
  /** An existing parameter's id. Nothing here redefines the parameter. */
  readonly parameterId: string;
  /** What the control is called in Play, in words rather than variables. */
  readonly label: string;
  /** One line on what changing it does. */
  readonly description: string;
  /** A dependable subset of the parameter's range. Defaults to all of it. */
  readonly range?: InstantPlayRange;
  /** Optional ends, for a scale that reads better as a direction than a number. */
  readonly endpoints?: InstantPlayEndpoints;
}

export interface InstantPlayRecipe {
  /** Stable identifier: it names the recipe in tests and in a reproduction. */
  readonly id: string;
  /** A value per Play control, by parameter id. */
  readonly values: Readonly<Record<string, number>>;
  /**
   * How far each value may wander, in the parameter's own units.
   *
   * Restraint rather than randomness: a recipe is a place worth standing, and
   * drift is how far you may step without leaving it.
   */
  readonly drift?: Readonly<Record<string, number>>;
}

export interface InstantPlayConfig {
  readonly controls: readonly InstantPlayControl[];
  readonly recipes: readonly InstantPlayRecipe[];
}

/** The parameter a Play control refers to, or undefined if it names none. */
export function parameterForControl(
  preset: ArtworkPreset,
  control: InstantPlayControl,
): ArtworkParameter | undefined {
  return preset.parameters.find((parameter) => parameter.id === control.parameterId);
}

/** The range Play offers: the control's if it narrows one, the parameter's otherwise. */
export function playRange(parameter: ArtworkParameter, control: InstantPlayControl): InstantPlayRange {
  return control.range ?? { min: parameter.min ?? 0, max: parameter.max ?? 1 };
}

/**
 * What Play calls a parameter, or what the preset calls it if Play offers no
 * control for it.
 *
 * Used where an action has to be named after the thing it changed — an Undo that
 * says "Complexity" rather than "multiplier", which is the whole point of the
 * relabelling.
 */
export function playLabelFor(preset: ArtworkPreset, parameter: ArtworkParameter): string {
  const control = preset.instantPlay?.controls.find((candidate) => candidate.parameterId === parameter.id);
  return control?.label ?? parameter.label;
}

/** The step a Play control moves in, which is the parameter's own. */
export function playStep(parameter: ArtworkParameter): number {
  return parameter.step ?? (parameter.type === 'integer' ? 1 : 0.01);
}

function onStepGrid(value: number, from: number, step: number): boolean {
  const steps = (value - from) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/**
 * Everything wrong with a preset's Instant Play block.
 *
 * Called from `validatePreset`, so `npm run validate:presets`, the gallery and
 * the tests all apply the same rules — a broken toy should fail the build rather
 * than open an empty workspace.
 */
export function validateInstantPlay(preset: ArtworkPreset, fail: (message: string) => void): void {
  const config = preset.instantPlay;
  if (config === undefined) return;

  const { controls, recipes } = config;

  if (controls.length === 0) {
    fail('instantPlay declares no controls, so Play would have nothing to offer');
  }
  if (controls.length > MAX_INSTANT_PLAY_CONTROLS) {
    fail(`instantPlay declares ${controls.length} controls; Play shows at most ${MAX_INSTANT_PLAY_CONTROLS}`);
  }

  const seen = new Set<string>();
  const playParameters = new Map<string, ArtworkParameter>();

  for (const control of controls) {
    const where = `instantPlay control "${control.parameterId}"`;

    if (seen.has(control.parameterId)) {
      fail(`${where} appears more than once`);
    }
    seen.add(control.parameterId);

    const parameter = parameterForControl(preset, control);
    if (parameter === undefined) {
      fail(`${where} names no parameter of this preset`);
      continue;
    }
    playParameters.set(control.parameterId, parameter);

    if (control.label.trim() === '') fail(`${where} has no label`);
    if (control.description.trim() === '') fail(`${where} has no description`);

    if (parameter.type !== 'integer' && parameter.type !== 'number') {
      fail(`${where} is a ${parameter.type} control, and Play offers numeric controls only`);
      continue;
    }

    if (control.endpoints !== undefined) {
      const { low, high } = control.endpoints;
      if (low.trim() === '' || high.trim() === '') fail(`${where} has an empty endpoint label`);
    }

    if (control.range === undefined) continue;

    const { min, max } = control.range;
    const step = playStep(parameter);
    const outer = { min: parameter.min ?? 0, max: parameter.max ?? 1 };

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      fail(`${where} has a range that is not finite`);
      continue;
    }
    if (min >= max) fail(`${where} has a Play range of ${min}–${max}, which is not ascending`);
    if (min < outer.min || max > outer.max) {
      fail(`${where} has a Play range of ${min}–${max}, outside the parameter's ${outer.min}–${outer.max}`);
    }
    if (parameter.type === 'integer' && (!Number.isInteger(min) || !Number.isInteger(max))) {
      fail(`${where} is an integer control with a fractional Play range`);
    }
    // Off the grid, a Play end could never be reached by moving the control.
    if (!onStepGrid(min, outer.min, step) || !onStepGrid(max, outer.min, step)) {
      fail(`${where} has a Play range that does not land on its step of ${step}`);
    }
  }

  if (recipes.length < 2) {
    // With one recipe there is nothing to move to, and Randomise has to be able
    // to offer something other than what is already on screen.
    fail(`instantPlay declares ${recipes.length} recipe(s); at least two are needed to vary`);
  }

  const recipeIds = new Set<string>();
  for (const recipe of recipes) {
    const where = `instantPlay recipe "${recipe.id}"`;

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(recipe.id)) {
      fail(`${where} must be lower-case kebab-case`);
    }
    if (recipeIds.has(recipe.id)) fail(`${where} is declared more than once`);
    recipeIds.add(recipe.id);

    for (const [parameterId, value] of Object.entries(recipe.values)) {
      const parameter = playParameters.get(parameterId);
      if (parameter === undefined) {
        fail(`${where} sets "${parameterId}", which is not one of its Play controls`);
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(`${where} sets "${parameterId}" to something that is not a number`);
        continue;
      }

      const control = controls.find((candidate) => candidate.parameterId === parameterId);
      if (control === undefined) continue;
      const range = playRange(parameter, control);

      if (value < range.min || value > range.max) {
        fail(`${where} sets "${parameterId}" to ${value}, outside its Play range ${range.min}–${range.max}`);
      }
      if (parameter.type === 'integer' && !Number.isInteger(value)) {
        fail(`${where} sets the integer "${parameterId}" to ${value}`);
      }
    }

    for (const parameterId of playParameters.keys()) {
      if (!(parameterId in recipe.values)) {
        fail(`${where} sets no value for the Play control "${parameterId}"`);
      }
    }

    for (const [parameterId, drift] of Object.entries(recipe.drift ?? {})) {
      const parameter = playParameters.get(parameterId);
      if (parameter === undefined) {
        fail(`${where} allows drift on "${parameterId}", which is not one of its Play controls`);
        continue;
      }
      if (typeof drift !== 'number' || !Number.isFinite(drift) || drift <= 0) {
        fail(`${where} allows a drift of ${String(drift)} on "${parameterId}", which must be positive`);
        continue;
      }
      // Drift finer than the step rounds away to nothing, which reads as
      // variation that was configured and then silently did not happen.
      if (drift < playStep(parameter)) {
        fail(
          `${where} allows a drift of ${drift} on "${parameterId}", below its step of ${playStep(parameter)}`,
        );
      }
    }
  }
}

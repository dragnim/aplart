/**
 * The Instant Play variation generator.
 *
 * Two things are being established here. That a variation is reproducible — same
 * seed, same artwork, which is what lets a shared link rebuild what somebody saw.
 * And that it is restrained: every value lands inside the Play range, on the step
 * grid, and near a recipe somebody looked at rather than anywhere in the space.
 *
 * The last group goes all the way to APL text, because a value that is correct in
 * a Map and wrong in the source is still wrong.
 */

import { describe, expect, it, vi } from 'vitest';
import { modularBloom } from '@/presets/modular-bloom';
import { getPreset } from '@/presets/presets';
import {
  parameterForControl,
  playRange,
  playStep,
  type InstantPlayConfig,
  type InstantPlayControl,
  type InstantPlayRecipe,
} from '@/presets/instantPlay';
import { type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';
import {
  bindingStateFor,
  findAssignment,
  numberAssignedTo,
  setParameterValues,
} from '@/editor/parameterBinding';
import { generateInstantPlayVariation } from '@/workspace/instantPlayVariation';
import { randomSeed } from '@/workspace/randomise';

const config = modularBloom.instantPlay as InstantPlayConfig;

/** Seeds used wherever a property should hold for any of them. */
const seeds = Array.from({ length: 200 }, (_unused, index) => index * 7919);

function recipeById(id: string): InstantPlayRecipe {
  return config.recipes.find((recipe) => recipe.id === id) as InstantPlayRecipe;
}

function parameterFor(parameterId: string): ArtworkParameter {
  const control = config.controls.find((candidate) => candidate.parameterId === parameterId);
  return parameterForControl(modularBloom, control as InstantPlayControl) as ArtworkParameter;
}

describe('generateInstantPlayVariation', () => {
  it('declines a preset that has not opted in', () => {
    /*
     * A fractal rather than Truchet, which used to be the example here and now
     * has curated controls of its own. The fractals still have none — their
     * meaningful parameters are viewport coordinates — and an artwork without
     * them must produce no variation rather than one invented from raw ranges.
     */
    const mandelbrot = getPreset('mandelbrot-field') as ArtworkPreset;

    expect(mandelbrot.instantPlay).toBeUndefined();
    expect(generateInstantPlayVariation(mandelbrot, 1)).toBeNull();
  });

  it('gives the same variation for the same seed, every time', () => {
    for (const seed of seeds.slice(0, 20)) {
      const first = generateInstantPlayVariation(modularBloom, seed);
      const again = generateInstantPlayVariation(modularBloom, seed);

      expect(first).not.toBeNull();
      expect(again?.recipeId).toBe(first?.recipeId);
      expect([...(again?.values ?? [])]).toEqual([...(first?.values ?? [])]);
    }
  });

  it('reports the seed it was given, so it can travel in the share state', () => {
    expect(generateInstantPlayVariation(modularBloom, 4242)?.seed).toBe(4242);
  });

  it('sets a value for every Play control, by APL variable', () => {
    const expected = config.controls.map((control) => parameterFor(control.parameterId).variable).sort();

    for (const seed of seeds) {
      const variation = generateInstantPlayVariation(modularBloom, seed);

      expect([...(variation?.values.keys() ?? [])].sort()).toEqual(expected);
    }
  });

  it('never leaves a Play range, and never lands between steps', () => {
    for (const seed of seeds) {
      const variation = generateInstantPlayVariation(modularBloom, seed);

      for (const control of config.controls) {
        const parameter = parameterFor(control.parameterId);
        const range = playRange(parameter, control);
        const step = playStep(parameter);
        const value = variation?.values.get(parameter.variable);

        expect(typeof value, control.parameterId).toBe('number');
        expect(value as number, `${control.parameterId} @ ${seed}`).toBeGreaterThanOrEqual(range.min);
        expect(value as number, `${control.parameterId} @ ${seed}`).toBeLessThanOrEqual(range.max);
        expect(((value as number) - range.min) % step, control.parameterId).toBe(0);
        if (parameter.type === 'integer') expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('stays within the drift its recipe allows', () => {
    for (const seed of seeds) {
      const variation = generateInstantPlayVariation(modularBloom, seed);
      const recipe = recipeById(variation?.recipeId ?? '');

      for (const control of config.controls) {
        const parameter = parameterFor(control.parameterId);
        const base = recipe.values[control.parameterId] as number;
        const drift = recipe.drift?.[control.parameterId] ?? 0;
        const value = variation?.values.get(parameter.variable) as number;

        // Snapping can round outwards by up to half a step, so allow for it.
        const reach = drift === 0 ? 0 : drift + playStep(parameter) / 2;
        expect(Math.abs(value - base), `${recipe.id}/${control.parameterId}`).toBeLessThanOrEqual(reach);
      }
    }
  });

  it('holds a control exactly where the recipe put it when no drift is allowed', () => {
    // Complexity is the character of the artwork, so no recipe lets it wander.
    for (const seed of seeds) {
      const variation = generateInstantPlayVariation(modularBloom, seed);
      const recipe = recipeById(variation?.recipeId ?? '');

      expect(recipe.drift?.['multiplier']).toBeUndefined();
      expect(variation?.values.get('multiplier')).toBe(recipe.values['multiplier']);
    }
  });

  it('can reach every curated recipe', () => {
    const reached = new Set(seeds.map((seed) => generateInstantPlayVariation(modularBloom, seed)?.recipeId));

    expect([...reached].sort()).toEqual(config.recipes.map((recipe) => recipe.id).sort());
  });

  it('never repeats the recipe already on screen', () => {
    for (const recipe of config.recipes) {
      for (const seed of seeds.slice(0, 40)) {
        const variation = generateInstantPlayVariation(modularBloom, seed, recipe.id);

        expect(variation?.recipeId, `${recipe.id} @ ${seed}`).not.toBe(recipe.id);
      }
    }
  });

  it('still chooses something when the previous recipe is not one of these', () => {
    // A share link naming a recipe that has since been renamed away.
    const variation = generateInstantPlayVariation(modularBloom, 11, 'a-recipe-that-went-away');

    expect(variation).not.toBeNull();
    expect(config.recipes.map((recipe) => recipe.id)).toContain(variation?.recipeId);
  });

  it('does not shift the other controls when one gains drift', () => {
    /*
     * The generator draws once per control whether or not the control can drift.
     * If it drew only when drift was set, allowing an earlier control to wander
     * would silently move every value after it — so allowing Complexity to drift
     * must leave Scale and Detail exactly where they were.
     */
    const drifting: InstantPlayConfig = {
      ...config,
      recipes: config.recipes.map((recipe) => ({
        ...recipe,
        drift: { ...recipe.drift, multiplier: 2 },
      })),
    };
    const preset: ArtworkPreset = { ...modularBloom, instantPlay: drifting };

    for (const seed of seeds.slice(0, 40)) {
      const plain = generateInstantPlayVariation(modularBloom, seed);
      const wandering = generateInstantPlayVariation(preset, seed);

      expect(wandering?.recipeId).toBe(plain?.recipeId);
      expect(wandering?.values.get('modulus')).toBe(plain?.values.get('modulus'));
      expect(wandering?.values.get('size')).toBe(plain?.values.get('size'));
    }
  });
});

describe('randomSeed', () => {
  it('is a whole number inside the range mulberry32 uses', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const seed = randomSeed();

      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  it('reaches the top of the range without going past it', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999_999_999_9);
    try {
      expect(randomSeed()).toBeLessThanOrEqual(0xffff_ffff);
    } finally {
      random.mockRestore();
    }
  });
});

describe('a variation applied to the source', () => {
  it('writes each value onto its own assignment, and reads back identically', () => {
    for (const seed of seeds.slice(0, 40)) {
      const variation = generateInstantPlayVariation(modularBloom, seed);
      const code = setParameterValues(modularBloom.code, variation?.values ?? new Map());

      for (const control of config.controls) {
        const parameter = parameterFor(control.parameterId);
        const expected = variation?.values.get(parameter.variable);

        expect(numberAssignedTo(code, parameter.variable), control.parameterId).toBe(expected);
      }
    }
  });

  it('leaves every control bound, so the workspace shows values rather than "detached"', () => {
    const variation = generateInstantPlayVariation(modularBloom, 999);
    const code = setParameterValues(modularBloom.code, variation?.values ?? new Map());

    for (const parameter of modularBloom.parameters) {
      expect(bindingStateFor(code, parameter).status, parameter.id).toBe('bound');
    }
  });

  it('changes only the assignment lines, and nothing else in the artwork', () => {
    const variation = generateInstantPlayVariation(modularBloom, 2024);
    const code = setParameterValues(modularBloom.code, variation?.values ?? new Map());

    const before = modularBloom.code.split('\n');
    const after = code.split('\n');
    expect(after).toHaveLength(before.length);

    const changed = after
      .map((line, index) => (line === before[index] ? null : index))
      .filter((index): index is number => index !== null);
    const assignmentLines = config.controls.map(
      (control) => findAssignment(modularBloom.code, parameterFor(control.parameterId).variable)?.line,
    );

    expect(changed.length).toBeGreaterThan(0);
    for (const index of changed) expect(assignmentLines).toContain(index);
  });

  it('names the line Peek will point at for each control', () => {
    /*
     * Peek's promise is that a named control corresponds to a visible line. The
     * generator's values have to reach that same line, so the two are asserted
     * together rather than separately.
     */
    const variation = generateInstantPlayVariation(modularBloom, 7);
    const code = setParameterValues(modularBloom.code, variation?.values ?? new Map());

    for (const control of config.controls) {
      const parameter = parameterFor(control.parameterId);
      const assignment = findAssignment(code, parameter.variable);
      const line = code.split('\n')[assignment?.line ?? -1];

      expect(assignment, control.parameterId).not.toBeNull();
      expect(line).toContain(`${parameter.variable}←`);
      expect(Number(assignment?.valueText)).toBe(variation?.values.get(parameter.variable));
    }
  });
});

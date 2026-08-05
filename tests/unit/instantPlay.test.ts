/**
 * Instant Play configuration, and what it refuses.
 *
 * The validator's job is to turn a broken toy into a failed build rather than an
 * empty workspace, so most of this file is deliberately bad configuration. Each
 * case is built by bending a copy of the real preset, which keeps the fixtures
 * honest: if the preset's own shape changes, these bend with it.
 *
 * The bad fixtures are asserted through `as`, because their whole point is to
 * hold what the types forbid. The good ones never are.
 */

import { describe, expect, it } from 'vitest';
import { modularBloom } from '@/presets/modular-bloom';
import { presets } from '@/presets/presets';
import {
  MAX_INSTANT_PLAY_CONTROLS,
  parameterForControl,
  playLabelFor,
  playRange,
  playStep,
  validateInstantPlay,
  type InstantPlayConfig,
  type InstantPlayControl,
  type InstantPlayRecipe,
} from '@/presets/instantPlay';
import { validatePreset, type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';
import { findAssignment } from '@/editor/parameterBinding';

const base = modularBloom.instantPlay as InstantPlayConfig;

/** Modular Bloom with a different Instant Play block, or none at all. */
function presetWith(config?: InstantPlayConfig): ArtworkPreset {
  const { instantPlay: _replaced, ...rest } = modularBloom;
  return config === undefined ? rest : { ...rest, instantPlay: config };
}

/** Every message a configuration produces, joined so order does not matter. */
function issues(config?: InstantPlayConfig): string {
  const found: string[] = [];
  validateInstantPlay(presetWith(config), (message) => found.push(message));
  return found.join(' | ');
}

/** The real configuration with one control bent. */
const withControl = (index: number, patch: Record<string, unknown>): InstantPlayConfig => ({
  ...base,
  controls: base.controls.map((control, at) =>
    at === index ? ({ ...control, ...patch } as InstantPlayControl) : control,
  ),
});

/** The real configuration with one recipe bent. */
const withRecipe = (index: number, patch: Record<string, unknown>): InstantPlayConfig => ({
  ...base,
  recipes: base.recipes.map((recipe, at) =>
    at === index ? ({ ...recipe, ...patch } as InstantPlayRecipe) : recipe,
  ),
});

const firstControl = base.controls[0] as InstantPlayControl;
const firstRecipe = base.recipes[0] as InstantPlayRecipe;

describe('the starter preset', () => {
  it('is Modular Bloom, and it is the only preset that opts in for now', () => {
    const opted = presets.filter((preset) => preset.instantPlay !== undefined);

    expect(opted.map((preset) => preset.id)).toEqual(['modular-bloom']);
  });

  it('passes the preset validator with its Instant Play block', () => {
    expect(validatePreset(modularBloom)).toEqual([]);
  });

  it('offers three controls, in creative words, within the four allowed', () => {
    expect(base.controls).toHaveLength(3);
    expect(base.controls.length).toBeLessThanOrEqual(MAX_INSTANT_PLAY_CONTROLS);
    expect(base.controls.map((control) => control.label)).toEqual(['Complexity', 'Scale', 'Detail']);

    // None of them says a variable name out loud.
    for (const control of base.controls) {
      expect(control.label).not.toMatch(/modulus|multiplier|size/iu);
      expect(control.description.trim()).not.toBe('');
      expect(control.endpoints?.low.trim()).not.toBe('');
      expect(control.endpoints?.high.trim()).not.toBe('');
    }
  });

  it('keeps Detail inside the modest range asked for, and the parameter wider', () => {
    const control = base.controls.find((candidate) => candidate.parameterId === 'size');
    const parameter = parameterForControl(modularBloom, control as InstantPlayControl);

    expect(control?.range).toEqual({ min: 32, max: 72 });
    // The workspace still offers the whole of it.
    expect(parameter?.min).toBe(8);
    expect(parameter?.max).toBe(88);
  });

  it('narrows every Play range inside its parameter', () => {
    for (const control of base.controls) {
      const parameter = parameterForControl(modularBloom, control) as ArtworkParameter;
      const range = playRange(parameter, control);

      expect(range.min, control.parameterId).toBeGreaterThanOrEqual(parameter.min ?? 0);
      expect(range.max, control.parameterId).toBeLessThanOrEqual(parameter.max ?? 0);
      expect(range.min).toBeLessThan(range.max);
    }
  });

  it('mostly avoids a multiplier of one, which is the quietest thing it draws', () => {
    const ones = base.recipes.filter((recipe) => recipe.values['multiplier'] === 1);

    expect(ones.length).toBeGreaterThan(0);
    expect(ones.length * 2).toBeLessThan(base.recipes.length);
  });

  it('never pairs a busy multiplier with a small modulus', () => {
    // The one corner of this space that turns to noise.
    for (const recipe of base.recipes) {
      const multiplier = recipe.values['multiplier'] ?? 0;
      const modulus = recipe.values['modulus'] ?? 0;

      if (multiplier >= 5) expect(modulus, recipe.id).toBeGreaterThanOrEqual(11);
    }
  });

  it('binds every Play control to a real assignment in the source', () => {
    /*
     * What Peek will claim later: this control changes that line. Asserted here
     * so the claim cannot quietly stop being true.
     */
    for (const control of base.controls) {
      const parameter = parameterForControl(modularBloom, control) as ArtworkParameter;
      const assignment = findAssignment(modularBloom.code, parameter.variable);

      expect(assignment, control.parameterId).not.toBeNull();
      expect(assignment?.prefix).toContain(parameter.variable);
      expect(Number(assignment?.valueText)).toBe(parameter.defaultValue);
    }
  });
});

describe('the validator accepts', () => {
  it('the real configuration', () => {
    expect(issues(base)).toBe('');
  });

  it('a preset that does not opt in at all', () => {
    expect(issues()).toBe('');
  });

  it('a control with no range, which then means the whole parameter', () => {
    const config = withControl(2, { range: undefined });
    expect(issues(config)).toBe('');

    const control = config.controls[2] as InstantPlayControl;
    const parameter = parameterForControl(modularBloom, control) as ArtworkParameter;
    expect(playRange(parameter, control)).toEqual({ min: 8, max: 88 });
  });
});

describe('the validator refuses', () => {
  it('no controls at all', () => {
    expect(issues({ ...base, controls: [] })).toContain('declares no controls');
  });

  it('a control naming a parameter the preset does not have', () => {
    expect(issues(withControl(0, { parameterId: 'thickness' }))).toContain('names no parameter');
  });

  it('the same parameter twice', () => {
    const config: InstantPlayConfig = { ...base, controls: [firstControl, firstControl] };

    expect(issues(config)).toContain('appears more than once');
  });

  it('more than four controls', () => {
    const extra = { ...firstControl, parameterId: 'size' };
    const config: InstantPlayConfig = {
      ...base,
      controls: [...base.controls, extra, { ...extra, parameterId: 'modulus' }],
    };

    expect(issues(config)).toContain(`at most ${MAX_INSTANT_PLAY_CONTROLS}`);
  });

  it('a missing label or description', () => {
    expect(issues(withControl(0, { label: '  ' }))).toContain('has no label');
    expect(issues(withControl(0, { description: '' }))).toContain('has no description');
  });

  it('an empty endpoint label', () => {
    const config = withControl(0, { endpoints: { low: 'Calm', high: '' } });

    expect(issues(config)).toContain('empty endpoint label');
  });

  it('a Play range wider than the parameter', () => {
    expect(issues(withControl(2, { range: { min: 4, max: 120 } }))).toContain("outside the parameter's");
  });

  it('a Play range that is not ascending', () => {
    expect(issues(withControl(2, { range: { min: 60, max: 40 } }))).toContain('not ascending');
  });

  it('a Play range that is not finite', () => {
    expect(issues(withControl(2, { range: { min: 32, max: Number.POSITIVE_INFINITY } }))).toContain(
      'not finite',
    );
  });

  it('a fractional range on an integer control', () => {
    expect(issues(withControl(2, { range: { min: 32.5, max: 72 } }))).toContain('fractional Play range');
  });

  it('a range that cannot be reached by stepping', () => {
    /*
     * A parameter that moves in fives cannot stop at 33, so a Play end there is
     * a value the control could never take.
     */
    const preset: ArtworkPreset = {
      ...modularBloom,
      parameters: modularBloom.parameters.map((parameter) =>
        parameter.id === 'size' ? { ...parameter, min: 10, step: 5 } : parameter,
      ),
      instantPlay: withControl(2, { range: { min: 33, max: 70 } }),
    };

    const found: string[] = [];
    validateInstantPlay(preset, (message) => found.push(message));

    expect(found.join(' | ')).toContain('does not land on its step');
  });

  it('a control on something that is not a number', () => {
    const preset: ArtworkPreset = {
      ...modularBloom,
      parameters: [
        ...modularBloom.parameters,
        {
          id: 'smooth',
          variable: 'smooth',
          label: 'Smooth',
          type: 'boolean',
          defaultValue: false,
          randomisable: false,
        },
      ],
      instantPlay: withControl(0, { parameterId: 'smooth' }),
    };

    const found: string[] = [];
    validateInstantPlay(preset, (message) => found.push(message));

    expect(found.join(' | ')).toContain('Play offers numeric controls only');
  });

  it('a single recipe, which leaves Randomise nothing to move to', () => {
    expect(issues({ ...base, recipes: [firstRecipe] })).toContain('at least two are needed');
  });

  it('a recipe id that is not kebab-case', () => {
    expect(issues(withRecipe(0, { id: 'Calm Rings' }))).toContain('kebab-case');
  });

  it('the same recipe id twice', () => {
    expect(issues({ ...base, recipes: [firstRecipe, firstRecipe] })).toContain('declared more than once');
  });

  it('a recipe that omits a control', () => {
    const config = withRecipe(0, { values: { multiplier: 1, modulus: 19 } });

    expect(issues(config)).toContain('sets no value for the Play control "size"');
  });

  it('a recipe setting something that is not a Play control', () => {
    const config = withRecipe(0, { values: { ...firstRecipe.values, thickness: 3 } });

    expect(issues(config)).toContain('"thickness", which is not one of its Play controls');
  });

  it('a recipe value outside the Play range', () => {
    const config = withRecipe(0, { values: { ...firstRecipe.values, size: 80 } });

    expect(issues(config)).toContain('outside its Play range 32–72');
  });

  it('a fractional value for an integer control', () => {
    const config = withRecipe(0, { values: { ...firstRecipe.values, modulus: 19.5 } });

    expect(issues(config)).toContain('sets the integer "modulus" to 19.5');
  });

  it('drift on something that is not a Play control', () => {
    const config = withRecipe(0, { drift: { thickness: 2 } });

    expect(issues(config)).toContain('drift on "thickness", which is not one of its Play controls');
  });

  it('drift that is not positive', () => {
    expect(issues(withRecipe(0, { drift: { size: -4 } }))).toContain('must be positive');
    expect(issues(withRecipe(0, { drift: { size: 0 } }))).toContain('must be positive');
  });

  it('drift finer than the step, which would round away to nothing', () => {
    expect(issues(withRecipe(0, { drift: { size: 0.5 } }))).toContain('below its step of 1');
  });
});

describe('playLabelFor', () => {
  const parameterNamed = (id: string) =>
    modularBloom.parameters.find((parameter) => parameter.id === id) as ArtworkParameter;

  it('gives a Play control’s creative label', () => {
    // What an Undo says it will take back: "Complexity", not "multiplier".
    expect(playLabelFor(modularBloom, parameterNamed('multiplier'))).toBe('Complexity');
    expect(playLabelFor(modularBloom, parameterNamed('modulus'))).toBe('Scale');
    expect(playLabelFor(modularBloom, parameterNamed('size'))).toBe('Detail');
  });

  it('falls back to the parameter’s own label where Play offers no control', () => {
    const preset = presetWith({ ...base, controls: [firstControl] });

    expect(playLabelFor(preset, parameterNamed('size'))).toBe('Size');
    expect(playLabelFor(presetWith(), parameterNamed('modulus'))).toBe('Modulus');
  });
});

describe('playStep', () => {
  const numeric: ArtworkParameter = {
    id: 'span',
    variable: 'span',
    label: 'Span',
    type: 'number',
    min: 0,
    max: 1,
    defaultValue: 0.5,
    randomisable: true,
  };

  it("is the parameter's own step when it declares one", () => {
    const size = modularBloom.parameters.find((parameter) => parameter.id === 'size');

    expect(playStep(size as ArtworkParameter)).toBe(1);
  });

  it('falls back to one for an integer and a hundredth for a number', () => {
    expect(playStep({ ...numeric, type: 'integer', defaultValue: 0 })).toBe(1);
    expect(playStep(numeric)).toBe(0.01);
  });
});

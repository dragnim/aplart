/**
 * What a "Start creating" link resolves to.
 *
 * The seed in the link is the whole state, so these are the two properties the
 * feature rests on: a seed always produces the same artwork, and anything that is
 * not a seed produces nothing rather than something plausible. A URL is untrusted
 * input, and the failure to avoid is a coerced value quietly opening a different
 * artwork from the one somebody was sent.
 */

import { describe, expect, it } from 'vitest';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { modularBloom } from '@/presets/modular-bloom';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { type InstantPlayConfig } from '@/presets/instantPlay';
import { generateInstantPlayVariation } from '@/workspace/instantPlayVariation';
import { readPlaySeed, startCreating } from '@/workspace/startCreating';

const config = modularBloom.instantPlay as InstantPlayConfig;

describe('readPlaySeed', () => {
  it('accepts a whole number in range', () => {
    expect(readPlaySeed('0')).toBe(0);
    expect(readPlaySeed('7')).toBe(7);
    expect(readPlaySeed('4294967295')).toBe(0xffff_ffff);
  });

  it('refuses anything that is not one', () => {
    // Each of these could be coerced into a number, and each would open a
    // different artwork from the one the link named.
    for (const raw of [
      null,
      '',
      ' 7',
      '7 ',
      '7.5',
      '-7',
      '¯7',
      '0x10',
      '1e3',
      '4294967296',
      'nine',
      'NaN',
      'Infinity',
      '9007199254740993',
    ]) {
      expect(readPlaySeed(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('startCreating', () => {
  it('writes the curated values into the preset’s own source', () => {
    const started = startCreating(modularBloom, 20_260_805);
    const variation = generateInstantPlayVariation(modularBloom, 20_260_805);

    expect(started).not.toBeNull();
    expect(started?.seed).toBe(20_260_805);
    expect(started?.recipeId).toBe(variation?.recipeId);

    // The same source, with three numbers changed and nothing else.
    for (const [variable, value] of variation?.values ?? []) {
      expect(numberAssignedTo(started?.code ?? '', variable), variable).toBe(value);
    }
    expect(started?.code.split('\n')).toHaveLength(modularBloom.code.split('\n').length);
  });

  it('differs from the preset’s defaults, or there was no point starting', () => {
    const started = startCreating(modularBloom, 99);

    expect(started?.code).not.toBe(modularBloom.code);
  });

  it('gives the same artwork for the same seed, and different ones for different seeds', () => {
    expect(startCreating(modularBloom, 1)?.code).toBe(startCreating(modularBloom, 1)?.code);

    const many = new Set(
      Array.from({ length: 40 }, (_unused, index) => startCreating(modularBloom, index * 7919)?.code),
    );
    // Several recipes and drift within them, so a handful of seeds should not all
    // land on one artwork.
    expect(many.size).toBeGreaterThan(4);
  });

  it('lands on a Play control value the workspace could also have set', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const started = startCreating(modularBloom, seed);

      for (const control of config.controls) {
        const parameter = modularBloom.parameters.find((candidate) => candidate.id === control.parameterId);
        const value = numberAssignedTo(started?.code ?? '', parameter?.variable ?? '');

        expect(typeof value, control.parameterId).toBe('number');
        expect(value as number).toBeGreaterThanOrEqual(parameter?.min ?? 0);
        expect(value as number).toBeLessThanOrEqual(parameter?.max ?? 0);
      }
    }
  });

  it('declines a preset with no curated variations, rather than inventing some', () => {
    // Truchet stood here until it was curated. The fractals are the artworks
    // that still offer none, and a seed aimed at one has to open its default.
    expect(mandelbrotField.instantPlay).toBeUndefined();
    expect(startCreating(mandelbrotField, 1)).toBeNull();
  });
});

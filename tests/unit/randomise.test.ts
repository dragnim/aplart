import { describe, expect, it } from 'vitest';
import { randomiseParameters, randomValueFor, seededRandom } from '@/workspace/randomise';
import { type ArtworkParameter } from '@/presets/schema';
import { modularBloom } from '@/presets/modular-bloom';

const integerParameter: ArtworkParameter = {
  id: 'size',
  variable: 'size',
  label: 'Size',
  type: 'integer',
  min: 8,
  max: 88,
  step: 1,
  defaultValue: 64,
  randomisable: true,
};

describe('seededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRandom(12_345);
    const b = seededRandom(12_345);
    const first = Array.from({ length: 20 }, () => a());
    const second = Array.from({ length: 20 }, () => b());
    expect(first).toEqual(second);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 10 }, seededRandom(1));
    const b = Array.from({ length: 10 }, seededRandom(2));
    expect(a).not.toEqual(b);
  });

  it('stays within zero and one', () => {
    const random = seededRandom(99);
    for (let index = 0; index < 1000; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('randomValueFor', () => {
  it('never leaves the declared range', () => {
    const random = seededRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const value = randomValueFor(integerParameter, random);
      expect(typeof value).toBe('number');
      expect(value as number).toBeGreaterThanOrEqual(8);
      expect(value as number).toBeLessThanOrEqual(88);
    }
  });

  it('produces whole numbers for an integer control', () => {
    const random = seededRandom(3);
    for (let index = 0; index < 200; index += 1) {
      expect(Number.isInteger(randomValueFor(integerParameter, random))).toBe(true);
    }
  });

  it('respects a fractional step without accumulating floating point noise', () => {
    const parameter: ArtworkParameter = {
      id: 'zoom',
      variable: 'zoom',
      label: 'Zoom',
      type: 'number',
      min: 0.05,
      max: 2,
      step: 0.05,
      defaultValue: 1,
      randomisable: true,
    };

    const random = seededRandom(11);
    for (let index = 0; index < 300; index += 1) {
      const value = randomValueFor(parameter, random) as number;
      expect(value).toBeGreaterThanOrEqual(0.05);
      expect(value).toBeLessThanOrEqual(2);
      // A value like 0.30000000000000004 would end up in the user's code.
      expect(String(value).replace('-', '').split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });

  it('favours the middle of the range over its ends', () => {
    // Uniform sampling puts a quarter of values in each outer quarter, which
    // is where most of these parameters are least interesting.
    const random = seededRandom(2024);
    let outer = 0;
    const samples = 2000;
    for (let index = 0; index < samples; index += 1) {
      const value = randomValueFor(integerParameter, random) as number;
      if (value < 28 || value > 68) outer += 1;
    }
    expect(outer / samples).toBeLessThan(0.25);
  });

  it('chooses one of the declared options for a select', () => {
    const parameter: ArtworkParameter = {
      id: 'mode',
      variable: 'mode',
      label: 'Mode',
      type: 'select',
      defaultValue: 1,
      randomisable: true,
      options: [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
      ],
    };
    const random = seededRandom(5);
    for (let index = 0; index < 50; index += 1) {
      expect([1, 2]).toContain(randomValueFor(parameter, random));
    }
  });
});

describe('randomiseParameters', () => {
  it('is reproducible from its seed, which is what makes a randomised link shareable', () => {
    const first = randomiseParameters(modularBloom.parameters, 4242);
    const second = randomiseParameters(modularBloom.parameters, 4242);
    expect([...first.values]).toEqual([...second.values]);
    expect(first.seed).toBe(4242);
  });

  it('returns the seed it used when none was given', () => {
    const result = randomiseParameters(modularBloom.parameters);
    const repeat = randomiseParameters(modularBloom.parameters, result.seed);
    expect([...repeat.values]).toEqual([...result.values]);
  });

  it('leaves parameters that opt out alone', () => {
    const parameters: ArtworkParameter[] = [
      integerParameter,
      { ...integerParameter, id: 'fixed', variable: 'fixed', randomisable: false },
    ];
    const { values } = randomiseParameters(parameters, 1);
    expect(values.has('size')).toBe(true);
    expect(values.has('fixed')).toBe(false);
  });

  it('covers every randomisable parameter of a real preset', () => {
    const { values } = randomiseParameters(modularBloom.parameters, 1);
    const expected = modularBloom.parameters.filter((parameter) => parameter.randomisable);
    expect(values.size).toBe(expected.length);
  });
});

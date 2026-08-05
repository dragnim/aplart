/**
 * Randomising parameters.
 *
 * Two things matter here beyond picking numbers. The seed is carried in the
 * share state, so a randomised artwork someone sends you rebuilds exactly.
 * And the values are chosen to be worth looking at rather than uniformly
 * scattered: the extremes of most ranges are the dull end, and uniform
 * sampling lands there far too often.
 */

import { type ArtworkParameter } from '@/presets/schema';
import { type ParameterValue } from '@/editor/parameterBinding';

/**
 * mulberry32.
 *
 * Small, fast, and identical everywhere — which is the whole requirement. The
 * statistical quality of the stream does not matter; reproducing it from a
 * seed does.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Pulls a sample towards the middle of its range.
 *
 * The average of two uniform draws is triangular: still capable of reaching
 * the ends, but far more likely to land somewhere interesting. Most of these
 * parameters are least interesting at their extremes — a modulus of 2, a
 * frequency of 1, a zoom right out.
 */
function centreWeighted(random: () => number): number {
  return (random() + random()) / 2;
}

/**
 * Puts a value on the step grid and inside the bounds.
 *
 * The grid is measured from `min`, so a narrowed range keeps landing on values
 * the control can actually reach. Exported because Instant Play needs the same
 * arithmetic against a Play range rather than the parameter's full one, and two
 * copies of it would be two chances to round differently.
 */
export function snapWithin(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;

  // Floating point steps such as 0.01 accumulate error; round to the number of
  // decimals the step implies so the code stays readable.
  const decimals = (String(step).split('.')[1] ?? '').length;
  const rounded = Number(snapped.toFixed(decimals));

  return Math.min(max, Math.max(min, rounded));
}

function snapToStep(value: number, parameter: ArtworkParameter): number {
  const min = parameter.min ?? 0;
  const step = parameter.step ?? (parameter.type === 'integer' ? 1 : 0.01);

  return snapWithin(value, min, parameter.max ?? value, step);
}

export function randomValueFor(parameter: ArtworkParameter, random: () => number): ParameterValue {
  switch (parameter.type) {
    case 'integer':
    case 'number': {
      const min = parameter.min ?? 0;
      const max = parameter.max ?? 1;
      const value = min + centreWeighted(random) * (max - min);
      return snapToStep(value, parameter);
    }
    case 'select': {
      const options = parameter.options ?? [];
      if (options.length === 0) return parameter.defaultValue;
      const chosen = options[Math.floor(random() * options.length)] ?? options[0];
      return chosen === undefined ? parameter.defaultValue : chosen.value;
    }
    case 'boolean':
      return random() < 0.5;
  }
}

export interface RandomisedParameters {
  readonly values: ReadonlyMap<string, ParameterValue>;
  readonly seed: number;
}

/**
 * Chooses new values for every randomisable parameter.
 *
 * Parameters marked `randomisable: false` are left alone — resolution and
 * iteration counts, where a random value only makes the artwork slower rather
 * than more interesting.
 */
export function randomiseParameters(
  parameters: readonly ArtworkParameter[],
  seed: number = Math.floor(Math.random() * 0xffff_ffff),
): RandomisedParameters {
  const random = seededRandom(seed);
  const values = new Map<string, ParameterValue>();

  for (const parameter of parameters) {
    if (!parameter.randomisable) continue;
    values.set(parameter.variable, randomValueFor(parameter, random));
  }

  return { values, seed };
}

/**
 * What a curated control is allowed to produce.
 *
 * Create and Advanced answer different questions. Advanced asks "what does this
 * program do with these numbers", and every combination is a truthful answer,
 * including the ones that draw two shades. Create asks "make me something worth
 * looking at", and a slider that lands on a blank square has not answered it.
 *
 * So a preset may declare a quality rule: a pure function from the values its
 * Create controls hold to the nearest values that are actually worth drawing.
 * Nothing here constrains Advanced, the editor or a shared link — the raw
 * parameter ranges are untouched, and a number reached by typing stays reached.
 *
 * The rule is used in both places a curated value can come from: the randomiser
 * that opens an artwork, and the sliders somebody moves afterwards. Applying it
 * to only one of those was the previous state of affairs — the recipes avoided
 * the bad corners by hand, and the sliders walked straight into them.
 */

import { numberAssignedTo, type ParameterValue } from '@/editor/parameterBinding';
import { type ArtworkPreset } from './schema';

/**
 * Values by APL variable, as both the randomiser and the sliders speak.
 *
 * A rule receives every curated value at once because quality is rarely a
 * property of one of them: it is the relationship between them that collapses.
 */
export type CuratedValues = ReadonlyMap<string, ParameterValue>;

/**
 * A preset's rule, if it has one.
 *
 * Returns the values to use — the same ones when they are already good, and the
 * nearest good ones when they are not. It must be total, deterministic and
 * idempotent: the same input always gives the same output, and applying it to
 * its own output changes nothing.
 *
 * `holding` names the APL variable somebody is actually moving, when one is. That
 * value is never the one adjusted: a slider that slides out from under the
 * finger on it is broken, however good the picture at the end. The rule moves
 * one of the others instead, which is visible, explicable and leaves the gesture
 * doing what it looks like it does. The randomiser passes nothing, because
 * nobody is holding anything.
 */
export type CreateQualityRule = (values: CuratedValues, holding?: string) => CuratedValues;

/**
 * What the curated controls should hold after one of them is moved.
 *
 * Reads the artwork's present values out of its own source — the editor is the
 * single source of truth, and a control that cached its value would disagree
 * with the code the moment somebody typed — writes the new one over the top, and
 * asks the preset's rule to make the set worth drawing.
 *
 * Returns every curated value, not only the changed ones. Writing them all back
 * costs nothing when they are unchanged and means the caller never has to work
 * out which the rule moved.
 */
export function curatedValuesAfter(
  preset: ArtworkPreset,
  code: string,
  variable: string,
  value: number,
): CuratedValues {
  const values = new Map<string, ParameterValue>();

  for (const control of preset.instantPlay?.controls ?? []) {
    const parameter = preset.parameters.find((candidate) => candidate.id === control.parameterId);
    if (parameter === undefined) continue;

    const current = numberAssignedTo(code, parameter.variable);
    // A control whose assignment somebody has rewritten by hand has no value to
    // read, and nothing here may invent one: it is left out, and the rule sees
    // the artwork as it actually is.
    if (current !== null) values.set(parameter.variable, current);
  }

  values.set(variable, value);

  const rule = preset.instantPlay?.quality;
  return rule === undefined ? values : rule(values, variable);
}

/**
 * The rule every tiling artwork shares: the grid must be a whole number of
 * pattern periods across.
 *
 * These patterns repeat on a period measured in cells — a strap width, a block,
 * a tile. Draw such a pattern on a grid that is not a whole number of periods
 * wide and the artwork itself still looks right; it is only when the result is
 * repeated that the join lands mid-period and a seam appears. Since a seamless
 * repeat is the whole point of these pieces, Create keeps the grid on the grid.
 *
 * `size` names the grid control and `period` computes the repeat from the other
 * values. Whichever of the two the person is holding, the other gives way: drag
 * the grid and the pattern resizes to fit it, drag the pattern and the grid
 * grows to the next whole number of it. Advanced still writes either freely.
 */
export function tilePeriodRule(options: {
  readonly size: string;
  readonly period: (values: CuratedValues) => number;
  readonly sizeRange: { readonly min: number; readonly max: number };
  readonly periodVariable: string;
  readonly periodRange: { readonly min: number; readonly max: number; readonly step: number };
}): CreateQualityRule {
  return (values, holding) => {
    const size = values.get(options.size);
    if (typeof size !== 'number') return values;

    const period = options.period(values);
    if (!Number.isFinite(period) || period <= 0 || size % period === 0) return values;

    const adjusted = new Map(values);

    /*
     * The grid is being dragged, so the pattern moves instead. Only the period
     * control can move it, and only in its own steps — a strap width of 7 where
     * the control offers even numbers would be a value the slider could never
     * return to.
     */
    if (holding === options.size) {
      const current = values.get(options.periodVariable);
      if (typeof current !== 'number') return values;

      const next = nearestAccepted(current, options.periodRange.min, options.periodRange.max, (candidate) => {
        if ((candidate - options.periodRange.min) % options.periodRange.step !== 0) return false;
        const trial = new Map(values);
        trial.set(options.periodVariable, candidate);
        const trialPeriod = options.period(trial);
        return trialPeriod > 0 && size % trialPeriod === 0;
      });

      if (next !== null) adjusted.set(options.periodVariable, next);
      return adjusted;
    }

    // Otherwise the grid gives way, to the nearest whole number of periods that
    // is still a size this artwork offers.
    const wanted = Math.round(size / period) * period;
    const clamped = Math.min(
      Math.max(wanted < period ? period : wanted, options.sizeRange.min),
      options.sizeRange.max,
    );
    const fitted = Math.floor(clamped / period) * period;
    adjusted.set(options.size, fitted >= period ? fitted : period);
    return adjusted;
  };
}

/** The greatest common divisor, for the rules that care about shared factors. */
export function gcd(a: number, b: number): number {
  let [x, y] = [Math.abs(Math.round(a)), Math.abs(Math.round(b))];
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/**
 * The nearest value to `from` within `min`–`max` that some test accepts.
 *
 * Searches outwards a step at a time, so "nearest" means nearest, and prefers
 * the larger candidate when two are equally close — an arbitrary tie-break, but
 * a fixed one, which is what makes a seeded variation reproducible.
 *
 * Returns null when nothing in range passes, which a caller must handle by
 * leaving the value alone: a rule that cannot improve something must not
 * invent an answer.
 */
export function nearestAccepted(
  from: number,
  min: number,
  max: number,
  accepts: (candidate: number) => boolean,
): number | null {
  if (accepts(from)) return from;

  const span = Math.max(from - min, max - from);
  for (let distance = 1; distance <= span; distance += 1) {
    const above = from + distance;
    if (above <= max && accepts(above)) return above;

    const below = from - distance;
    if (below >= min && accepts(below)) return below;
  }

  return null;
}

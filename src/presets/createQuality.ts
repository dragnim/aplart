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

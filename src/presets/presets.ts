/**
 * The preset registry.
 *
 * Presets are validated once, on load. Anything that fails is dropped and
 * reported rather than being allowed to break the gallery for every other
 * piece. `npm run validate:presets` runs the same checks in CI, so a broken
 * preset fails the build long before it can reach a visitor.
 */

import { burningShip } from './burning-ship';
import { cellularEcho } from './cellular-echo';
import { checkerShift } from './checker-shift';
import { juliaSet } from './julia-set';
import { mandelbrotField } from './mandelbrot-field';
import { modularBloom } from './modular-bloom';
import { multibrot } from './multibrot';
import { sierpinskiArray } from './sierpinski-array';
import { tricorn } from './tricorn';
import { truchetGrid } from './truchet-grid';
import { waveInterference } from './wave-interference';
import { validatePreset, type ArtworkPreset, type PresetValidationIssue } from './schema';

// Presets are registered here as they are authored. Each lives in its own
// module so that its APL, parameters and prose stay together.
//
// Gallery order, roughly easiest first, so a visitor scrolling down meets the
// gentle pieces before the fractals.
//
// Julia sits after Mandelbrot despite being the easier of the two to read. Its
// description is written in terms of Mandelbrot's — the whole point of it is the
// two lines that differ — so meeting it second is what makes the comparison
// available. Burning Ship follows for the same reason: its one difference from
// Mandelbrot only means anything once Mandelbrot has been seen.
const authored: readonly ArtworkPreset[] = [
  modularBloom,
  checkerShift,
  waveInterference,
  truchetGrid,
  sierpinskiArray,
  cellularEcho,
  mandelbrotField,
  juliaSet,
  burningShip,
  tricorn,
  multibrot,
];

const issues: PresetValidationIssue[] = [];
const valid: ArtworkPreset[] = [];

for (const preset of authored) {
  const presetIssues = validatePreset(preset);
  if (presetIssues.length === 0) {
    valid.push(preset);
  } else {
    issues.push(...presetIssues);
  }
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`[presets] "${issue.presetId}" was not loaded: ${issue.message}`);
  }
}

export const presets: readonly ArtworkPreset[] = valid;

/** Problems found while loading; surfaced by `npm run validate:presets`. */
export const presetIssues: readonly PresetValidationIssue[] = issues;

const byId = new Map(valid.map((preset) => [preset.id, preset]));

export function getPreset(id: string): ArtworkPreset | undefined {
  return byId.get(id);
}

export function featuredPreset(): ArtworkPreset | undefined {
  return valid.find((preset) => preset.featured === true) ?? valid[0];
}

/**
 * The artworks "Start creating" may open with.
 *
 * Named here rather than derived from which presets have curated controls,
 * because the two questions are different. Curated controls are what makes an
 * artwork editable in Create; this list is a judgement about which pieces are
 * the right first impression of APL Art — the pattern families, whose whole
 * character changes under a slider. The fractals are fully editable in the
 * workspace and are simply not what "surprise me" should hand somebody.
 *
 * Order is fixed, so the seed below means the same thing tomorrow.
 */
export const START_CREATING_POOL: readonly string[] = [
  'modular-bloom',
  'checker-shift',
  'wave-interference',
  'truchet-grid',
];

/**
 * The pool as artworks, in the order above.
 *
 * Filtered by curated controls as well as by the list, so an artwork that lost
 * its Instant Play block — or was dropped by validation entirely — leaves the
 * pool rather than becoming a "Start creating" that opens on a default.
 */
export function startCreatingPool(): readonly ArtworkPreset[] {
  return START_CREATING_POOL.map((id) => byId.get(id)).filter(
    (preset): preset is ArtworkPreset => preset !== undefined && preset.instantPlay !== undefined,
  );
}

/**
 * Which artwork a "Start creating" seed opens, or undefined if the pool is empty.
 *
 * The seed decides the preset as well as the variation within it, so one number
 * in one link is the whole state: the same seed opens the same artwork at the
 * same settings, today and after a reload and on somebody else's machine. The
 * link still names the preset, because the preset is what the address is for —
 * the seed choosing it is how the gallery picks, not how the workspace reads.
 */
export function starterFor(seed: number): ArtworkPreset | undefined {
  const pool = startCreatingPool();
  if (pool.length === 0) return undefined;

  // The same generator the variation uses, drawn once before it. Whole-number
  // arithmetic on the seed itself rather than a float, so this cannot drift
  // between engines.
  return pool[seed % pool.length];
}

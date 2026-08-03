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
import { sierpinskiArray } from './sierpinski-array';
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

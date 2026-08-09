/**
 * The preset registry.
 *
 * Presets are validated once, on load. Anything that fails is dropped and
 * reported rather than being allowed to break the gallery for every other
 * piece. `npm run validate:presets` runs the same checks in CI, so a broken
 * preset fails the build long before it can reach a visitor.
 */

import { basketWeave } from './basket-weave';
import { burningShip } from './burning-ship';
import { cellularEcho } from './cellular-echo';
import { checkerShift } from './checker-shift';
import { glowGrid } from './glow-grid';
import { juliaSet } from './julia-set';
import { mandelbrotField } from './mandelbrot-field';
import { mazeTiles } from './maze-tiles';
import { modularBloom } from './modular-bloom';
import { multibrot } from './multibrot';
import { quiltStars } from './quilt-stars';
import { sierpinskiArray } from './sierpinski-array';
import { tricorn } from './tricorn';
import { truchetGrid } from './truchet-grid';
import { waveInterference } from './wave-interference';
import { validatePreset, type ArtworkPreset, type PresetValidationIssue } from './schema';

/*
 * Presets are registered here as they are authored. Each lives in its own
 * module so that its APL, parameters and prose stay together.
 *
 * The order is the gallery's, and it leads with the patterns.
 *
 * That is a change of emphasis rather than of taste. The question this
 * collection is now judged by is whether somebody would put a piece behind
 * something of their own — as a background, a texture, a tile — and the answers
 * are the seamless patterns. They come first, in rough order of how immediately
 * they read: a weave, a quilt, a maze, a lattice, then the arithmetic patterns
 * that started the gallery.
 *
 * The fractals follow. They are the best things here to *explore*, which is a
 * different pleasure and a later one; a visitor who wants to wander a plane will
 * scroll for it, and one who wants a texture should not have to.
 *
 * Julia sits after Mandelbrot despite being the easier of the two to read. Its
 * description is written in terms of Mandelbrot's — the whole point of it is the
 * two lines that differ — so meeting it second is what makes the comparison
 * available. Burning Ship follows for the same reason.
 *
 * This list is now the only thing that says which artwork leads. Basket Weave is
 * first because it answers the collection's question fastest, and being first is
 * all that emphasis amounts to: a preset could once set `featured: true` and be
 * drawn as a double-width card with its picture beside its text, which made the
 * first row read as a banner rather than as a catalogue. Every card is the same
 * card, and the order does the work.
 */
const authored: readonly ArtworkPreset[] = [
  basketWeave,
  quiltStars,
  mazeTiles,
  glowGrid,
  modularBloom,
  truchetGrid,
  checkerShift,
  waveInterference,
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

/**
 * Every artwork that loaded, listed or not.
 *
 * This is what an address resolves against, so an unlisted piece still opens and
 * a link somebody was sent still works.
 */
export const presets: readonly ArtworkPreset[] = valid;

/**
 * The artworks the gallery shows.
 *
 * Tricorn and Multibrot are not among them. Both are a line of arithmetic away
 * from Mandelbrot, and the gallery has stopped being a survey of the family —
 * Multibrot in particular is the longest and hardest program here for a
 * difference most people would not name. They are retired from the front rather
 * than deleted: their addresses still work, so nothing anybody has shared is
 * broken by the decision.
 */
export const listedPresets: readonly ArtworkPreset[] = valid.filter((preset) => preset.listed !== false);

/** Problems found while loading; surfaced by `npm run validate:presets`. */
export const presetIssues: readonly PresetValidationIssue[] = issues;

const byId = new Map(valid.map((preset) => [preset.id, preset]));

export function getPreset(id: string): ArtworkPreset | undefined {
  return byId.get(id);
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
  'basket-weave',
  'quilt-stars',
  'maze-tiles',
  'glow-grid',
  'modular-bloom',
  'truchet-grid',
  'checker-shift',
  'wave-interference',
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

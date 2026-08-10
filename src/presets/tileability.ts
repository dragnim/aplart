/**
 * Whether an artwork, as it currently stands, repeats seamlessly.
 *
 * Two things are deliberately kept apart here, because conflating them is how a
 * texture tool comes to lie to people.
 *
 * A *capability* is a property of the artwork's mathematics: Basket Weave is
 * built from a motif that repeats every `2×width` cells, and that is true of the
 * program whatever numbers it is holding. A *verdict* is a property of the
 * numbers it is holding right now: the same artwork with a grid that is not a
 * whole number of those motifs has a visible seam, and must be told so. A
 * preset declaring the first must never be enough to claim the second.
 *
 * Nothing here knows about Repeat or Mirror repeat. Those compose copies of a
 * finished tile on screen and change nothing about whether the tile's own edges
 * meet — a mirrored copy hides a seam by reflecting it, which is a way of
 * looking at an artwork and not a property of one.
 */

import { numberAssignedTo } from '@/editor/parameterBinding';
import { nearestAccepted } from './createQuality';
import { type ArtworkPreset } from './schema';

/** A number the artwork's source currently assigns, or undefined if it does not. */
export type ReadValue = (variable: string) => number | undefined;

/**
 * An artwork whose picture repeats on a fixed pitch.
 *
 * Seamless exactly when the grid is a whole number of periods. Everything the
 * verdict and the correction need comes from this: the period is computed from
 * the artwork's own numbers, so a preset states its mathematics once.
 */
export interface PeriodicTiling {
  readonly kind: 'periodic';
  /** The variable holding the grid size in cells. */
  readonly sizeVariable: string;
  /** The repeat length in cells, or undefined when the numbers make none. */
  readonly period: (value: ReadValue) => number | undefined;
  readonly sizeRange: { readonly min: number; readonly max: number };
  /** The control that changes the period, tried only when size cannot move. */
  readonly periodVariable: string;
  readonly periodRange: { readonly min: number; readonly max: number; readonly step: number };
  /**
   * A condition beyond periodicity that a correction must not break.
   *
   * Checker Shift collapses to plain stripes when the shear is a multiple of the
   * band count: still perfectly seamless, and not the artwork anybody was
   * looking at. A correction that produced it would be arithmetically right and
   * a bad answer.
   */
  readonly alsoRequires?: (value: ReadValue) => boolean;
}

/**
 * An artwork whose tiles join by their motifs meeting at the edges.
 *
 * Truchet's cells carry no periodicity at all — the classes come from a hash —
 * and it tiles because every arc crosses an edge at its midpoint and
 * perpendicular to it, so any two arcs continue into each other. Adding the
 * diagonals breaks that: they arrive at a corner at an angle.
 *
 * The correction is therefore not a small snap but a different artwork, so it is
 * offered as its own named action rather than folded into Auto tile.
 */
export interface MotifTiling {
  readonly kind: 'motif';
  readonly variable: string;
  /** The largest value for which every available shape joins. */
  readonly compatibleUpTo: number;
  /** What the explicit correction is called, in the visitor's words. */
  readonly correctionLabel: string;
  /** What the artwork can promise, in the visitor's words. */
  readonly compatibleSummary: string;
}

export type TileCapability = PeriodicTiling | MotifTiling;

export type TileState = 'seamless' | 'correctable' | 'none';

export interface TileVerdict {
  readonly state: TileState;
  /**
   * The values a correction would write, or null when there is none.
   *
   * Present only for `correctable`, and always a complete set of changes rather
   * than a hint: the caller writes them and redraws, and never has to work out
   * what a correction meant.
   */
  readonly correction: ReadonlyMap<string, number> | null;
  /** What the correction is called, when there is one to offer. */
  readonly correctionLabel: string | null;
}

/** Reads the artwork's numbers out of the source, which is the only truth. */
export function valuesIn(code: string): ReadValue {
  // `numberAssignedTo` says "not there" with null; the rest of this module says
  // it with undefined, so the two meet here rather than at every call site.
  return (variable) => numberAssignedTo(code, variable) ?? undefined;
}

/**
 * How far the grid may move to reach a seam-free size.
 *
 * Bounded on purpose. Auto tile is a correction, not a redesign: a grid dragged
 * from 96 to 100 is the artwork somebody chose at a slightly different extent,
 * and one dragged from 96 to 240 is a different picture with a green label on
 * it. When nothing inside this distance works the period control is tried
 * instead, and if that fails too the honest answer is that there is nothing to
 * offer.
 */
const MAX_SIZE_MOVE = 24;

function periodicVerdict(tiling: PeriodicTiling, value: ReadValue): TileVerdict {
  const size = value(tiling.sizeVariable);
  const period = tiling.period(value);

  // Nothing to say about numbers the source does not contain.
  if (size === undefined || period === undefined || period <= 0) {
    return { state: 'none', correction: null, correctionLabel: null };
  }

  const wellFormed = tiling.alsoRequires?.(value) ?? true;
  if (size % period === 0 && wellFormed) {
    return { state: 'seamless', correction: null, correctionLabel: null };
  }

  const correction = periodicCorrection(tiling, value, size);
  return correction === null
    ? { state: 'none', correction: null, correctionLabel: null }
    : { state: 'correctable', correction, correctionLabel: 'Auto tile' };
}

/**
 * The smallest change that makes the grid a whole number of periods.
 *
 * The grid moves first, and by preference. Every other number here shapes the
 * motif — a strap's width, a block's size, the modulus a bloom is folded by —
 * so moving one of those hands back a different artwork, while a nearby size
 * is the same artwork drawn at a slightly different extent.
 */
function periodicCorrection(
  tiling: PeriodicTiling,
  value: ReadValue,
  size: number,
): ReadonlyMap<string, number> | null {
  const withSize =
    (candidate: number): ReadValue =>
    (name) =>
      name === tiling.sizeVariable ? candidate : value(name);

  const nearbySize = nearestAccepted(
    size,
    Math.max(tiling.sizeRange.min, size - MAX_SIZE_MOVE),
    Math.min(tiling.sizeRange.max, size + MAX_SIZE_MOVE),
    (candidate) => {
      const period = tiling.period(withSize(candidate));
      if (period === undefined || period <= 0 || candidate % period !== 0) return false;
      return tiling.alsoRequires?.(withSize(candidate)) ?? true;
    },
  );

  if (nearbySize !== null && nearbySize !== size) return new Map([[tiling.sizeVariable, nearbySize]]);

  /*
   * The grid could not reach one, so the pattern gives way instead — in the
   * steps its own control offers, or the correction would leave a value that
   * control can never return to.
   */
  const current = value(tiling.periodVariable);
  if (current === undefined) return null;

  const withPeriod =
    (candidate: number): ReadValue =>
    (name) =>
      name === tiling.periodVariable ? candidate : value(name);

  const nearbyPeriod = nearestAccepted(
    current,
    tiling.periodRange.min,
    tiling.periodRange.max,
    (candidate) => {
      if ((candidate - tiling.periodRange.min) % tiling.periodRange.step !== 0) return false;
      const period = tiling.period(withPeriod(candidate));
      if (period === undefined || period <= 0 || size % period !== 0) return false;
      return tiling.alsoRequires?.(withPeriod(candidate)) ?? true;
    },
  );

  if (nearbyPeriod === null || nearbyPeriod === current) return null;
  return new Map([[tiling.periodVariable, nearbyPeriod]]);
}

function motifVerdict(tiling: MotifTiling, value: ReadValue): TileVerdict {
  const held = value(tiling.variable);
  if (held === undefined) return { state: 'none', correction: null, correctionLabel: null };

  if (held <= tiling.compatibleUpTo) {
    return { state: 'seamless', correction: null, correctionLabel: null };
  }

  return {
    state: 'correctable',
    correction: new Map([[tiling.variable, tiling.compatibleUpTo]]),
    correctionLabel: tiling.correctionLabel,
  };
}

/**
 * What this artwork's present numbers actually do.
 *
 * The whole point of the module: a preset that declares periodicity is not
 * thereby seamless. Advanced can write any number it likes, and a grid that is
 * not a whole number of periods has a seam whatever the preset promises.
 */
export function tileVerdict(preset: ArtworkPreset, code: string): TileVerdict | null {
  const tiling = preset.tiling;
  if (tiling === undefined) return null;

  const value = valuesIn(code);
  return tiling.kind === 'periodic' ? periodicVerdict(tiling, value) : motifVerdict(tiling, value);
}

/**
 * What to tell a visitor about this artwork's present state.
 *
 * One sentence about *this* artwork right now, rather than one sentence about
 * the family it belongs to. The two states used to share a line explaining that
 * the artwork is built from a repeating motif, which is true of both and
 * therefore says nothing about the difference between them — a visitor reading
 * "can be made seamless" wants to know what is wrong and what the button will
 * do about it.
 *
 * No arithmetic. The period, the modulus and the common factors are how this is
 * decided and are no part of what somebody wanting a background needs to read.
 *
 * A motif tiling keeps its own words: its answer is about which shapes it is
 * drawing, and forcing it through the generic sentences would describe a size
 * problem it does not have.
 */
export function tileSummary(tiling: TileCapability, state: TileState): string {
  if (tiling.kind === 'motif') return tiling.compatibleSummary;

  switch (state) {
    case 'seamless':
      return 'The current size contains whole repeats of the pattern, so the edges join cleanly.';
    case 'correctable':
      return 'This pattern repeats, but the current size cuts through a repeat. Auto tile can adjust it to the nearest clean fit.';
    case 'none':
      // Reached when the numbers describe no repeat at all — nothing to correct
      // towards, so the honest answer is that there is nothing on offer.
      return 'These settings do not produce a repeating pattern, so the edges will not join.';
  }
}

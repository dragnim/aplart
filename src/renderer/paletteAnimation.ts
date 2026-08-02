/**
 * Moving a palette without changing it.
 *
 * Three things are kept apart deliberately:
 *
 *   - the *base* palette, which is what was chosen, saved and shared;
 *   - the *phase*, which is where the animation has got to and is never saved;
 *   - the *effective* palette for one frame, produced here from the two.
 *
 * Nothing in this file mutates a stop. Every mode is a transform of stop
 * positions applied to a copy, which is what makes pausing, resetting and
 * exporting exact rather than approximate — and what keeps a hard edge hard:
 * two stops sharing a position are moved by the same amount, so they still
 * share one afterwards.
 *
 * Resampling the ramp into evenly spaced entries would have been simpler and
 * would have quietly interpolated every hard edge away.
 */

import { mixRgb, parseHexColour, sampleGradient, type Rgb } from './colourMapping';
import { type Palette } from './palettes';

export type AnimationMode = 'rotate' | 'pingPong' | 'shift';

export const ANIMATION_MODES: readonly AnimationMode[] = ['rotate', 'pingPong', 'shift'];

export interface AnimationSettings {
  readonly mode: AnimationMode;
  /** Cycles per second. Elapsed-time based, so the display's rate is irrelevant. */
  readonly speed: number;
  readonly running: boolean;
}

export const DEFAULT_ANIMATION: AnimationSettings = { mode: 'rotate', speed: 0.15, running: false };

/** How far the ramp slides in the shift mode, at its furthest. */
const SHIFT_REACH = 0.35;

export function describeMode(mode: AnimationMode): string {
  switch (mode) {
    case 'rotate':
      return 'Rotate';
    case 'pingPong':
      return 'Ping-pong';
    case 'shift':
      return 'Shift stops';
  }
}

/**
 * Where the animation has got to, from a clock reading.
 *
 * Elapsed time rather than a count of frames, so the same second of animation
 * covers the same ground at 60 Hz, at 120 Hz, and on a tab the browser has
 * throttled to four frames a second.
 */
export function phaseFor(elapsedMs: number, speed: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(speed) || speed <= 0) return 0;
  const cycles = (elapsedMs / 1000) * speed;
  return cycles - Math.floor(cycles);
}

/** Where each colour sits, filling in the even spacing a named ramp implies. */
function positionsOf(palette: Palette): number[] {
  if (palette.positions !== undefined && palette.positions.length === palette.colours.length) {
    return [...palette.positions];
  }
  const last = Math.max(1, palette.colours.length - 1);
  return palette.colours.map((_unused, index) => index / last);
}

function toHex({ r, g, b }: Rgb): string {
  const byte = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** The base ramp's colour at a point, used to close the seam when rotating. */
function sampleAt(palette: Palette, at: number): string {
  const ramp = palette.colours.map(parseHexColour);
  return toHex(sampleGradient(ramp, at, positionsOf(palette)));
}

/**
 * Rounds a position so that stops which ought to coincide actually do.
 *
 * Wrapping is subtraction, and subtraction leaves dust: `1 + 0.999 - 1` is
 * `0.9990000000000001`, not `0.999`. Two stops that should have landed on the
 * same point were then a millionth of a ramp apart, which sorted them by that
 * gap instead of by the order the seam needs — and turned a hard edge into an
 * invisibly narrow gradient, quietly, at most phases but not all.
 *
 * A millionth is far finer than any display and far coarser than the dust.
 */
function snap(position: number): number {
  return Math.round(position * 1e6) / 1e6;
}

function triangle(phase: number): number {
  // 0 → 0, 0.5 → 1, 1 → 0. Continuous at both turning points, which is what
  // stops the reversal from looking like a jump.
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

interface Placed {
  readonly colour: string;
  readonly position: number;
  /**
   * Which of two stops in the same place comes first.
   *
   * Rotation makes this matter. A ramp whose ends differ is not a loop, so
   * turning it puts the colour from the far end onto the same point as the
   * colour from the near end — and which of the two the gradient runs *into*
   * decides whether the seam reads forwards or backwards. Getting it wrong is
   * not subtle: the segment after the seam ran from white to red instead of
   * from black to red.
   */
  readonly rank: number;
}

function ordered(placed: readonly Placed[]): { colours: string[]; positions: number[] } {
  const sorted = [...placed].sort((a, b) =>
    a.position === b.position ? a.rank - b.rank : a.position - b.position,
  );
  return { colours: sorted.map((entry) => entry.colour), positions: sorted.map((entry) => entry.position) };
}

/**
 * The palette to draw this frame.
 *
 * Returns the base unchanged at phase zero, so a paused or reset animation is
 * not merely close to the saved palette but identical to it.
 */
export function animatePalette(base: Palette, mode: AnimationMode, phase: number): Palette {
  if (!Number.isFinite(phase) || phase === 0) return base;

  const positions = positionsOf(base);

  if (mode === 'shift') {
    /*
     * The ramp slides back and forth without wrapping, so colours bunch up
     * against whichever end they are approaching. Positions are clamped, which
     * can put two stops in the same place — a hard edge, and a legitimate one.
     */
    const offset = SHIFT_REACH * Math.sin(2 * Math.PI * phase);
    const sorted = ordered(
      base.colours.map((colour, index) => ({
        colour,
        position: snap(Math.min(1, Math.max(0, (positions[index] ?? 0) + offset))),
        // Nothing wraps here, so the ramp's own order is the only tie-break
        // needed — and it is what keeps a hard edge facing the same way.
        rank: index,
      })),
    );
    return { ...base, colours: sorted.colours, positions: sorted.positions };
  }

  /*
   * Rotate and ping-pong both slide the ramp cyclically; they differ only in
   * how the offset moves. Ping-pong runs it forwards and then backwards, so
   * the seam sweeps one way and returns rather than snapping back.
   */
  const offset = mode === 'pingPong' ? triangle(phase) : phase;

  /*
   * The colour on both ends: the base ramp at the point the wrap cuts it.
   * Without these the ends would take whichever stop happened to be nearest,
   * and the gradient would stretch across the join instead of meeting itself
   * there.
   */
  const cut = 1 - offset;
  const seam = sampleAt(base, cut - Math.floor(cut));

  /*
   * Ranks: the head first, then anything that came round from beyond the end,
   * then the stops that did not wrap, then the tail. A stop from the far end
   * and a stop from the near end land together at exactly the offset, and this
   * is what puts them in the order the eye expects to read them.
   */
  const placed: Placed[] = [
    { colour: seam, position: 0, rank: -1 },
    ...base.colours.map((colour, index) => {
      const moved = (positions[index] ?? 0) + offset;
      const didWrap = moved > 1;
      return {
        colour,
        position: snap(didWrap ? moved - 1 : moved),
        rank: didWrap ? index : base.colours.length + index,
      };
    }),
    { colour: seam, position: 1, rank: Number.MAX_SAFE_INTEGER },
  ];

  const sorted = ordered(placed);
  return { ...base, colours: sorted.colours, positions: sorted.positions };
}

/** Blends two colours, exported for the preview strip. */
export { mixRgb };

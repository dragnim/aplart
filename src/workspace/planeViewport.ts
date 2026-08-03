/**
 * Turning a gesture on the artwork into a change to the APL.
 *
 * The central rule of this application is that the visible code is the source
 * of the result. Dragging a region does not move a camera the code knows
 * nothing about: it rewrites three assignments, and the picture changes because
 * the APL changed. Everything here is therefore about reading those three
 * numbers out of the code and writing new ones back.
 *
 * A preset declares which assignments those are, and by doing so promises that
 * it lays its axes out the way `planeAt` assumes.
 */

import { numberAssignedTo, setParameterValue } from '@/editor/parameterBinding';
import { type ArtworkParameter, type PlaneExploration } from '@/presets/schema';
import { type SourceRect } from '@/renderer/displayMapping';

export { type SourceRect };

export interface Viewport {
  readonly centreX: number;
  readonly centreY: number;
  /** Half the width of the view, in plane units. Smaller is further in. */
  readonly span: number;
}

export interface Bounds {
  readonly min: number;
  readonly max: number;
}

export interface ViewportBounds {
  readonly centreX: Bounds;
  readonly centreY: Bounds;
  readonly span: Bounds;
}

/**
 * The point of the plane a fraction of the way across and down the matrix.
 *
 * This is the convention a preset signs up to by declaring `planeExploration`:
 * an axis of `centre + span × ¯1+2×(¯1+⍳size)÷size-1`, with the first column at
 * `centre-span` and the last at `centre+span`, columns running across and rows
 * running down.
 */
export function planeAt(viewport: Viewport, u: number, v: number): { x: number; y: number } {
  return {
    x: viewport.centreX + viewport.span * (2 * u - 1),
    y: viewport.centreY + viewport.span * (2 * v - 1),
  };
}

function clamp(value: number, bounds: Bounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/**
 * How many decimals to write.
 *
 * Enough to place the centre well inside a single cell at any resolution this
 * can return, and no more: the numbers go into code someone is reading, and
 * `centreX←¯0.6000000000000001` teaches nothing except that a computer was
 * involved.
 */
export function decimalsFor(span: number): number {
  const magnitude = Math.ceil(-Math.log10(Math.max(span, 1e-12)));
  return Math.min(15, Math.max(3, magnitude + 4));
}

function tidy(viewport: Viewport): Viewport {
  const decimals = decimalsFor(viewport.span);
  return {
    centreX: Number(viewport.centreX.toFixed(decimals)),
    centreY: Number(viewport.centreY.toFixed(decimals)),
    span: Number(viewport.span.toFixed(decimals)),
  };
}

function constrain(viewport: Viewport, bounds: ViewportBounds): Viewport {
  // The span is settled first, because it is what the centre has to be
  // sensible for — and because clamping it afterwards would silently widen a
  // view whose centre had already been decided.
  const span = clamp(viewport.span, bounds.span);
  return tidy({
    centreX: clamp(viewport.centreX, bounds.centreX),
    centreY: clamp(viewport.centreY, bounds.centreY),
    span,
  });
}

/**
 * The view that a dragged region asks for.
 *
 * The larger of the two sides sets the new span, so everything inside the
 * rectangle is still in view afterwards. Choosing the smaller one would crop
 * part of what was deliberately selected, and choosing the mean would crop a
 * little of it in one direction — surprising in a way that is hard to name and
 * easy to feel.
 */
export function selectionToViewport(
  current: Viewport,
  selection: SourceRect,
  bounds: ViewportBounds,
): Viewport {
  const u0 = Math.min(selection.u0, selection.u1);
  const u1 = Math.max(selection.u0, selection.u1);
  const v0 = Math.min(selection.v0, selection.v1);
  const v1 = Math.max(selection.v0, selection.v1);

  const centre = planeAt(current, (u0 + u1) / 2, (v0 + v1) / 2);
  const fraction = Math.max(u1 - u0, v1 - v0);

  return constrain({ centreX: centre.x, centreY: centre.y, span: current.span * fraction }, bounds);
}

/** Widens or narrows the view about its own centre. */
export function scaleViewport(current: Viewport, factor: number, bounds: ViewportBounds): Viewport {
  return constrain({ ...current, span: current.span * factor }, bounds);
}

/**
 * Moves the view, in multiples of its own span.
 *
 * Relative to the span rather than absolute, because there is no single fixed
 * step that works across the whole range: 0.01 is a thousandth of the view at
 * the widest setting and five whole views at the narrowest. This is what makes
 * the plane reachable without a pointer — the centre sliders alone cannot pan a
 * deep zoom by any usable amount.
 */
export function panViewport(
  current: Viewport,
  acrossSpans: number,
  downSpans: number,
  bounds: ViewportBounds,
): Viewport {
  return constrain(
    {
      centreX: current.centreX + acrossSpans * current.span,
      centreY: current.centreY + downSpans * current.span,
      span: current.span,
    },
    bounds,
  );
}

/**
 * The view the code currently describes, or null if it no longer describes one.
 *
 * Deliberately more permissive than the sliders, which report a value outside
 * their range as unrepresentable. A view zoomed past what a slider can show is
 * still a perfectly good view, and refusing to read it would make the artwork
 * stop responding at the exact moment someone was getting somewhere.
 */
export function readViewport(code: string, spec: PlaneExploration): Viewport | null {
  const centreX = numberAssignedTo(code, spec.centreXVariable);
  const centreY = numberAssignedTo(code, spec.centreYVariable);
  const span = numberAssignedTo(code, spec.spanVariable);

  if (centreX === null || centreY === null || span === null) return null;
  // A view with no width is not a view, and would make every later fraction
  // collapse onto one point.
  if (!(span > 0)) return null;

  return { centreX, centreY, span };
}

/** Writes a view back into the code, touching only the three assignment lines. */
export function writeViewport(code: string, spec: PlaneExploration, viewport: Viewport): string {
  let updated = code;
  for (const [variable, value] of [
    [spec.centreXVariable, viewport.centreX],
    [spec.centreYVariable, viewport.centreY],
    [spec.spanVariable, viewport.span],
  ] as const) {
    const result = setParameterValue(updated, variable, value);
    if (result.ok) updated = result.code;
  }
  return updated;
}

/**
 * The limits the preset's own controls declare.
 *
 * Taken from the parameters rather than invented here, so a drag can never
 * produce a view the sliders would then refuse to show. A variable with no
 * declared parameter is unbounded, which is the honest reading of silence.
 */
export function viewportBounds(
  parameters: readonly ArtworkParameter[],
  spec: PlaneExploration,
): ViewportBounds {
  const boundsOf = (variable: string): Bounds => {
    const parameter = parameters.find((candidate) => candidate.variable === variable);
    return {
      min: parameter?.min ?? Number.NEGATIVE_INFINITY,
      max: parameter?.max ?? Number.POSITIVE_INFINITY,
    };
  };

  return {
    centreX: boundsOf(spec.centreXVariable),
    centreY: boundsOf(spec.centreYVariable),
    span: boundsOf(spec.spanVariable),
  };
}

export function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.centreX === b.centreX && a.centreY === b.centreY && a.span === b.span;
}

/**
 * The views and ceilings for the iteration review.
 *
 * Kept local to this benchmark rather than added to the algorithm benchmark's
 * `VIEWS`. That list defines the scope of a published comparison, and appending
 * to it would silently enlarge what `npm run benchmark:mandelbrot` measures and
 * make its existing results no longer reproducible.
 *
 * The four views are chosen for how the work is distributed, because that is
 * what an iteration ceiling changes. Raising the ceiling costs nothing where
 * points escape immediately and costs the most where they never escape at all,
 * so the answer is different in each of these and the average of them would
 * hide it.
 */

import { setParameterValues } from '@/editor/parameterBinding';
import { mandelbrotField } from '@/presets/mandelbrot-field';

export interface IterationView {
  readonly id: string;
  readonly label: string;
  /** Why this view is worth timing, and what it is expected to show. */
  readonly rationale: string;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
}

export const VIEWS: readonly IterationView[] = [
  {
    id: 'full-set',
    label: 'Full set',
    rationale: "The preset's own default view: interior, boundary and fast-escaping exterior together.",
    centreX: -0.6,
    centreY: 0,
    zoom: 1.4,
  },
  {
    id: 'boundary-heavy',
    label: 'Boundary heavy',
    rationale:
      'Seahorse valley. Filaments everywhere, so points escape at every count and a higher ceiling has the most to add.',
    centreX: -0.745,
    centreY: 0.1,
    zoom: 0.05,
  },
  {
    id: 'moderate-zoom',
    label: 'Moderate zoom',
    rationale:
      'Where two or three drags on the artwork land: detailed, but not the deepest the slider allows.',
    centreX: -0.748,
    centreY: 0.1,
    zoom: 0.02,
  },
  {
    id: 'mostly-interior',
    label: 'Mostly interior',
    rationale:
      'Inside the main cardioid, where almost nothing escapes. Every extra iteration is paid for and none of it can add detail.',
    centreX: -0.25,
    centreY: 0,
    zoom: 0.15,
  },
];

/** The preset's default resolution, and the maximum it documents as safe. */
export const SIZES: readonly number[] = [128, 144];

/** The current default, and the three candidates. The maximum stays 60. */
export const CEILINGS: readonly number[] = [28, 40, 48, 60];

/**
 * The shipped program, with the view and ceiling written into it.
 *
 * Through `setParameterValues`, which is the same path a slider and a
 * drag-to-zoom use. The point of measuring is to learn what a visitor waits
 * for, and that means running the source they would have on screen rather than
 * an expression written for the benchmark.
 */
export function sourceFor(view: IterationView, size: number, iterations: number): string {
  return setParameterValues(
    mandelbrotField.code,
    new Map<string, number>([
      ['size', size],
      ['iterations', iterations],
      ['centreX', view.centreX],
      ['centreY', view.centreY],
      ['zoom', view.zoom],
    ]),
  );
}

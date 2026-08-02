/**
 * Two ways to count Mandelbrot escape times, for the benchmark to compare.
 *
 * Kept here rather than in `src/presets` on purpose: nothing in the application
 * imports this file, so an experiment cannot leak into the artwork someone sees
 * until a written recommendation says it should.
 *
 * Both must produce the same convention — a `size × size` matrix of counts from
 * 1 to `iterations`, with x across the columns and y down the rows — or the
 * comparison is meaningless. Whether they actually do is the first thing the
 * benchmark measures rather than assumes.
 */

export interface ViewParameters {
  readonly size: number;
  readonly iterations: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
}

export type VariantId = 'full-matrix' | 'active-points';

/** APL writes a negative sign as a high minus, and will not parse an ASCII one. */
function aplNumber(value: number): string {
  return String(value).replace('-', '¯');
}

function controls(view: ViewParameters): string[] {
  return [
    '⍝ Controls',
    `size←${String(view.size)}`,
    `iterations←${String(view.iterations)}`,
    `centreX←${aplNumber(view.centreX)}`,
    `centreY←${aplNumber(view.centreY)}`,
    `zoom←${aplNumber(view.zoom)}`,
    '',
    '⍝ The patch of the plane, as two real matrices. TryAPL rejects complex',
    '⍝ arithmetic, so the real and imaginary parts are carried separately.',
    'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
    'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
  ];
}

/**
 * The implementation the preset ships today.
 *
 * Every point is iterated for the full count, escaped or not. The clamp is what
 * makes that safe: an escaped point's magnitude grows without bound, and an
 * infinity minus an infinity is not-a-number, which would compare false against
 * the escape test and start being counted as inside again.
 *
 * The count is taken before the step, starting from z = 0, so the first test
 * always passes and no cell can come back with less than one.
 */
export function fullMatrixSource(view: ViewParameters): string {
  return [
    ...controls(view),
    'cr←(size,size)⍴ax',
    'ci←⍉(size,size)⍴ay',
    '',
    '⍝ Repeat z←z²+c over the whole grid, counting the steps each point survives.',
    'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}',
    '⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)',
  ].join('\n');
}

/**
 * The alternative: drop escaped points instead of carrying them.
 *
 * The plane is flattened to vectors and `live` holds the indices still being
 * iterated. Each step counts the survivors, then keeps only those, so the work
 * per iteration shrinks as the exterior falls away.
 *
 * No clamp is needed, because an escaped point is removed on the same step that
 * detects it and is never squared again. That is also the one place the two can
 * disagree: the full-matrix version keeps iterating an escaped point with
 * clamped values, and a clamped value can land back inside the escape radius
 * and resume counting. Whether that ever happens in practice is measured rather
 * than argued.
 */
export function activePointsSource(view: ViewParameters): string {
  return [
    ...controls(view),
    'cr←,(size,size)⍴ax',
    'ci←,⍉(size,size)⍴ay',
    '',
    '⍝ Iterate only the points that have not escaped. `live` holds their indices;',
    '⍝ `n` accumulates counts against the whole grid, flat.',
    'step←{(zr zi live n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ n[live]←n[live]+m ⋄ k←⍸m ⋄ (((cr[live]+(zr*2)-zi*2)[k])((ci[live]+2×zr×zi)[k])(live[k])n)}',
    'cells←size×size',
    '(size,size)⍴⊃⌽step⍣iterations⊢(cells⍴0)(cells⍴0)(⍳cells)(cells⍴0)',
  ].join('\n');
}

export function sourceFor(variant: VariantId, view: ViewParameters): string {
  return variant === 'full-matrix' ? fullMatrixSource(view) : activePointsSource(view);
}

export interface ViewKind {
  readonly id: string;
  readonly label: string;
  /** Why this view is worth timing: what it does to the balance of work. */
  readonly rationale: string;
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
}

/**
 * Views chosen for how much of the plane escapes, because that is the whole
 * question. An active-point algorithm wins where points leave early and has
 * nothing to gain where they never leave at all.
 */
export const VIEWS: readonly ViewKind[] = [
  {
    id: 'full-set',
    label: 'Full set',
    rationale: 'The default view. A mixture of interior, boundary and fast-escaping exterior.',
    centreX: -0.6,
    centreY: 0,
    zoom: 1.4,
  },
  {
    id: 'mostly-exterior',
    label: 'Mostly exterior',
    rationale: 'Far from the set, so nearly every point escapes within a few iterations.',
    centreX: 1.2,
    centreY: 1.2,
    zoom: 0.6,
  },
  {
    id: 'boundary-heavy',
    label: 'Boundary heavy',
    rationale: 'Seahorse valley: filaments everywhere, so points escape at every count.',
    centreX: -0.745,
    centreY: 0.1,
    zoom: 0.05,
  },
  {
    id: 'mostly-interior',
    label: 'Mostly interior',
    rationale: 'Inside the main cardioid, where almost nothing escapes and there is nothing to drop.',
    centreX: -0.25,
    centreY: 0,
    zoom: 0.15,
  },
  {
    id: 'deep-zoom',
    label: 'Representative deeper zoom',
    rationale: 'A view of the kind dragging on the artwork produces after a few zooms.',
    centreX: -0.748,
    centreY: 0.1,
    zoom: 0.005,
  },
];

export const SIZES: readonly number[] = [64, 90, 128, 144];
export const CEILINGS: readonly number[] = [16, 28, 40, 60];

export function viewParameters(view: ViewKind, size: number, iterations: number): ViewParameters {
  return { size, iterations, centreX: view.centreX, centreY: view.centreY, zoom: view.zoom };
}

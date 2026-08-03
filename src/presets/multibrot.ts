import source from './apl/multibrot.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Multibrot.
 *
 * Mandelbrot Field with the square taken out of the program and put on a slider.
 * `by` multiplies one (real imaginary) pair by another, and `by⍣(power-1)` applies
 * it that many times — so z is multiplied by itself power−1 times, which is
 * z*power. At `power←2` that is one multiplication and exactly z², which is why
 * this artwork at power 2 is not merely similar to Mandelbrot but identical to it:
 * checked against the live service, all 4,096 cells of a 64² view agree.
 *
 * The exponent could have been done in polar form — modulus to the power, angle
 * times the power — and repeated multiplication was preferred for two reasons. It
 * needs no trigonometry and no quadrant correction, so there is nothing to get
 * subtly wrong near the axes; and it is the same arithmetic Mandelbrot performs,
 * written once and applied a variable number of times, which is what makes the
 * comparison legible.
 *
 * Every integer power from 2 to 8 was run against the live service at 128² and at
 * 144², the resolution maximum this family declares. All of them completed in the
 * same three or four requests as the rest of the family, so nothing about
 * reliability or safe resolution argues for a lower public maximum.
 */
export const multibrot: ArtworkPreset = {
  id: 'multibrot',
  title: 'Multibrot',
  description:
    'Replace the square with another integer power and the familiar Mandelbrot form develops new symmetries.',
  category: 'fractal',
  /*
   * Advanced, where the other three are intermediate. Not because the picture is
   * harder to enjoy but because the program is the hardest in the family to read:
   * it has a helper function, a dyadic dfn, and the power operator doing two
   * different jobs on the same line.
   */
  difficulty: 'advanced',

  code: artworkSource(source),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Resolution',
      description: 'How many rows and columns. Larger takes noticeably longer.',
      type: 'integer',
      min: 32,
      // As the rest of the family: the same 512 KB workspace, and measured to be
      // reachable at every supported power.
      max: 144,
      step: 8,
      defaultValue: 128,
      randomisable: false,
    },
    {
      id: 'iterations',
      variable: 'iterations',
      label: 'Maximum iterations',
      description: 'How long to keep testing each point. Higher shows finer detail but takes longer.',
      type: 'integer',
      min: 8,
      max: 60,
      step: 1,
      defaultValue: 48,
      randomisable: false,
    },
    {
      id: 'power',
      variable: 'power',
      label: 'Power',
      description: 'The exponent in z←z*power+c. Two is the Mandelbrot set; higher adds lobes.',
      /*
       * Integer, and only integer. A fractional exponent has no meaning for
       * repeated multiplication — `⍣2.5` is not half an application — so the
       * control cannot offer one and the program would not know what to do with
       * it. Fractional powers need the polar form and a decision about which
       * branch of the angle to take, which is a different artwork.
       */
      type: 'integer',
      /*
       * Two to eight. Two, because that is the Mandelbrot set and the comparison
       * this artwork is for. Eight, because every power from two to eight was run
       * live at both 128² and 144² and none of them cost more requests or more
       * time than the rest of the family; the range stops there rather than at a
       * measured failure, since the lobes grow narrower and less distinct as the
       * exponent rises and nothing beyond eight adds anything to look at.
       */
      min: 2,
      max: 8,
      step: 1,
      /*
       * Three, kept as the default after looking at 3, 4, 5, 6 and 8 rendered from
       * live output at this view.
       *
       * Four is arguably the prettier shape and five the neatest, but three is the
       * clearest. An exponent of d gives d−1 lobes, and that relation is easiest to
       * see when the first step away from the square shows exactly two: the visitor
       * can then step 3 → 4 → 5 and watch a lobe arrive each time. Three is also
       * one keystroke from the comparison the artwork exists for, and it had the
       * most distinct values of the five (43, against 29 at five and 33 at eight)
       * with the least of the frame at the ceiling, so there is the most to colour.
       */
      defaultValue: 3,
      randomisable: true,
    },
    {
      id: 'centreX',
      variable: 'centreX',
      label: 'Centre across',
      description: 'Moves the view left and right.',
      type: 'number',
      min: -2,
      max: 2,
      // Smaller than the narrowest view it has to move, as in the rest of the
      // family.
      step: 0.001,
      defaultValue: 0,
      randomisable: false,
    },
    {
      id: 'centreY',
      variable: 'centreY',
      label: 'Centre down',
      description: 'Moves the view up and down.',
      type: 'number',
      min: -2,
      max: 2,
      step: 0.001,
      defaultValue: 0,
      randomisable: false,
    },
    {
      id: 'zoom',
      variable: 'zoom',
      label: 'Span',
      description: 'How much of the plane to show. Smaller values zoom in.',
      type: 'number',
      min: 0.002,
      max: 2,
      scale: 'logarithmic',
      /*
       * 1.4, which is Mandelbrot's own span, and left there deliberately after
       * looking at every supported power at it. A tighter frame would suit power
       * three alone; this one holds the whole shape at three and at eight, so
       * moving the exponent never leaves the artwork half outside the frame. That
       * matters more than filling the corners, because moving the exponent is the
       * thing this artwork is for.
       */
      defaultValue: 1.4,
      randomisable: false,
    },
  ],

  /*
   * Ember, which is the one ramp none of the other fractals uses: Mandelbrot and
   * Tricorn share Abyss, Burning Ship has Heat, Julia has Poolrooms. Four fractal
   * thumbnails in a row need to be told apart at a glance.
   *
   * Its pale end lands on the interior, which is the argument Mandelbrot uses
   * Abyss to avoid — a region holding no information rendered as the brightest
   * thing in the frame. It is acceptable here and not there because of what the
   * default view is: a quarter of this frame is interior, with the boundary detail
   * legible around it, where Mandelbrot's default is a zoom in which the ceiling
   * dominates. Abyss remains one click away for anyone who prefers the void.
   */
  defaultPaletteId: 'ember',
  renderMode: 'continuous',

  /*
   * The three view variables, and deliberately not `power`. Dragging changes where
   * you are looking; it must never change which shape you are looking at, and a
   * drag that quietly moved the exponent would be the worst kind of surprise.
   */
  planeExploration: { centreXVariable: 'centreX', centreYVariable: 'centreY', spanVariable: 'zoom' },

  /*
   * One, not zero, as in the rest of the family: the step tests before it updates
   * and the first test is on z = 0, so no cell can come back with less than one.
   */
  valueRange: { min: 1, maxVariable: 'iterations' },

  valueNotes: {
    ceilingVariable: 'iterations',
    cellAtCeiling: 'This point reached the maximum of {ceiling} iterations.',
    viewAtCeiling:
      'Every point in this view reached the current iteration limit. Try moving towards an edge of the shape or increasing the iteration value.',
  },

  primitives: [
    {
      glyph: '⍣',
      name: 'Power operator',
      shortDescription: 'Applies a function a given number of times — here, the exponent itself.',
    },
    { glyph: '⌊', name: 'Minimum', shortDescription: 'The smaller of two numbers, used here to clamp.' },
    { glyph: '⌈', name: 'Maximum', shortDescription: 'The larger of two numbers, used here to clamp.' },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table over its diagonal.' },
    {
      glyph: '∧',
      name: 'And',
      shortDescription: 'True only where both sides are true, used here as a latch.',
    },
    { glyph: '⊃', name: 'First', shortDescription: 'Takes the first item of a list.' },
    { glyph: '⌽', name: 'Reverse', shortDescription: 'Turns a list back to front.' },
  ],

  thumbnailPath: 'thumbnails/multibrot.png',
  fixturePath: 'tests/fixtures/multibrot.json',
  tags: ['fractal', 'iteration', 'complex plane'],

  tryChangingThis: [
    'Set power←2 and compare it with Mandelbrot Field. It is the same picture, cell for cell.',
    'Change power from 3 to 4. Another lobe appears.',
    'Try power←8, then look at how narrow the lobes have become.',
    'Zoom into the join between two lobes.',
    'Read the step line: ⍣(power-1) is the only place the exponent appears.',
  ],
};

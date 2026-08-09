import source from './apl/burning-ship.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Burning Ship.
 *
 * Mandelbrot Field with two extra names in the step, and nothing else changed.
 * Each component is made positive before it is squared — `x←|zr` and `y←|zi` —
 * and that single alteration turns the smooth Mandelbrot boundary into a jagged
 * silhouette with masts. The absolute values are meant to be the visible
 * difference, so they are separate assignments on the step line rather than
 * folded into the arithmetic, and there is no control that switches them on or
 * off: without them this is not a Burning Ship, it is Mandelbrot.
 *
 * The escape test still reads `zr` and `zi` rather than `x` and `y`, which is not
 * an oversight. Squaring discards the sign, so the two are the same magnitude and
 * the shorter form is the one Mandelbrot already uses — leaving it alone keeps the
 * two programs comparable line by line, which is the point of having both.
 *
 * The default view is the ship itself, at a span of 0.06 near ¯1.755, rather than
 * the whole set. The set as a whole is a lopsided blob; the structure the artwork
 * is named for is this small region, and it was chosen by fetching four framings
 * from the live service and looking at them (`scripts/ship-framing.ts`). A wider
 * span put the vessel in an empty sea; a narrower one cut the masts.
 *
 * It arrives the right way up with no help. The axis lines are Mandelbrot's,
 * unchanged, and the imaginary axis already increases down the rows — so the hull
 * sits below the masts because that is where the arithmetic puts it. Nothing
 * flips the image, here or in the renderer, and if a different orientation were
 * ever wanted the `ay` line is where it would have to happen.
 */
export const burningShip: ArtworkPreset = {
  id: 'burning-ship',
  title: 'Burning Ship',
  description:
    'Taking the absolute value of each component before squaring transforms the Mandelbrot calculation into a jagged, ship-like fractal.',
  category: 'fractal',
  difficulty: 'intermediate',

  code: artworkSource(source),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Resolution',
      description: 'How many rows and columns. Larger takes noticeably longer.',
      type: 'integer',
      min: 32,
      // The same arithmetic, the same intermediates and the same 512 KB
      // workspace as the other two fractals, so the same ceiling.
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
      /*
       * Forty-eight, as Mandelbrot and Julia. At the default view this returns
       * 45 distinct values with about a tenth of the frame at the ceiling, which
       * is the balance the iteration measurements argued for: enough range to
       * colour, without the ceiling swallowing the picture.
       */
      defaultValue: 48,
      randomisable: false,
    },
    {
      id: 'centreX',
      variable: 'centreX',
      label: 'Centre across',
      description: 'Moves the view left and right.',
      type: 'number',
      /*
       * Wide enough to reach both ends of what there is to see: the smaller
       * vessels trail away to the left of the default view, and the main body of
       * the set sits to its right, ending around 0.5.
       */
      min: -2.5,
      max: 1,
      // Smaller than the narrowest view it has to move, as in the other two.
      step: 0.001,
      defaultValue: -1.755,
      randomisable: true,
    },
    {
      id: 'centreY',
      variable: 'centreY',
      label: 'Centre down',
      description: 'Moves the view up and down.',
      type: 'number',
      /*
       * Not symmetric about zero in what it contains, unlike Mandelbrot: the
       * shape hangs below the real axis. The range is symmetric anyway, because a
       * control that stopped at the edge of the interesting part would be a
       * statement about taste rather than about the arithmetic.
       */
      min: -1.5,
      max: 1.5,
      step: 0.001,
      defaultValue: -0.02,
      randomisable: true,
    },
    {
      id: 'zoom',
      variable: 'zoom',
      label: 'Span',
      description: 'How much of the plane to show. Smaller values zoom in.',
      type: 'number',
      /*
       * Reaching in both directions from a default that is already close in: 2
       * pulls back to the whole set, and 0.002 is another thirty times deeper.
       * Geometric, because no fixed step is right across a thousandfold range.
       */
      min: 0.002,
      max: 2,
      scale: 'logarithmic',
      defaultValue: 0.06,
      randomisable: true,
    },
  ],

  /*
   * Heat, and it was compared rather than assumed.
   *
   * All eight ramps were drawn on this artwork's own live output at the default
   * view. Abyss suits Mandelbrot because its ceiling is a large uninformative
   * interior that ought to read as a void — but here the ceiling *is* the vessel,
   * and a black hull on blue loses the ship while keeping its rigging. Heat puts
   * its brightest end on the hull and runs the escape bands out through orange
   * into the dark, so the thing reads as a lit shape above dark water, which is
   * both what the numbers say and what the artwork is called.
   */
  defaultPaletteId: 'heat',
  renderMode: 'continuous',
  // The frame is part of the work, so a Focus window shows all of it.
  focusFit: 'contain',

  // Built in exactly the form this declaration promises, which is what lets a
  // dragged region be turned back into three assignments.
  planeExploration: { centreXVariable: 'centreX', centreYVariable: 'centreY', spanVariable: 'zoom' },

  /*
   * One, not zero, for Mandelbrot's reason: the step tests before it updates and
   * the first test is on z = 0, so no cell can come back with less than one. The
   * default view happens to bottom out at four, being far from anything that
   * escapes immediately, but the program's range is what is declared here.
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
      glyph: '|',
      name: 'Magnitude',
      shortDescription: 'Distance from zero, which is what makes this a Burning Ship.',
    },
    {
      glyph: '⍣',
      name: 'Power operator',
      shortDescription: 'Applies a function a given number of times.',
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

  thumbnailPath: 'thumbnails/burning-ship.png',
  fixturePath: 'tests/fixtures/burning-ship.json',
  tags: ['fractal', 'iteration', 'complex plane'],

  tryChangingThis: [
    'Compare the step line with Mandelbrot Field. The two absolute values are the only difference.',
    'Remove the absolute values by using zr and zi in the update. The Mandelbrot set comes back.',
    'Zoom into the lower edge of the main shape.',
    'Increase the iterations around a fine boundary to grow the masts.',
    'Set the span to 2 to see the whole set, which looks nothing like a ship.',
  ],
};

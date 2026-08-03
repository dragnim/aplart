import source from './apl/julia-set.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Julia Set.
 *
 * The same iteration as Mandelbrot Field, with two roles exchanged, and the two
 * programs are kept side by side deliberately so that the exchange can be read.
 * Mandelbrot takes c from the grid and starts every point at zero; here the grid
 * is where z begins and c is one constant the same for every point. Nothing else
 * differs — the same longhand squaring, the same clamp, the same monotonic mask.
 *
 * The span has a lower ceiling than Mandelbrot's, and for a reason that only
 * shows up in this direction. The count adds one for every step a point survives
 * the escape test, and the test happens before the update — so Mandelbrot's
 * first test is always on z = 0 and always passes, which is why no Mandelbrot
 * cell can come back below one. A Julia point starts *at its own coordinate*, so
 * a point further than 2 from the origin has already escaped before the first
 * step and returns zero. At a span of 1.4 the corners of the frame sit at a
 * magnitude of 1.98, just inside; beyond about 1.414 they do not, and the
 * declared range would no longer describe what the program returns. So the span
 * stops at 1.4. Nothing is lost: the set for any c of interest lives well within
 * that, and a wider view is exterior that escapes at once.
 */
export const juliaSet: ArtworkPreset = {
  id: 'julia-set',
  title: 'Julia Set',
  description:
    'The same z²+c as the Mandelbrot set, with the roles swapped: c is fixed and the grid decides where each point starts.',
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
      // As Mandelbrot: the same arithmetic, the same intermediates, and the same
      // 512 KB workspace to hold them in.
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
      id: 'realC',
      variable: 'realC',
      label: 'Real part of c',
      description: 'The constant every point is pulled towards. Small changes reshape the whole set.',
      type: 'number',
      min: -2,
      max: 2,
      /*
       * Fine, because this is the control the artwork is really about. A coarse
       * step would jump between unrelated shapes; at a thousandth, holding an
       * arrow key walks through a family of them.
       */
      step: 0.001,
      defaultValue: -0.8,
      randomisable: true,
    },
    {
      id: 'imagC',
      variable: 'imagC',
      label: 'Imaginary part of c',
      description: 'The other half of the constant. Zero gives a shape symmetric about both axes.',
      type: 'number',
      min: -2,
      max: 2,
      step: 0.001,
      defaultValue: 0.156,
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
      // Smaller than the narrowest view it has to move, as in Mandelbrot.
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
      /*
       * 1.4, not 2. Past about 1.414 the corners of the frame start further than
       * 2 from the origin, and a point that starts outside the escape radius has
       * escaped before the first step — it returns zero, below the range this
       * preset declares. See the note at the top of this file.
       */
      max: 1.4,
      scale: 'logarithmic',
      // Chosen by looking at 0.8, 1.0, 1.2, 1.3 and 1.4 rendered from live
      // output: below 1.2 the arms run off the frame, and 1.4 leaves the set
      // small in a large field of exterior.
      defaultValue: 1.3,
      randomisable: false,
    },
  ],

  /*
   * Poolrooms, and not Abyss — which is the opposite of what inheriting
   * Mandelbrot's default would have given.
   *
   * All eight named ramps were rendered on this artwork's own fixture in Pixel
   * mode and looked at. Abyss ends at black, which suits Mandelbrot because its
   * ceiling is a large solid interior and the detail worth seeing is the
   * boundary around it. This set is almost entirely boundary: a thin dendrite,
   * and a black dendrite on a bright blue field loses both the shape's own edge
   * and the halo of escape bands just outside it, while most of the canvas
   * becomes flat exterior.
   *
   * Poolrooms puts the pale end where the surviving points are, so the dendrite
   * reads as a form and the bands around it stay visible. Its cyan is also
   * clearly not Mandelbrot's blue-and-black at gallery size, which matters: two
   * fractal thumbnails that look alike teach nothing about the difference
   * between the programs.
   */
  defaultPaletteId: 'poolrooms',
  renderMode: 'continuous',

  /*
   * Only the three view variables. `realC` and `imagC` are deliberately absent:
   * dragging changes where you are looking, never which Julia set you are
   * looking at.
   */
  planeExploration: { centreXVariable: 'centreX', centreYVariable: 'centreY', spanVariable: 'zoom' },

  valueRange: { min: 1, maxVariable: 'iterations' },

  valueNotes: {
    ceilingVariable: 'iterations',
    /*
     * "Did not escape within" — not "is inside the set". The count stopped; it
     * proved nothing. A point that would have escaped on the next step is
     * indistinguishable here from one that never escapes, and for a Julia set
     * the distinction is not academic: the boundary is where the interesting
     * points are.
     */
    cellAtCeiling: 'This point did not escape within {ceiling} iterations.',
    viewAtCeiling:
      'Every point in this view reached the current iteration limit. Try moving towards an edge of the set or increasing the iteration value.',
  },

  primitives: [
    {
      glyph: '⍣',
      name: 'Power operator',
      shortDescription: 'Applies a function a given number of times.',
    },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table over its diagonal.' },
    {
      glyph: '∧',
      name: 'And',
      shortDescription: 'True only where both sides are true, used here as a latch.',
    },
    { glyph: '⌊', name: 'Minimum', shortDescription: 'The smaller of two numbers, used here to clamp.' },
    { glyph: '⌈', name: 'Maximum', shortDescription: 'The larger of two numbers, used here to clamp.' },
    { glyph: '⊃', name: 'First', shortDescription: 'Takes the first item of a list.' },
    { glyph: '⌽', name: 'Reverse', shortDescription: 'Turns a list back to front.' },
  ],

  thumbnailPath: 'thumbnails/julia-set.png',
  fixturePath: 'tests/fixtures/julia-set.json',
  tags: ['fractal', 'iteration', 'complex plane'],

  tryChangingThis: [
    'Change the real part of c slightly. The whole shape reorganises.',
    'Set realC←0 and imagC←0 for the one case you can predict: a filled circle.',
    'Try realC←¯1 and imagC←0, which breaks the set into a chain of blobs.',
    'Compare the last two lines with Mandelbrot Field. The grid starts z here, and c is a constant.',
    'Raise the iterations near a detailed edge to grow finer filaments.',
  ],
};

import source from './apl/tricorn.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Tricorn.
 *
 * Mandelbrot Field with one minus sign. Where Mandelbrot's step ends
 * `ci+2×zr×zi`, this ends `ci-2×zr×zi`, and that is the entire difference:
 * negating the imaginary part before squaring is conjugating z, and conjugating z
 * turns the familiar boundary into a three-cornered one. There is no control for
 * it, because a control would need a second version of the formula and the sign
 * would stop being the thing a reader can see.
 *
 * It is the smallest difference in the family and the one most worth having beside
 * the others: Burning Ship adds two operations, Julia exchanges two roles, and
 * this changes a single character.
 *
 * Unlike Burning Ship, the default view is the whole set. The three-fold form is
 * the shape of the set itself rather than a detail inside it, so there is nothing
 * to zoom into to see what the artwork is called.
 *
 * The set is symmetric about the real axis, so nothing here depends on which way
 * the imaginary axis runs — the axis lines are Mandelbrot's, untouched, and the
 * picture would be the same if they ran the other way. There is nothing to flip
 * and nothing flipping it.
 */
export const tricorn: ArtworkPreset = {
  id: 'tricorn',
  title: 'Tricorn',
  description:
    'Reversing the sign of the imaginary update creates a three-fold relative of the Mandelbrot set.',
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
      // The same arithmetic and the same 512 KB workspace as the rest of the
      // family, so the same ceiling.
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
      id: 'centreX',
      variable: 'centreX',
      label: 'Centre across',
      description: 'Moves the view left and right.',
      type: 'number',
      min: -2.5,
      max: 1,
      // Smaller than the narrowest view it has to move, as in the rest of the
      // family.
      step: 0.001,
      defaultValue: -0.25,
      randomisable: true,
    },
    {
      id: 'centreY',
      variable: 'centreY',
      label: 'Centre down',
      description: 'Moves the view up and down.',
      type: 'number',
      min: -1.5,
      max: 1.5,
      step: 0.001,
      defaultValue: 0,
      randomisable: true,
    },
    {
      id: 'zoom',
      variable: 'zoom',
      label: 'Span',
      description: 'How much of the plane to show. Smaller values zoom in.',
      type: 'number',
      /*
       * Geometric across a thousandfold range, because no fixed step is right
       * across it: at the widest a single arrow key should move the view a little,
       * and at the deepest it must not throw away a carefully chosen one.
       */
      min: 0.002,
      max: 2,
      scale: 'logarithmic',
      /*
       * 1.5, chosen by fetching four full views from the live service and looking
       * at them. At 1.2 the two right-hand horns run out of the frame; at 1.8 and
       * 2 the shape sits small in a wide field of exterior. See
       * `npm run preset:framing`.
       */
      defaultValue: 1.5,
      randomisable: true,
    },
  ],

  /*
   * Abyss, and deliberately the same ramp as Mandelbrot Field.
   *
   * The other fractals were given palettes that set them apart. This one is the
   * opposite case: its whole claim is that it differs from Mandelbrot by a single
   * character, and holding the colours constant is what makes the shape the only
   * difference between the two thumbnails. Comparison is the lesson, so the
   * resemblance is the point.
   *
   * It is also the right ramp on its own merits, for Mandelbrot's reason. The
   * interior is a solid region of cells that never escaped, which is the one part
   * of the image holding no information; Abyss ends at black, so it reads as a
   * void rather than as detail that is not there.
   *
   * Julia was given a different ramp from Mandelbrot's on the argument that two
   * fractal thumbnails which look alike teach nothing — so this needs squaring
   * with that. Julia is almost entirely boundary: a thin dendrite, which Abyss
   * draws as black on blue and loses. It needed the pale end where its surviving
   * points are, and distinctness came with that. This artwork is a solid shape
   * whose silhouette reads clearly here, so nothing is lost by sharing the ramp —
   * and what is gained is that the two pictures differ only where the programs do.
   */
  defaultPaletteId: 'abyss',
  renderMode: 'continuous',

  // Built in exactly the form this declaration promises, which is what lets a
  // dragged region be turned back into three assignments.
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

  thumbnailPath: 'thumbnails/tricorn.png',
  fixturePath: 'tests/fixtures/tricorn.json',
  tags: ['fractal', 'iteration', 'complex plane'],

  tryChangingThis: [
    'Compare the imaginary update with Mandelbrot Field. One minus sign is the whole difference.',
    'Change that minus back to a plus. The Mandelbrot set returns.',
    'Zoom into one of the three main branches.',
    'Increase the iterations around the boundary to sharpen its edge.',
  ],
};

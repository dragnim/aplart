import source from './apl/sierpinski-array.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Sierpiński Array.
 *
 * Built from a property of binary numbers rather than by subdividing
 * triangles: a cell is filled when its row and column numbers share no binary
 * digit. The whole fractal falls out of one inner product.
 *
 * The bit depth is fixed at 16 rather than derived from the size. Deriving it
 * would need the largest value after the repeat multiplier is applied, and
 * sixteen bits covers every value the controls can reach with no measurable
 * cost.
 */
export const sierpinskiArray: ArtworkPreset = {
  id: 'sierpinski-array',
  title: 'Sierpiński Array',
  description:
    'The Sierpiński triangle, found in binary. A cell is filled when its row and column numbers share no binary digit.',
  category: 'fractal',
  difficulty: 'intermediate',

  code: artworkSource(source),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Size',
      description: 'How many rows and columns. Powers of two give the cleanest triangles.',
      type: 'integer',
      min: 8,
      max: 88,
      step: 1,
      defaultValue: 64,
      randomisable: true,
    },
    {
      id: 'repeats',
      variable: 'repeats',
      label: 'Repetition',
      description: 'Scales the numbers before they are read in binary, tiling the fractal.',
      type: 'integer',
      min: 1,
      max: 6,
      step: 1,
      defaultValue: 1,
      randomisable: true,
    },
    {
      id: 'invert',
      variable: 'invert',
      label: 'Invert',
      description: 'Swaps filled cells for empty ones.',
      type: 'boolean',
      defaultValue: false,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'neon',
  renderMode: 'binary',
  // The frame is part of the work, so a Focus window shows all of it.
  focusFit: 'contain',

  primitives: [
    { glyph: '⊤', name: 'Encode', shortDescription: 'Writes numbers in another base — here, binary.' },
    {
      glyph: '+.×',
      name: 'Inner product',
      shortDescription: 'Matrix multiplication. Here it counts the binary digits two numbers share.',
    },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table over its diagonal.' },
    { glyph: '≠', name: 'Not equal', shortDescription: 'On zeros and ones this is exclusive or.' },
    { glyph: '¯', name: 'High minus', shortDescription: 'Marks a negative number, as in ¯1.' },
  ],

  thumbnailPath: 'thumbnails/sierpinski-array.png',
  fixturePath: 'tests/fixtures/sierpinski-array.json',
  tags: ['fractal', 'binary', 'self-similar'],

  tryChangingThis: [
    'Set the size to exactly 64, then to 65, and see how much the triangle depends on powers of two.',
    'Turn Invert on. The holes become the shape.',
    'Set the repetition to 2 or 3 to tile the fractal.',
    'Change 16 to 4 in the bits line and watch the pattern wrap.',
    'Try the Forest palette for something quieter.',
  ],
};

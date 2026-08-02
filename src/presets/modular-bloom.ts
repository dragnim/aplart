import source from './apl/modular-bloom.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Modular Bloom.
 *
 * A multiplication table folded by a modulus. The whole artwork is one
 * expression, and the flower-like structure is a property of the arithmetic
 * rather than anything the renderer adds.
 *
 * Verified against the live TryAPL service at every corner of its parameter
 * ranges; the slowest run measured 145 ms.
 */
export const modularBloom: ArtworkPreset = {
  id: 'modular-bloom',
  title: 'Modular Bloom',
  description:
    'A multiplication table folded by a modulus. Small changes to the modulus reorganise the whole pattern.',
  category: 'geometry',
  difficulty: 'beginner',

  code: artworkSource(source),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Size',
      description: 'How many rows and columns the artwork has.',
      type: 'integer',
      min: 8,
      max: 88,
      step: 1,
      defaultValue: 64,
      randomisable: true,
    },
    {
      id: 'modulus',
      variable: 'modulus',
      label: 'Modulus',
      description: 'The number the table is folded by. Primes give the most intricate patterns.',
      type: 'integer',
      min: 2,
      max: 24,
      step: 1,
      defaultValue: 17,
      randomisable: true,
    },
    {
      id: 'multiplier',
      variable: 'multiplier',
      label: 'Multiplier',
      description: 'Scales the table before folding, which rotates the pattern through itself.',
      type: 'integer',
      min: 1,
      max: 16,
      step: 1,
      defaultValue: 1,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'ember',
  renderMode: 'continuous',

  primitives: [
    { glyph: '⍳', name: 'Index generator', shortDescription: 'Counts one, two, three, up to a number.' },
    {
      glyph: '∘.×',
      name: 'Outer product',
      shortDescription: 'Multiplies every item on the left by every item on the right, making a table.',
    },
    {
      glyph: '⍨',
      name: 'Selfie',
      shortDescription: 'Uses the same value on both sides, so the table is multiplied against itself.',
    },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    { glyph: '×', name: 'Times', shortDescription: 'Ordinary multiplication, applied to the whole array.' },
  ],

  thumbnailPath: 'thumbnails/modular-bloom.png',
  fixturePath: 'tests/fixtures/modular-bloom.json',
  featured: true,
  tags: ['multiplication', 'modular arithmetic', 'symmetry'],

  tryChangingThis: [
    'Drop the modulus from 17 to 9 and watch the rings break into a tighter grid.',
    'Try 12 instead of 17. Numbers with many factors give much plainer patterns than primes.',
    'Set the multiplier to 7 for a sheared, off-axis version.',
    'Replace × with + in the last line for something much calmer.',
    'Switch to the Poolrooms palette and invert it.',
  ],
};

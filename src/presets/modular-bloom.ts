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

  /*
   * The artwork somebody meets first.
   *
   * Chosen for this over the other ten because its three parameters each change
   * the picture in a way you can name without mentioning APL, because it opens in
   * Ember so the interface arrives in APL Art's own colours, and because 64×64 is
   * one quick request.
   *
   * The labels come from watching the artwork rather than from reading the code.
   * A higher `multiplier` makes the pattern finer and busier, so that is
   * Complexity. A higher `modulus` makes each bloom *larger* and therefore fewer
   * of them — the opposite of what "complexity" would suggest — so that is Scale.
   * `size` is how many cells the pattern is drawn from, which is Detail.
   *
   * Ranges are narrower than the parameters allow, deliberately. Below a modulus
   * of five there are too few values to shade a bloom; above a multiplier of
   * twelve the grid speckles; and `size` is a cost as much as a look, so Play
   * stays between 32 and 72 while the workspace keeps all of 8–88.
   */
  instantPlay: {
    controls: [
      {
        parameterId: 'multiplier',
        label: 'Complexity',
        description: 'How intricate the pattern becomes, from open blooms to a fine lattice.',
        range: { min: 1, max: 12 },
        endpoints: { low: 'Calm', high: 'Intricate' },
      },
      {
        parameterId: 'modulus',
        label: 'Scale',
        description: 'How large each bloom is. Larger blooms mean fewer of them.',
        range: { min: 5, max: 24 },
        endpoints: { low: 'Small', high: 'Large' },
      },
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the pattern is drawn from.',
        range: { min: 32, max: 72 },
        endpoints: { low: 'Bold', high: 'Fine' },
      },
    ],

    /*
     * Eight places worth standing, looked at side by side against the live
     * service before being written down. They run from calm concentric rings to a
     * dense woven lattice, and from a few large blooms to many small ones.
     *
     * Two use a multiplier of one, which is the preset's own default and the
     * quietest thing it draws; the rest sit above it, so opening twice rarely
     * gives the same character twice. None pairs a high multiplier with a small
     * modulus, which is the one corner of this space that turns to noise.
     */
    recipes: [
      {
        id: 'calm-rings',
        values: { multiplier: 1, modulus: 19, size: 56 },
        drift: { modulus: 2, size: 8 },
      },
      {
        id: 'small-blooms',
        values: { multiplier: 1, modulus: 7, size: 48 },
        drift: { modulus: 2, size: 8 },
      },
      {
        id: 'star-centres',
        values: { multiplier: 2, modulus: 15, size: 56 },
        drift: { modulus: 2, size: 8 },
      },
      {
        id: 'woven-crosses',
        values: { multiplier: 3, modulus: 17, size: 64 },
        drift: { modulus: 3, size: 8 },
      },
      {
        id: 'bold-tiles',
        values: { multiplier: 3, modulus: 11, size: 40 },
        drift: { modulus: 2, size: 4 },
      },
      {
        id: 'snowflakes',
        values: { multiplier: 5, modulus: 19, size: 64 },
        drift: { modulus: 3, size: 8 },
      },
      {
        id: 'fine-lattice',
        values: { multiplier: 7, modulus: 21, size: 64 },
        drift: { modulus: 2, size: 8 },
      },
      {
        id: 'dense-weave',
        values: { multiplier: 11, modulus: 23, size: 72 },
        drift: { modulus: 1, size: 8 },
      },
    ],
  },

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

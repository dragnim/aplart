import source from './apl/basket-weave.apl?raw';
import { artworkSource } from './artworkSource';
import { tilePeriodRule } from './createQuality';
import { type ArtworkPreset } from './schema';

const STRAP = { min: 6, max: 24, step: 2 };
const DETAIL = { min: 48, max: 120 };

/**
 * Basket Weave.
 *
 * Straps laid over and under each other, which is one line of arithmetic: the
 * parity of a block decides which way its strap runs, and a sine across the
 * strap does the shading that makes it look like it passes over its neighbour.
 *
 * Seamless by construction. The pattern repeats every two strap widths, so a
 * grid that is a whole number of those across joins its own copy exactly —
 * verified at zero difference across the wrap, not merely by eye.
 */
export const basketWeave: ArtworkPreset = {
  id: 'basket-weave',
  title: 'Basket Weave',
  description:
    'Straps woven over and under, shaded across their width. The whole weave is the parity of one sum.',
  category: 'pattern',
  difficulty: 'beginner',

  code: artworkSource(source),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Size',
      description: 'How many rows and columns the artwork has.',
      type: 'integer',
      min: DETAIL.min,
      max: DETAIL.max,
      step: 12,
      defaultValue: 96,
      randomisable: true,
    },
    {
      id: 'width',
      variable: 'width',
      label: 'Strap width',
      description: 'How wide each strap is, in cells. The pattern repeats every two of them.',
      type: 'integer',
      min: STRAP.min,
      max: STRAP.max,
      step: STRAP.step,
      defaultValue: 12,
      randomisable: true,
    },
    {
      id: 'relief',
      variable: 'relief',
      label: 'Relief',
      description: 'How sharply each strap is shaded, which is how raised the weave looks.',
      type: 'integer',
      min: 1,
      max: 5,
      step: 1,
      defaultValue: 3,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'ember',
  renderMode: 'continuous',

  /*
   * Three controls, and the third is the one that surprises people: the same
   * weave at relief 1 is flat ribbon and at relief 5 is deep cord.
   *
   * The strap width carries the scale, from a fine textile at six cells to a
   * bold graphic at twenty-four. Both ends are worth having, which is why the
   * range is the parameter's own rather than a narrowing of it.
   */
  instantPlay: {
    quality: tilePeriodRule({
      size: 'size',
      period: (values) => 2 * ((values.get('width') as number) ?? 0),
      sizeRange: DETAIL,
      periodVariable: 'width',
      periodRange: STRAP,
    }),

    controls: [
      {
        parameterId: 'width',
        label: 'Strap width',
        description: 'How wide each strap is, from a fine textile to a bold weave.',
        range: { min: STRAP.min, max: STRAP.max },
        endpoints: { low: 'Fine', high: 'Bold' },
      },
      {
        parameterId: 'relief',
        label: 'Relief',
        description: 'How raised the straps look where they cross.',
        range: { min: 1, max: 5 },
        endpoints: { low: 'Flat', high: 'Deep' },
      },
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the weave is drawn from.',
        range: { min: DETAIL.min, max: DETAIL.max },
        endpoints: { low: 'Coarse', high: 'Fine' },
      },
    ],

    /*
     * Five weaves, each a whole number of straps across so every one of them
     * repeats without a seam. Drift is on the grid alone: the strap width is
     * what the artwork *is* at any setting, and wandering off it would change
     * the piece rather than vary it.
     */
    recipes: [
      { id: 'classic-basket', values: { width: 12, relief: 3, size: 96 } },
      { id: 'fine-textile', values: { width: 6, relief: 3, size: 96 } },
      { id: 'flat-ribbon', values: { width: 12, relief: 1, size: 96 } },
      { id: 'deep-cord', values: { width: 8, relief: 5, size: 96 } },
      { id: 'broad-strap', values: { width: 20, relief: 4, size: 120 } },
    ],
  },

  primitives: [
    { glyph: '⌊', name: 'Floor', shortDescription: 'Rounds down, which is how a cell finds its block.' },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    {
      glyph: '1○',
      name: 'Sine',
      shortDescription: 'The sine of a number, used here to shade across a strap.',
    },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table, turning rows into columns.' },
    { glyph: '~', name: 'Not', shortDescription: 'Swaps ones and zeros, so the other strap takes over.' },
  ],

  thumbnailPath: 'thumbnails/basket-weave.png',
  fixturePath: 'tests/fixtures/basket-weave.json',

  tags: ['weave', 'textile', 'seamless', 'tileable'],

  tryChangingThis: [
    'Set the relief to 1. The straps flatten into plain ribbon.',
    'Try a strap width of 6 for a fine textile, or 24 for a bold graphic.',
    'Swap the 1○ for 2○ and the shading moves a quarter turn along each strap.',
    'Remove the ~ and both straps run the same way, which is a grid rather than a weave.',
    'Switch to the Mono palette for something that looks like woven paper.',
  ],
};

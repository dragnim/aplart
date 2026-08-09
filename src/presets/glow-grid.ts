import source from './apl/glow-grid.apl?raw';
import { artworkSource } from './artworkSource';
import { tilePeriodRule } from './createQuality';
import { type ArtworkPreset } from './schema';

const SPACING = { min: 9, max: 27, step: 3 };
const DETAIL = { min: 54, max: 126 };

/**
 * Glow Grid.
 *
 * Named for what it is rather than for what it nearly is. The prototype behind
 * this was a hexagonal lattice, and it was not one: offsetting every other row
 * by half a cell gives a staggered grid that reads as columns of dots, which is
 * a true thing to draw and a false thing to call hexagonal.
 *
 * Every third row steps a third of a cell instead, so the orbs run in diagonals
 * and the lattice repeats over three rows. That is both better looking and
 * honestly describable — and it keeps the period rational, which a real
 * hexagonal lattice does not.
 *
 * Seamless by construction: the period is three rows of cells, and a grid that
 * is a whole number of those across joins its own copy exactly.
 */
export const glowGrid: ArtworkPreset = {
  id: 'glow-grid',
  title: 'Glow Grid',
  description:
    'Orbs on a staggered lattice, each fading to nothing at its cell edge. Every third row steps sideways.',
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
      min: DETAIL.min,
      max: DETAIL.max,
      step: 9,
      defaultValue: 108,
      randomisable: true,
    },
    {
      id: 'spacing',
      variable: 'spacing',
      label: 'Spacing',
      description: 'How far apart the orbs sit, in cells. The lattice repeats every three rows of them.',
      type: 'integer',
      min: SPACING.min,
      max: SPACING.max,
      step: SPACING.step,
      defaultValue: 18,
      randomisable: true,
    },
    {
      id: 'glow',
      variable: 'glow',
      label: 'Glow',
      description: 'How quickly each orb fades outwards, from a soft haze to a hard dot.',
      type: 'integer',
      min: 1,
      max: 5,
      step: 1,
      defaultValue: 3,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'poolrooms',
  renderMode: 'continuous',
  // A seamless surface: it fills a Focus window and runs off the edges.
  focusFit: 'cover',

  /*
   * Two controls carry this artwork and they pull in opposite directions:
   * spacing sets how many orbs there are, glow sets how much of the cell each
   * one fills. Wide spacing with a soft glow is a night sky; tight spacing with
   * a hard glow is a perforated sheet.
   */
  instantPlay: {
    quality: tilePeriodRule({
      size: 'size',
      period: (values) => 3 * ((values.get('spacing') as number) ?? 0),
      sizeRange: DETAIL,
      periodVariable: 'spacing',
      periodRange: SPACING,
    }),

    controls: [
      {
        parameterId: 'spacing',
        label: 'Spacing',
        description: 'How far apart the orbs sit.',
        range: { min: SPACING.min, max: SPACING.max },
        endpoints: { low: 'Close', high: 'Far' },
      },
      {
        parameterId: 'glow',
        label: 'Glow',
        description: 'How softly each orb fades outwards.',
        range: { min: 1, max: 5 },
        endpoints: { low: 'Soft', high: 'Hard' },
      },
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the lattice is drawn from.',
        range: { min: DETAIL.min, max: DETAIL.max },
        endpoints: { low: 'Coarse', high: 'Fine' },
      },
    ],

    /*
     * Four lattices, each a whole number of three-row periods across. The
     * spacing is held rather than drifted: it decides how many orbs there are,
     * and a step of three either way is a different artwork rather than a
     * variation of this one.
     */
    recipes: [
      { id: 'soft-lattice', values: { spacing: 18, glow: 3, size: 108 } },
      { id: 'night-sky', values: { spacing: 27, glow: 2, size: 81 } },
      { id: 'perforated', values: { spacing: 9, glow: 5, size: 108 } },
      { id: 'close-haze', values: { spacing: 12, glow: 1, size: 108 } },
    ],
  },

  primitives: [
    {
      glyph: '⌊',
      name: 'Floor',
      shortDescription: 'Rounds down, which is how a cell finds its row of orbs.',
    },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table, turning rows into columns.' },
    {
      glyph: '*',
      name: 'Power',
      shortDescription: 'Raises to a power, which is what bends the fade into a glow.',
    },
    {
      glyph: '⌈',
      name: 'Maximum',
      shortDescription: 'The larger of two numbers, used here to clip at zero.',
    },
  ],

  thumbnailPath: 'thumbnails/glow-grid.png',
  fixturePath: 'tests/fixtures/glow-grid.json',
  tags: ['lattice', 'orbs', 'seamless', 'tileable'],

  tryChangingThis: [
    'Set the glow to 1 for a soft haze, or 5 for hard dots.',
    'Change the 3 in the step line to 2 and the lattice becomes columns instead of diagonals.',
    'Raise the spacing to 27 for a night sky, or drop it to 9 for a perforated sheet.',
    'Remove the ×spacing÷3 and every row lines up, which is an ordinary square grid.',
    'Switch to the Sunset palette for something that looks like warm lamplight.',
  ],
};

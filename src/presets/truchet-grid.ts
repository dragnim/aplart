import { type ArtworkPreset } from './schema';

/**
 * Truchet Grid.
 *
 * Each cell is assigned a tile class by hashing its position, so the layout
 * looks scattered while being completely determined by the seed. That matters
 * for sharing: the same link must always draw the same picture, and TryAPL's
 * roll would not give that.
 *
 * The APL emits a tile class per cell; the renderer turns each class into a
 * quarter-arc or a diagonal. Which motif belongs to which class is a rendering
 * decision, so the preset does not know or care.
 */
export const truchetGrid: ArtworkPreset = {
  id: 'truchet-grid',
  title: 'Truchet Grid',
  description:
    'Curved tiles scattered by hashing each position, joining into paths that wander across the whole piece. Nothing is random: the same seed always gives the same tiling.',
  category: 'pattern',
  difficulty: 'intermediate',

  code: [
    '⍝ Controls',
    'size←20',
    'seed←7',
    'classes←2',
    '',
    '⍝ Hash each cell position into a tile class.',
    '⍝ Sine of a large angle is what does the scrambling. Multiplying the row',
    '⍝ and column numbers together looks random but is not: the step along a',
    '⍝ row is fixed, so whenever it lands near a whole number the whole row',
    '⍝ comes out almost constant and a band appears across the tiling.',
    'angle←(12.9898×⍳size)∘.+(78.233×⍳size)+seed×0.6180339887',
    'classes|⌊classes×1|43758.5453×1○angle',
  ].join('\n'),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Size',
      description: 'How many tiles across and down.',
      type: 'integer',
      min: 8,
      max: 88,
      step: 1,
      // Twenty tiles across, rather than twenty-eight. The point of a Truchet
      // tiling is that you can follow a path through it, and that needs tiles
      // large enough to see one arc at a time.
      defaultValue: 20,
      randomisable: true,
    },
    {
      id: 'seed',
      variable: 'seed',
      label: 'Seed',
      description: 'Chooses the arrangement. The same seed always gives the same tiling.',
      type: 'integer',
      min: 1,
      max: 999,
      step: 1,
      defaultValue: 7,
      randomisable: true,
    },
    {
      id: 'classes',
      variable: 'classes',
      label: 'Tile shapes',
      description: 'Two gives the classic flowing curves. Three and four add diagonals that cut across them.',
      type: 'integer',
      min: 2,
      /*
       * Four, not eight.
       *
       * There are four motifs, and the renderer picks one with the class
       * modulo four — so class 4 draws the same shape as class 0. Asking for
       * more than four never added a shape; it only changed how often the four
       * came up, and eight gave each of them exactly a quarter, which is
       * statistically the same artwork as four. Looking at 2 through 8 side by
       * side at two seeds confirmed it: the last four are indistinguishable.
       *
       * The old range was made to look meaningful by tinting the ground per
       * class, which drew a grid of squares over the tiling. With that gone the
       * control has to be honest about what it can actually do.
       */
      max: 4,
      step: 1,
      defaultValue: 2,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'mono',
  // Tile motifs rather than coloured cells. A Truchet tiling is a grid of
  // shapes whose edges line up, so the curves run on across tile boundaries;
  // a flat colour per cell cannot show that at all.
  renderMode: 'tiles',

  primitives: [
    {
      glyph: '∘.+',
      name: 'Outer sum',
      shortDescription: 'Adds every item on the left to every item on the right, making a table.',
    },
    {
      glyph: '○',
      name: 'Circle functions',
      shortDescription: 'A family of trigonometric functions. 1○ is sine.',
    },
    {
      glyph: '|',
      name: 'Residue',
      shortDescription:
        'The remainder after dividing. Used twice here: once to take a fraction, once to pick a tile.',
    },
    { glyph: '⌊', name: 'Floor', shortDescription: 'Rounds down to a whole number.' },
    { glyph: '⍳', name: 'Index generator', shortDescription: 'Counts one, two, three, up to a number.' },
  ],

  thumbnailPath: 'thumbnails/truchet-grid.png',
  fixturePath: 'tests/fixtures/truchet-grid.json',
  tags: ['tiles', 'deterministic randomness', 'hashing'],

  tryChangingThis: [
    'Change the seed. Every value gives a completely different arrangement.',
    'Raise the tile shapes to 3 or 4 to cut diagonals across the curves.',
    'Try 4 shapes with the Sunset palette.',
    'Delete the 1○ so the angle is used directly. The scrambling collapses and the rows start to repeat.',
    'Go back to the same seed and confirm you get the same picture.',
  ],
};

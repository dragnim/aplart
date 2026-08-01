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
    'Curved tiles laid at random, joining into paths that wander across the whole piece. The same seed always gives the same tiling.',
  category: 'pattern',
  difficulty: 'intermediate',

  code: [
    '⍝ Controls',
    'size←20',
    'seed←7',
    'density←2',
    '',
    '⍝ Hash each cell position into a tile class.',
    '⍝ Sine of a large angle is what does the scrambling. Multiplying the row',
    '⍝ and column numbers together looks random but is not: the step along a',
    '⍝ row is fixed, so whenever it lands near a whole number the whole row',
    '⍝ comes out almost constant and a band appears across the tiling.',
    'angle←(12.9898×⍳size)∘.+(78.233×⍳size)+seed×0.6180339887',
    'density|⌊density×1|43758.5453×1○angle',
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
      id: 'density',
      variable: 'density',
      label: 'Tile classes',
      description:
        'How many tile shapes are used. Two gives the classic flowing curves; more adds diagonals that cut across them.',
      type: 'integer',
      min: 2,
      max: 8,
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
    'Try 8 shapes with the Sunset palette.',
    'Delete the 1○ so the angle is used directly. The scrambling collapses and the rows start to repeat.',
    'Go back to the same seed and confirm you get the same picture.',
  ],
};

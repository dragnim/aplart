import { type ArtworkPreset } from './schema';

/**
 * Truchet Grid.
 *
 * Each cell is assigned a tile class by hashing its position, so the layout
 * looks scattered while being completely determined by the seed. That matters
 * for sharing: the same link must always draw the same picture, and TryAPL's
 * roll would not give that.
 *
 * The MVP renders tile classes as cell colours rather than drawing motifs.
 * Motif rendering is a renderer feature, not a preset one, and the matrix this
 * produces is already the right input for it.
 */
export const truchetGrid: ArtworkPreset = {
  id: 'truchet-grid',
  title: 'Truchet Grid',
  description:
    'A scattered field of tile classes. The seed decides the arrangement, so the same seed always gives the same tiling.',
  category: 'pattern',
  difficulty: 'intermediate',

  code: [
    '⍝ Controls',
    'size←28',
    'seed←7',
    'density←4',
    '',
    '⍝ Hash each cell position into a tile class.',
    '⍝ The multipliers are irrational, so the sequence never settles into a cycle.',
    'density|⌊10000×1|(seed×0.6180339887)+(⍳size)∘.×(⍳size)×0.7548776662',
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
      defaultValue: 28,
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
      description: 'How many different tiles are used. Two gives the sparsest look.',
      type: 'integer',
      min: 2,
      max: 8,
      step: 1,
      defaultValue: 4,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'mono',
  // Continuous, not indexed: with four tile classes, indexing an eight-step
  // ramp directly would only ever reach its darkest half.
  renderMode: 'continuous',

  primitives: [
    {
      glyph: '∘.×',
      name: 'Outer product',
      shortDescription: 'Multiplies every item on the left by every item on the right.',
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
    'Set the tile classes to 2 for a stark two-colour scatter.',
    'Set them to 8 and switch to the Sunset palette.',
    'Change 0.7548776662 to 0.5 and watch the randomness collapse into stripes.',
    'Go back to the same seed and confirm you get the same picture.',
  ],
};

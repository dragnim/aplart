import source from './apl/checker-shift.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

/**
 * Checker Shift.
 *
 * The gentlest introduction in the gallery: add the row number to the column
 * number, fold the result by a repeat, and a diagonal weave appears. Setting
 * the offset to zero collapses it to plain stripes, which makes the role of
 * each control obvious.
 */
export const checkerShift: ArtworkPreset = {
  id: 'checker-shift',
  title: 'Checker Shift',
  description: 'Row plus column, folded by a repeat. The offset shears the stripes into a diagonal weave.',
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
      min: 8,
      max: 88,
      step: 1,
      defaultValue: 32,
      randomisable: true,
    },
    {
      id: 'repeat',
      variable: 'repeat',
      label: 'Repeat',
      description: 'How many steps before the pattern starts again.',
      type: 'integer',
      min: 2,
      max: 16,
      step: 1,
      defaultValue: 8,
      randomisable: true,
    },
    {
      id: 'offset',
      variable: 'offset',
      label: 'Offset',
      description: 'How far each column is pushed along. Zero gives plain stripes.',
      type: 'integer',
      min: 0,
      max: 12,
      step: 1,
      defaultValue: 3,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'blueprint',
  renderMode: 'indexed',

  primitives: [
    { glyph: '⍳', name: 'Index generator', shortDescription: 'Counts one, two, three, up to a number.' },
    {
      glyph: '∘.+',
      name: 'Outer product',
      shortDescription: 'Adds every item on the left to every item on the right, making a table.',
    },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    { glyph: '×', name: 'Times', shortDescription: 'Multiplication, applied to the whole array at once.' },
  ],

  thumbnailPath: 'thumbnails/checker-shift.png',
  fixturePath: 'tests/fixtures/checker-shift.json',
  tags: ['stripes', 'diagonal', 'modular arithmetic'],

  tryChangingThis: [
    'Set the offset to 0. The diagonals become horizontal stripes.',
    'Set the offset to 1 and the repeat to 2 for a true chequerboard.',
    'Try a repeat of 3 with an offset of 5.',
    'Replace + with × in the last line and see how different the result is.',
    'Switch to the Mono palette for something that looks woven.',
  ],
};

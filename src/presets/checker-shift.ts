import source from './apl/checker-shift.apl?raw';
import { artworkSource } from './artworkSource';
import { nearestAccepted, type CreateQualityRule } from './createQuality';
import { type ArtworkPreset } from './schema';

const BANDS = { min: 2, max: 12 };
const SHEAR = { min: 1, max: 8 };

/**
 * Keep the shear actually shearing.
 *
 * The artwork is `repeat | (⍳size) ∘.+ offset × ⍳size`, so a column is pushed
 * along by `offset` — modulo the repeat. When the offset is a multiple of the
 * repeat the push lands exactly back where it started and the diagonals
 * disappear: Shear 8 against Bands 8 draws the same horizontal stripes as Shear
 * 0, having asked for the most shear on the slider.
 *
 * Plain stripes are not the problem — they are one of the things this artwork is
 * for, and the preset's own prompts recommend them. Asking for a weave and
 * silently getting stripes is. So the rule moves whichever control is free to
 * the nearest value that leaves the offset visible.
 */
export const checkerShiftQuality: CreateQualityRule = (values, holding) => {
  const repeat = values.get('repeat');
  const offset = values.get('offset');
  if (typeof repeat !== 'number' || typeof offset !== 'number') return values;
  if (offset % repeat !== 0) return values;

  const adjusted = new Map(values);

  if (holding === 'repeat') {
    const next = nearestAccepted(offset, SHEAR.min, SHEAR.max, (candidate) => candidate % repeat !== 0);
    if (next !== null) adjusted.set('offset', next);
    return adjusted;
  }

  const next = nearestAccepted(repeat, BANDS.min, BANDS.max, (candidate) => offset % candidate !== 0);
  if (next !== null) adjusted.set('repeat', next);
  return adjusted;
};

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

  /*
   * The gentlest artwork in the gallery, and the easiest to describe without
   * mentioning APL: how many shades before it starts again, how far each column
   * is pushed, and how fine the grid is.
   *
   * The ranges are narrower than the parameters allow, and each end is a
   * judgement about the picture. Bands stops at twelve because beyond it the
   * shades stop being distinguishable in a small palette. Shear starts at one
   * rather than zero — zero is genuinely worth seeing, and it is one press away
   * in Advanced, but a curated control that can open on plain stripes is a
   * curated control that sometimes opens on the least interesting thing this
   * artwork does. Detail stays above sixteen so there are enough cells for the
   * diagonal to read as a diagonal.
   */
  instantPlay: {
    quality: checkerShiftQuality,

    controls: [
      {
        parameterId: 'repeat',
        label: 'Bands',
        description: 'How many shades the weave runs through before it starts again.',
        range: { min: BANDS.min, max: BANDS.max },
        endpoints: { low: 'Few', high: 'Many' },
      },
      {
        parameterId: 'offset',
        label: 'Shear',
        description: 'How far each column is pushed along, which tilts the stripes into a weave.',
        range: { min: SHEAR.min, max: SHEAR.max },
        endpoints: { low: 'Gentle', high: 'Steep' },
      },
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the pattern is drawn from.',
        range: { min: 16, max: 72 },
        endpoints: { low: 'Bold', high: 'Fine' },
      },
    ],

    /*
     * Five arrangements, each a different relationship between the two numbers
     * rather than a different value of one. None has an offset that divides its
     * repeat, which is the corner the rule above defends.
     *
     * Drift is on the grid alone. Bands and Shear are what the artwork *is* at
     * any setting — two against one is a chequerboard and three against two is a
     * fine twill, and neither is a neighbour of the other — so letting them
     * wander would not vary a recipe, it would leave it.
     */
    recipes: [
      { id: 'diagonal-weave', values: { repeat: 8, offset: 3, size: 32 }, drift: { size: 8 } },
      { id: 'chequerboard', values: { repeat: 2, offset: 1, size: 24 }, drift: { size: 6 } },
      { id: 'fine-twill', values: { repeat: 3, offset: 2, size: 60 }, drift: { size: 8 } },
      { id: 'broad-bands', values: { repeat: 12, offset: 5, size: 48 }, drift: { size: 10 } },
      { id: 'steep-lattice', values: { repeat: 5, offset: 3, size: 40 }, drift: { size: 8 } },
    ],
  },

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

import source from './apl/quilt-stars.apl?raw';
import { artworkSource } from './artworkSource';
import { tilePeriodRule } from './createQuality';
import { type ArtworkPreset } from './schema';

const BLOCK = { min: 12, max: 36, step: 6 };
const DETAIL = { min: 48, max: 120 };

/**
 * Quilt Stars.
 *
 * Two ways of measuring distance from the middle of a block. The larger of the
 * two coordinates draws a square; their sum draws a diamond; every blend between
 * them is an eight-pointed star. Banding that distance gives the concentric
 * rings a quilt block is made of.
 *
 * Seamless by construction. Each block is symmetric about its own centre, so
 * opposite edges are reflections of each other and blocks meet exactly —
 * verified at zero difference across the wrap.
 */
export const quiltStars: ArtworkPreset = {
  id: 'quilt-stars',
  title: 'Quilt Stars',
  description:
    'Concentric rings measured from the middle of each block, in a distance that bends from square to diamond.',
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
      id: 'block',
      variable: 'block',
      label: 'Block size',
      description: 'How large each quilt block is, in cells. The pattern repeats every one of them.',
      type: 'integer',
      min: BLOCK.min,
      max: BLOCK.max,
      step: BLOCK.step,
      defaultValue: 24,
      randomisable: true,
    },
    {
      id: 'rings',
      variable: 'rings',
      label: 'Rings',
      description: 'How many bands run from the middle of a block to its corner.',
      type: 'integer',
      min: 2,
      max: 6,
      step: 1,
      defaultValue: 3,
      randomisable: true,
    },
    {
      id: 'shape',
      variable: 'shape',
      label: 'Shape',
      description: 'Bends the rings from square, through an eight-pointed star, to diamond.',
      type: 'integer',
      min: 0,
      max: 6,
      step: 1,
      defaultValue: 3,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'sunset',
  renderMode: 'continuous',

  /*
   * Shape is the control worth meeting first: one slider takes the artwork from
   * concentric squares to a rosette to bold diamonds, which is three different
   * pieces rather than three settings of one.
   *
   * Rings stops at six because beyond that the bands are thinner than the cells
   * drawing them, and the picture turns to moiré rather than to detail.
   */
  instantPlay: {
    quality: tilePeriodRule({
      size: 'size',
      period: (values) => (values.get('block') as number) ?? 0,
      sizeRange: DETAIL,
      periodVariable: 'block',
      periodRange: BLOCK,
    }),

    controls: [
      {
        parameterId: 'shape',
        label: 'Shape',
        description: 'From concentric squares, through a star, to diamonds.',
        range: { min: 0, max: 6 },
        endpoints: { low: 'Square', high: 'Diamond' },
      },
      {
        parameterId: 'rings',
        label: 'Rings',
        description: 'How many bands run out from the middle of each block.',
        range: { min: 2, max: 6 },
        endpoints: { low: 'Few', high: 'Many' },
      },
      {
        parameterId: 'block',
        label: 'Block size',
        description: 'How large each block is, which is how bold the quilt reads.',
        range: { min: BLOCK.min, max: BLOCK.max },
        endpoints: { low: 'Small', high: 'Large' },
      },
      /*
       * The grid is offered as a control because it has to be: a block that does
       * not divide it would tile with a seam, and the two are adjusted against
       * each other. Somebody moving the block size sees the grid follow, which
       * is more honest than a hidden correction.
       */
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the quilt is drawn from.',
        range: { min: DETAIL.min, max: DETAIL.max },
        endpoints: { low: 'Coarse', high: 'Fine' },
      },
    ],

    /*
     * Five blocks, chosen across the shape range rather than around it: the
     * square end and the diamond end are as much the artwork as the star in the
     * middle, and a set of recipes that all sat near the middle would be five
     * versions of one picture.
     */
    recipes: [
      { id: 'star-rosette', values: { shape: 3, rings: 3, block: 24, size: 96 } },
      { id: 'concentric-squares', values: { shape: 0, rings: 4, block: 24, size: 96 } },
      { id: 'bold-diamonds', values: { shape: 6, rings: 2, block: 36, size: 108 } },
      { id: 'fine-stars', values: { shape: 4, rings: 5, block: 12, size: 96 } },
      { id: 'wide-rosette', values: { shape: 2, rings: 3, block: 30, size: 120 } },
    ],
  },

  primitives: [
    {
      glyph: '⌈',
      name: 'Maximum',
      shortDescription: 'The larger of two numbers, which here draws a square.',
    },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    {
      glyph: '|',
      name: 'Magnitude',
      shortDescription: 'The size of a number regardless of sign, which folds a block about its middle.',
    },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table, turning rows into columns.' },
    { glyph: '⌊', name: 'Floor', shortDescription: 'Rounds down, turning a distance into a band.' },
  ],

  thumbnailPath: 'thumbnails/quilt-stars.png',
  fixturePath: 'tests/fixtures/quilt-stars.json',
  tags: ['quilt', 'stars', 'seamless', 'tileable'],

  tryChangingThis: [
    'Set the shape to 0 for concentric squares, or to 6 for diamonds.',
    'Drop the rings to 2 and raise the block to 36 for a bold, simple tile.',
    'Replace the ⌈ with ⌊ and the square becomes its own inverse.',
    'Remove the 1| and the bands become one smooth gradient out from each centre.',
    'Switch to the Blueprint palette for something that looks like drawn tilework.',
  ],
};

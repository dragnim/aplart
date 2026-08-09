import source from './apl/maze-tiles.apl?raw';
import { artworkSource } from './artworkSource';
import { tilePeriodRule } from './createQuality';
import { type ArtworkPreset } from './schema';

const CELL = { min: 6, max: 16, step: 2 };
const DETAIL = { min: 48, max: 120 };

/**
 * Maze Tiles.
 *
 * One diagonal per tile, chosen by hashing where the tile sits. Both diagonals
 * meet every edge at its midpoint, so whichever way a tile falls its lines join
 * the ones beside it — which is why a maze made this way never has a dead end
 * at a tile boundary.
 *
 * Seamless by construction, and for a second reason as well: the hash wraps over
 * the whole grid rather than over a fixed block, so the arrangement repeats
 * exactly once across the artwork. Verified at zero difference across the wrap.
 */
export const mazeTiles: ArtworkPreset = {
  id: 'maze-tiles',
  title: 'Maze Tiles',
  description:
    'A diagonal in every tile, hashed from its position. The lines meet at each edge, so the paths run on.',
  category: 'pattern',
  difficulty: 'intermediate',

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
      id: 'cell',
      variable: 'cell',
      label: 'Tile size',
      description: 'How large each tile is, in cells. The grid must be a whole number of them across.',
      type: 'integer',
      min: CELL.min,
      max: CELL.max,
      step: CELL.step,
      defaultValue: 8,
      randomisable: true,
    },
    {
      id: 'seed',
      variable: 'seed',
      label: 'Arrangement',
      description: 'Chooses which way each tile falls. The same number always gives the same maze.',
      type: 'integer',
      min: 1,
      max: 99,
      step: 1,
      defaultValue: 7,
      randomisable: true,
    },
    {
      id: 'weight',
      variable: 'weight',
      label: 'Line weight',
      description: 'How thick the drawn lines are, in cells.',
      type: 'integer',
      min: 1,
      max: 3,
      step: 1,
      defaultValue: 1,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'blueprint',
  renderMode: 'continuous',
  // A seamless surface: it fills a Focus window and runs off the edges.
  focusFit: 'cover',

  /*
   * The arrangement is the control this artwork exists for. It is a hash seed,
   * so it has no order at all — every value is as good as every other and
   * neighbouring values are unrelated — which makes it the one control that
   * means "another one of these, please".
   *
   * Line weight is held to two for the curated range. At three the lines are
   * thicker than the gaps between them at small tile sizes, and the maze fills
   * in solid; the parameter still offers it, and Advanced can still reach it.
   */
  instantPlay: {
    quality: tilePeriodRule({
      size: 'size',
      period: (values) => (values.get('cell') as number) ?? 0,
      sizeRange: DETAIL,
      periodVariable: 'cell',
      periodRange: CELL,
    }),

    controls: [
      {
        parameterId: 'seed',
        label: 'Arrangement',
        description: 'Which way each tile falls. Every number is a different maze.',
        range: { min: 1, max: 99 },
        endpoints: { low: 'First', high: 'Last' },
      },
      {
        parameterId: 'cell',
        label: 'Tile size',
        description: 'How large each tile is, which is how open the maze reads.',
        range: { min: CELL.min, max: CELL.max },
        endpoints: { low: 'Tight', high: 'Open' },
      },
      {
        parameterId: 'weight',
        label: 'Line weight',
        description: 'How heavy the drawn lines are.',
        range: { min: 1, max: 2 },
        endpoints: { low: 'Fine', high: 'Bold' },
      },
      /*
       * The grid is a control because the tile size has to divide it — the hash
       * wraps over a whole number of tiles, and a fractional one would scramble
       * the arrangement rather than repeat it.
       */
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the maze is drawn from.',
        range: { min: DETAIL.min, max: DETAIL.max },
        endpoints: { low: 'Coarse', high: 'Fine' },
      },
    ],

    /*
     * The arrangement drifts widely in every recipe, because it has no
     * neighbourhood to leave: a seed forty away is not a variation of this maze,
     * it is another maze of the same kind, which is exactly what a recipe wants
     * from its drift. Tile size and weight are what the artwork *is*, so those
     * are held.
     */
    recipes: [
      { id: 'fine-labyrinth', values: { seed: 7, cell: 8, weight: 1, size: 96 }, drift: { seed: 45 } },
      { id: 'open-maze', values: { seed: 31, cell: 14, weight: 1, size: 84 }, drift: { seed: 45 } },
      { id: 'bold-paths', values: { seed: 63, cell: 12, weight: 2, size: 96 }, drift: { seed: 35 } },
      { id: 'tight-weave', values: { seed: 22, cell: 6, weight: 1, size: 96 }, drift: { seed: 45 } },
    ],
  },

  primitives: [
    { glyph: '⌊', name: 'Floor', shortDescription: 'Rounds down, which is how a cell finds its tile.' },
    {
      glyph: '1○',
      name: 'Sine',
      shortDescription: 'The sine of a large angle, which is what does the scrambling.',
    },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    { glyph: '⌈', name: 'Maximum', shortDescription: 'The larger of two numbers, used here to clip a line.' },
    { glyph: '~', name: 'Not', shortDescription: 'Swaps ones and zeros, so the other diagonal is drawn.' },
  ],

  thumbnailPath: 'thumbnails/maze-tiles.png',
  fixturePath: 'tests/fixtures/maze-tiles.json',
  tags: ['maze', 'labyrinth', 'seamless', 'tileable'],

  tryChangingThis: [
    'Change the seed. Every number is a different maze of the same kind.',
    'Raise the line weight to 2 for something bolder to look at from across a room.',
    'Swap the C-R for C+R and every tile takes the same diagonal, which is a lattice rather than a maze.',
    'Set the tile size to 6 for a dense weave, or 16 for open paths.',
    'Switch to the Mono palette for something that looks like a pen drawing.',
  ],
};

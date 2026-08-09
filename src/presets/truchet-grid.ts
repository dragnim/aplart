import source from './apl/truchet-grid.apl?raw';
import { artworkSource } from './artworkSource';
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

  code: artworkSource(source),

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

  /*
   * How large the tiles are, which arrangement of them, and which shapes are in
   * play. No quality rule: this artwork has no corner that collapses it, and the
   * safety is in the ranges instead.
   *
   * Scale is the one that needed narrowing. The whole point of a Truchet tiling
   * is that a path can be followed through it, and above about forty tiles the
   * arcs are too small to follow — the picture becomes a texture. Below ten
   * there is not enough tiling to wander through. Tile shapes stops at four
   * because the renderer has four motifs and the fifth class draws the first
   * shape again.
   *
   * Arrangement is the interesting one to offer. It is a hash seed, so it has no
   * order at all — every value is as good as every other and neighbouring values
   * are unrelated — which is exactly what makes it a good thing to sweep: it is
   * the control that means "another one of these, please".
   */
  instantPlay: {
    controls: [
      {
        parameterId: 'size',
        label: 'Scale',
        description: 'How many tiles across and down. Fewer tiles means larger curves.',
        range: { min: 10, max: 40 },
        endpoints: { low: 'Large', high: 'Small' },
      },
      {
        parameterId: 'classes',
        label: 'Tile shapes',
        description: 'Two gives the classic flowing curves. Three and four add diagonals across them.',
        range: { min: 2, max: 4 },
        endpoints: { low: 'Curves', high: 'Mixed' },
      },
      {
        parameterId: 'seed',
        label: 'Arrangement',
        description: 'Which way the tiles fall. The same arrangement always gives the same tiling.',
        range: { min: 1, max: 99 },
        endpoints: { low: 'First', high: 'Last' },
      },
    ],

    /*
     * Four, spread across the two controls that change the character. The
     * arrangement drifts widely in every one of them, because it has no
     * neighbourhood to leave: a seed forty away is not a variation of this
     * tiling, it is another tiling of the same kind, which is what a recipe
     * wants from its drift.
     */
    recipes: [
      { id: 'flowing-curves', values: { size: 20, classes: 2, seed: 7 }, drift: { seed: 40, size: 4 } },
      { id: 'cut-diagonals', values: { size: 24, classes: 3, seed: 31 }, drift: { seed: 40, size: 4 } },
      { id: 'dense-maze', values: { size: 34, classes: 2, seed: 63 }, drift: { seed: 30, size: 5 } },
      { id: 'broad-mix', values: { size: 14, classes: 4, seed: 22 }, drift: { seed: 40, size: 3 } },
    ],
  },

  defaultPaletteId: 'mono',
  // Tile motifs rather than coloured cells. A Truchet tiling is a grid of
  // shapes whose edges line up, so the curves run on across tile boundaries;
  // a flat colour per cell cannot show that at all.
  renderMode: 'tiles',

  /*
   * Two shapes are the two arc orientations, and both cross every edge at the
   * midpoint, perpendicular to it — so any tile meets any tile with neither a
   * gap nor a kink, at any size or seed. Three or four bring in the diagonals,
   * which arrive at a corner at an angle and cannot continue an arc.
   *
   * Conditional on the assignment rather than claimed for the preset, because
   * the preset can produce either. Proved in tests/unit/motifEdges.test.ts.
   */
  edgeCompatibility: {
    variable: 'classes',
    compatibleUpTo: 2,
    compatible: {
      title: 'Seamless by construction',
      detail:
        'With two classes, every available arc motif meets repeated edges at the same position and direction.',
    },
    uncertain: {
      title: 'Edge continuity is not guaranteed',
      detail: 'Diagonal motifs can meet arc motifs at different positions and angles.',
    },
  },

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

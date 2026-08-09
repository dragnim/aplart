import source from './apl/modular-bloom.apl?raw';
import { artworkSource } from './artworkSource';
import { gcd, nearestAccepted, type CreateQualityRule } from './createQuality';
import { type ArtworkPreset } from './schema';

/**
 * How many shades the artwork must be able to draw before Create will offer it.
 *
 * `modulus | multiplier × x ∘.× ⍳size` takes only the multiples of
 * `gcd(multiplier, modulus)` below the modulus, so the picture has exactly
 * `modulus ÷ gcd` distinct values — whatever `size` is, and however intricate
 * the arrangement looks in the parameters. At one it is a single flat colour; at
 * two it is a checkerboard of nothing.
 *
 * Five is a floor rather than a target. It rules out the collapses and leaves
 * everything else alone: of the 220 combinations the two sliders can reach, 39
 * fall below it and 181 do not, so this is a rule about the corner rather than
 * about the space.
 */
const MINIMUM_SHADES = 5;

/** How many distinct values the artwork draws at these settings. */
export function shadesDrawn(multiplier: number, modulus: number): number {
  return modulus / gcd(multiplier, modulus);
}

const COMPLEXITY = { min: 1, max: 11 };
const SCALE = { min: 5, max: 24 };

/**
 * Keep Create out of the flat corner, by moving whichever control is free.
 *
 * Complexity and Scale collapse the artwork when they share a large factor —
 * Complexity 10 against Scale 20 is two shades — and the pair is reachable in
 * one press from several perfectly good neighbours. Neither value is wrong, and
 * both stay available in Advanced and in the code; what changes is that the
 * curated controls will not hand somebody a blank square and call it an artwork.
 *
 * The control being moved is the one kept. Moving Scale adjusts Complexity and
 * moving Complexity adjusts Scale, so the slider under the finger always does
 * what it says and the correction is somewhere the eye can see it. There is
 * always an answer: Complexity 1 leaves any modulus at its full count, and a
 * prime Scale leaves any complexity at its own.
 */
export const modularBloomQuality: CreateQualityRule = (values, holding) => {
  const multiplier = values.get('multiplier');
  const modulus = values.get('modulus');
  if (typeof multiplier !== 'number' || typeof modulus !== 'number') return values;
  if (shadesDrawn(multiplier, modulus) >= MINIMUM_SHADES) return values;

  const adjusted = new Map(values);

  // Scale is held, so Complexity gives way — and the other way about. With
  // nothing held, Scale moves: the randomiser's recipes are chosen for their
  // complexity, which is the character of the piece rather than its grain.
  if (holding === 'modulus') {
    const next = nearestAccepted(multiplier, COMPLEXITY.min, COMPLEXITY.max, (candidate) => {
      return shadesDrawn(candidate, modulus) >= MINIMUM_SHADES;
    });
    if (next !== null) adjusted.set('multiplier', next);
    return adjusted;
  }

  const next = nearestAccepted(modulus, SCALE.min, SCALE.max, (candidate) => {
    return shadesDrawn(multiplier, candidate) >= MINIMUM_SHADES;
  });
  if (next !== null) adjusted.set('modulus', next);
  return adjusted;
};

/**
 * Modular Bloom.
 *
 * A multiplication table folded by a modulus. The whole artwork is one
 * expression, and the flower-like structure is a property of the arithmetic
 * rather than anything the renderer adds.
 *
 * Verified against the live TryAPL service at every corner of its parameter
 * ranges; the slowest run measured 145 ms.
 */
export const modularBloom: ArtworkPreset = {
  id: 'modular-bloom',
  title: 'Modular Bloom',
  description:
    'A multiplication table folded by a modulus. Small changes to the modulus reorganise the whole pattern.',
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
      min: 8,
      max: 88,
      step: 1,
      defaultValue: 64,
      randomisable: true,
    },
    {
      id: 'modulus',
      variable: 'modulus',
      label: 'Modulus',
      description: 'The number the table is folded by. Primes give the most intricate patterns.',
      type: 'integer',
      min: 2,
      max: 24,
      step: 1,
      defaultValue: 17,
      randomisable: true,
    },
    {
      id: 'multiplier',
      variable: 'multiplier',
      label: 'Multiplier',
      description: 'Scales the table before folding, which rotates the pattern through itself.',
      type: 'integer',
      min: 1,
      max: 16,
      step: 1,
      defaultValue: 1,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'ember',
  renderMode: 'continuous',
  // A seamless surface: it fills a Focus window and runs off the edges.
  focusFit: 'cover',

  /*
   * The artwork somebody meets first.
   *
   * Chosen for this over the other ten because its three parameters each change
   * the picture in a way you can name without mentioning APL, because it opens in
   * Ember so the interface arrives in APL Art's own colours, and because 64×64 is
   * one quick request.
   *
   * The labels come from watching the artwork rather than from reading the code.
   * A higher `multiplier` makes the pattern finer and busier, so that is
   * Complexity. A higher `modulus` makes each bloom *larger* and therefore fewer
   * of them — the opposite of what "complexity" would suggest — so that is Scale.
   * `size` is how many cells the pattern is drawn from, which is Detail.
   *
   * Ranges are narrower than the parameters allow, deliberately. Below a modulus
   * of five there are too few values to shade a bloom; above a multiplier of
   * twelve the grid speckles; and `size` is a cost as much as a look, so Play
   * stays between 32 and 72 while the workspace keeps all of 8–88.
   */
  instantPlay: {
    /*
     * The floor above, enforced. Until this existed the avoidance was editorial —
     * recipes hand-picked away from the shared factors and drift chosen small
     * enough not to wander into them — which protected the artwork somebody was
     * given and not the artwork they made a moment later with a slider.
     */
    quality: modularBloomQuality,

    controls: [
      {
        parameterId: 'multiplier',
        label: 'Complexity',
        description: 'How intricate the pattern becomes, from open blooms to a fine lattice.',
        /*
         * Eleven rather than twelve, and the difference is arithmetic rather than
         * taste. The values drawn number `modulus ÷ gcd`, so a composite end
         * collapses against everything it shares a factor with: twelve is thin
         * against a dozen of the Scale values it can meet, and flat against
         * twenty-four. A prime end meets only its own multiple — eleven against
         * twenty-two — and the two look the same on screen.
         */
        range: { min: 1, max: 11 },
        endpoints: { low: 'Calm', high: 'Intricate' },
      },
      {
        parameterId: 'modulus',
        label: 'Scale',
        description: 'How large each bloom is. Larger blooms mean fewer of them.',
        range: { min: 5, max: 24 },
        endpoints: { low: 'Small', high: 'Large' },
      },
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the pattern is drawn from.',
        range: { min: 32, max: 72 },
        endpoints: { low: 'Bold', high: 'Fine' },
      },
    ],

    /*
     * Eight places worth standing, looked at side by side against the live
     * service before being written down. They run from calm concentric rings to a
     * dense woven lattice, and from a few large blooms to many small ones.
     *
     * Two use a multiplier of one, which is the preset's own default and the
     * quietest thing it draws; the rest sit above it, so opening twice rarely
     * gives the same character twice. None pairs a high multiplier with a small
     * modulus, which is the one corner of this space that turns to noise.
     *
     * And none lets its modulus drift onto a number sharing a factor with its
     * multiplier. `(multiplier×r×c) mod modulus` takes only `modulus ÷ gcd` values,
     * so 11 against 22 is two shades — an artwork that is blank in everything but
     * name. That is invisible in the parameters and obvious on screen, which is how
     * it was found: a review of twenty-four live variations turned up two flat
     * ones and two thin ones. Drift on the modulus is therefore small and chosen
     * against the multiplier, while drift on `size` stays generous because the
     * count of values does not depend on it at all.
     */
    recipes: [
      {
        id: 'calm-rings',
        values: { multiplier: 1, modulus: 19, size: 56 },
        drift: { modulus: 2, size: 8 },
      },
      {
        id: 'small-blooms',
        values: { multiplier: 1, modulus: 7, size: 48 },
        drift: { modulus: 2, size: 8 },
      },
      /*
       * An even modulus halves an even multiplier's values, and every window of
       * three consecutive numbers holds a multiple of three — so these three hold
       * their modulus still and take a wider drift on `size` instead, which
       * changes how many blooms fill the square and can change nothing else.
       */
      {
        id: 'star-centres',
        values: { multiplier: 2, modulus: 15, size: 56 },
        drift: { size: 12 },
      },
      {
        id: 'woven-crosses',
        values: { multiplier: 3, modulus: 17, size: 60 },
        drift: { size: 12 },
      },
      {
        id: 'bold-tiles',
        values: { multiplier: 3, modulus: 11, size: 40 },
        drift: { size: 8 },
      },
      // 16, 17 and 18 are all coprime to five, as 22, 23, 24 are to seven and
      // 18, 19, 20 are to eleven — so these three may drift by one.
      {
        id: 'snowflakes',
        values: { multiplier: 5, modulus: 17, size: 64 },
        drift: { modulus: 1, size: 8 },
      },
      {
        id: 'fine-lattice',
        values: { multiplier: 7, modulus: 23, size: 64 },
        drift: { modulus: 1, size: 8 },
      },
      {
        id: 'dense-weave',
        values: { multiplier: 11, modulus: 19, size: 72 },
        drift: { modulus: 1, size: 8 },
      },
    ],
  },

  primitives: [
    { glyph: '⍳', name: 'Index generator', shortDescription: 'Counts one, two, three, up to a number.' },
    {
      glyph: '∘.×',
      name: 'Outer product',
      shortDescription: 'Multiplies every item on the left by every item on the right, making a table.',
    },
    {
      glyph: '⍨',
      name: 'Selfie',
      shortDescription: 'Uses the same value on both sides, so the table is multiplied against itself.',
    },
    { glyph: '|', name: 'Residue', shortDescription: 'The remainder after dividing.' },
    { glyph: '×', name: 'Times', shortDescription: 'Ordinary multiplication, applied to the whole array.' },
  ],

  thumbnailPath: 'thumbnails/modular-bloom.png',
  fixturePath: 'tests/fixtures/modular-bloom.json',
  tags: ['multiplication', 'modular arithmetic', 'symmetry'],

  tryChangingThis: [
    'Drop the modulus from 17 to 9 and watch the rings break into a tighter grid.',
    'Try 12 instead of 17. Numbers with many factors give much plainer patterns than primes.',
    'Set the multiplier to 7 for a sheared, off-axis version.',
    'Replace × with + in the last line for something much calmer.',
    'Switch to the Poolrooms palette and invert it.',
  ],
};

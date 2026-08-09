import source from './apl/wave-interference.apl?raw';
import { artworkSource } from './artworkSource';
import { nearestAccepted, type CreateQualityRule } from './createQuality';
import { type ArtworkPreset } from './schema';

const RIPPLES = { min: 3, max: 14 };
const DETAIL = { min: 32, max: 80 };

/**
 * How few cells a single wave may be drawn from before it stops being a wave.
 *
 * The grid samples a continuous field, so the wave has to be wider than the
 * cells measuring it. Below about five cells per wave the sampling beats against
 * the pattern and the artwork turns to moiré speckle — a real effect, and an
 * interesting one to find in Advanced, but not what "more ripples" promises.
 */
const CELLS_PER_WAVE = 5;

/**
 * Keep the grid fine enough for the waves it is drawing.
 *
 * Moving Ripples raises the detail to match; moving Detail lowers the ripples.
 * Either way the control under the finger does what it says, and the other one
 * follows by as little as it can.
 */
export const waveInterferenceQuality: CreateQualityRule = (values, holding) => {
  const frequency = values.get('frequency');
  const size = values.get('size');
  if (typeof frequency !== 'number' || typeof size !== 'number') return values;
  if (size >= frequency * CELLS_PER_WAVE) return values;

  const adjusted = new Map(values);

  if (holding === 'size') {
    const next = nearestAccepted(frequency, RIPPLES.min, RIPPLES.max, (candidate) => {
      return size >= candidate * CELLS_PER_WAVE;
    });
    if (next !== null) adjusted.set('frequency', next);
    return adjusted;
  }

  const next = nearestAccepted(size, DETAIL.min, DETAIL.max, (candidate) => {
    return candidate >= frequency * CELLS_PER_WAVE;
  });
  if (next !== null) adjusted.set('size', next);
  return adjusted;
};

/**
 * Wave Interference.
 *
 * Two sine waves, one running across and one running down, added together.
 * The result is scaled to whole numbers before it leaves APL: floating point
 * output would be far wider on the wire and would cost extra requests for no
 * visible gain, since the renderer maps the range onto a palette anyway.
 */
export const waveInterference: ArtworkPreset = {
  id: 'wave-interference',
  title: 'Wave Interference',
  description:
    'Straight waves travelling in several directions at once. Where they cross they reinforce or cancel, the way ripples do.',
  category: 'geometry',
  difficulty: 'intermediate',

  code: artworkSource(source),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Size',
      description: 'How many rows and columns the artwork has.',
      type: 'integer',
      min: 16,
      max: 88,
      step: 1,
      defaultValue: 72,
      randomisable: true,
    },
    {
      id: 'frequency',
      variable: 'frequency',
      label: 'Frequency',
      description: 'How many complete waves fit across the artwork.',
      type: 'integer',
      min: 1,
      max: 20,
      step: 1,
      defaultValue: 8,
      randomisable: true,
    },
    {
      id: 'phase',
      variable: 'phase',
      label: 'Phase',
      description: 'Slides every wave along together, moving where the crossings fall.',
      type: 'number',
      min: 0,
      max: 6.2,
      step: 0.1,
      defaultValue: 0,
      randomisable: true,
    },
    {
      id: 'symmetry',
      variable: 'symmetry',
      label: 'Symmetry',
      description: 'How many directions the waves travel in. Five and above never quite repeat.',
      type: 'integer',
      min: 2,
      max: 8,
      step: 1,
      defaultValue: 5,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'poolrooms',
  renderMode: 'continuous',
  // A seamless surface: it fills a Focus window and runs off the edges.
  focusFit: 'cover',

  /*
   * Three questions about the ripples: how many directions they travel in, how
   * tightly they are spaced, and how finely the whole thing is sampled. Phase is
   * left out — it slides the crossings along without changing what the artwork
   * is, which is a subtle pleasure for Advanced rather than one of three curated
   * controls.
   *
   * Symmetry starts at three. Two directions cross into a plain grid, which is a
   * true and useful thing to see and is exactly what the parameter offers in
   * Advanced; three is where the pattern stops being a grid. It stops at eight
   * because the parameter does.
   */
  instantPlay: {
    quality: waveInterferenceQuality,

    controls: [
      {
        parameterId: 'symmetry',
        label: 'Symmetry',
        description: 'How many directions the waves travel in. Five and above never quite repeat.',
        range: { min: 3, max: 8 },
        endpoints: { low: 'Simple', high: 'Intricate' },
      },
      {
        parameterId: 'frequency',
        label: 'Ripples',
        description: 'How many complete waves fit across the artwork.',
        range: { min: RIPPLES.min, max: RIPPLES.max },
        endpoints: { low: 'Broad', high: 'Tight' },
      },
      {
        parameterId: 'size',
        label: 'Detail',
        description: 'How many cells the pattern is drawn from.',
        range: { min: DETAIL.min, max: DETAIL.max },
        endpoints: { low: 'Bold', high: 'Fine' },
      },
    ],

    /*
     * Four places, from a broad three-way cross-hatch to the eight-fold pattern
     * that never repeats. Every one leaves the grid at least five cells to a
     * wave, which is the floor the rule above holds.
     */
    recipes: [
      { id: 'quasicrystal', values: { symmetry: 5, frequency: 8, size: 72 }, drift: { size: 8 } },
      { id: 'broad-cross', values: { symmetry: 3, frequency: 4, size: 56 }, drift: { size: 8 } },
      { id: 'woven-six', values: { symmetry: 6, frequency: 6, size: 64 }, drift: { size: 8 } },
      { id: 'tight-eight', values: { symmetry: 8, frequency: 12, size: 80 }, drift: { size: 8 } },
    ],
  },

  primitives: [
    { glyph: '○', name: 'Pi times', shortDescription: 'Multiplies by π, so one turn of a circle is 2○1.' },
    {
      glyph: '1○',
      name: 'Sine',
      shortDescription: 'The sine of every number in the array at once.',
    },
    {
      glyph: '∘.+',
      name: 'Outer product',
      shortDescription: 'Adds every item on the left to every item on the right, making a table.',
    },
    { glyph: '⌊', name: 'Floor', shortDescription: 'Rounds down to a whole number.' },
    { glyph: '÷', name: 'Divide', shortDescription: 'Division, applied to the whole array at once.' },
  ],

  thumbnailPath: 'thumbnails/wave-interference.png',
  fixturePath: 'tests/fixtures/wave-interference.json',
  tags: ['waves', 'interference', 'trigonometry'],

  tryChangingThis: [
    'Set the symmetry to 2 or 4 for a pattern that repeats, and 5 or 7 for one that never quite does.',
    'Raise the frequency to 14 for a much finer weave.',
    'Drag the phase slowly and watch the bright points drift.',
    'Change 1○ to 2○ in the last line to use cosine instead of sine.',
    'Try the Heat palette, which makes the peaks glow.',
  ],
};

import source from './apl/wave-interference.apl?raw';
import { artworkSource } from './artworkSource';
import { type ArtworkPreset } from './schema';

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

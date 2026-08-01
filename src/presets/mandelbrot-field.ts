import { type ArtworkPreset } from './schema';

/**
 * Mandelbrot Field.
 *
 * TryAPL rejects complex arithmetic — a `0J1`-based formulation returns
 * DOMAIN ERROR — so the plane is carried as two real matrices and the squaring
 * is written out longhand. The magnitude is clamped each step: once a point
 * has escaped its value grows without bound, and an infinity minus an infinity
 * would become NaN and start being counted as inside again.
 *
 * The only preset that declares high-resolution output. It is worth the extra
 * requests here: the detail is the point of a fractal, and 90 rows is not
 * enough to show it.
 */
export const mandelbrotField: ArtworkPreset = {
  id: 'mandelbrot-field',
  title: 'Mandelbrot Field',
  description:
    'The Mandelbrot set, counted out in real arithmetic. Each cell records how long that point stayed near the origin.',
  category: 'fractal',
  difficulty: 'advanced',

  code: [
    '⍝ Controls',
    'size←128',
    'iterations←28',
    'centreX←¯0.6',
    'centreY←0',
    'zoom←1.4',
    '',
    '⍝ The patch of the plane to look at, as two real matrices.',
    '⍝ TryAPL does not support complex numbers, so the real and imaginary',
    '⍝ parts are carried separately.',
    'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
    'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
    'cr←(size,size)⍴ax',
    'ci←⍉(size,size)⍴ay',
    '',
    '⍝ Repeat z←z²+c, counting the steps each point survives.',
    '⍝ The clamp stops escaped points overflowing to infinity.',
    'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}',
    '⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)',
  ].join('\n'),

  parameters: [
    {
      id: 'size',
      variable: 'size',
      label: 'Resolution',
      description: 'How many rows and columns. Larger takes noticeably longer.',
      type: 'integer',
      min: 32,
      // TryAPL gives each run a 512 KB workspace. This preset holds several
      // matrices of doubles at once, and measurement puts the ceiling between
      // 160 and 176; 144 leaves room for the intermediates at any zoom.
      max: 144,
      step: 8,
      defaultValue: 128,
      randomisable: false,
    },
    {
      id: 'iterations',
      variable: 'iterations',
      label: 'Maximum iterations',
      description: 'How long to keep testing each point. Higher shows finer detail but takes longer.',
      type: 'integer',
      min: 8,
      max: 60,
      step: 1,
      defaultValue: 28,
      randomisable: false,
    },
    {
      id: 'centreX',
      variable: 'centreX',
      label: 'Centre across',
      description: 'Moves the view left and right.',
      type: 'number',
      min: -2,
      max: 1,
      step: 0.01,
      defaultValue: -0.6,
      randomisable: true,
    },
    {
      id: 'centreY',
      variable: 'centreY',
      label: 'Centre down',
      description: 'Moves the view up and down.',
      type: 'number',
      min: -1.2,
      max: 1.2,
      step: 0.01,
      defaultValue: 0,
      randomisable: true,
    },
    {
      id: 'zoom',
      variable: 'zoom',
      label: 'Span',
      description: 'How much of the plane to show. Smaller values zoom in.',
      type: 'number',
      /*
       * Far below the step, so dragging on the artwork can zoom in about 700
       * times without producing a value the slider would refuse to show. The
       * step only governs the slider and the arrow keys, which stay usable at
       * 0.05; a value between two steps is still perfectly representable.
       */
      min: 0.002,
      max: 2,
      step: 0.05,
      defaultValue: 1.4,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'heat',
  renderMode: 'continuous',
  outputLimits: { highResolution: true, maxRows: 144, maxColumns: 144, maxCells: 20_736 },

  // The axes above are built in exactly the form this declaration promises,
  // which is what lets a dragged region be turned back into three assignments.
  planeExploration: { centreXVariable: 'centreX', centreYVariable: 'centreY', spanVariable: 'zoom' },

  primitives: [
    {
      glyph: '⍣',
      name: 'Power operator',
      shortDescription: 'Applies a function a given number of times.',
    },
    { glyph: '⌊', name: 'Minimum', shortDescription: 'The smaller of two numbers, used here to clamp.' },
    { glyph: '⌈', name: 'Maximum', shortDescription: 'The larger of two numbers, used here to clamp.' },
    { glyph: '⍉', name: 'Transpose', shortDescription: 'Flips a table over its diagonal.' },
    { glyph: '⊃', name: 'First', shortDescription: 'Takes the first item of a list.' },
    { glyph: '⌽', name: 'Reverse', shortDescription: 'Turns a list back to front.' },
  ],

  thumbnailPath: 'thumbnails/mandelbrot-field.png',
  fixturePath: 'tests/fixtures/mandelbrot-field.json',
  tags: ['fractal', 'iteration', 'complex plane'],

  tryChangingThis: [
    'Drag a rectangle on the artwork. Watch the centre and span lines above rewrite themselves.',
    'Reduce the span to 0.3 and move the centre to ¯0.75 to find the seahorse valley.',
    'Raise the iterations to 50. The edge grows filaments — and the run takes longer.',
    'Set the centre across to ¯1.25 and the span to 0.15.',
    'Switch to Poolrooms and invert it.',
    'Drop the iterations to 8 to see how the count builds the picture up.',
  ],
};

import { type ArtworkPreset } from './schema';

/**
 * Cellular Echo.
 *
 * An elementary cellular automaton, with each generation stacked as a row so
 * the whole history is one picture. Rule 30 is the default because it is the
 * famous one that produces genuine-looking randomness from a single cell.
 *
 * Output height is one more than the number of generations, so the generation
 * count is capped below the single-request row limit.
 */
export const cellularEcho: ArtworkPreset = {
  id: 'cellular-echo',
  title: 'Cellular Echo',
  description: 'One row of cells, evolving by a simple rule, with every generation stacked below the last.',
  category: 'cellular',
  difficulty: 'advanced',

  code: [
    '⍝ Controls',
    'width←121',
    'generations←80',
    'rule←30',
    'seed←0',
    '',
    '⍝ The eight outcomes the rule number encodes, in neighbourhood order',
    'rb←⌽(8⍴2)⊤rule',
    '',
    '⍝ Start from a single live cell in the middle.',
    '⍝ A seed above zero scatters more, always the same way for the same seed.',
    'start←width⍴0',
    'start[⌈width÷2]←1',
    'start←start∨(0≠seed)∧2|⌊10000×1|seed×0.6180339887×⍳width',
    '',
    '⍝ Each new row is the rule read off every cell and its two neighbours',
    'grow←{r←,¯1↑⍵ ⋄ ⍵⍪rb[1+2⊥↑(1⌽r)r(¯1⌽r)]}',
    'grow⍣generations⊢1 width⍴start',
  ].join('\n'),

  parameters: [
    {
      id: 'width',
      variable: 'width',
      label: 'Width',
      description: 'How many cells in each generation.',
      type: 'integer',
      min: 21,
      max: 200,
      step: 2,
      defaultValue: 121,
      randomisable: true,
    },
    {
      id: 'generations',
      variable: 'generations',
      label: 'Generations',
      description: 'How many steps to run. Each one becomes a row.',
      type: 'integer',
      min: 8,
      max: 88,
      step: 1,
      defaultValue: 80,
      randomisable: true,
    },
    {
      id: 'rule',
      variable: 'rule',
      label: 'Rule',
      description:
        'Which of the 256 rules to use. 30 is chaotic, 90 draws a fractal, 110 is famously complex.',
      type: 'integer',
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 30,
      randomisable: true,
    },
    {
      id: 'seed',
      variable: 'seed',
      label: 'Starting seed',
      description: 'Zero starts from a single cell. Anything else scatters extra live cells.',
      type: 'integer',
      min: 0,
      max: 99,
      step: 1,
      defaultValue: 0,
      randomisable: true,
    },
  ],

  defaultPaletteId: 'forest',
  renderMode: 'binary',

  primitives: [
    { glyph: '⊤', name: 'Encode', shortDescription: 'Writes a number in another base — here, binary.' },
    { glyph: '⊥', name: 'Decode', shortDescription: 'Reads digits back into a number.' },
    {
      glyph: '⌽',
      name: 'Rotate',
      shortDescription: 'Shifts a list round, which is how each cell sees its neighbours.',
    },
    { glyph: '⍪', name: 'Catenate first', shortDescription: 'Adds a row to the bottom of a table.' },
    { glyph: '⍣', name: 'Power operator', shortDescription: 'Applies a function a given number of times.' },
  ],

  thumbnailPath: 'thumbnails/cellular-echo.png',
  fixturePath: 'tests/fixtures/cellular-echo.json',
  tags: ['cellular automaton', 'emergence', 'rule 30'],

  tryChangingThis: [
    'Change the rule to 90. The chaos becomes a Sierpiński triangle.',
    'Try rule 110, which is capable of universal computation.',
    'Try rule 184, which models traffic.',
    'Set the seed to 5 to start from scattered cells instead of one.',
    'Set the rule to 0 or 255 to see the two dullest possible outcomes.',
  ],
};

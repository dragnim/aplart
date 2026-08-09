import { describe, expect, it } from 'vitest';
import { escapeRegExp, validatePreset, type ArtworkPreset } from '@/presets/schema';
import { presets } from '@/presets/presets';

function makePreset(overrides: Partial<ArtworkPreset> = {}): ArtworkPreset {
  return {
    id: 'modular-bloom',
    title: 'Modular Bloom',
    description: 'A multiplication table folded by a modulus.',
    category: 'geometry',
    difficulty: 'beginner',
    code: 'size←64\nmodulus←9\n\nmodulus|∘.×⍨⍳size',
    parameters: [
      {
        id: 'size',
        variable: 'size',
        label: 'Size',
        type: 'integer',
        min: 8,
        max: 90,
        step: 1,
        defaultValue: 64,
        randomisable: true,
      },
    ],
    defaultPaletteId: 'ember',
    renderMode: 'indexed',
    primitives: [{ glyph: '⍳', name: 'Index generator', shortDescription: 'Counts from one.' }],
    thumbnailPath: 'thumbnails/modular-bloom.png',
    fixturePath: 'fixtures/modular-bloom.json',
    tags: ['modular'],
    ...overrides,
  };
}

describe('validatePreset', () => {
  it('accepts a well-formed preset', () => {
    expect(validatePreset(makePreset())).toEqual([]);
  });

  it('rejects an id that is not kebab-case, because it appears in URLs', () => {
    const issues = validatePreset(makePreset({ id: 'Modular Bloom' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/kebab-case/);
  });

  it('requires at least one parameter', () => {
    const issues = validatePreset(makePreset({ parameters: [] }));
    expect(issues.map((issue) => issue.message)).toContain(
      'every preset needs at least one editable parameter',
    );
  });

  it('rejects a parameter with no matching assignment in the code', () => {
    const issues = validatePreset(makePreset({ code: 'modulus←9\n\nmodulus|∘.×⍨⍳64' }));
    expect(issues[0]?.message).toMatch(/expects a top-level assignment "size←…"/);
  });

  it('accepts an assignment that is indented', () => {
    expect(validatePreset(makePreset({ code: '   size←64\nsize size⍴1' }))).toEqual([]);
  });

  it('rejects an assignment that is not at the start of a line', () => {
    // `⍳size←64` would be rewritten mid-expression by the parameter binder, so
    // it must not be treated as a bindable control.
    const issues = validatePreset(makePreset({ code: 'x←⍳size←64\nx∘.×x' }));
    expect(issues[0]?.message).toMatch(/expects a top-level assignment/);
  });

  it('rejects a default outside the declared range', () => {
    const preset = makePreset({
      parameters: [
        {
          id: 'size',
          variable: 'size',
          label: 'Size',
          type: 'integer',
          min: 8,
          max: 32,
          defaultValue: 64,
          randomisable: true,
        },
      ],
    });
    expect(validatePreset(preset)[0]?.message).toMatch(/outside its range 8–32/);
  });

  it('rejects an inverted range', () => {
    const preset = makePreset({
      parameters: [
        {
          id: 'size',
          variable: 'size',
          label: 'Size',
          type: 'integer',
          min: 90,
          max: 8,
          defaultValue: 64,
          randomisable: true,
        },
      ],
    });
    expect(validatePreset(preset).map((i) => i.message)).toContainEqual(
      expect.stringMatching(/min 90 which is not below max 8/),
    );
  });

  it('rejects a numeric control with no range at all', () => {
    const preset = makePreset({
      parameters: [
        {
          id: 'size',
          variable: 'size',
          label: 'Size',
          type: 'integer',
          defaultValue: 64,
          randomisable: true,
        },
      ],
    });
    expect(validatePreset(preset)[0]?.message).toMatch(/must declare both min and max/);
  });

  it('rejects a select whose default is not among its options', () => {
    const preset = makePreset({
      code: 'mode←1\nmode mode⍴1',
      parameters: [
        {
          id: 'mode',
          variable: 'mode',
          label: 'Mode',
          type: 'select',
          defaultValue: 3,
          randomisable: false,
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
          ],
        },
      ],
    });
    expect(validatePreset(preset)[0]?.message).toMatch(/not one of its options/);
  });

  it('reports duplicate parameter ids', () => {
    const parameter = {
      id: 'size',
      variable: 'size',
      label: 'Size',
      type: 'integer' as const,
      min: 8,
      max: 90,
      defaultValue: 64,
      randomisable: true,
    };
    const issues = validatePreset(makePreset({ parameters: [parameter, parameter] }));
    expect(issues.map((issue) => issue.message)).toContain('duplicate parameter id "size"');
  });
});

describe('escapeRegExp', () => {
  it('escapes characters that would otherwise change the pattern', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
  });

  it('leaves an ordinary APL name untouched', () => {
    expect(escapeRegExp('size')).toBe('size');
  });
});

describe('how every artwork meets a Focus window', () => {
  /*
   * Stated by each preset, and checked as data rather than as a rule.
   *
   * This was briefly derived from `category`, which is tidy and wrong: a
   * category says what an artwork is, and letting it decide a rendering policy
   * means a piece filed differently one day is cropped differently the next,
   * with nothing in the preset to say so. The schema tolerates the field being
   * absent so a preset from elsewhere still loads; these assertions are what
   * stop an authored one quietly falling back to the default.
   */
  const expected: Readonly<Record<string, 'cover' | 'contain'>> = {
    'basket-weave': 'cover',
    'quilt-stars': 'cover',
    'maze-tiles': 'cover',
    'glow-grid': 'cover',
    'truchet-grid': 'cover',
    'checker-shift': 'cover',
    'modular-bloom': 'cover',
    'wave-interference': 'cover',
    'mandelbrot-field': 'contain',
    'julia-set': 'contain',
    'burning-ship': 'contain',
    tricorn: 'contain',
    multibrot: 'contain',
    'sierpinski-array': 'contain',
    'cellular-echo': 'contain',
  };

  it('is declared by every artwork, with nothing left to the default', () => {
    for (const preset of presets) {
      expect(preset.focusFit, `${preset.id} does not say how it meets a Focus window`).toBeDefined();
    }
  });

  it('fills for the seamless surfaces and fits for everything else', () => {
    for (const preset of presets) {
      expect(preset.focusFit, preset.id).toBe(expected[preset.id]);
    }
  });

  it('covers every artwork that exists, so a new one cannot be forgotten here', () => {
    expect(new Set(presets.map((preset) => preset.id))).toEqual(new Set(Object.keys(expected)));
  });
});

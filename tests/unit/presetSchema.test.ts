import { describe, expect, it } from 'vitest';
import { escapeRegExp, validatePreset, type ArtworkPreset } from '@/presets/schema';

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
    defaultPaletteId: 'dyalog',
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

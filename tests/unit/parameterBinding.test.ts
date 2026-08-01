import { describe, expect, it } from 'vitest';
import {
  bindingStateFor,
  findAssignment,
  formatAplLiteral,
  parseAplLiteral,
  restoreControlLine,
  setParameterValue,
  setParameterValues,
} from '@/editor/parameterBinding';
import { type ArtworkParameter } from '@/presets/schema';

const CODE = ['⍝ Controls', 'size←64', 'modulus←17', '', '⍝ Draw', 'modulus|∘.×⍨⍳size'].join('\n');

const sizeParameter: ArtworkParameter = {
  id: 'size',
  variable: 'size',
  label: 'Size',
  type: 'integer',
  min: 8,
  max: 88,
  defaultValue: 64,
  randomisable: true,
};

describe('findAssignment', () => {
  it('finds a top-level assignment', () => {
    expect(findAssignment(CODE, 'size')).toMatchObject({ line: 1, valueText: '64' });
  });

  it('finds an indented assignment', () => {
    expect(findAssignment('   size←12\nx', 'size')).toMatchObject({ valueText: '12' });
  });

  it('does not match an assignment inside an expression', () => {
    // Rewriting this would change an expression rather than a control.
    expect(findAssignment('x←⍳size←64\nx', 'size')).toBeNull();
  });

  it('does not match a different variable with the same prefix', () => {
    expect(findAssignment('sizeLimit←9\nx', 'size')).toBeNull();
  });

  it('keeps a trailing comment separate from the value', () => {
    expect(findAssignment('size←64 ⍝ how big', 'size')).toMatchObject({
      valueText: '64',
      comment: '⍝ how big',
    });
  });

  it('is not fooled by a lamp inside a string', () => {
    expect(findAssignment("label←'⍝ hello'", 'label')).toMatchObject({
      valueText: "'⍝ hello'",
      comment: '',
    });
  });
});

describe('formatAplLiteral', () => {
  it('writes negatives with an overbar, as APL requires', () => {
    expect(formatAplLiteral(-3)).toBe('¯3');
    expect(formatAplLiteral(-0.5)).toBe('¯0.5');
  });

  it('writes booleans as one and zero', () => {
    expect(formatAplLiteral(true)).toBe('1');
    expect(formatAplLiteral(false)).toBe('0');
  });

  it('quotes strings and doubles an embedded quote', () => {
    expect(formatAplLiteral('abc')).toBe("'abc'");
    expect(formatAplLiteral("it's")).toBe("'it''s'");
  });

  it('refuses a value APL cannot express', () => {
    expect(() => formatAplLiteral(Number.NaN)).toThrow();
    expect(() => formatAplLiteral(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('parseAplLiteral', () => {
  it('round-trips every kind of literal', () => {
    for (const value of [64, -3, 0.5, -0.5, true, 'abc', "it's"] as const) {
      const written = formatAplLiteral(value);
      const read = parseAplLiteral(written);
      // Booleans are written as numbers and come back as numbers; the
      // parameter's declared type restores the distinction.
      expect(read).toBe(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
  });

  it('rejects an expression', () => {
    expect(parseAplLiteral('2×32')).toBeNull();
    expect(parseAplLiteral('⍳9')).toBeNull();
    expect(parseAplLiteral('')).toBeNull();
  });
});

describe('setParameterValue', () => {
  it('rewrites only the assignment line', () => {
    const result = setParameterValue(CODE, 'size', 88);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toContain('size←88');
      // Everything else is untouched, including the expression that uses it.
      expect(result.code).toContain('modulus|∘.×⍨⍳size');
      expect(result.code).toContain('modulus←17');
      expect(result.code.split('\n')).toHaveLength(6);
    }
  });

  it('does not rewrite other uses of the same name', () => {
    const result = setParameterValue('size←4\nsize size⍴size', 'size', 9);
    expect(result.ok && result.code).toBe('size←9\nsize size⍴size');
  });

  it('keeps a trailing comment', () => {
    const result = setParameterValue('size←64 ⍝ how big', 'size', 32);
    expect(result.ok && result.code).toBe('size←32 ⍝ how big');
  });

  it('preserves the original indentation and spacing around the arrow', () => {
    const result = setParameterValue('  size ← 64', 'size', 12);
    expect(result.ok && result.code).toBe('  size ← 12');
  });

  it('reports a missing assignment rather than inventing one', () => {
    expect(setParameterValue('x←1', 'size', 4)).toEqual({ ok: false, reason: 'detached' });
  });

  it('escapes the variable name when building the pattern', () => {
    // A name is validated at preset load, but the binder must not be the thing
    // that breaks if one ever contains a regular-expression character.
    const result = setParameterValue('a.b←1\nx', 'a.b', 2);
    expect(result.ok && result.code).toBe('a.b←2\nx');
    expect(setParameterValue('axb←1\nx', 'a.b', 2).ok).toBe(false);
  });
});

describe('bindingStateFor', () => {
  it('reports the current value', () => {
    expect(bindingStateFor(CODE, sizeParameter)).toMatchObject({ status: 'bound', value: 64 });
  });

  it('detaches when the assignment is deleted', () => {
    expect(bindingStateFor('⍳9', sizeParameter)).toEqual({ status: 'detached' });
  });

  it('reports an expression as unrepresentable rather than overwriting it', () => {
    expect(bindingStateFor('size←2×32\nx', sizeParameter)).toMatchObject({
      status: 'unrepresentable',
    });
  });

  it('reports a non-integer as unrepresentable for an integer control', () => {
    expect(bindingStateFor('size←64.5\nx', sizeParameter)).toMatchObject({
      status: 'unrepresentable',
    });
  });

  it('reads a boolean control', () => {
    const parameter: ArtworkParameter = {
      id: 'flip',
      variable: 'flip',
      label: 'Flip',
      type: 'boolean',
      defaultValue: false,
      randomisable: false,
    };
    expect(bindingStateFor('flip←1\nx', parameter)).toMatchObject({ status: 'bound', value: true });
    expect(bindingStateFor('flip←0\nx', parameter)).toMatchObject({ status: 'bound', value: false });
    expect(bindingStateFor('flip←7\nx', parameter)).toMatchObject({ status: 'unrepresentable' });
  });

  it('rejects a select value that is not one of the options', () => {
    const parameter: ArtworkParameter = {
      id: 'mode',
      variable: 'mode',
      label: 'Mode',
      type: 'select',
      defaultValue: 1,
      randomisable: false,
      options: [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
      ],
    };
    expect(bindingStateFor('mode←2\nx', parameter)).toMatchObject({ status: 'bound', value: 2 });
    expect(bindingStateFor('mode←9\nx', parameter)).toMatchObject({ status: 'unrepresentable' });
  });
});

describe('restoreControlLine', () => {
  it('puts a deleted assignment back above the expression', () => {
    const restored = restoreControlLine('⍝ Draw\n9|∘.×⍨⍳64', 'size', 64);
    expect(restored.split('\n')[0]).toBe('size←64');
  });

  it('adds it after the other controls, not at the very top', () => {
    const restored = restoreControlLine('size←64\nmodulus←9\nmodulus|∘.×⍨⍳size', 'multiplier', 1);
    expect(restored.split('\n')).toEqual(['size←64', 'modulus←9', 'multiplier←1', 'modulus|∘.×⍨⍳size']);
  });

  it('updates the existing line when one is already there', () => {
    expect(restoreControlLine('size←12\nx', 'size', 64)).toBe('size←64\nx');
  });
});

describe('setParameterValues', () => {
  it('applies several changes in one pass, as Randomise does', () => {
    const updated = setParameterValues(
      CODE,
      new Map([
        ['size', 32],
        ['modulus', 11],
      ]),
    );
    expect(updated).toContain('size←32');
    expect(updated).toContain('modulus←11');
  });

  it('skips a detached control without disturbing the rest', () => {
    const updated = setParameterValues(
      CODE,
      new Map([
        ['missing', 1],
        ['size', 8],
      ]),
    );
    expect(updated).toContain('size←8');
    expect(updated).not.toContain('missing');
  });
});

import { describe, expect, it } from 'vitest';
import { flattenToExpression, hasUnterminatedString, stripComment } from '@/execution/aplSource';

describe('stripComment', () => {
  it('removes a whole-line comment', () => {
    expect(stripComment('⍝ Controls')).toBe('');
  });

  it('removes a trailing comment but keeps the code', () => {
    expect(stripComment('size←64 ⍝ how big')).toBe('size←64 ');
  });

  it('leaves a line with no comment alone', () => {
    expect(stripComment('modulus|∘.×⍨⍳size')).toBe('modulus|∘.×⍨⍳size');
  });

  it('does not treat a lamp inside a string as a comment', () => {
    // The naive split-on-⍝ approach truncates here and changes the code.
    expect(stripComment("label←'⍝ not a comment'")).toBe("label←'⍝ not a comment'");
  });

  it('handles a doubled quote, which is how APL escapes one', () => {
    expect(stripComment("s←'it''s fine' ⍝ trailing")).toBe("s←'it''s fine' ");
  });

  it('treats a lamp after a closed string as a comment', () => {
    expect(stripComment("s←'text' ⍝ gone")).toBe("s←'text' ");
  });

  it('handles several strings on one line', () => {
    expect(stripComment("a←'x' ⋄ b←'y' ⍝ gone")).toBe("a←'x' ⋄ b←'y' ");
  });
});

describe('hasUnterminatedString', () => {
  it('is false for balanced quotes', () => {
    expect(hasUnterminatedString("s←'abc'")).toBe(false);
  });

  it('is false for an escaped quote inside a string', () => {
    expect(hasUnterminatedString("s←'it''s'")).toBe(false);
  });

  it('is true for a string that is never closed', () => {
    expect(hasUnterminatedString("s←'abc")).toBe(true);
  });

  it('is true for a trailing escaped-looking quote that opens a string', () => {
    expect(hasUnterminatedString("s←'it''s")).toBe(true);
  });
});

describe('flattenToExpression', () => {
  it('joins the statements of a preset with diamonds', () => {
    const source = [
      '⍝ Controls',
      'size←64',
      'modulus←9',
      '',
      '⍝ Generate the artwork',
      'modulus|∘.×⍨⍳size',
    ].join('\n');

    const result = flattenToExpression(source);
    expect(result).toMatchObject({
      ok: true,
      expression: 'size←64 ⋄ modulus←9 ⋄ modulus|∘.×⍨⍳size',
      // Kept separately so the transport wrappers can parenthesise only the
      // final statement.
      statements: ['size←64', 'modulus←9', 'modulus|∘.×⍨⍳size'],
    });
  });

  it('produces exactly what the live service accepted for that preset', () => {
    // This expression was run against tryapl.org and returned a matrix.
    const result = flattenToExpression('size←5\n9|∘.×⍨⍳size');
    expect(result).toMatchObject({ expression: 'size←5 ⋄ 9|∘.×⍨⍳size' });
  });

  it('handles Windows line endings', () => {
    expect(flattenToExpression('size←8\r\nsize size⍴1')).toMatchObject({
      expression: 'size←8 ⋄ size size⍴1',
    });
  });

  it('does not double up a diamond the author already wrote', () => {
    expect(flattenToExpression('size←8 ⋄\nsize size⍴1')).toMatchObject({
      expression: 'size←8 ⋄ size size⍴1',
    });
  });

  it('keeps a diamond used mid-line', () => {
    expect(flattenToExpression('a←1 ⋄ b←2\na+b')).toMatchObject({ expression: 'a←1 ⋄ b←2 ⋄ a+b' });
  });

  it('drops blank and comment-only lines', () => {
    expect(flattenToExpression('\n⍝ one\n\n  ⍝ two\n1 2⍴3\n\n')).toMatchObject({ expression: '1 2⍴3' });
  });

  it('refuses source that is only comments', () => {
    expect(flattenToExpression('⍝ nothing here')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('refuses empty source', () => {
    expect(flattenToExpression('   \n  ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('refuses an unterminated string rather than sending code that means something else', () => {
    // Joining would put the following statement inside the open string.
    const result = flattenToExpression("s←'oops\nsize←64");
    expect(result).toMatchObject({ ok: false, reason: 'unterminatedString' });
  });
});

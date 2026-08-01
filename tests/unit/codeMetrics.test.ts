import { describe, expect, it } from 'vitest';
import { aplCharacterCount, captionLinesFor } from '@/presets/codeMetrics';
import { modularBloom } from '@/presets/modular-bloom';
import { presets } from '@/presets/presets';

describe('aplCharacterCount', () => {
  it('counts the expression that runs, not the editor contents', () => {
    const withComments = '⍝ Controls\nsize←4\n\n⍝ Draw it\nsize size⍴1';
    const withoutComments = 'size←4 ⋄ size size⍴1';

    expect(aplCharacterCount(withComments)).toBe([...withoutComments].length);
    // The naive count would be much larger, and would be claiming credit for
    // prose the interpreter never sees.
    expect(aplCharacterCount(withComments)).toBeLessThan([...withComments].length);
  });

  it('counts an APL glyph as one character', () => {
    // Eight glyphs, several of which are multiple UTF-16 units.
    expect(aplCharacterCount('⍳⍴⌽⊖⍉∘⍨⍤')).toBe(8);
  });

  it('is zero for source with nothing to run', () => {
    expect(aplCharacterCount('⍝ just a comment')).toBe(0);
    expect(aplCharacterCount('')).toBe(0);
  });

  it('reflects an edit the user has made', () => {
    const smaller = modularBloom.code.replace('size←64', 'size←8');
    expect(aplCharacterCount(smaller)).toBeLessThan(aplCharacterCount(modularBloom.code));
  });
});

describe('captionLinesFor', () => {
  it('names the piece and states how little code made it', () => {
    const lines = captionLinesFor('Modular Bloom', 'size←4 ⋄ size size⍴1');
    expect(lines[0]).toBe('Modular Bloom');
    expect(lines[1]).toBe('Generated with 20 characters of Dyalog APL');
  });

  it('makes a claim that can be checked against the code', () => {
    // The whole point of the caption is that a sceptic can count for
    // themselves, so the number has to be the length of the real expression.
    for (const preset of presets) {
      const lines = captionLinesFor(preset.title, preset.code);
      const stated = Number(/(\d+) characters/u.exec(lines[1] ?? '')?.[1]);
      expect(stated, preset.id).toBe(aplCharacterCount(preset.code));
      expect(stated, preset.id).toBeGreaterThan(0);
    }
  });

  it('agrees with the figure the gallery card shows', () => {
    // Both read the same helper, so a visitor cannot be told two numbers for
    // the same artwork.
    for (const preset of presets) {
      const caption = captionLinesFor(preset.title, preset.code)[1] ?? '';
      expect(caption).toContain(`${aplCharacterCount(preset.code)} characters`);
    }
  });
});

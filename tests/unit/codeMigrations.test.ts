/**
 * Bringing forward code written before a preset renamed a variable.
 *
 * This is the only thing in the application that rewrites somebody's code
 * without being asked, so the tests are mostly about the cases where it must
 * decline to.
 */

import { describe, expect, it } from 'vitest';
import { migratePresetCode } from '@/presets/codeMigrations';
import { bindingStateFor } from '@/editor/parameterBinding';
import { truchetGrid } from '@/presets/truchet-grid';
import { mandelbrotField } from '@/presets/mandelbrot-field';

/** A Truchet tiling as it was shared before the rename. */
const OLD_CODE = [
  '⍝ Controls',
  'size←20',
  'seed←7',
  'density←3',
  '',
  'angle←(12.9898×⍳size)∘.+(78.233×⍳size)+seed×0.6180339887',
  'density|⌊density×1|43758.5453×1○angle',
].join('\n');

describe('migratePresetCode', () => {
  it('renames the assignment and every use of it', () => {
    // Renaming only the assignment would leave a VALUE ERROR, which is worse
    // than a detached control.
    const migrated = migratePresetCode('truchet-grid', OLD_CODE);
    expect(migrated).toContain('classes←3');
    expect(migrated).toContain('classes|⌊classes×1|');
    expect(migrated).not.toContain('density');
  });

  it('reconnects the control that would otherwise have detached', () => {
    const parameter = truchetGrid.parameters.find((candidate) => candidate.variable === 'classes');
    expect(parameter).toBeDefined();

    // Before: the preset looks for `classes`, the code says `density`.
    expect(bindingStateFor(OLD_CODE, parameter!).status).toBe('detached');

    const binding = bindingStateFor(migratePresetCode('truchet-grid', OLD_CODE), parameter!);
    expect(binding.status).toBe('bound');
    // The value the sharer chose, not the preset's default.
    expect(binding.status === 'bound' ? binding.value : null).toBe(3);
  });

  it('leaves code that already uses the new name alone', () => {
    expect(migratePresetCode('truchet-grid', truchetGrid.code)).toBe(truchetGrid.code);
  });

  it('does not touch a preset that has renamed nothing', () => {
    const code = 'size←64\ndensity←3\ndensity|∘.×⍨⍳size';
    expect(migratePresetCode('modular-bloom', code)).toBe(code);
  });

  it('stands aside when the author already has the new name', () => {
    /*
     * Both names present means the code has moved on under its own steam.
     * Rewriting here could only collide with something deliberate — and a
     * collision would silently change what the code computes.
     */
    const both = 'classes←5\ndensity←2\nclasses+density';
    expect(migratePresetCode('truchet-grid', both)).toBe(both);
  });

  it('does not rename part of a longer name', () => {
    const code = 'densityScale←2\nmydensity←3\ndensityScale×mydensity';
    expect(migratePresetCode('truchet-grid', code)).toBe(code);
  });

  it('renames a use inside a longer expression, but only the whole word', () => {
    expect(migratePresetCode('truchet-grid', '⌊density×2+densityScale')).toBe('⌊classes×2+densityScale');
  });

  describe('leaves alone anything that is not code', () => {
    it('does not edit a comment', () => {
      // Somebody's note about their own artwork. Rewriting prose is not
      // migrating a variable, and the first version of this did it.
      const code = 'density←2 ⍝ density of the tiling, chosen by eye\ndensity|⍳4';
      expect(migratePresetCode('truchet-grid', code)).toBe(
        'classes←2 ⍝ density of the tiling, chosen by eye\nclasses|⍳4',
      );
    });

    it('does not edit a whole-line comment', () => {
      const code = '⍝ density picks the tile\ndensity←2\ndensity|⍳4';
      const migrated = migratePresetCode('truchet-grid', code);
      expect(migrated).toContain('⍝ density picks the tile');
      expect(migrated).toContain('classes←2');
    });

    it('does not edit character data', () => {
      // A string is a value the artwork carries, not a name it refers to.
      const code = "label←'density'\ndensity←2\ndensity|⍳4";
      const migrated = migratePresetCode('truchet-grid', code);
      expect(migrated).toContain("label←'density'");
      expect(migrated).toContain('classes←2');
      expect(migrated).toContain('classes|⍳4');
    });

    it('handles a doubled quote inside character data', () => {
      const code = "label←'the density''s value'\ndensity←2";
      const migrated = migratePresetCode('truchet-grid', code);
      expect(migrated).toContain("label←'the density''s value'");
      expect(migrated).toContain('classes←2');
    });

    it('is not fooled by a comment marker inside character data', () => {
      // `⍝` in a string does not start a comment, so the code after it is still
      // code and still has to be renamed.
      const code = "label←'⍝ not a comment'⋄density←2";
      const migrated = migratePresetCode('truchet-grid', code);
      expect(migrated).toBe("label←'⍝ not a comment'⋄classes←2");
    });

    it('gets every kind of non-code right at once', () => {
      /*
       * All the ways `density` and `classes` can appear without being a name,
       * in one artwork: a whole-line comment, the old name as character data,
       * the *new* name as character data, and a comment marker inside a string.
       *
       * The middle two are the ones that matter most. If either counted as a
       * use, the real assignment on the first line would be left behind — the
       * control detached because of a word in a caption.
       */
      const code = [
        'density←2',
        '⍝ density controls the old version',
        "label←'density'",
        "text←'four tile classes look best'",
        "quotedComment←'not ⍝ a comment'",
        'density|⍳4',
      ].join('\n');

      expect(migratePresetCode('truchet-grid', code)).toBe(
        [
          'classes←2',
          '⍝ density controls the old version',
          "label←'density'",
          "text←'four tile classes look best'",
          "quotedComment←'not ⍝ a comment'",
          'classes|⍳4',
        ].join('\n'),
      );
    });

    it('steps over doubled quotes around the old name itself', () => {
      // The inner `'density'` must not be read as a literal of its own, which
      // would leave the surrounding text looking executable.
      const code = "text←'the word ''density'' is data'\ndensity←2";
      expect(migratePresetCode('truchet-grid', code)).toBe("text←'the word ''density'' is data'\nclasses←2");
    });

    it('does not count a mention in a comment as already using the new name', () => {
      /*
       * The stand-aside rule asks whether the code *uses* the new name. A
       * comment that happens to say "classes" is not a use, and treating it as
       * one would leave the control detached for the sake of a word in prose.
       */
      const code = '⍝ four tile classes look best\ndensity←2\ndensity|⍳4';
      const migrated = migratePresetCode('truchet-grid', code);
      expect(migrated).toContain('classes←2');
      expect(migrated).toContain('⍝ four tile classes look best');
    });
  });
});

describe('bringing forward a corrected line', () => {
  const OLD_STEP = 'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}';
  const OLD_SEED = '⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)';

  it('replaces the step that resumed counting after an escape', () => {
    const before = ['size←128', OLD_STEP, OLD_SEED].join('\n');
    const after = migratePresetCode('mandelbrot-field', before);

    // The saved artwork gets the correction, so somebody who never edited the
    // code is not left running a version with a known wrong answer in it.
    expect(after).toContain('a←a∧4>(zr*2)+zi*2');
    expect(after).toContain('((size,size)⍴1)');
    expect(after).not.toContain(OLD_STEP);
  });

  it('leaves the line alone once it is already current', () => {
    const current = mandelbrotField.code;
    expect(migratePresetCode('mandelbrot-field', current)).toBe(current);
  });

  it('does not touch a step somebody has edited themselves', () => {
    /*
     * Matched exactly, so a partial match cannot rewrite half of an edit into
     * something that no longer runs. Their code is theirs; only an untouched
     * copy of ours is ours to correct.
     */
    const edited = OLD_STEP.replace('4>', '9>');
    const before = ['size←128', edited, OLD_SEED].join('\n');

    expect(migratePresetCode('mandelbrot-field', before)).toContain(edited);
  });

  it('says nothing about other presets', () => {
    const before = ['size←128', OLD_STEP].join('\n');
    expect(migratePresetCode('truchet-grid', before)).toContain(OLD_STEP);
  });
});

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

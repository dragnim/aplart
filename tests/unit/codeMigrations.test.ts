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
});

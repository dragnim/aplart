/**
 * Work saved before the APL moved into `.apl` files still opens unchanged.
 *
 * Nobody's saved project or shared link records which file the program came
 * from — it records the program. So the question the extraction has to answer
 * is narrow and absolute: is the string identical? If it is, a restored piece
 * still reads "Original" and its controls still bind. If a single character
 * moved — a stripped comment, a lost final newline, a normalised glyph — the
 * same piece would open as somebody's edit of an artwork they never edited.
 *
 * The programs below are written out in full, exactly as they were embedded in
 * TypeScript before the move. That duplication is the point: it is a record of
 * what shipped, independent of the file the application now reads.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeShareState } from '@/sharing/encodeShareState';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { codeEditor } from '../helpers/workspaceModes';

/** Modular Bloom exactly as it shipped inline. */
const BLOOM_AS_SHIPPED = [
  '⍝ Controls',
  'size←64',
  'modulus←17',
  'multiplier←1',
  '',
  '⍝ Multiply every number by every other, then fold by the modulus',
  'modulus|multiplier×∘.×⍨⍳size',
].join('\n');

/**
 * Mandelbrot Field exactly as it shipped inline, comments and all.
 *
 * Kept verbatim, including `iterations←28`, although the preset now defaults to
 * 48. This is not the current program — it is the record of a program that is
 * out there in saved projects and in links people have posted, and the test
 * below is about those still working.
 */
const MANDELBROT_AS_SHIPPED = [
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
  '⍝ Repeat z←z²+c, counting the steps each point survives. `a` marks the',
  '⍝ points that have not escaped; once one has, it can never count again.',
  'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}',
  '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)',
].join('\n');

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

describe('the program that shipped', () => {
  it('is the program the file now provides, where nothing has deliberately changed', () => {
    // The whole of the extraction's compatibility argument, stated once.
    expect(modularBloom.code).toBe(BLOOM_AS_SHIPPED);
  });

  it('differs from Mandelbrot in exactly the one line that was meant to change', () => {
    /*
     * The iteration default moved from 28 to 48 in Stage 4, on measurement. So
     * this is no longer an equality — but it must still be a difference of one
     * assignment and nothing else, which is a stronger statement than equality
     * would have been once a change was intended.
     */
    const shipped = MANDELBROT_AS_SHIPPED.split('\n');
    const now = mandelbrotField.code.split('\n');

    expect(now).toHaveLength(shipped.length);
    const differing = now.filter((line, index) => line !== shipped[index]);
    expect(differing).toEqual(['iterations←48']);
  });

  it('has no trailing newline, as the editor never showed one', () => {
    expect(modularBloom.code.endsWith('\n')).toBe(false);
    expect(mandelbrotField.code.endsWith('\n')).toBe(false);
  });
});

describe('a link shared before the move', () => {
  it('opens as the original artwork rather than as somebody’s edit', async () => {
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: BLOOM_AS_SHIPPED,
      params: {},
      palette: 'ember',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    render(
      <WorkspacePage
        presetId={modularBloom.id}
        sharedState={encoded}
        service={new MockAplExecutionService()}
      />,
    );

    expect(await screen.findByText(/shared with you/)).toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.queryByText('Edited')).not.toBeInTheDocument();
  });

  it('still opens and still works when it names the old iteration default', async () => {
    /*
     * A Mandelbrot link posted before Stage 4 carries `iterations←28`, and the
     * preset now defaults to 48. It is marked "Edited", which is the truth —
     * the code differs from the preset — and that is the price of ever changing
     * a default. What must not happen is the link failing to open, the value
     * being rewritten to 48 behind the sharer's back, or the control detaching.
     */
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: MANDELBROT_AS_SHIPPED,
      params: {},
      palette: 'heat',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    render(
      <WorkspacePage
        presetId={mandelbrotField.id}
        sharedState={encoded}
        service={new MockAplExecutionService()}
      />,
    );

    expect(await screen.findByText(/shared with you/)).toBeInTheDocument();

    // The sharer's own value, untouched, with its control bound to it.
    expect(codeEditor().textContent).toContain('iterations←28');
    expect(screen.getByLabelText('Maximum iterations')).toHaveValue('28');
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('still binds every control to the assignment it names', async () => {
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: BLOOM_AS_SHIPPED,
      params: {},
      palette: 'ember',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    render(
      <WorkspacePage
        presetId={modularBloom.id}
        sharedState={encoded}
        service={new MockAplExecutionService()}
      />,
    );

    await screen.findByText(/shared with you/);
    expect(screen.getByLabelText('Size')).toHaveValue('64');
    expect(screen.getByLabelText('Modulus')).toHaveValue('17');
    expect(screen.getByLabelText('Multiplier')).toHaveValue('1');
  });
});

describe('a project saved before the move', () => {
  it('restores unedited, with its controls bound', () => {
    const saved = {
      schemaVersion: 1,
      id: 'saved-before-extraction',
      sourcePresetId: modularBloom.id,
      title: 'Modular Bloom',
      code: BLOOM_AS_SHIPPED,
      parameterValues: {},
      paletteId: 'ember',
      renderOptions: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    localStorage.setItem('apl-art:projects', JSON.stringify([saved.id]));
    localStorage.setItem(`apl-art:project:${saved.id}`, JSON.stringify(saved));

    render(
      <WorkspacePage presetId={modularBloom.id} sharedState={null} service={new MockAplExecutionService()} />,
    );

    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByLabelText('Modulus')).toHaveValue('17');
  });
});

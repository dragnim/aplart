/**
 * What a control may say about the code, and what it may not.
 *
 * Every expectation here is worked out from the source text independently — by
 * splitting it into lines and counting characters — rather than by calling the
 * binding helpers the code under test calls. Two paths through one helper agreeing
 * proves nothing about whether the answer is right, and the fault worth catching
 * is a confident sentence naming a line that is not the one the control writes.
 *
 * The other fault worth catching is quieter: a view assembled from the preset's
 * configuration rather than from the source. It agrees with the source exactly
 * until somebody edits the code — which is the moment the claim matters.
 */

import { describe, expect, it } from 'vitest';
import { setParameterValue } from '@/editor/parameterBinding';
import { modularBloom } from '@/presets/modular-bloom';
import { truchetGrid } from '@/presets/truchet-grid';
import { type InstantPlayConfig, type InstantPlayControl } from '@/presets/instantPlay';
import { peekAt, revealTargetFor } from '@/workspace/peek';
import { type ArtworkParameter } from '@/presets/schema';

const config = modularBloom.instantPlay as InstantPlayConfig;
const controlFor = (parameterId: string) =>
  config.controls.find((control) => control.parameterId === parameterId) as InstantPlayControl;
const parameterFor = (id: string) =>
  modularBloom.parameters.find((parameter) => parameter.id === id) as ArtworkParameter;

/** Where a variable is assigned, found by reading the text rather than by asking. */
function lineHolding(code: string, variable: string): { line: number; text: string } {
  const lines = code.split('\n');
  const line = lines.findIndex((text) => text.trimStart().startsWith(`${variable}←`));
  return { line, text: lines[line] as string };
}

describe('what every Play control says about the source it opened with', () => {
  it('names its own variable and the assignment the code actually makes', () => {
    for (const control of config.controls) {
      const view = peekAt(modularBloom, control, modularBloom.code);
      const { line, text } = lineHolding(modularBloom.code, view?.variable ?? '');

      expect(view?.status, control.parameterId).toBe('bound');
      expect(view?.label).toBe(control.label);
      expect(view?.description).toBe(control.description);
      // The assignment as written, with the layout around it taken off.
      expect(view?.assignment, control.parameterId).toBe(text.trim());
      expect(view?.target?.line).toBe(line);
    }
  });

  it('points at the value, not at the line', () => {
    const view = peekAt(modularBloom, controlFor('modulus'), modularBloom.code);
    const { text } = lineHolding(modularBloom.code, 'modulus');
    const target = view?.target;

    // Counted here rather than derived: `modulus←17` puts the value at column 8,
    // which is the length of the name plus the arrow.
    expect(target?.from).toBe('modulus←'.length);
    expect(text.slice(target?.from, target?.to)).toBe('17');
  });

  it('offers one view per control, in the order they are shown', () => {
    const views = config.controls.map((control) => peekAt(modularBloom, control, modularBloom.code));

    expect(views.map((view) => view?.label)).toEqual(['Complexity', 'Scale', 'Detail']);
    expect(views.map((view) => view?.variable)).toEqual(['multiplier', 'modulus', 'size']);
  });

  it('declines a control belonging to another preset', () => {
    // Truchet has no Play controls at all, so one of Modular Bloom's names
    // nothing there — which is the same refusal as a mistyped parameter id.
    expect(peekAt(truchetGrid, controlFor('modulus'), truchetGrid.code)).toBeNull();
  });

  it('declines a control naming no parameter of this preset', () => {
    const stray = { ...controlFor('size'), parameterId: 'thickness' };

    expect(peekAt(modularBloom, stray, modularBloom.code)).toBeNull();
  });
});

describe('the source, not the configuration', () => {
  it('follows the code when it changes', () => {
    const changed = setParameterValue(modularBloom.code, 'multiplier', 7);
    const view = peekAt(modularBloom, controlFor('multiplier'), changed.ok ? changed.code : '');

    expect(view?.assignment).toBe('multiplier←7');
  });

  it('never falls back to the parameter’s default', () => {
    /*
     * The mutation this exists for: a view built from configuration would say
     * `multiplier←1`, the preset's default, however the code had been edited. The
     * value here is deliberately one the configuration does not contain.
     */
    const changed = setParameterValue(modularBloom.code, 'multiplier', 9);
    const view = peekAt(modularBloom, controlFor('multiplier'), changed.ok ? changed.code : '');

    expect(view?.assignment).toBe('multiplier←9');
    expect(view?.assignment).not.toContain(String(parameterFor('multiplier').defaultValue));
  });

  it('reads a line somebody has laid out differently', () => {
    // Extra spaces around the value and a note after it. The assignment is what
    // the control sets; the note is the author's and is not repeated as one.
    const code = 'size←   40    ⍝ my own note\nmodulus←17\nmultiplier←1';
    const view = peekAt(modularBloom, controlFor('size'), code);

    expect(view?.assignment).toBe('size←40');
    expect(view?.target).toEqual({ line: 0, from: 'size←   '.length, to: 'size←   40'.length });
  });

  it('finds a line wherever it has been moved to', () => {
    const code = ['⍝ a comment first', '', 'multiplier←3', 'modulus←17', 'size←64'].join('\n');

    expect(peekAt(modularBloom, controlFor('multiplier'), code)?.target?.line).toBe(2);
    expect(peekAt(modularBloom, controlFor('size'), code)?.target?.line).toBe(4);
  });
});

describe('when a control is no longer connected', () => {
  it('claims no value for an expression, but still offers the line', () => {
    // The line is there and it is theirs now. Showing it is useful; naming a
    // value for it would be a guess.
    const code = 'size←64\nmodulus←2+3×5\nmultiplier←1';
    const view = peekAt(modularBloom, controlFor('modulus'), code);

    expect(view?.status).toBe('unrepresentable');
    expect(view?.assignment).toBeNull();
    expect(view?.target).toEqual({ line: 1, from: 'modulus←'.length, to: 'modulus←2+3×5'.length });
  });

  it('claims nothing at all when the assignment has gone', () => {
    const code = 'size←64\nmultiplier←1\nmodulus|multiplier×∘.×⍨⍳size';
    const view = peekAt(modularBloom, controlFor('modulus'), code);

    expect(view?.status).toBe('detached');
    expect(view?.assignment).toBeNull();
    expect(view?.target).toBeNull();
    // The words for it are still there, so the disclosure can explain itself.
    expect(view?.label).toBe('Scale');
    expect(view?.variable).toBe('modulus');
  });

  it('is not fooled by the variable appearing somewhere else', () => {
    // `modulus` is used in the last line but assigned nowhere.
    const code = 'size←64\nmultiplier←1\nr←modulus|multiplier×∘.×⍨⍳size';

    expect(peekAt(modularBloom, controlFor('modulus'), code)?.status).toBe('detached');
  });
});

describe('revealTargetFor', () => {
  it('agrees with the view, because it is what the view uses', () => {
    const view = peekAt(modularBloom, controlFor('size'), modularBloom.code);

    expect(revealTargetFor(modularBloom.code, parameterFor('size'))).toEqual(view?.target);
  });

  it('is null when the source assigns nothing', () => {
    expect(revealTargetFor('⍝ nothing here', parameterFor('size'))).toBeNull();
  });
});

/**
 * What a Play control can honestly say about the code behind it.
 *
 * The claim Peek makes is "this control changes that line", so everything here is
 * read out of the source through the same binding the controls write through. No
 * part of it is assembled from the configuration or from a slider's position: a
 * control announcing `size←64` while the code says `size←40` would be a confident
 * lie, and that is precisely the lie a view model built from configuration tells
 * the moment somebody edits the source.
 *
 * Three states, because there are three honest things to say. Bound: this
 * assignment, here. Present but not a plain value: the line is yours now, and no
 * value is claimed for it. Gone: nothing to point at.
 */

import { bindingStateFor, findAssignment } from '@/editor/parameterBinding';
import { parameterForControl, type InstantPlayControl } from '@/presets/instantPlay';
import { type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';

/** Where the editor should be asked to look, in zero-based line and columns. */
export interface RevealTarget {
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

export type PeekStatus =
  /** A plain assignment, which this control sets. */
  | 'bound'
  /** The line is there and holds something a control cannot represent. */
  | 'unrepresentable'
  /** No such assignment anywhere in the source. */
  | 'detached';

export interface PeekView {
  readonly label: string;
  readonly variable: string;
  readonly description: string;
  readonly status: PeekStatus;
  /**
   * The assignment as the source writes it, e.g. `multiplier←7`.
   *
   * Null unless the control is bound, because those are the only cases where
   * naming a value would be true. A trailing comment is left out: it is the
   * author's note about the line rather than part of what the control sets.
   */
  readonly assignment: string | null;
  /** Where to reveal it, or null when the source holds nothing to reveal. */
  readonly target: RevealTarget | null;
}

/** Where a parameter's assignment sits in this source, or null if it has none. */
export function revealTargetFor(code: string, parameter: ArtworkParameter): RevealTarget | null {
  const location = findAssignment(code, parameter.variable);
  if (location === null) return null;

  return {
    line: location.line,
    // The prefix is everything up to and including the arrow, so its length is
    // the column the value starts at — no second parse, and no way for the
    // highlight to disagree with the sentence above it.
    from: location.prefix.length,
    to: location.prefix.length + location.valueText.length,
  };
}

/**
 * What this control can say, given the source as it stands.
 *
 * Null only when the control names no parameter of this preset, which validation
 * already refuses — so in practice this is total, and the null is a belt.
 */
export function peekAt(preset: ArtworkPreset, control: InstantPlayControl, code: string): PeekView | null {
  const parameter = parameterForControl(preset, control);
  if (parameter === undefined) return null;

  const binding = bindingStateFor(code, parameter);
  const common = {
    label: control.label,
    variable: parameter.variable,
    description: control.description,
  };

  if (binding.status === 'detached') {
    return { ...common, status: 'detached', assignment: null, target: null };
  }

  const { location } = binding;
  const target = revealTargetFor(code, parameter);

  if (binding.status === 'unrepresentable') {
    /*
     * The line can still be shown — that is the useful thing to do with an
     * expression somebody has written — but nothing is claimed about its value.
     */
    return { ...common, status: 'unrepresentable', assignment: null, target };
  }

  return {
    ...common,
    status: 'bound',
    // From the source: the prefix as written up to the arrow, then the value as
    // written after it. `  size← 40  ⍝ note` reads as `size←40`.
    assignment: `${location.prefix.trim()}${location.valueText}`,
    target,
  };
}

/** Every Play control's view of this source, in the order they are offered. */
export function peekAtAll(preset: ArtworkPreset, code: string): readonly PeekView[] {
  const controls = preset.instantPlay?.controls ?? [];

  return controls
    .map((control) => peekAt(preset, control, code))
    .filter((view): view is PeekView => view !== null);
}

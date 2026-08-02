/**
 * What the artwork that ran can say about its repeated edges.
 *
 * Read from the source that produced the result, never from the editor. The
 * claim describes the artwork on screen, so editing the class count changes what
 * the *next* run will be able to say and nothing about this one — the same rule
 * the colouring range and the inspector's wording already follow, and for the
 * same reason.
 */

import { numberAssignedTo } from '@/editor/parameterBinding';
import { type ArtworkPreset } from '@/presets/schema';

export interface EdgeClaim {
  /** The control this sits beside. */
  readonly variable: string;
  readonly compatible: boolean;
  readonly title: string;
  readonly detail: string;
}

export function edgeClaimFor(preset: ArtworkPreset, source: string | null): EdgeClaim | null {
  const declared = preset.edgeCompatibility;
  if (declared === undefined || source === null) return null;

  const value = numberAssignedTo(source, declared.variable);
  /*
   * A count rewritten into an expression is not something to make a claim
   * about. Saying nothing is the honest answer; guessing at the compatible case
   * would be the one mistake that matters here.
   */
  if (value === null) return null;

  const compatible = value <= declared.compatibleUpTo;
  const wording = compatible ? declared.compatible : declared.uncertain;

  return { variable: declared.variable, compatible, ...wording };
}

/**
 * How much APL an artwork actually is.
 *
 * Counting the whole editor contents would include the comments and the blank
 * lines, which is a larger number and a less true one — none of it reaches the
 * interpreter. This counts the expression that runs: comments stripped, blank
 * lines dropped, statements joined.
 *
 * The same figure is used on the gallery card and in the exported caption, so
 * the two cannot disagree, and neither overstates the case for APL.
 */

import { flattenToExpression } from '@/execution/aplSource';

export function aplCharacterCount(code: string): number {
  const flattened = flattenToExpression(code);
  if (!flattened.ok) return 0;
  // Counted in code points: an APL glyph is one character to a person.
  return [...flattened.expression].length;
}

/**
 * The caption offered on export.
 *
 * Two lines: what the piece is, and how little code it took. The second line
 * is the point — "generated with 63 characters of Dyalog APL" is the claim
 * this whole application exists to make, and it should be checkable by anyone
 * who reads it.
 */
export function captionLinesFor(title: string, code: string): readonly string[] {
  const characters = aplCharacterCount(code);
  return [title, `Generated with ${characters} characters of Dyalog APL`];
}

/**
 * A prototype of a single adaptive first request.
 *
 * Not wired into the application. The question it exists to answer: can one
 * request evaluate the source, decide whether the result is drawable, measure
 * how wide and how tall its printed form would be, and then either return the
 * whole matrix or say precisely why it could not — so that no execution is ever
 * spent and discarded.
 *
 * The decision is made in APL, because only APL knows how it will format its own
 * numbers. Deciding on the client from the row count alone would miss a short
 * matrix of very wide values, which truncates at the line-length cap instead.
 */

import { type ExecutionCapabilities } from '@/execution/AplExecutionService';
import { elementTypeOf, type AplElementType } from '@/execution/transport';

/**
 * The token that says "this is metadata, not an artwork".
 *
 * A comment glyph and letters: a drawable result is a numeric matrix, so no
 * valid result can begin this way and no parser can confuse the two. Versioned
 * from the start, so a future shape can be told from this one rather than
 * guessed at.
 */
export const ADAPTIVE_MARKER = '⍝APLART1';

/** The APL name the wrapper binds the user's result to. */
const RESULT = 'r';

function bindResult(statements: readonly string[]): string {
  const leading = statements.slice(0, -1);
  const final = statements[statements.length - 1] ?? '';
  return [...leading, `${RESULT}←(${final})`].join(' ⋄ ');
}

/**
 * One request that returns the artwork, or the reason it cannot.
 *
 * `n<lines` and `w<width` are both strict. At exactly the line cap a reply is
 * indistinguishable from one truncated there, which is the rule the existing
 * direct path already applies; the same argument holds at the width cap, and
 * whether it is needed in practice is one of the things the prototype measures.
 */
export function buildAdaptiveExpression(
  statements: readonly string[],
  capabilities: ExecutionCapabilities,
): string {
  /*
   * Written inside the glyph set the endpoint actually permits, which is
   * narrower than Dyalog's. Measured, not assumed: `∈` comes back as
   * "NOT SUPPORTED", so membership is spelled out as three comparisons.
   *
   * `⊃…↓` selects the branch, and the formatted array is taken once into `f`
   * rather than formatted twice.
   *
   * The formatting is deferred behind a dfn guard so that an undrawable result
   * is never formatted merely to measure dimensions nobody will use. Guards are
   * supported by the endpoint — checked, since `∈` was not — and an undrawable
   * result reports its size as 0 rather than a number it did not measure.
   */
  const meta = `'${ADAPTIVE_MARKER} ',⍕(≢s),(≡${RESULT}),(⎕DR ${RESULT}),n,w,s`;

  return (
    `${bindResult(statements)} ⋄ ` +
    `s←⍴${RESULT} ⋄ ` +
    `t←10|⎕DR ${RESULT} ⋄ ` +
    `num←(t=1)∨(t=3)∨(t=5) ⋄ ` +
    `ok←(2=≢s)∧(1=≡${RESULT})∧num ⋄ ` +
    `d←{⍵:(≢f),⊃⌽⍴f⊣f←⍕${RESULT} ⋄ 0 0}ok ⋄ ` +
    `n←⊃d ⋄ ` +
    `w←⊃⌽d ⋄ ` +
    `fits←ok∧(n<${String(capabilities.maxOutputLines)})∧` +
    `(w<${String(capabilities.maxLineLength)}) ⋄ ` +
    `⊃fits↓(${meta}) ${RESULT}`
  );
}

export interface AdaptiveMetadata {
  readonly kind: 'metadata';
  readonly rank: number;
  readonly depth: number;
  readonly dataRepresentation: number;
  readonly elementType: AplElementType;
  /** Lines the printed form would occupy. */
  readonly lines: number;
  /** Width of the widest printed line, or 0 when the result is undrawable. */
  readonly width: number;
  readonly shape: readonly number[];
}

export type AdaptiveReply =
  | { readonly kind: 'matrix'; readonly lines: readonly string[] }
  | AdaptiveMetadata
  | { readonly kind: 'error'; readonly reason: string };

/** Tells an artwork from an explanation, by the marker alone. */
export function parseAdaptiveReply(lines: readonly string[]): AdaptiveReply {
  const first = lines[0]?.trim() ?? '';
  if (!first.startsWith(ADAPTIVE_MARKER)) {
    return { kind: 'matrix', lines };
  }

  const numbers = first
    .slice(ADAPTIVE_MARKER.length)
    .trim()
    .split(/\s+/u)
    .map((token) => Number(token.replace('¯', '-')));

  const [rank, depth, dataRepresentation, count, width, ...shape] = numbers;
  if (
    rank === undefined ||
    depth === undefined ||
    dataRepresentation === undefined ||
    count === undefined ||
    width === undefined ||
    !Number.isFinite(rank)
  ) {
    return { kind: 'error', reason: `could not read the metadata: "${first}"` };
  }

  return {
    kind: 'metadata',
    rank,
    depth,
    dataRepresentation,
    elementType: elementTypeOf(dataRepresentation),
    lines: count,
    width,
    shape,
  };
}

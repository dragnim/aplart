/**
 * A single adaptive first request.
 *
 * One request evaluates the source, decides whether the result is drawable,
 * measures how wide and how tall its printed form would be, and then either
 * returns the whole matrix or says precisely why it could not — so no execution
 * is ever spent and discarded, and no preset metadata is consulted.
 *
 * The decision is made in APL, because only APL knows how it will format its own
 * numbers. Deciding on the client from the row count alone would miss a short
 * matrix of very wide values, which truncates at the line-length cap instead.
 */

import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type ExecutionCapabilities } from './AplExecutionService';
import { bindResult, elementTypeOf, formatBandReply, type AplElementType } from './transport';

/**
 * The token that says "this is metadata, not an artwork".
 *
 * A comment glyph and letters: a drawable result is a numeric matrix, so no
 * valid result can begin this way and no parser can confuse the two. Versioned
 * from the start, so a future shape can be told from this one rather than
 * guessed at.
 */
export const ADAPTIVE_MARKER = '⍝APLART1';

/** The APL name `bindResult` binds the user's result to. */
const RESULT = 'r';

/**
 * One request that returns the artwork, or the reason it cannot.
 *
 * `n<lines` and `w<width` are both strict. At exactly the line cap a reply is
 * indistinguishable from one truncated there; the same argument holds at the
 * width cap. Measured: 92 lines print and 93 band, 989 characters print and 998
 * band.
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
    !numbers.every((value) => Number.isFinite(value))
  ) {
    return { kind: 'error', reason: `could not read the metadata: "${first}"` };
  }

  /*
   * One axis length per axis, or the line is not describing what it claims to.
   * Nothing downstream would notice a missing axis — a rank-2 reply with one
   * number would simply be read as a matrix with zero columns — so the reply is
   * refused here instead.
   */
  if (shape.length !== rank) {
    return {
      kind: 'error',
      reason: `the metadata reported rank ${String(rank)} but gave ${String(shape.length)} axis lengths`,
    };
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

// ---------------------------------------------------------------------------
// Reply formatting, used by the mock service and the end-to-end stub to
// imitate the backend. Nothing here runs in the production build.
// ---------------------------------------------------------------------------

/**
 * Formats what the adaptive request would return for a given matrix.
 *
 * The same decision the APL makes, made the same way: print the whole thing,
 * measure it, and hand back metadata instead if it would not have fitted. A
 * stub that returned the matrix unconditionally would never exercise the banded
 * path, and one that returned metadata unconditionally would never exercise the
 * complete path.
 */
export function formatAdaptiveReply(matrix: NumericMatrix, capabilities: ExecutionCapabilities): string[] {
  // Printed against no caps at all, because the width that decides the outcome
  // is the width before the backend would have cut it.
  const printed = formatBandReply(matrix, '', {
    ...capabilities,
    maxOutputLines: Number.MAX_SAFE_INTEGER,
    maxLineLength: Number.MAX_SAFE_INTEGER,
  });
  const count = printed.length;
  const width = printed.reduce((widest, line) => Math.max(widest, line.length), 0);

  // Strict on both, as the APL is: at either cap the reply is indistinguishable
  // from one truncated there.
  if (count < capabilities.maxOutputLines && width < capabilities.maxLineLength) {
    return printed;
  }

  const onlyZeroAndOne = matrix.values.every((value) => value === 0 || value === 1);
  const everyValueIsInteger = matrix.values.every((value) => Number.isInteger(value));
  const dataRepresentation = onlyZeroAndOne ? 11 : everyValueIsInteger ? 83 : 645;

  return [
    `${ADAPTIVE_MARKER} 2 1 ${String(dataRepresentation)} ${String(count)} ${String(width)} ` +
      `${String(matrix.rows)} ${String(matrix.columns)}`,
  ];
}

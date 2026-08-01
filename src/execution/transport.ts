/**
 * Getting a matrix out of a backend that truncates its output.
 *
 * TryAPL cuts every response at 93 lines of 995 characters, silently, and does
 * not keep variables between requests. Two strategies follow from that:
 *
 * **Direct** — send the expression, read the matrix APL prints. One request,
 * exact values, but limited to roughly 90 rows. This is what almost every
 * preset uses.
 *
 * **Banded** — ask APL for the shape and type first, then fetch the flattened
 * result in slices, re-executing the expression for each one, and stitch them
 * back together. Several requests, still exact, and it reaches 256x256. Only
 * presets that declare `highResolution` pay for it.
 *
 * The APL generated here wraps the user's expression; it never replaces it.
 * The artwork is still computed by the code shown in the editor.
 */

import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type ExecutionCapabilities } from './AplExecutionService';

/**
 * Distinctive fragments of the generated expressions.
 *
 * The mock service matches on these to tell a probe from a band read. They are
 * substrings of real APL rather than injected comments, because comments are
 * stripped before anything is sent.
 */
export const PROBE_MARKER = '(≢⍴r),(≡r),(⎕DR r)';
export const BAND_MARKER = '⌈(≢b)÷';

/** The APL name the wrapper binds the user's result to. */
const RESULT = 'r';

/**
 * Dyalog's `⎕DR` encodes the element type in its last digit.
 *
 * Measured: 83 an integer matrix, 645 a float matrix, 80 characters, 326 a
 * nested array, 1289 complex. Boolean arrays report 11.
 */
export type AplElementType = 'boolean' | 'integer' | 'float' | 'character' | 'nested' | 'complex' | 'unknown';

export function elementTypeOf(dataRepresentation: number): AplElementType {
  switch (dataRepresentation % 10) {
    case 1:
      return 'boolean';
    case 3:
      return 'integer';
    case 5:
      return 'float';
    case 0:
      return 'character';
    case 6:
      return 'nested';
    case 9:
      return 'complex';
    default:
      return 'unknown';
  }
}

export function isDrawableType(type: AplElementType): boolean {
  return type === 'boolean' || type === 'integer' || type === 'float';
}

/**
 * Binds the artwork's result to `r`, leaving the leading statements alone.
 *
 * Only the final statement is parenthesised. Wrapping the whole flattened
 * source — `r←(size←160 ⋄ 9|∘.×⍨⍳size)` — is not equivalent; the live service
 * returns a rank-1 result for it. The setup statements have to stay outside
 * the assignment.
 */
function bindResult(statements: readonly string[]): string {
  const leading = statements.slice(0, -1);
  const final = statements[statements.length - 1] ?? '';
  return [...leading, `${RESULT}←(${final})`].join(' ⋄ ');
}

/**
 * Asks for the shape and type of the result without transferring it.
 *
 * Rank, depth and `⎕DR` together reject everything the renderer cannot draw —
 * nested arrays, character data, complex numbers, wrong rank — before a single
 * cell crosses the wire, and with a precise reason rather than a guess made
 * from the printed text.
 */
export function buildProbeExpression(statements: readonly string[]): string {
  return `${bindResult(statements)} ⋄ ${PROBE_MARKER},(⍴${RESULT})`;
}

export interface ProbeReply {
  readonly rank: number;
  readonly depth: number;
  readonly dataRepresentation: number;
  readonly elementType: AplElementType;
  readonly shape: readonly number[];
}

export type ProbeParseResult =
  { readonly ok: true; readonly probe: ProbeReply } | { readonly ok: false; readonly reason: string };

export function parseProbeReply(lines: readonly string[]): ProbeParseResult {
  const text = lines.join(' ').trim();
  if (text === '') return { ok: false, reason: 'the shape probe returned nothing' };

  const tokens = text.split(/\s+/u);
  const numbers: number[] = [];
  for (const token of tokens) {
    const value = Number(token.replaceAll('¯', '-'));
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `the shape probe returned “${token}”, which is not a number` };
    }
    numbers.push(value);
  }

  // rank, depth and ⎕DR, then one value per axis.
  if (numbers.length < 3) {
    return { ok: false, reason: `the shape probe returned only ${numbers.length} values` };
  }

  const [rank, depth, dataRepresentation] = numbers as [number, number, number];
  const shape = numbers.slice(3);

  if (shape.length !== rank) {
    return {
      ok: false,
      reason: `the shape probe reported rank ${rank} but gave ${shape.length} axis lengths`,
    };
  }

  return {
    ok: true,
    probe: {
      rank,
      depth,
      dataRepresentation,
      elementType: elementTypeOf(dataRepresentation),
      shape,
    },
  };
}

/**
 * Reads a slice of the flattened result as a rectangle of `perLine` columns.
 *
 * The slice is padded up to a whole number of lines so the reshape is exact —
 * `⍴` would otherwise recycle values from the start of the slice to fill the
 * last row, quietly corrupting it. The caller knows how many values it asked
 * for and discards the padding.
 *
 * The expression is re-executed for each band because TryAPL does not keep
 * `r` between requests.
 */
export function buildBandExpression(
  statements: readonly string[],
  offset: number,
  count: number,
  perLine: number,
): string {
  return (
    `${bindResult(statements)} ⋄ ` +
    `b←${count}↑${offset}↓,${RESULT} ⋄ ` +
    `p←(${perLine}×${BAND_MARKER}${perLine})↑b ⋄ ` +
    `(((≢p)÷${perLine}),${perLine})⍴p`
  );
}

export interface BandPlan {
  readonly offset: number;
  readonly count: number;
  readonly perLine: number;
}

/**
 * Splits `totalCells` into requests that fit inside the backend's limits.
 *
 * `valueWidth` is the widest a single formatted value is expected to be,
 * including the space that separates it from the next. Getting it wrong is not
 * fatal — the reply carries fewer values than asked for and the runner retries
 * with a narrower estimate — but getting it close keeps the request count down.
 */
export function planBands(
  totalCells: number,
  valueWidth: number,
  capabilities: ExecutionCapabilities,
  safetyMargin = 0.95,
): BandPlan[] {
  const perLine = Math.max(1, Math.floor((capabilities.maxLineLength * safetyMargin) / valueWidth));
  // Stay below the line cap: hitting it exactly is indistinguishable from
  // being truncated at it.
  const linesPerBand = Math.max(1, Math.floor(capabilities.maxOutputLines * safetyMargin));
  const cellsPerBand = perLine * linesPerBand;

  const plans: BandPlan[] = [];
  for (let offset = 0; offset < totalCells; offset += cellsPerBand) {
    plans.push({ offset, count: Math.min(cellsPerBand, totalCells - offset), perLine });
  }
  return plans;
}

/**
 * How wide a formatted value is likely to be, from the probe alone.
 *
 * Deliberately generous. Under-estimating costs a retry; over-estimating only
 * costs an extra request or two.
 */
export function estimateValueWidth(type: AplElementType): number {
  switch (type) {
    case 'boolean':
      return 2; // "0 "
    case 'integer':
      return 9; // room for eight digits and a separator
    case 'float':
      return 16; // Dyalog prints up to ⎕PP significant digits by default
    case 'character':
    case 'nested':
    case 'complex':
    case 'unknown':
      // These are rejected before any band is planned; the width is only ever
      // consulted for drawable types.
      return 16;
  }
}

// ---------------------------------------------------------------------------
// Reply formatting, used by MockAplExecutionService to imitate the backend.
// ---------------------------------------------------------------------------

/** Formats what `buildProbeExpression` would return for a given matrix. */
export function formatProbeReply(matrix: NumericMatrix): string[] {
  const everyValueIsInteger = matrix.values.every((value) => Number.isInteger(value));
  const onlyZeroAndOne = matrix.values.every((value) => value === 0 || value === 1);
  const dataRepresentation = onlyZeroAndOne ? 11 : everyValueIsInteger ? 83 : 645;

  return [`2 1 ${dataRepresentation} ${matrix.rows} ${matrix.columns}`];
}

/**
 * Formats what a band read — or a direct read — would return.
 *
 * Values are separated by single spaces rather than column-aligned. The parser
 * treats any run of whitespace as one separator, so this is equivalent for its
 * purposes, and it keeps the mock simple.
 */
export function formatBandReply(
  matrix: NumericMatrix,
  expression: string,
  capabilities: ExecutionCapabilities,
): string[] {
  const band = parseBandArguments(expression);

  if (band === null) {
    // A direct read: print the matrix the way APL would.
    const lines: string[] = [];
    for (let row = 0; row < matrix.rows; row += 1) {
      const start = row * matrix.columns;
      lines.push(
        Array.from(matrix.values.subarray(start, start + matrix.columns))
          .map(format)
          .join(' '),
      );
    }
    return truncateLikeBackend(lines, capabilities);
  }

  const { offset, count, perLine } = band;
  const slice: number[] = [];
  for (let index = 0; index < count; index += 1) {
    slice.push(matrix.values[offset + index] ?? 0);
  }
  while (slice.length % perLine !== 0) slice.push(0);

  const lines: string[] = [];
  for (let start = 0; start < slice.length; start += perLine) {
    lines.push(
      slice
        .slice(start, start + perLine)
        .map(format)
        .join(' '),
    );
  }
  return truncateLikeBackend(lines, capabilities);
}

/** Reproduces the backend's silent truncation so tests can exercise it. */
function truncateLikeBackend(lines: readonly string[], capabilities: ExecutionCapabilities): string[] {
  return lines
    .slice(0, capabilities.maxOutputLines)
    .map((line) =>
      line.length > capabilities.maxLineLength ? line.slice(0, capabilities.maxLineLength) : line,
    );
}

function format(value: number): string {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
  return text.startsWith('-') ? `¯${text.slice(1)}` : text;
}

const BAND_ARGUMENTS = /b←(\d+)↑(\d+)↓,r ⋄ p←\((\d+)×/u;

function parseBandArguments(expression: string): { offset: number; count: number; perLine: number } | null {
  const match = BAND_ARGUMENTS.exec(expression);
  if (match === null) return null;

  return {
    count: Number(match[1]),
    offset: Number(match[2]),
    perLine: Number(match[3]),
  };
}

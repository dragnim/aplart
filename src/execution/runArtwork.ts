/**
 * Runs a preset's source and returns the matrix to draw.
 *
 * This is the seam between "some APL" and "a picture". It flattens the source,
 * chooses a transport strategy, checks that what came back is something the
 * renderer can honestly draw, and turns every failure into a message written
 * for someone who may not know APL.
 */

import { type MatrixLimits, validateMatrix } from '@/matrix/validateMatrix';
import { matrixStats, type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { parseMatrix } from '@/matrix/parseMatrix';
import { type AplExecutionService } from './AplExecutionService';
import { flattenToExpression } from './aplSource';
import { detectAplError, executionError } from './errors';
import {
  buildBandExpression,
  buildProbeExpression,
  estimateValueWidth,
  isDrawableType,
  parseProbeReply,
  planBands,
} from './transport';

/**
 * A ceiling on requests for one artwork, so a pathological re-planning loop
 * cannot turn a single Run press into an unbounded stream of calls to a shared
 * public service.
 */
const MAX_BAND_REQUESTS = 32;

/**
 * How much of a banded artwork has arrived so far.
 *
 * `values` is the full-size buffer, so the first `filled` entries are real and
 * the rest are zeroes that have never been fetched. Callers must not read past
 * `filled` — a zero there is the absence of a value, not a value of zero, and a
 * renderer that could not tell the two apart would paint an artwork's unread
 * half as though the calculation had returned nothing there.
 */
export interface RunProgress {
  readonly rows: number;
  readonly columns: number;
  readonly values: Float64Array;
  /** How many cells, in row-major order, hold data. */
  readonly filled: number;
  readonly total: number;
  /** Bands returned so far, for announcements rather than arithmetic. */
  readonly bandsDone: number;
}

export interface RunArtworkOptions {
  readonly service: AplExecutionService;
  /** The preset source as shown in the editor, comments and all. */
  readonly source: string;
  /**
   * Called as bands arrive, so a tall artwork can be shown building up.
   *
   * Only banded runs report anything; a direct read has nothing to report
   * between sending one request and having the whole matrix.
   */
  readonly onProgress?: ((progress: RunProgress) => void) | undefined;
  /** Use banded transport to exceed the single-request row limit. */
  readonly highResolution: boolean;
  readonly limits: MatrixLimits;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface ArtworkRun {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  readonly durationMs: number;
  /** How many backend calls this took; one for a direct read. */
  readonly requestCount: number;
  readonly warnings: readonly string[];
}

export async function runArtwork(options: RunArtworkOptions): Promise<ArtworkRun> {
  const flattened = flattenToExpression(options.source);
  if (!flattened.ok) {
    throw executionError('aplError', flattened.reason, flattened.message);
  }

  const startedAt = Date.now();

  const outcome = options.highResolution
    ? await runBanded(flattened.statements, options)
    : await runDirect(flattened.expression, options);

  const validation = validateMatrix(outcome.matrix, options.limits);
  if (!validation.ok) {
    throw executionError(
      validation.failure.kind === 'tooLarge' ? 'tooLarge' : 'invalidOutput',
      undefined,
      validation.failure.message,
    );
  }

  return {
    matrix: outcome.matrix,
    stats: matrixStats(outcome.matrix),
    durationMs: Date.now() - startedAt,
    requestCount: outcome.requestCount,
    warnings: outcome.warnings,
  };
}

interface TransportOutcome {
  readonly matrix: NumericMatrix;
  readonly requestCount: number;
  readonly warnings: readonly string[];
}

/** One request. The matrix is read from the text APL prints. */
async function runDirect(expression: string, options: RunArtworkOptions): Promise<TransportOutcome> {
  const result = await execute(expression, options);

  const aplError = detectAplError(result.outputLines);
  if (aplError !== null) {
    throw executionError('aplError', aplError.detail);
  }

  // The backend truncates at its line cap without saying so. A result that
  // reaches the cap is therefore indistinguishable from one that was cut
  // short, and drawing it would risk showing an artwork missing its lower
  // rows. Refuse, and say what to do about it.
  const { maxOutputLines } = options.service.capabilities;
  if (result.outputLines.length >= maxOutputLines) {
    throw executionError(
      'tooLarge',
      `the service returned ${result.outputLines.length} lines, its maximum of ${maxOutputLines}`,
      `This artwork is too tall to fetch in one go. The APL service returns at most ${maxOutputLines - 1} rows. Reduce the size, or mark the preset as high resolution.`,
    );
  }

  // Truncation by width is more insidious than truncation by height: a row cut
  // through the middle of a number leaves a value that still parses, just
  // wrongly. Any line at the limit is therefore treated as cut.
  const { maxLineLength } = options.service.capabilities;
  if (result.outputLines.some((line) => line.length >= maxLineLength)) {
    throw executionError(
      'tooLarge',
      `a line reached ${maxLineLength} characters, the service maximum`,
      'This artwork is too wide to fetch in one go. Reduce the size, or mark the preset as high resolution.',
    );
  }

  const parsed = parseMatrix(result.outputLines);
  if (!parsed.ok) {
    throw executionError('invalidOutput', result.rawOutput, parsed.failure.message);
  }

  return { matrix: parsed.matrix, requestCount: 1, warnings: result.warnings };
}

/**
 * A shape probe followed by banded reads.
 *
 * The probe rejects anything undrawable before any data is transferred, and
 * gives the exact shape, which is what makes the bands verifiable: the number
 * of values reassembled must equal rows times columns.
 */
async function runBanded(
  statements: readonly string[],
  options: RunArtworkOptions,
): Promise<TransportOutcome> {
  const warnings: string[] = [];
  let requestCount = 0;

  const probeResult = await execute(buildProbeExpression(statements), options);
  requestCount += 1;

  const probeError = detectAplError(probeResult.outputLines);
  if (probeError !== null) {
    throw executionError('aplError', probeError.detail);
  }

  const probe = parseProbeReply(probeResult.outputLines);
  if (!probe.ok) {
    throw executionError('badResponse', probe.reason);
  }

  const { rank, depth, elementType, shape } = probe.probe;

  if (rank !== 2) {
    throw executionError(
      'invalidOutput',
      `rank ${rank}`,
      `This code ran, but it returned a rank-${rank} result rather than a rectangular matrix.`,
    );
  }
  if (depth > 1) {
    throw executionError(
      'invalidOutput',
      `depth ${depth}`,
      'This code ran, but it returned a nested array rather than a plain grid of numbers.',
    );
  }
  if (!isDrawableType(elementType)) {
    throw executionError(
      'invalidOutput',
      `⎕DR ${probe.probe.dataRepresentation} (${elementType})`,
      `This code ran, but it returned ${describeType(elementType)} rather than numbers.`,
    );
  }

  const [rows = 0, columns = 0] = shape;

  // Check the size before fetching, so an oversized result costs one request
  // rather than a dozen.
  const preflight = validateMatrix({ rows, columns, values: new Float64Array(0) }, options.limits);
  if (!preflight.ok) {
    throw executionError(
      preflight.failure.kind === 'tooLarge' ? 'tooLarge' : 'invalidOutput',
      undefined,
      preflight.failure.message,
    );
  }

  const totalCells = rows * columns;
  const values = new Float64Array(totalCells);
  // Declared above `report`, which closes over both: a `let` read before its
  // declaration throws, and the first call is the empty one below.
  let filled = 0;
  let bandsDone = 0;

  /*
   * A copy per band rather than the live buffer.
   *
   * The consumer holds this across renders, and handing out the array being
   * written into would let a later band change a snapshot that had already been
   * drawn — the artwork would appear to gain rows nobody had told React about,
   * and in a paused or slow render the two would disagree.
   */
  const report = () => {
    options.onProgress?.({
      rows,
      columns,
      values: values.slice(),
      filled,
      total: totalCells,
      bandsDone,
    });
  };

  report();

  let width = estimateValueWidth(elementType);
  let plans = planBands(totalCells, width, options.service.capabilities);

  while (filled < totalCells) {
    const plan = plans.find((candidate) => candidate.offset === filled);
    if (plan === undefined) {
      throw executionError('badResponse', `no band planned at offset ${filled}`);
    }

    const band = await execute(
      buildBandExpression(statements, plan.offset, plan.count, plan.perLine),
      options,
    );
    requestCount += 1;

    const bandError = detectAplError(band.outputLines);
    if (bandError !== null) {
      throw executionError('aplError', bandError.detail);
    }

    const parsed = parseMatrix(band.outputLines);
    if (!parsed.ok) {
      throw executionError('invalidOutput', band.rawOutput, parsed.failure.message);
    }

    const received = parsed.matrix.values;

    // A line sitting exactly on the length limit was cut. If the cut fell
    // inside a number, the value still parses and the count can still be
    // right, so the count alone is not a sufficient check — the truncation
    // signature is.
    const wasTruncated = band.outputLines.some(
      (line) => line.length >= options.service.capabilities.maxLineLength,
    );

    // Either symptom means the value width was under-estimated. Widen the
    // estimate from what actually came back and re-plan.
    if (wasTruncated || received.length < plan.count) {
      const observed = widestToken(band.outputLines);
      const widened = Math.max(width + 1, observed + 1);
      if (widened <= width || requestCount > MAX_BAND_REQUESTS) {
        throw executionError(
          'badResponse',
          `band at ${plan.offset} returned ${received.length} of ${plan.count} values and could not be narrowed further`,
        );
      }
      warnings.push(
        `Adjusted the transfer size after the service returned less than requested (values are up to ${observed} characters wide).`,
      );
      width = widened;
      plans = replan(totalCells, filled, width, options);
      continue;
    }

    for (let index = 0; index < plan.count; index += 1) {
      values[filled + index] = received[index] as number;
    }
    filled += plan.count;
    bandsDone += 1;
    warnings.push(...band.warnings);
    report();
  }

  return { matrix: { rows, columns, values }, requestCount, warnings: dedupe(warnings) };
}

/** Re-plans the remaining bands from `filled`, keeping earlier offsets valid. */
function replan(totalCells: number, filled: number, width: number, options: RunArtworkOptions) {
  return planBands(totalCells - filled, width, options.service.capabilities).map((plan) => ({
    ...plan,
    offset: plan.offset + filled,
  }));
}

async function execute(expression: string, options: RunArtworkOptions) {
  return options.service.execute({
    code: expression,
    timeoutMs: options.timeoutMs,
    freshWorkspace: true,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}

function widestToken(lines: readonly string[]): number {
  let widest = 0;
  for (const line of lines) {
    for (const token of line.trim().split(/\s+/u)) {
      if (token.length > widest) widest = token.length;
    }
  }
  return widest;
}

function describeType(type: string): string {
  switch (type) {
    case 'character':
      return 'text';
    case 'complex':
      return 'complex numbers';
    case 'nested':
      return 'a nested array';
    default:
      return 'something other than numbers';
  }
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

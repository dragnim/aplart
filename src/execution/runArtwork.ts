/**
 * Runs a preset's source and returns the matrix to draw.
 *
 * This is the seam between "some APL" and "a picture". It flattens the source,
 * asks for the result, follows whichever transport the result turns out to need,
 * checks that what came back is something the renderer can honestly draw, and
 * turns every failure into a message written for someone who may not know APL.
 */

import { type MatrixLimits, validateMatrix } from '@/matrix/validateMatrix';
import { matrixStats, type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { parseMatrix } from '@/matrix/parseMatrix';
import { buildAdaptiveExpression, parseAdaptiveReply, type AdaptiveMetadata } from './adaptiveProbe';
import { type AplExecutionService } from './AplExecutionService';
import { flattenToExpression } from './aplSource';
import { detectAplError, executionError } from './errors';
import { buildBandExpression, estimateValueWidth, isDrawableType, planBands } from './transport';

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
   * Only banded runs report anything: when the first request returns the whole
   * matrix there is nothing to report between sending it and having everything.
   */
  readonly onProgress?: ((progress: RunProgress) => void) | undefined;
  readonly limits: MatrixLimits;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface ArtworkRun {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  readonly durationMs: number;
  /** How many backend calls this took; one when the first request sufficed. */
  readonly requestCount: number;
  readonly warnings: readonly string[];
}

export async function runArtwork(options: RunArtworkOptions): Promise<ArtworkRun> {
  const flattened = flattenToExpression(options.source);
  if (!flattened.ok) {
    throw executionError('aplError', flattened.reason, flattened.message);
  }

  const startedAt = Date.now();

  const outcome = await runAdaptive(flattened.statements, options);

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

/**
 * One request, and further requests only when one could not have been enough.
 *
 * The first request evaluates the source and returns either the whole artwork
 * or a single line of metadata describing the result it could not print.
 * Nothing about the preset is consulted — no identity, no declared size, no
 * flag. The service's own answer decides which of three things happens:
 *
 *   - The matrix arrived whole. Draw it. One request, one evaluation.
 *   - It did not fit, but it is a rank-2 numeric array of a shape and value
 *     width that bands can carry. Fetch it in bands.
 *   - It is something else, or something too large. Refuse, and say what came
 *     back instead.
 *
 * This replaces a preset-declared `highResolution` flag, which chose the
 * transport before the result existed. Any source could be typed into any
 * artwork, so a flag set for one program decided the transport for another —
 * which is how a 128×128 Julia program pasted into a small preset came back
 * refused as too tall. The decision now belongs to the result.
 */
async function runAdaptive(
  statements: readonly string[],
  options: RunArtworkOptions,
): Promise<TransportOutcome> {
  const first = await execute(buildAdaptiveExpression(statements, options.service.capabilities), options);

  const aplError = detectAplError(first.outputLines);
  if (aplError !== null) {
    throw executionError('aplError', aplError.detail);
  }

  const reply = parseAdaptiveReply(first.outputLines);

  if (reply.kind === 'error') {
    throw executionError('badResponse', reply.reason);
  }

  if (reply.kind === 'matrix') {
    /*
     * Complete, and known to be complete rather than assumed so. The wrapper
     * returns the value itself only when its printed form is strictly inside
     * both service caps, so a reply that is not metadata cannot be one that was
     * truncated on the way out.
     */
    const parsed = parseMatrix(first.outputLines);
    if (!parsed.ok) {
      throw executionError('invalidOutput', first.rawOutput, parsed.failure.message);
    }
    return { matrix: parsed.matrix, requestCount: 1, warnings: first.warnings };
  }

  return runBanded(statements, options, reply, first.warnings);
}

/**
 * Banded reads, planned from the metadata the first request already returned.
 *
 * There is no second shape probe. The first request measured the shape while
 * trying to return the whole result, so a banded artwork costs exactly what the
 * old probe-then-band path cost — the measurement now simply has a chance of
 * being the answer.
 */
async function runBanded(
  statements: readonly string[],
  options: RunArtworkOptions,
  metadata: AdaptiveMetadata,
  firstWarnings: readonly string[],
): Promise<TransportOutcome> {
  const { rank, depth, elementType, shape } = metadata;

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
      `⎕DR ${metadata.dataRepresentation} (${elementType})`,
      `This code ran, but it returned ${describeType(elementType)} rather than numbers.`,
    );
  }

  const [rows = 0, columns = 0] = shape;

  /*
   * The workspace-wide safety limits, checked before any data is transferred so
   * that an oversized result costs one request rather than a dozen. These are
   * the same limits the finished matrix is checked against, applied to a shape
   * that is now known — not a per-preset override, which is the mechanism that
   * caused the fault above.
   */
  const preflight = validateMatrix({ rows, columns, values: new Float64Array(0) }, options.limits);
  if (!preflight.ok) {
    throw executionError(
      preflight.failure.kind === 'tooLarge' ? 'tooLarge' : 'invalidOutput',
      `${rows}×${columns} exceeds the workspace matrix limits`,
      preflight.failure.message,
    );
  }

  /*
   * Refuse now if the values are wide fractions, which bands cannot carry.
   *
   * Bands are planned from an assumed width per value, and a value wider than
   * assumed is normally recoverable: the reply comes back short or cut, the
   * width is re-estimated from what arrived, and the remaining bands are
   * re-planned. Wide integers do exactly that, and there are tests below that
   * hold it to it.
   *
   * Wide fractions do not. Dyalog elides a long float row — `1.234···5678` —
   * rather than truncating it, and an elided number is not a short reply to
   * widen from, it is an unparseable one. A 128×128 float matrix prints rows
   * 2,175 characters wide, about 17 per value against a budget of 16, and comes
   * back like that today.
   *
   * That is a defect in band assembly rather than in this decision, and it has
   * its own fix pending. Until then one refusal naming what to change beats a
   * dozen requests ending in an unreadable reply. The condition is deliberately
   * narrow: floats whose printed width is above the budget, not every value
   * wider than estimated.
   */
  const budget = estimateValueWidth(elementType);
  const perValue = columns === 0 ? 0 : Math.ceil((metadata.width + 1) / columns);
  if (elementType === 'float' && perValue > budget) {
    throw executionError(
      'tooLarge',
      `float values print about ${perValue} characters wide, above the ${budget} the transport plans for`,
      `This artwork is too large to return in one piece, and its numbers are too long to fetch in sections — about ${perValue} characters each. Round them, with ⌊ or ⌈ for whole numbers, or return fewer rows and columns.`,
    );
  }

  /*
   * Said once, and only for a result that really is assembled from several runs.
   * A one-request artwork is a single evaluation and needs no such caveat.
   */
  const warnings: string[] = [
    ...firstWarnings,
    'This artwork was too large to return in one request, so the program was run several times and the pieces joined together. Code that uses randomness, or that changes state as it runs, may not agree between the pieces.',
  ];
  // The first request is already spent; it measured the shape these bands use.
  let requestCount = 1;

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

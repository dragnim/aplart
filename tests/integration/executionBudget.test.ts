/**
 * One run, one budget: a total deadline and a ceiling on requests.
 *
 * Both were nominally in place before v1.0.1 and neither actually held. The
 * timeout was described as covering a whole execution but was handed to each
 * request unchanged, so thirty bands could take thirty times the budget while
 * every request stayed inside it. The request ceiling was consulted only when a
 * truncated band forced a re-plan, so an ordinary run of successful narrow bands
 * never met it at all.
 *
 * These tests count what the service is actually asked for, because that is the
 * only place the difference shows.
 */

import { describe, expect, it } from 'vitest';
import {
  type AplExecutionRequest,
  type AplExecutionResult,
  type AplExecutionService,
  type ExecutionCapabilities,
} from '@/execution/AplExecutionService';
import { ADAPTIVE_MARKER, formatAdaptiveReply } from '@/execution/adaptiveProbe';
import { AplExecutionError } from '@/execution/errors';
import { runArtwork } from '@/execution/runArtwork';
import { BAND_MARKER, formatBandReply } from '@/execution/transport';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { type MatrixLimits } from '@/matrix/validateMatrix';

const LIMITS: MatrixLimits = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };

/** Narrow enough that a full artwork needs many bands. */
const NARROW: ExecutionCapabilities = { maxOutputLines: 6, maxLineLength: 60, preservesState: false };

function grid(rows: number, columns: number): NumericMatrix {
  return fromNested(
    Array.from({ length: rows }, (_unusedRow, row) =>
      Array.from({ length: columns }, (_unusedColumn, column) => ((row * columns + column) % 9) + 1),
    ),
  );
}

/**
 * A service that records the timeout of every request and can advance a clock.
 *
 * The clock is the point: real time cannot be relied on in a test, so each
 * request costs a fixed, controllable number of milliseconds.
 */
class RecordingService implements AplExecutionService {
  readonly capabilities: ExecutionCapabilities;
  readonly timeouts: number[] = [];
  readonly codes: string[] = [];

  private readonly matrix: NumericMatrix;
  private readonly costMs: number;

  constructor(
    matrix: NumericMatrix,
    options: { costMs?: number; capabilities?: ExecutionCapabilities } = {},
  ) {
    this.matrix = matrix;
    this.costMs = options.costMs ?? 0;
    this.capabilities = options.capabilities ?? NARROW;
  }

  async execute(request: AplExecutionRequest): Promise<AplExecutionResult> {
    this.timeouts.push(request.timeoutMs);
    this.codes.push(request.code);

    // Time passes whether or not the caller waits for it.
    if (this.costMs > 0) clock += this.costMs;

    const lines = request.code.includes(ADAPTIVE_MARKER)
      ? formatAdaptiveReply(this.matrix, this.capabilities)
      : formatBandReply(this.matrix, request.code, this.capabilities);

    return { outputLines: lines, rawOutput: lines.join('\n'), durationMs: this.costMs, warnings: [] };
  }

  cancel(): void {}

  get bandRequests(): number {
    return this.codes.filter((code) => code.includes(BAND_MARKER)).length;
  }
}

/**
 * A clock the tests move by hand.
 *
 * `Date.now` is stubbed for the duration of each test that needs it, so a run
 * can be made to exhaust its budget without anything actually waiting.
 */
let clock = 0;

function withStubbedClock<T>(body: () => T): T {
  const real = Date.now;
  clock = 1_000_000;
  Date.now = () => clock;
  try {
    return body();
  } finally {
    Date.now = real;
  }
}

async function expectFailure(promise: Promise<unknown>): Promise<AplExecutionError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AplExecutionError) return error;
    throw new Error(`expected an AplExecutionError, got ${String(error)}`);
  }
  throw new Error('expected the run to fail, but it succeeded');
}

describe('the total execution deadline', () => {
  it('gives each request only what is left of the run', async () => {
    await withStubbedClock(async () => {
      // Each request costs 100 ms of a 5,000 ms budget.
      const service = new RecordingService(grid(40, 4), { costMs: 100 });

      await runArtwork({ service, source: 'x←1\n40 4⍴⍳160', limits: LIMITS, timeoutMs: 5_000 });

      expect(service.timeouts.length).toBeGreaterThan(2);

      // The first request may use the whole budget; every later one gets less,
      // and the sequence never rises.
      expect(service.timeouts[0]).toBe(5_000);
      for (let index = 1; index < service.timeouts.length; index += 1) {
        const previous = service.timeouts[index - 1] as number;
        const current = service.timeouts[index] as number;
        expect(current, `request ${String(index)}`).toBeLessThan(previous);
      }

      // And the total handed out is not a multiple of the budget: the whole run
      // fits inside it.
      const last = service.timeouts.at(-1) as number;
      expect(last).toBeLessThanOrEqual(5_000 - 100 * (service.timeouts.length - 1));
    });
  });

  it('refuses to start a request once the budget is spent', async () => {
    await withStubbedClock(async () => {
      /*
       * Three hundred milliseconds, and each request costs two hundred. The first
       * is affordable, the second is the last that can start, and the run must
       * stop rather than continue asking.
       */
      const service = new RecordingService(grid(60, 4), { costMs: 200 });

      const error = await expectFailure(
        runArtwork({ service, source: 'x←1\n60 4⍴⍳240', limits: LIMITS, timeoutMs: 300 }),
      );

      expect(error.kind).toBe('timeout');
      expect(service.timeouts.length).toBeLessThanOrEqual(2);
      expect(error.detail).toContain('budget for the whole run');
    });
  });

  it('does not let several bands each spend the full timeout', async () => {
    await withStubbedClock(async () => {
      /*
       * The defect, stated as arithmetic. Twelve bands at 500 ms each would have
       * been allowed under the old behaviour — every request inside its own
       * 1,000 ms limit, six seconds of wall clock. Now the run stops when its
       * second of budget is gone.
       */
      const service = new RecordingService(grid(80, 4), { costMs: 500 });

      const error = await expectFailure(
        runArtwork({ service, source: 'x←1\n80 4⍴⍳320', limits: LIMITS, timeoutMs: 1_000 }),
      );

      expect(error.kind).toBe('timeout');
      const spent = service.timeouts.length * 500;
      expect(spent).toBeLessThanOrEqual(1_000);
    });
  });
});

describe('the ceiling on requests for one run', () => {
  it('stops at the maximum even when every band succeeds', async () => {
    /*
     * The case the old guard missed entirely: nothing is truncated, nothing is
     * re-planned, and the bands are narrow enough that a large artwork needs more
     * than the allowance. No clock stubbing — this is about counting, not time.
     */
    const service = new RecordingService(grid(160, 8));

    const error = await expectFailure(
      runArtwork({ service, source: 'x←1\n160 8⍴⍳1280', limits: LIMITS, timeoutMs: 600_000 }),
    );

    expect(error.kind).toBe('tooLarge');
    expect(error.message).toContain('more requests than APL Art will make');
    // Exactly the maximum was sent, and not one more.
    expect(service.timeouts).toHaveLength(32);
  });

  it('allows a run that needs exactly the maximum', async () => {
    /*
     * The other side of the boundary, which is what makes the limit unambiguous:
     * the thirty-second request is permitted. The matrix is sized so the run needs
     * the first request plus thirty-one bands.
     *
     * Six lines of five values per band is thirty values a band, so 930 cells is
     * thirty-one bands exactly.
     */
    const service = new RecordingService(grid(31, 30));

    const run = await runArtwork({
      service,
      source: 'x←1\n31 30⍴⍳930',
      limits: LIMITS,
      timeoutMs: 600_000,
    });

    expect(service.timeouts).toHaveLength(32);
    expect(run.requestCount).toBe(32);
    expect(run.matrix.rows).toBe(31);
    expect(run.matrix.columns).toBe(30);
  });

  it('counts the first request, not only the bands', async () => {
    // A one-request artwork reports one, so the first request is inside the count
    // rather than free. The ceiling therefore means what it says.
    const service = new RecordingService(grid(4, 4), {
      capabilities: { maxOutputLines: 93, maxLineLength: 995, preservesState: false },
    });

    const run = await runArtwork({ service, source: 'x←1\n4 4⍴⍳16', limits: LIMITS, timeoutMs: 5_000 });

    expect(run.requestCount).toBe(1);
    expect(service.timeouts).toHaveLength(1);
  });
});

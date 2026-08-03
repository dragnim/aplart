import { describe, expect, it } from 'vitest';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { AplExecutionError } from '@/execution/errors';
import { runArtwork, type RunProgress } from '@/execution/runArtwork';
import { fromNested, toNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { type MatrixLimits } from '@/matrix/validateMatrix';

const LIMITS: MatrixLimits = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };

/** A mock constrained exactly as TryAPL is, so banding is genuinely exercised. */
function constrainedService(options: { latencyMs?: number } = {}) {
  return new MockAplExecutionService({ capabilities: TRYAPL_CAPABILITIES, ...options });
}

function gradient(rows: number, columns: number, scale = 1): NumericMatrix {
  const values = new Float64Array(rows * columns);
  for (let index = 0; index < values.length; index += 1) values[index] = (index % 97) * scale;
  return { rows, columns, values };
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

describe('runArtwork, running a source', () => {
  it('runs a preset and returns its matrix', async () => {
    const service = constrainedService();
    service.register(
      'default',
      fromNested([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]),
    );

    const run = await runArtwork({
      service,
      source: '⍝ Controls\nsize←3\n\n⍝ Draw\nsize size⍴⍳9',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(toNested(run.matrix)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    expect(run.requestCount).toBe(1);
  });

  it('sends the flattened expression, with comments removed', async () => {
    const service = constrainedService();
    service.register(
      'default',
      fromNested([
        [1, 2],
        [3, 4],
      ]),
    );

    await runArtwork({
      service,
      source: '⍝ Controls\nsize←2 ⍝ how big\n\nsize size⍴⍳4',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    // Wrapped, never replaced: the artwork is still computed by the statements
    // the editor showed, with only the comments gone.
    expect(service.received[0]).toContain('size←2 ⋄ r←(size size⍴⍳4)');
    expect(service.received[0]).not.toContain('how big');
    expect(service.received[0]).not.toContain('Controls');
  });

  it('reports the value range for the accessible description', async () => {
    const service = constrainedService();
    service.register(
      'default',
      fromNested([
        [0, 5],
        [10, 5],
      ]),
    );

    const run = await runArtwork({
      service,
      source: 'x←1\n2 2⍴0 5 10 5',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(run.stats).toMatchObject({ min: 0, max: 10, distinct: 3, uniform: false });
  });

  it('surfaces an APL error as a friendly message, keeping the detail separate', async () => {
    const service = new MockAplExecutionService({
      cannedOutput: ['LENGTH ERROR', ' 3 3⍴⍳8', '    ∧'],
    });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'size←3\nsize size⍴⍳8',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('aplError');
    expect(error.message).toBe(
      'The APL code could not be run. Check the highlighted expression and try again.',
    );
    expect(error.detail).toContain('LENGTH ERROR');
  });

  it('rejects character output', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['abc', 'def'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: "x←1\n2 3⍴'abcdef'",
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('invalidOutput');
  });

  it('fetches a result too tall to print, rather than refusing it', async () => {
    /*
     * This used to be a refusal. The backend truncates silently, so a printed
     * result at the line cap cannot be told from one cut short — but that is an
     * argument for not printing it, not for declining to fetch it. Nothing about
     * this source says it is large; the first request finds out.
     */
    const service = constrainedService();
    const expected = gradient(200, 4);
    service.register('default', expected);

    const run = await runArtwork({
      service,
      source: 'size←200\nsize 4⍴⍳800',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(Array.from(run.matrix.values)).toEqual(Array.from(expected.values));
    expect(run.requestCount).toBeGreaterThan(1);
  });

  it('rejects a result smaller than 2x2', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['7'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n1 1⍴7',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('invalidOutput');
    expect(error.message).toContain('at least 2×2');
  });

  it('refuses source that is only comments, without calling the service', async () => {
    const service = constrainedService();

    const error = await expectFailure(
      runArtwork({
        service,
        source: '⍝ nothing to run',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('aplError');
    expect(service.executionCount).toBe(0);
  });
});

describe('runArtwork, banded transport', () => {
  it('reassembles a 256x256 matrix exactly, across several requests', async () => {
    const service = constrainedService();
    const expected = gradient(256, 256);
    service.register('default', expected);

    const run = await runArtwork({
      service,
      source: 'size←256\nsize size⍴⍳65536',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(run.matrix.rows).toBe(256);
    expect(run.matrix.columns).toBe(256);
    // Every one of the 65,536 cells, in the right order.
    expect(Array.from(run.matrix.values)).toEqual(Array.from(expected.values));

    // The first request plus the bands, and far fewer than a request per row.
    expect(run.requestCount).toBeGreaterThan(1);
    expect(run.requestCount).toBeLessThanOrEqual(10);
  });

  it('measures the result in its first request, before transferring anything', async () => {
    const service = constrainedService();
    service.register('default', gradient(120, 120));

    await runArtwork({
      service,
      source: 'size←120\nsize size⍴⍳14400',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(service.received[0]).toContain(ADAPTIVE_MARKER);
  });

  it('rejects a nested result from the first request alone, transferring no data', async () => {
    const service = new MockAplExecutionService({ cannedOutput: [`${ADAPTIVE_MARKER} 2 2 326 0 0 2 2`] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n2 2⍴(1 2)(3 4)(5 6)(7 8)',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('invalidOutput');
    expect(error.message).toContain('nested array');
    expect(service.executionCount).toBe(1);
  });

  it('rejects complex numbers from the first request', async () => {
    const service = new MockAplExecutionService({ cannedOutput: [`${ADAPTIVE_MARKER} 2 1 1289 0 0 2 2`] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n2 2⍴1J2 3J4 5 6',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.message).toContain('complex numbers');
  });

  it('rejects the wrong rank from the first request', async () => {
    const service = new MockAplExecutionService({ cannedOutput: [`${ADAPTIVE_MARKER} 1 1 83 0 0 5`] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n⍳5',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.message).toContain('rank-1');
  });

  it('rejects an oversized result after one request, before fetching any of it', async () => {
    const service = new MockAplExecutionService({
      cannedOutput: [`${ADAPTIVE_MARKER} 2 1 83 700 2100 700 700`],
    });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'size←700\nsize size⍴1',
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('tooLarge');
    expect(error.message).toBe(
      'This matrix is too large for APL Art to draw safely: 700×700, where the limit is 256×256. ' +
        'Reduce the size and run again.',
    );
    expect(service.executionCount).toBe(1);
  });

  it('recovers when values turn out wider than estimated', async () => {
    // Every value is twelve digits, comfortably wider than the planner assumes
    // for integers, so the first band overruns the line limit and is cut.
    const service = constrainedService();
    const values = new Float64Array(120 * 120);
    for (let index = 0; index < values.length; index += 1) values[index] = 100_000_000_000 + (index % 97);
    const wide: NumericMatrix = { rows: 120, columns: 120, values };
    service.register('default', wide);

    const run = await runArtwork({
      service,
      source: 'size←120\nsize size⍴x',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    // The point of the test: every cell is still exactly right afterwards.
    expect(Array.from(run.matrix.values)).toEqual(Array.from(wide.values));
    expect(run.warnings.some((warning) => warning.includes('Adjusted the transfer size'))).toBe(true);
  });

  it('never accepts a band whose line was cut mid-number', async () => {
    // A cut inside a number leaves a value that still parses, so the value
    // count can look correct while a cell is silently wrong. Widths are chosen
    // here so the cut lands inside a value rather than between two.
    const service = constrainedService();
    const values = new Float64Array(100 * 100);
    for (let index = 0; index < values.length; index += 1) values[index] = 987_654_321 + (index % 7);
    const expected: NumericMatrix = { rows: 100, columns: 100, values };
    service.register('default', expected);

    const run = await runArtwork({
      service,
      source: 'size←100\nsize size⍴x',
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(Array.from(run.matrix.values)).toEqual(Array.from(expected.values));
  });
});

describe('runArtwork, reporting progress', () => {
  it('reports the shape before any data, then after every band', async () => {
    const service = constrainedService();
    const expected = gradient(256, 256);
    service.register('default', expected);

    const reports: RunProgress[] = [];
    const run = await runArtwork({
      service,
      source: ['size←256', 'size size⍴⍳65536'].join('\n'),
      limits: LIMITS,
      timeoutMs: 5000,
      onProgress: (progress) => reports.push(progress),
    });

    // The first report carries the shape and nothing else, which is what lets
    // the artwork reserve its space instead of jumping when a band lands.
    expect(reports[0]).toMatchObject({ rows: 256, columns: 256, filled: 0, total: 65_536 });

    // One per band afterwards, and the last one is the whole thing.
    expect(reports.length).toBe(run.requestCount);
    expect(reports.at(-1)?.filled).toBe(65_536);
    expect(reports.at(-1)?.bandsDone).toBe(run.requestCount - 1);
  });

  it('never goes backwards, and only ever describes cells it has', async () => {
    const service = constrainedService();
    const expected = gradient(256, 256);
    service.register('default', expected);

    const reports: RunProgress[] = [];
    await runArtwork({
      service,
      source: ['size←256', 'size size⍴⍳65536'].join('\n'),
      limits: LIMITS,
      timeoutMs: 5000,
      onProgress: (progress) => reports.push(progress),
    });

    let previous = -1;
    for (const report of reports) {
      expect(report.filled).toBeGreaterThan(previous);
      previous = report.filled;

      /*
       * Every cell claimed as filled matches the final artwork. A report that
       * over-claimed would have the renderer paint uninitialised zeroes as
       * though the calculation had returned them.
       *
       * Compared as whole slices rather than cell by cell: an assertion per
       * cell is 650,000 of them across the run, which is quick enough on a
       * developer's machine and over the timeout on a busy CI worker.
       */
      const claimed = report.values.subarray(0, report.filled);
      const truth = expected.values.subarray(0, report.filled);
      const firstDifference = claimed.findIndex((value, index) => value !== truth[index]);
      expect(firstDifference, `report of ${report.filled} cells`).toBe(-1);
    }
  });

  it('hands out a snapshot, not the buffer it is still filling', async () => {
    const service = constrainedService();
    service.register('default', gradient(256, 256));

    const reports: RunProgress[] = [];
    await runArtwork({
      service,
      source: ['size←256', 'size size⍴⍳65536'].join('\n'),
      limits: LIMITS,
      timeoutMs: 5000,
      onProgress: (progress) => reports.push(progress),
    });

    /*
     * The consumer holds these across renders. Handing out the live buffer
     * would let a later band change a snapshot already drawn, so an artwork
     * would gain rows nobody had told React about.
     */
    const first = reports[0] as RunProgress;
    const last = reports.at(-1) as RunProgress;
    expect(first.values).not.toBe(last.values);
    expect(first.values.every((value) => value === 0)).toBe(true);
  });

  it('says nothing at all for a one-request run', async () => {
    const service = constrainedService();
    service.register(
      'default',
      fromNested([
        [1, 2],
        [3, 4],
      ]),
    );

    const reports: RunProgress[] = [];
    await runArtwork({
      service,
      source: '2 2⍴1 2 3 4',
      limits: LIMITS,
      timeoutMs: 5000,
      onProgress: (progress) => reports.push(progress),
    });

    // One request, nothing to report between sending it and having everything.
    expect(reports).toEqual([]);
  });
});

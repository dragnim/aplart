import { describe, expect, it } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { AplExecutionError } from '@/execution/errors';
import { runArtwork } from '@/execution/runArtwork';
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

describe('runArtwork, direct transport', () => {
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
      highResolution: false,
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
      highResolution: false,
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(service.received[0]).toBe('size←2 ⋄ size size⍴⍳4');
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
      highResolution: false,
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
        highResolution: false,
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
        highResolution: false,
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('invalidOutput');
  });

  it('refuses a result that reaches the line cap rather than drawing a truncated one', async () => {
    // The backend truncates silently, so a result at the cap cannot be
    // distinguished from one that was cut short.
    const service = constrainedService();
    service.register('default', gradient(200, 4));

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'size←200\nsize 4⍴⍳800',
        highResolution: false,
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('tooLarge');
    expect(error.message).toContain('high resolution');
  });

  it('rejects a result smaller than 2x2', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['7'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n1 1⍴7',
        highResolution: false,
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
        highResolution: false,
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
      highResolution: true,
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(run.matrix.rows).toBe(256);
    expect(run.matrix.columns).toBe(256);
    // Every one of the 65,536 cells, in the right order.
    expect(Array.from(run.matrix.values)).toEqual(Array.from(expected.values));

    // One probe plus the bands, and far fewer than a request per row.
    expect(run.requestCount).toBeGreaterThan(1);
    expect(run.requestCount).toBeLessThanOrEqual(10);
  });

  it('probes for the shape before transferring anything', async () => {
    const service = constrainedService();
    service.register('default', gradient(120, 120));

    await runArtwork({
      service,
      source: 'size←120\nsize size⍴⍳14400',
      highResolution: true,
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(service.received[0]).toContain('(≢⍴r),(≡r),(⎕DR r)');
  });

  it('rejects a nested result from the probe alone, transferring no data', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['2 2 326 2 2'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n2 2⍴(1 2)(3 4)(5 6)(7 8)',
        highResolution: true,
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('invalidOutput');
    expect(error.message).toContain('nested array');
    expect(service.executionCount).toBe(1);
  });

  it('rejects complex numbers from the probe', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['2 1 1289 2 2'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n2 2⍴1J2 3J4 5 6',
        highResolution: true,
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.message).toContain('complex numbers');
  });

  it('rejects the wrong rank from the probe', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['1 1 83 5'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'x←1\n⍳5',
        highResolution: true,
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.message).toContain('rank-1');
  });

  it('rejects an oversized result after the probe, before fetching any of it', async () => {
    const service = new MockAplExecutionService({ cannedOutput: ['2 1 83 700 700'] });

    const error = await expectFailure(
      runArtwork({
        service,
        source: 'size←700\nsize size⍴1',
        highResolution: true,
        limits: LIMITS,
        timeoutMs: 5000,
      }),
    );

    expect(error.kind).toBe('tooLarge');
    expect(error.message).toBe('This artwork returned a 700×700 matrix. The current limit is 256×256.');
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
      highResolution: true,
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
      highResolution: true,
      limits: LIMITS,
      timeoutMs: 5000,
    });

    expect(Array.from(run.matrix.values)).toEqual(Array.from(expected.values));
  });
});

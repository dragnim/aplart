/**
 * The boundary at which an artwork's meaning changes.
 *
 * A matrix, the statistics describing it, and the source that produced it are
 * one fact held in one object, so no transition can advance part of it. These
 * check the transitions that were most likely to try: an edit, a failure, a
 * cancellation, and a fresh start.
 */

import { describe, expect, it } from 'vitest';
import { matrixStats } from '@/matrix/matrixStats';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { mandelbrotField } from '@/presets/mandelbrot-field';

/**
 * The preset's own iteration ceiling, read from its code.
 *
 * Derived rather than written out, because these tests are about what a
 * value *means* against the ceiling that produced it. Restating the number
 * made them all fail when the default moved from 28 to 48, which told us
 * nothing except that the number had moved.
 */
const CEILING = numberAssignedTo(mandelbrotField.code, 'iterations') ?? 0;
import { initialWorkspaceState, workspaceReducer, type WorkspaceState } from '@/workspace/workspaceState';

const AT_28 = fromNested([
  [1, 14],
  [7, CEILING],
]);
const AT_60 = fromNested([
  [1, 30],
  [9, 60],
]);

const SOURCE_28 = mandelbrotField.code;
const SOURCE_60 = mandelbrotField.code.replace(`iterations←${String(CEILING)}`, 'iterations←60');

function reduce(state: WorkspaceState, ...actions: Parameters<typeof workspaceReducer>[1][]) {
  return actions.reduce((current, action) => workspaceReducer(current, action, mandelbrotField), state);
}

function succeeded(matrix: NumericMatrix, source: string) {
  return {
    type: 'runSucceeded' as const,
    matrix,
    stats: matrixStats(matrix),
    source,
    warnings: [],
    durationMs: 10,
    requestCount: 1,
  };
}

const START = initialWorkspaceState(mandelbrotField);

describe('a fresh workspace', () => {
  it('has no result at all, so there is no range to be stale', () => {
    // Not a matrix with a missing source, which is the state that would let an
    // artwork be read by code that never produced it. There is simply nothing.
    expect(START.result).toBeNull();
  });
});

describe('a successful run', () => {
  it('takes the matrix and the source that produced it together', () => {
    const state = reduce(START, succeeded(AT_28, SOURCE_28));

    expect(state.result?.matrix).toBe(AT_28);
    expect(state.result?.source).toBe(SOURCE_28);
    expect(state.result?.stats.max).toBe(CEILING);
  });

  it('records the source it was given, not the code in the editor', () => {
    /*
     * The order that matters. Somebody edits while a request is in flight, and
     * the reply lands afterwards: the result describes what was submitted, and
     * the editor has moved on to something that has not run yet.
     */
    const state = reduce(START, { type: 'codeChanged', code: SOURCE_60 }, succeeded(AT_28, SOURCE_28));

    expect(state.code).toBe(SOURCE_60);
    expect(state.result?.source).toBe(SOURCE_28);
  });
});

describe('editing without running', () => {
  it('changes the code and nothing about the result', () => {
    const before = reduce(START, succeeded(AT_28, SOURCE_28));
    const after = reduce(before, { type: 'codeChanged', code: SOURCE_60 });

    // The same object, not merely an equal one: nothing about the artwork has
    // been rebuilt, so nothing about it can have been reinterpreted.
    expect(after.result).toBe(before.result);
    expect(after.code).toBe(SOURCE_60);
    expect(after.status).toBe('edited');
  });
});

describe('a run that does not produce a result', () => {
  it('leaves the previous artwork and its source intact when it fails', () => {
    const before = reduce(START, succeeded(AT_28, SOURCE_28));
    const after = reduce(
      before,
      { type: 'codeChanged', code: SOURCE_60 },
      { type: 'runStarted' },
      {
        type: 'runFailed',
        error: { kind: 'tooLarge', message: 'Too large.', detail: undefined, source: SOURCE_60 },
      },
    );

    /*
     * The dangerous case. The code says 60, no result at 60 ever arrived, and
     * the matrix on screen is the CEILING one. Anything reading `code` here would
     * reinterpret it permanently with nothing to explain why.
     */
    expect(after.result).toBe(before.result);
    expect(after.result?.source).toBe(SOURCE_28);
  });

  it('leaves them intact when it is cancelled', () => {
    const before = reduce(START, succeeded(AT_28, SOURCE_28));
    const after = reduce(
      before,
      { type: 'codeChanged', code: SOURCE_60 },
      { type: 'runStarted' },
      { type: 'runCancelled' },
    );

    expect(after.result).toBe(before.result);
    expect(after.status).toBe('cancelled');
  });
});

describe('a second successful run', () => {
  it('replaces the matrix and its meaning in one step', () => {
    const state = reduce(
      START,
      succeeded(AT_28, SOURCE_28),
      { type: 'codeChanged', code: SOURCE_60 },
      succeeded(AT_60, SOURCE_60),
    );

    expect(state.result?.matrix).toBe(AT_60);
    expect(state.result?.source).toBe(SOURCE_60);
  });
});

describe('appearance changes', () => {
  it('do not touch the result', () => {
    const before = reduce(START, succeeded(AT_28, SOURCE_28));
    const after = reduce(before, { type: 'renderOptionsChanged', options: { paletteId: 'neon' } });

    // Presentation, so the matrix and what it means are both untouched. This is
    // the difference the whole application is built around.
    expect(after.result).toBe(before.result);
  });
});

describe('a banded run in flight', () => {
  const delivering = {
    source: SOURCE_60,
    rows: 2,
    columns: 2,
    values: Float64Array.from([1, 2, 0, 0]),
    filled: 2,
    total: 4,
    bandsDone: 1,
  };

  it('is held apart from the result and never becomes one', () => {
    const state = reduce(
      START,
      succeeded(AT_28, SOURCE_28),
      { type: 'codeChanged', code: SOURCE_60 },
      { type: 'runStarted' },
      { type: 'runProgressed', progress: delivering },
    );

    // Two separate things at once: the artwork that exists, and the delivery of
    // the one that might. Nothing can promote the second into the first except
    // a run finishing.
    expect(state.result?.matrix).toBe(AT_28);
    expect(state.result?.source).toBe(SOURCE_28);
    expect(state.progress?.filled).toBe(2);
  });

  it('is discarded when the run finishes, leaving only the result', () => {
    const state = reduce(
      START,
      { type: 'runStarted' },
      { type: 'runProgressed', progress: delivering },
      succeeded(AT_60, SOURCE_60),
    );

    expect(state.progress).toBeNull();
    expect(state.result?.matrix).toBe(AT_60);
  });

  it('is discarded on failure, putting the previous artwork back whole', () => {
    const before = reduce(START, succeeded(AT_28, SOURCE_28));
    const after = reduce(
      before,
      { type: 'runStarted' },
      { type: 'runProgressed', progress: delivering },
      {
        type: 'runFailed',
        error: { kind: 'serverUnavailable', message: 'Unavailable.', detail: undefined, source: SOURCE_60 },
      },
    );

    // Half an artwork is not an artwork; what is left is the last complete one.
    expect(after.progress).toBeNull();
    expect(after.result).toBe(before.result);
  });

  it('is discarded on cancellation, which is the whole of restoring the artwork', () => {
    const before = reduce(START, succeeded(AT_28, SOURCE_28));
    const after = reduce(
      before,
      { type: 'runStarted' },
      { type: 'runProgressed', progress: delivering },
      { type: 'runCancelled' },
    );

    expect(after.progress).toBeNull();
    expect(after.result).toBe(before.result);
  });

  it('ignores a band that arrives after the run has stopped', () => {
    const stopped = reduce(START, { type: 'runStarted' }, { type: 'runCancelled' });
    const after = reduce(stopped, { type: 'runProgressed', progress: delivering });

    /*
     * A cancelled run keeps making requests until its abort lands. A band from
     * one would otherwise put a partial picture back on screen after the person
     * had already stopped it.
     */
    expect(after.progress).toBeNull();
    expect(after).toBe(stopped);
  });

  it('starts a new run with nothing delivered, not with the last one’s bands', () => {
    const state = reduce(
      START,
      { type: 'runStarted' },
      { type: 'runProgressed', progress: delivering },
      { type: 'runStarted' },
    );

    expect(state.progress).toBeNull();
  });
});

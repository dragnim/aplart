/**
 * Stepping back, at the level of the reducer.
 *
 * The history is workspace state rather than a stack belonging to one surface, so
 * this is where its rules are established: what counts as a step, what a step
 * restores, and what must never create one. The rules that matter most are the
 * negative ones — typing must not fill it, restoring a shared link must not add
 * to it, and one drag of one slider must be one step and not forty.
 */

import { describe, expect, it } from 'vitest';
import { fromNested } from '@/matrix/matrixTypes';
import { matrixStats } from '@/matrix/matrixStats';
import { modularBloom } from '@/presets/modular-bloom';
import {
  HISTORY_LIMIT,
  initialWorkspaceState,
  workspaceReducer,
  type ArtworkResult,
  type WorkspaceAction,
  type WorkspaceState,
} from '@/workspace/workspaceState';

const reduce = (state: WorkspaceState, action: WorkspaceAction) =>
  workspaceReducer(state, action, modularBloom);

/** Applies several actions in order, which is how these histories are built. */
const reduceAll = (state: WorkspaceState, actions: readonly WorkspaceAction[]) =>
  actions.reduce(reduce, state);

function resultOf(size: number, source: string): ArtworkResult {
  const matrix = fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) => (row * column) % 5),
    ),
  );
  return { matrix, stats: matrixStats(matrix), source };
}

/** A workspace with an artwork on screen, which is the interesting starting point. */
function drawn(size = 8): WorkspaceState {
  const code = modularBloom.code;
  return {
    ...initialWorkspaceState(modularBloom),
    status: 'success',
    result: resultOf(size, code),
    warnings: ['a warning that belongs to this run'],
    lastRunAt: 1_000,
    lastDurationMs: 42,
    lastRequestCount: 3,
  };
}

const commit = (
  code: string,
  extra: Partial<Omit<WorkspaceAction & { type: 'codeCommitted' }, 'type'>> = {},
) => ({ type: 'codeCommitted', code, label: 'Complexity', ...extra }) as WorkspaceAction;

describe('what creates a step back', () => {
  it('a committed change, which records the state it left', () => {
    const before = drawn();
    const after = reduce(before, commit('size←40'));

    expect(after.code).toBe('size←40');
    expect(after.past).toHaveLength(1);
    expect(after.past[0]).toMatchObject({
      code: before.code,
      result: before.result,
      warnings: before.warnings,
      lastDurationMs: 42,
      label: 'Complexity',
    });
  });

  it('and nothing else: typing does not', () => {
    // The editor has its own undo, and a keystroke is not a decision.
    const after = reduceAll(drawn(), [
      { type: 'codeChanged', code: 'size←4' },
      { type: 'codeChanged', code: 'size←40' },
      { type: 'codeChanged', code: 'size←400' },
    ]);

    expect(after.past).toEqual([]);
    expect(after.code).toBe('size←400');
  });

  it('nor does recolouring, which changes no artwork', () => {
    const after = reduce(drawn(), { type: 'renderOptionsChanged', options: { invert: true } });

    expect(after.past).toEqual([]);
  });

  it('nor does a run, however it ends', () => {
    const after = reduceAll(drawn(), [
      { type: 'runStarted' },
      {
        type: 'runSucceeded',
        matrix: resultOf(4, 'size←4').matrix,
        stats: resultOf(4, 'size←4').stats,
        source: 'size←4',
        warnings: [],
        durationMs: 1,
        requestCount: 1,
      },
      { type: 'runFailed', error: { kind: 'badResponse', message: 'no', detail: undefined, source: 'x' } },
      { type: 'runCancelled' },
    ]);

    expect(after.past).toEqual([]);
  });

  it('nor does restoring saved or shared work', () => {
    /*
     * Rebuilding from a link is not something the visitor did in this session, so
     * there is nothing behind it — and the state that arrives brings its own
     * history, which is empty.
     */
    const restored: WorkspaceState = { ...initialWorkspaceState(modularBloom), code: 'size←12' };
    const after = reduce(reduce(drawn(), commit('size←40')), { type: 'restored', state: restored });

    expect(after.past).toEqual([]);
    expect(after.code).toBe('size←12');
  });

  it('nor does a commit that changes nothing', () => {
    // Setting a slider to the value it already holds should not consume a step.
    const before = drawn();
    const after = reduce(before, commit(before.code));

    expect(after).toBe(before);
  });
});

describe('one gesture, one step', () => {
  it('folds every step of a drag into the state it started from', () => {
    const before = drawn();
    const after = reduceAll(before, [
      commit('size←41', { coalesce: 'play:size:0' }),
      commit('size←42', { coalesce: 'play:size:0' }),
      commit('size←43', { coalesce: 'play:size:0' }),
    ]);

    expect(after.code).toBe('size←43');
    expect(after.past).toHaveLength(1);
    expect(after.past[0]?.code).toBe(before.code);

    // And one step back returns to before the drag, not to the middle of it.
    expect(reduce(after, { type: 'undone' }).code).toBe(before.code);
  });

  it('separates two drags of the same control', () => {
    // The identity carries a gesture number, so letting go and starting again is
    // a second thing somebody did.
    const after = reduceAll(drawn(), [
      commit('size←41', { coalesce: 'play:size:0' }),
      commit('size←42', { coalesce: 'play:size:0' }),
      commit('size←50', { coalesce: 'play:size:1' }),
    ]);

    expect(after.past).toHaveLength(2);
    expect(after.past.map((entry) => entry.code)).toEqual([modularBloom.code, 'size←42']);
  });

  it('separates two different controls, even within one gesture number', () => {
    const after = reduceAll(drawn(), [
      commit('size←41', { coalesce: 'play:size:0' }),
      commit('modulus←9', { coalesce: 'play:modulus:0' }),
    ]);

    expect(after.past).toHaveLength(2);
  });

  it('never folds a change with no gesture, such as Randomise', () => {
    const after = reduceAll(drawn(), [
      commit('size←41', { label: 'Randomise' }),
      commit('size←42', { label: 'Randomise' }),
    ]);

    expect(after.past).toHaveLength(2);
    expect(after.past.every((entry) => entry.coalesce === undefined)).toBe(true);
  });
});

describe('a step back', () => {
  it('restores the source, the seed and the artwork together', () => {
    const before = drawn();
    const randomised = reduce(before, commit('size←40', { label: 'Randomise', seed: 77 }));
    const redrawn = reduce(randomised, {
      type: 'runSucceeded',
      matrix: resultOf(12, 'size←40').matrix,
      stats: resultOf(12, 'size←40').stats,
      source: 'size←40',
      warnings: [],
      durationMs: 9,
      requestCount: 1,
    });

    expect(redrawn.seed).toBe(77);
    expect(redrawn.result?.matrix.rows).toBe(12);

    const back = reduce(redrawn, { type: 'undone' });

    expect(back.code).toBe(before.code);
    expect(back.seed).toBe(before.seed);
    expect(back.result).toBe(before.result);
    expect(back.warnings).toEqual(before.warnings);
    expect(back.lastDurationMs).toBe(42);
    expect(back.lastRequestCount).toBe(3);
    // The source and the picture agree again, so that is what the status says.
    expect(back.status).toBe('success');
    expect(back.past).toEqual([]);
  });

  it('recomputes whether the artwork is still the original', () => {
    const edited = reduce(initialWorkspaceState(modularBloom), commit('size←40'));
    expect(edited.modified).toBe(true);

    expect(reduce(edited, { type: 'undone' }).modified).toBe(false);
  });

  it('clears a failure and a half-delivered run, which belonged to what is being undone', () => {
    const state: WorkspaceState = {
      ...reduce(drawn(), commit('size←40')),
      status: 'error',
      error: { kind: 'timeout', message: 'too slow', detail: undefined, source: 'size←40' },
      progress: {
        source: 'size←40',
        rows: 4,
        columns: 4,
        values: new Float64Array(16),
        filled: 4,
        total: 16,
        bandsDone: 1,
      },
    };

    const back = reduce(state, { type: 'undone' });

    expect(back.error).toBeNull();
    expect(back.progress).toBeNull();
    expect(back.status).toBe('success');
  });

  it('says "ready" when the artwork it restores is no artwork at all', () => {
    const fresh = initialWorkspaceState(modularBloom);
    const back = reduce(reduce(fresh, commit('size←40')), { type: 'undone' });

    expect(back.result).toBeNull();
    expect(back.status).toBe('ready');
  });

  it('drops a chosen cell the restored artwork does not have', () => {
    const small = reduce(drawn(4), commit('size←40'));
    const large = reduce(small, {
      type: 'runSucceeded',
      matrix: resultOf(40, 'size←40').matrix,
      stats: resultOf(40, 'size←40').stats,
      source: 'size←40',
      warnings: [],
      durationMs: 1,
      requestCount: 1,
    });
    const selected = reduce(large, { type: 'cellInspected', cell: { row: 30, column: 30 } });
    expect(selected.inspected).not.toBeNull();

    // Row 30 does not exist in the four-by-four artwork being restored.
    expect(reduce(selected, { type: 'undone' }).inspected).toBeNull();
  });

  it('keeps a chosen cell the restored artwork does have', () => {
    const state = reduce(reduce(drawn(8), commit('size←40')), {
      type: 'cellInspected',
      cell: { row: 2, column: 3 },
    });

    expect(reduce(state, { type: 'undone' }).inspected).toEqual({ row: 2, column: 3 });
  });

  it('does nothing at all when there is nothing behind you', () => {
    const state = drawn();

    expect(reduce(state, { type: 'undone' })).toBe(state);
  });

  it('walks back one step at a time', () => {
    const state = reduceAll(initialWorkspaceState(modularBloom), [
      commit('size←10'),
      commit('size←20'),
      commit('size←30'),
    ]);

    const first = reduce(state, { type: 'undone' });
    const second = reduce(first, { type: 'undone' });
    const third = reduce(second, { type: 'undone' });

    expect([first.code, second.code, third.code]).toEqual(['size←20', 'size←10', modularBloom.code]);
    expect(reduce(third, { type: 'undone' })).toBe(third);
  });
});

describe('what invalidates the history', () => {
  /** A history with two steps in it, which the cases below try to spend. */
  function withHistory(): WorkspaceState {
    return reduceAll(drawn(), [commit('size←40'), commit('modulus←9', { label: 'Scale' })]);
  }

  it('any source change the history does not describe', () => {
    /*
     * The heart of it. A snapshot says what the source was before a recorded
     * change, so stepping back is only honest while every change since has been
     * recorded. This one has not been — so rather than restoring a program from
     * before somebody's typing and discarding the typing with it, Undo stops
     * offering.
     */
    const typed = reduce(withHistory(), { type: 'codeChanged', code: 'size←40 ⋄ modulus←9 ⍝ mine' });

    expect(typed.past).toEqual([]);
    expect(reduce(typed, { type: 'undone' }).code).toBe('size←40 ⋄ modulus←9 ⍝ mine');
  });

  it('however small, and whatever wrote it', () => {
    // The reducer cannot tell a keystroke from a technical slider from a Reset,
    // and deliberately does not try: none of them is a snapshot, so all of them
    // invalidate. This is the rule a new route into the source inherits by
    // default rather than having to be told.
    for (const code of ['size←41', modularBloom.code, '']) {
      expect(reduce(withHistory(), { type: 'codeChanged', code }).past).toEqual([]);
    }
  });

  it('but not the editor reporting the change that was just committed', () => {
    /*
     * Pushing a value into the editor makes its document change, and its update
     * listener reports that straight back as a `codeChanged` carrying the text
     * just committed. Every Play adjustment arrives twice for that reason, and the
     * second arrival must not throw away the history the first one made.
     */
    const committed = reduce(withHistory(), commit('size←44', { coalesce: 'play:size:0' }));
    const echoed = reduce(committed, { type: 'codeChanged', code: 'size←44' });

    expect(echoed).toBe(committed);
    expect(echoed.past).toHaveLength(3);
  });

  it('and nothing that leaves the source alone', () => {
    // Looking at the artwork, recolouring it, running it, reading a cell: none of
    // these is a change to the program, so none of them costs a step back.
    const kept = reduceAll(withHistory(), [
      { type: 'renderOptionsChanged', options: { invert: true, paletteId: 'neon' } },
      { type: 'runStarted' },
      {
        type: 'runSucceeded',
        matrix: resultOf(6, 'modulus←9').matrix,
        stats: resultOf(6, 'modulus←9').stats,
        source: 'modulus←9',
        warnings: [],
        durationMs: 5,
        requestCount: 1,
      },
      { type: 'cellInspected', cell: { row: 1, column: 1 } },
      { type: 'runCancelled' },
    ]);

    expect(kept.past).toHaveLength(2);
    expect(reduce(kept, { type: 'undone' }).code).toBe('size←40');
  });

  it('and a later committed change begins a new sequence', () => {
    const invalidated = reduce(withHistory(), { type: 'codeChanged', code: 'size←41' });
    const committed = reduce(invalidated, commit('size←48'));

    expect(committed.past).toHaveLength(1);
    // Back to where the source stood after the typing, not to anything before it.
    expect(reduce(committed, { type: 'undone' }).code).toBe('size←41');
  });
});

describe('the history is bounded', () => {
  it('keeps the most recent steps and forgets the oldest', () => {
    const commits = Array.from({ length: HISTORY_LIMIT + 5 }, (_unused, index) =>
      commit(`size←${String(index + 10)}`),
    );
    const state = reduceAll(initialWorkspaceState(modularBloom), commits);

    expect(state.past).toHaveLength(HISTORY_LIMIT);
    // The oldest kept entry is the state left by the fifth commit, so the four
    // steps before it are gone rather than the four most recent.
    expect(state.past[0]?.code).toBe('size←14');
    expect(state.past.at(-1)?.code).toBe(`size←${String(HISTORY_LIMIT + 13)}`);
  });

  it('is a limit on steps, not on how far one step reaches', () => {
    // Twenty is the number of things you can take back, and a drag of any length
    // is one of them.
    const drag = Array.from({ length: 200 }, (_unused, index) =>
      commit(`size←${String(index + 10)}`, { coalesce: 'play:size:0' }),
    );
    const state = reduceAll(initialWorkspaceState(modularBloom), drag);

    expect(state.past).toHaveLength(1);
  });
});

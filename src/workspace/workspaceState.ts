/**
 * Workspace state and the rules for changing it.
 *
 * A plain reducer, kept separate from React so the transitions can be tested
 * directly. The one rule that matters throughout: a failed run never clears
 * the artwork. Losing your picture because the next edit had a typo would be
 * the worst thing this application could do.
 */

import { withinMatrix } from '@/matrix/matrixInspection';
import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type ExecutionErrorKind } from '@/execution/errors';
import { type ArtworkPreset } from '@/presets/schema';
import { type SourceCell } from '@/renderer/displayMapping';
import { defaultRenderOptions, type RenderOptions } from '@/renderer/renderOptions';

export type RunStatus =
  /** Loaded, never run. */
  | 'ready'
  /** Edited since the last successful run. */
  | 'edited'
  | 'running'
  | 'success'
  | 'cancelled'
  | 'error';

export interface WorkspaceError {
  readonly kind: ExecutionErrorKind;
  readonly message: string;
  readonly detail: string | undefined;
  /**
   * The source that failed, so it can be tried again as it was.
   *
   * A banded run can fail on its eighth request, several seconds after it was
   * submitted, by which time the editor may hold something else. Retrying is
   * retrying *that* run — pressing Run would submit whatever is in the editor,
   * which is a different question.
   */
  readonly source: string;
}

/**
 * A result, and everything needed to say what it means.
 *
 * One object rather than three fields, because they are one fact. The numbers
 * in a matrix do not interpret themselves: an escape count means "reached the
 * limit" only against the ceiling the run was given, so the source that
 * produced the matrix has to travel with it. Editing the code changes what the
 * *next* run will mean, not what this one meant.
 *
 * Grouping them makes that structural. Held apart, `source` could be advanced
 * on its own by an edit and the matrix would silently be reinterpreted under a
 * ceiling that never produced it.
 */
export interface ArtworkResult {
  readonly matrix: NumericMatrix;
  readonly stats: MatrixStats;
  /** The APL that produced it, exactly as submitted. */
  readonly source: string;
}

/**
 * A banded run in flight, and how much of it has arrived.
 *
 * Deliberately not an `ArtworkResult` and deliberately not convertible into
 * one. A partial matrix is a picture being delivered, not an artwork: it is
 * never inspected, never saved, never shared and never exported, and the only
 * way it can become the result is for the run to finish and dispatch one.
 *
 * It carries its own `source` for the same reason the result does, and more
 * urgently — a banded run takes seconds, which is long enough to edit the code
 * while it is happening. Every band belongs to the source that was submitted,
 * so bands already on screen keep meaning what they meant.
 */
export interface RunInFlight {
  readonly source: string;
  readonly rows: number;
  readonly columns: number;
  /** Full length; only the first `filled` entries have been fetched. */
  readonly values: Float64Array;
  readonly filled: number;
  readonly total: number;
  readonly bandsDone: number;
}

export interface WorkspaceState {
  readonly code: string;
  readonly renderOptions: RenderOptions;
  readonly status: RunStatus;
  /** The last artwork that ran successfully. Survives later failures. */
  readonly result: ArtworkResult | null;
  readonly error: WorkspaceError | null;
  readonly warnings: readonly string[];
  readonly lastRunAt: number | null;
  readonly lastDurationMs: number | null;
  readonly lastRequestCount: number | null;
  /** True once the code differs from the preset's original. */
  readonly modified: boolean;
  /**
   * The cell being read, in the matrix's own one-based coordinates.
   *
   * Kept here rather than beside the other view state because it and the matrix
   * share an invariant — a selection must name a cell the matrix has — and the
   * only way to hold a joint invariant is to change both in one transition.
   */
  readonly inspected: SourceCell | null;
  /** Set only while a banded run is delivering. Never becomes the result. */
  readonly progress: RunInFlight | null;
}

export type WorkspaceAction =
  | { readonly type: 'codeChanged'; readonly code: string }
  | { readonly type: 'cellInspected'; readonly cell: SourceCell | null }
  | { readonly type: 'renderOptionsChanged'; readonly options: Partial<RenderOptions> }
  | { readonly type: 'runStarted' }
  | { readonly type: 'runProgressed'; readonly progress: RunInFlight }
  | {
      readonly type: 'runSucceeded';
      readonly matrix: NumericMatrix;
      readonly stats: MatrixStats;
      /** The source submitted for this run, not whatever is in the editor now. */
      readonly source: string;
      readonly warnings: readonly string[];
      readonly durationMs: number;
      readonly requestCount: number;
    }
  | { readonly type: 'runFailed'; readonly error: WorkspaceError }
  | { readonly type: 'runCancelled' }
  | { readonly type: 'restored'; readonly state: WorkspaceState };

export function initialWorkspaceState(preset: ArtworkPreset): WorkspaceState {
  return {
    code: preset.code,
    renderOptions: defaultRenderOptions(preset.defaultPaletteId),
    status: 'ready',
    result: null,
    error: null,
    warnings: [],
    lastRunAt: null,
    lastDurationMs: null,
    lastRequestCount: null,
    modified: false,
    inspected: null,
    progress: null,
  };
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
  preset: ArtworkPreset,
): WorkspaceState {
  switch (action.type) {
    case 'codeChanged': {
      if (action.code === state.code) return state;
      return {
        ...state,
        code: action.code,
        modified: action.code !== preset.code,
        // Running is not interrupted by typing; the run in flight is either
        // superseded or completes and is discarded by the caller.
        status: state.status === 'running' ? 'running' : 'edited',
      };
    }

    case 'renderOptionsChanged': {
      // Appearance only. Deliberately does not mark the artwork as edited or
      // invalidate the result: recolouring must never imply a re-run. The
      // selection is untouched for the same reason — turning the artwork moves
      // where a cell is drawn, not which cell was chosen.
      return { ...state, renderOptions: { ...state.renderOptions, ...action.options } };
    }

    case 'cellInspected': {
      // Refused rather than stored when the matrix has no such cell, so the
      // invariant holds however the selection was arrived at.
      const cell =
        action.cell !== null &&
        state.result !== null &&
        withinMatrix(state.result.matrix, action.cell.row, action.cell.column)
          ? action.cell
          : null;
      return { ...state, inspected: cell };
    }

    case 'runStarted':
      // The previous artwork stays until something replaces it, so pressing Run
      // does not blank the screen for the length of a request.
      return { ...state, status: 'running', error: null, progress: null };

    case 'runProgressed':
      // Ignored unless a run is actually in flight, so a band arriving after a
      // cancellation cannot put a partial picture back on screen.
      return state.status === 'running' ? { ...state, progress: action.progress } : state;

    case 'runSucceeded':
      return {
        ...state,
        status: 'success',
        /*
         * The matrix and the source that produced it, replaced together. This
         * is the boundary at which the artwork's meaning changes; an edit to
         * the code before this point changes what the next run will mean and
         * nothing about the result already on screen.
         */
        result: { matrix: action.matrix, stats: action.stats, source: action.source },
        // The delivery is over, so the buffer goes with it. The complete result
        // above is the only thing left, which is what makes a partial matrix
        // unable to outlive its run.
        progress: null,
        /*
         * Dropped outright when the new result has no such cell, rather than
         * merely going unrendered. A selection kept out of sight would come back
         * the moment a later result was large enough again — pointing at a cell
         * nobody had chosen, in an artwork they had not been looking at.
         */
        inspected:
          state.inspected !== null && withinMatrix(action.matrix, state.inspected.row, state.inspected.column)
            ? state.inspected
            : null,
        error: null,
        warnings: action.warnings,
        lastRunAt: Date.now(),
        lastDurationMs: action.durationMs,
        lastRequestCount: action.requestCount,
      };

    case 'runFailed':
      return {
        ...state,
        status: 'error',
        error: action.error,
        // Half an artwork is not an artwork. What is left on screen is the last
        // complete one, behind the error.
        progress: null,
        // `result` is deliberately untouched: the last good artwork stays on
        // screen behind the error, still meaning what it meant, because the
        // source that produced it is part of it.
      };

    case 'runCancelled':
      // Cancelling restores the last complete result by discarding the partial,
      // which is the whole of the work: the result was never touched.
      return { ...state, status: 'cancelled', progress: null };

    case 'restored':
      return action.state;
  }
}

/**
 * How far along a banded run is, in quarters.
 *
 * Deliberately coarse. This sentence goes to a live region, and a tall artwork
 * arrives in a dozen bands — announcing each one would talk over everything
 * else on the page for the length of the run to convey nothing anybody needed.
 * Crossing a quarter is worth saying; band seven of twelve is not.
 */
function describeProgress(progress: RunInFlight | null): string {
  if (progress === null || progress.total === 0) return 'Running…';

  const quarters = Math.floor((4 * progress.filled) / progress.total);
  switch (quarters) {
    case 0:
      return 'Running…';
    case 1:
      return 'Running… about a quarter of the artwork has arrived.';
    case 2:
      return 'Running… about half of the artwork has arrived.';
    default:
      return 'Running… nearly there.';
  }
}

/** Wording for the status region, which is announced to screen readers. */
export function describeStatus(state: WorkspaceState): string {
  switch (state.status) {
    case 'ready':
      return 'Ready to run.';
    case 'edited':
      return state.result === null ? 'Ready to run.' : 'Edited. Run to update the artwork.';
    case 'running':
      return describeProgress(state.progress);
    case 'success': {
      const requests = state.lastRequestCount ?? 1;
      const detail = requests > 1 ? ` in ${requests} requests` : '';
      return `Finished in ${state.lastDurationMs ?? 0} ms${detail}.`;
    }
    case 'cancelled':
      return 'Stopped.';
    /*
     * Short, and deliberately not the message itself.
     *
     * The failure is already presented in full by the error panel, which is an
     * assertive alert. Returning the same sentence here put it on screen twice
     * and read it out twice — once politely, once assertively — which is how a
     * refusal came across as two separate problems. The panel says what went
     * wrong; this says only that something did.
     */
    case 'error':
      return 'Run failed.';
  }
}

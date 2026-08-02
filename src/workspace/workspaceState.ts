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
}

export interface WorkspaceState {
  readonly code: string;
  readonly renderOptions: RenderOptions;
  readonly status: RunStatus;
  /** The last artwork that ran successfully. Survives later failures. */
  readonly matrix: NumericMatrix | null;
  readonly stats: MatrixStats | null;
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
}

export type WorkspaceAction =
  | { readonly type: 'codeChanged'; readonly code: string }
  | { readonly type: 'cellInspected'; readonly cell: SourceCell | null }
  | { readonly type: 'renderOptionsChanged'; readonly options: Partial<RenderOptions> }
  | { readonly type: 'runStarted' }
  | {
      readonly type: 'runSucceeded';
      readonly matrix: NumericMatrix;
      readonly stats: MatrixStats;
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
    matrix: null,
    stats: null,
    error: null,
    warnings: [],
    lastRunAt: null,
    lastDurationMs: null,
    lastRequestCount: null,
    modified: false,
    inspected: null,
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
        state.matrix !== null &&
        withinMatrix(state.matrix, action.cell.row, action.cell.column)
          ? action.cell
          : null;
      return { ...state, inspected: cell };
    }

    case 'runStarted':
      return { ...state, status: 'running', error: null };

    case 'runSucceeded':
      return {
        ...state,
        status: 'success',
        matrix: action.matrix,
        stats: action.stats,
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
        // matrix and stats are deliberately untouched: the last good artwork
        // stays on screen behind the error.
      };

    case 'runCancelled':
      return { ...state, status: 'cancelled' };

    case 'restored':
      return action.state;
  }
}

/** Wording for the status region, which is announced to screen readers. */
export function describeStatus(state: WorkspaceState): string {
  switch (state.status) {
    case 'ready':
      return 'Ready to run.';
    case 'edited':
      return state.matrix === null ? 'Ready to run.' : 'Edited. Run to update the artwork.';
    case 'running':
      return 'Running…';
    case 'success': {
      const requests = state.lastRequestCount ?? 1;
      const detail = requests > 1 ? ` in ${requests} requests` : '';
      return `Finished in ${state.lastDurationMs ?? 0} ms${detail}.`;
    }
    case 'cancelled':
      return 'Stopped.';
    case 'error':
      return state.error?.message ?? 'Something went wrong.';
  }
}

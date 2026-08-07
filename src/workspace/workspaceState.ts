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

/**
 * A picture you can be put back to.
 *
 * Everything that describes the artwork on screen and nothing that describes how
 * you were looking at it: the source, the seed that reproduces it, the result and
 * the sentences about the run that produced it. Appearance is deliberately absent
 * — recolouring is not a change to the artwork, and an undo that also put the
 * palette back would take away something nobody asked to lose.
 *
 * The result is held by reference, not copied. It is already immutable and
 * already in memory, so a bounded history costs the matrices it keeps alive
 * rather than a duplicate of each.
 */
export interface WorkspaceSnapshot {
  readonly code: string;
  readonly seed: number | undefined;
  /**
   * How the artwork was drawn, not only what was calculated.
   *
   * Undo offers to take back "the last thing you changed", and once the palette
   * sits in the same panel as the sliders, a visitor who recolours an artwork and
   * presses Undo means the colour — not the Complexity they moved a minute
   * earlier. Appearance therefore travels in the same snapshot as the source
   * rather than in a history of its own, so one stack answers for both and the
   * order is the order things happened.
   *
   * Cheap to keep: this is a handful of scalars and a palette id beside a result
   * that is already held by reference.
   */
  readonly renderOptions: RenderOptions;
  readonly result: ArtworkResult | null;
  readonly warnings: readonly string[];
  readonly lastRunAt: number | null;
  readonly lastDurationMs: number | null;
  readonly lastRequestCount: number | null;
  /** What was about to happen, so Undo can name what it will take back. */
  readonly label: string;
  /**
   * The gesture this snapshot belongs to, if it was taken during one.
   *
   * A slider dragged across twenty values is one thing somebody did, so the
   * first step takes a snapshot and the rest recognise their own gesture and add
   * none. The caller supplies the identity because only the caller knows when a
   * gesture ends — a pointer released, a key let go.
   */
  readonly coalesce: string | undefined;
}

/**
 * How many steps back Undo can reach.
 *
 * Bounded because a session has no natural end: an afternoon of pressing
 * Randomise should not keep every artwork it produced alive. Twenty is far more
 * than anybody steps back and small enough that the matrices it holds are
 * measured in kilobytes.
 */
export const HISTORY_LIMIT = 20;

export interface WorkspaceState {
  readonly code: string;
  /**
   * The seed that reproduces this artwork, when one produced it.
   *
   * Here rather than beside the interface state because it is part of what makes
   * the picture: it travels in the share link, and Undo has to put back the seed
   * that goes with the source it restores, or a shared link would name a number
   * that describes something else.
   */
  readonly seed: number | undefined;
  /** Committed changes, oldest first. Empty when there is nothing to undo. */
  readonly past: readonly WorkspaceSnapshot[];
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
  /**
   * The source changed by some route the history does not describe.
   *
   * Typing, a technical control, a Reset, an inserted symbol, a view rewritten by
   * a drag. Records nothing and invalidates what was recorded, which is the pair
   * that makes Undo safe to offer.
   */
  | { readonly type: 'codeChanged'; readonly code: string }
  /**
   * A change somebody deliberately made, which Undo can therefore take back.
   *
   * Separate from `codeChanged` rather than a flag on it, and that separation is
   * what the safety rests on: the default is to record nothing and to invalidate,
   * so a route that has not been taught to commit cannot silently become
   * undoable. Typing must not fill a history either — the editor has its own undo,
   * and a keystroke is not a decision. What arrives here is a control released or
   * a Randomise completed.
   */
  | {
      readonly type: 'codeCommitted';
      readonly code: string;
      /** Names the action, for Undo's accessible label. */
      readonly label: string;
      /** Identity of the gesture in progress, if this is part of one. */
      readonly coalesce?: string | undefined;
      /** The seed that produced this code, when one did. */
      readonly seed?: number | undefined;
    }
  | { readonly type: 'undone' }
  | { readonly type: 'cellInspected'; readonly cell: SourceCell | null }
  | { readonly type: 'renderOptionsChanged'; readonly options: Partial<RenderOptions> }
  /**
   * An appearance change somebody deliberately made, which Undo can take back.
   *
   * The same distinction `codeCommitted` draws against `codeChanged`, for the
   * same reason: dragging a colour stop through forty shades is one decision, and
   * only the caller knows when the drag ended. A route that has not been taught to
   * commit still records nothing — but unlike source, appearance invalidates
   * nothing either, because recolouring cannot make an earlier snapshot's source
   * wrong.
   */
  | {
      readonly type: 'renderOptionsCommitted';
      readonly options: Partial<RenderOptions>;
      /** Names the action, for Undo's accessible label. */
      readonly label: string;
      /** Identity of the gesture in progress, if this is part of one. */
      readonly coalesce?: string | undefined;
    }
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

/**
 * Whether two sets of render options describe the same appearance.
 *
 * By value rather than by reference, because every commit builds a fresh object
 * by spreading the old one — so identity is never equal, and a palette chosen
 * twice would otherwise cost a step of the history that takes nothing back.
 *
 * These options are exactly what a share link and a saved project carry, so they
 * are plain JSON: primitives, arrays of them, and objects of them. That is the
 * whole domain this walks.
 */
function sameRenderOptions(before: RenderOptions, after: RenderOptions): boolean {
  const same = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((item, index) => same(item, b[index]));
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) =>
      same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  };

  return same(before, after);
}

export function initialWorkspaceState(preset: ArtworkPreset): WorkspaceState {
  return {
    code: preset.code,
    seed: undefined,
    past: [],
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
      /*
       * Identical text is not a change, and this is load-bearing rather than an
       * optimisation.
       *
       * The editor echoes: pushing a new value into it makes its document change,
       * which its update listener reports straight back here. Every committed
       * change therefore arrives a second time as a `codeChanged` carrying exactly
       * the text just committed — and that echo must not be mistaken for somebody
       * editing, or the history below would be discarded the instant it was made.
       */
      if (action.code === state.code) return state;

      return {
        ...state,
        code: action.code,
        modified: action.code !== preset.code,
        // Running is not interrupted by typing; the run in flight is either
        // superseded or completes and is discarded by the caller.
        status: state.status === 'running' ? 'running' : 'edited',
        /*
         * The history goes, because this change is not in it.
         *
         * A snapshot describes the source as it was before a recorded change, so a
         * step back is only honest while every change since has been recorded.
         * This action is the one that has not been: typing, a technical control, a
         * Reset, a symbol inserted, a view rewritten by a drag. Undoing past one of
         * those would quietly throw it away, so Undo stops offering rather than
         * offering something untrue — and the next committed change starts a fresh
         * sequence from wherever the source now stands.
         */
        past: state.past.length === 0 ? state.past : [],
      };
    }

    case 'codeCommitted': {
      const seed = action.seed ?? state.seed;
      // Nothing changed, so there is nothing to undo back to. Setting a slider to
      // the value it already holds should not consume a step of the history.
      if (action.code === state.code && seed === state.seed) return state;

      const current = state.past.at(-1);
      const sameGesture = action.coalesce !== undefined && current?.coalesce === action.coalesce;

      const snapshot: WorkspaceSnapshot = {
        code: state.code,
        seed: state.seed,
        renderOptions: state.renderOptions,
        result: state.result,
        warnings: state.warnings,
        lastRunAt: state.lastRunAt,
        lastDurationMs: state.lastDurationMs,
        lastRequestCount: state.lastRequestCount,
        label: action.label,
        ...(action.coalesce === undefined ? { coalesce: undefined } : { coalesce: action.coalesce }),
      };

      return {
        ...state,
        code: action.code,
        seed,
        modified: action.code !== preset.code,
        status: state.status === 'running' ? 'running' : 'edited',
        /*
         * The state *before* the change, so a step back lands where you were.
         * Within one gesture the first snapshot is already that state, and the
         * newest entries are the ones kept when the limit is reached.
         */
        past: sameGesture ? state.past : [...state.past, snapshot].slice(-HISTORY_LIMIT),
      };
    }

    case 'undone': {
      /*
       * A step back reaches the source as it was before the last committed change,
       * and it can only ever reach that far.
       *
       * Nothing untracked can have happened in between: any source change that is
       * not a commit empties the history above, so a step back never discards work
       * it has no record of. Which is why this can restore the source outright
       * rather than trying to reconcile it with anything.
       */
      const previous = state.past.at(-1);
      if (previous === undefined) return state;

      return {
        ...state,
        code: previous.code,
        seed: previous.seed,
        /*
         * Appearance travels with the source it was seen in. A step back over a
         * colour change restores the colour and leaves the source alone, because
         * a colour-only snapshot holds the source unchanged — the same field
         * restores both kinds of step without either knowing about the other.
         */
        renderOptions: previous.renderOptions,
        result: previous.result,
        warnings: previous.warnings,
        lastRunAt: previous.lastRunAt,
        lastDurationMs: previous.lastDurationMs,
        lastRequestCount: previous.lastRequestCount,
        modified: previous.code !== preset.code,
        past: state.past.slice(0, -1),
        /*
         * The source and the picture were restored together, so they agree — and
         * that agreement is what the status says. A failure and a half-delivered
         * run both belonged to the change being taken back, so both go with it.
         */
        status: previous.result === null ? 'ready' : 'success',
        error: null,
        progress: null,
        // A cell chosen in the artwork being left is only kept if the artwork
        // being restored has it, exactly as a completed run decides.
        inspected:
          state.inspected !== null &&
          previous.result !== null &&
          withinMatrix(previous.result.matrix, state.inspected.row, state.inspected.column)
            ? state.inspected
            : null,
      };
    }

    case 'renderOptionsCommitted': {
      const options = { ...state.renderOptions, ...action.options };

      // Nothing changed, so there is nothing to undo back to — choosing the
      // palette already in use should not consume a step of the history.
      if (sameRenderOptions(state.renderOptions, options)) return state;

      const current = state.past.at(-1);
      const sameGesture = action.coalesce !== undefined && current?.coalesce === action.coalesce;

      const snapshot: WorkspaceSnapshot = {
        code: state.code,
        seed: state.seed,
        renderOptions: state.renderOptions,
        result: state.result,
        warnings: state.warnings,
        lastRunAt: state.lastRunAt,
        lastDurationMs: state.lastDurationMs,
        lastRequestCount: state.lastRequestCount,
        label: action.label,
        ...(action.coalesce === undefined ? { coalesce: undefined } : { coalesce: action.coalesce }),
      };

      /*
       * Recorded, but nothing else about the artwork moves.
       *
       * `status`, `modified` and `result` are all left exactly as they were, for
       * the reason `renderOptionsChanged` gives below: recolouring must never
       * imply that the source needs running again. All this adds is a step back.
       */
      return {
        ...state,
        renderOptions: options,
        past: sameGesture ? state.past : [...state.past, snapshot].slice(-HISTORY_LIMIT),
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
      /*
       * Replaced wholesale, and deliberately without a snapshot.
       *
       * Rebuilding from a shared link or from saved work is not something the
       * visitor did in this session, so there is nothing behind it to step back
       * to — and the incoming state brings its own history, which for every
       * caller is an empty one.
       */
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

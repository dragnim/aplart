/**
 * Wires the workspace reducer to the execution service.
 *
 * Owns the two things a reducer cannot: the service instance, and the fact
 * that only the newest run may update the artwork. A slow request that lands
 * after a newer one has finished is discarded rather than overwriting it.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { analytics } from '@/analytics/Analytics';
import { config } from '@/app/config';
import { AplExecutionError } from '@/execution/errors';
import { runArtwork } from '@/execution/runArtwork';
import { type AplExecutionService } from '@/execution/AplExecutionService';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { type ArtworkPreset } from '@/presets/schema';
import { type SourceCell } from '@/renderer/displayMapping';
import { type RenderOptions } from '@/renderer/renderOptions';
import {
  initialWorkspaceState,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from './workspaceState';

export interface UseWorkspaceOptions {
  readonly preset: ArtworkPreset;
  /** Injected by tests and end-to-end runs; production uses TryAPL. */
  readonly service?: AplExecutionService;
  readonly initialState?: WorkspaceState;
}

/** What a committed change was, for the history it creates. */
export interface CodeCommit {
  /** Names the action, for Undo's accessible label. */
  readonly label: string;
  /**
   * The gesture this change belongs to, if any.
   *
   * Steps sharing one identity become one undo entry. Supplied here rather than
   * decided in the reducer because only the interface knows when a gesture ends.
   */
  readonly coalesce?: string | undefined;
  readonly seed?: number | undefined;
}

/**
 * What a committed appearance change was, for the history it creates.
 *
 * `CodeCommit` without the seed: a palette does not produce a variation, so
 * there is nothing for a seed to identify.
 */
export interface RenderCommit {
  /** Names the action, for Undo's accessible label. */
  readonly label: string;
  /** The gesture this change belongs to, if any. */
  readonly coalesce?: string | undefined;
}

export interface Workspace {
  readonly state: WorkspaceState;
  readonly setCode: (code: string) => void;
  /** As `setCode`, but recorded so that Undo can take it back. */
  readonly commitCode: (code: string, commit: CodeCommit) => void;
  /** Steps back to the source, seed and artwork before the last commit. */
  readonly undo: () => void;
  readonly setRenderOptions: (options: Partial<RenderOptions>) => void;
  /** As `setRenderOptions`, but recorded so that Undo can take it back. */
  readonly commitRenderOptions: (options: Partial<RenderOptions>, commit: RenderCommit) => void;
  readonly run: () => void;
  /**
   * Runs code that has only just been decided on.
   *
   * `run` reads the current code through a ref that is written in an effect
   * after render, so `setCode(next); run()` in one handler would execute the
   * previous code. A caller that already holds the new source passes it here
   * instead of relying on that ordering.
   */
  readonly runCode: (source: string) => void;
  readonly inspectCell: (cell: SourceCell | null) => void;
  readonly stop: () => void;
  readonly restore: (state: WorkspaceState) => void;
}

export function useWorkspace({ preset, service, initialState }: UseWorkspaceOptions): Workspace {
  const executionService = useMemo(() => service ?? new TryAplExecutionService(), [service]);

  const reducer = useCallback(
    (state: WorkspaceState, action: WorkspaceAction) => workspaceReducer(state, action, preset),
    [preset],
  );

  const [state, dispatch] = useReducer(reducer, initialState ?? initialWorkspaceState(preset));

  /** Increments on every run; only the newest may report a result. */
  const runToken = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  // The code is read through a ref inside `run` so the callback stays stable
  // and does not re-create the keyboard shortcut on every keystroke. Written
  // after render rather than during it, which React forbids.
  const codeRef = useRef(state.code);
  useEffect(() => {
    codeRef.current = state.code;
  }, [state.code]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortController.current?.abort();
      executionService.cancel();
    };
  }, [executionService]);

  const runCode = useCallback(
    (source: string) => {
      const token = (runToken.current += 1);

      abortController.current?.abort();
      const controller = new AbortController();
      abortController.current = controller;

      dispatch({ type: 'runStarted' });

      void (async () => {
        try {
          const outcome = await runArtwork({
            service: executionService,
            source,
            /*
             * Guarded by the same token as the result. A superseded run keeps
             * making requests until its abort lands, and a band arriving from
             * it would otherwise paint rows of an artwork nobody asked for over
             * the one being delivered.
             */
            onProgress: (progress) => {
              if (!mounted.current || token !== runToken.current) return;
              dispatch({ type: 'runProgressed', progress: { ...progress, source } });
            },
            /*
             * The workspace's limits, and the same ones for every source.
             *
             * A preset used to be able to override these, and to declare which
             * transport its source needed. Both were decided before the code ran
             * — and the code in the editor is not the code the preset shipped, so
             * the declaration could be about a different program entirely. How to
             * fetch a result is now settled by the result; how large a matrix
             * this application will draw is settled here, once. A program's own
             * memory ceiling stays where a visitor can see it, as the Resolution
             * slider's maximum.
             */
            limits: {
              maxRows: config.maxMatrixRows,
              maxColumns: config.maxMatrixColumns,
              maxCells: config.maxMatrixCells,
            },
            timeoutMs: config.executionTimeoutMs,
            signal: controller.signal,
          });

          // A stale result must never replace a newer artwork.
          if (!mounted.current || token !== runToken.current) return;

          analytics.track({ name: 'code_run', presetId: preset.id, durationMs: outcome.durationMs });

          dispatch({
            type: 'runSucceeded',
            matrix: outcome.matrix,
            stats: outcome.stats,
            /*
             * The source this run was given, not `codeRef.current`. By the time
             * a request comes back the editor may hold something else entirely,
             * and the matrix means what the code that produced it said.
             */
            source,
            warnings: outcome.warnings,
            durationMs: outcome.durationMs,
            requestCount: outcome.requestCount,
          });
        } catch (error) {
          if (!mounted.current || token !== runToken.current) return;

          if (error instanceof AplExecutionError) {
            if (error.kind === 'cancelled') {
              dispatch({ type: 'runCancelled' });
              return;
            }
            analytics.track({ name: 'execution_failed', presetId: preset.id, kind: error.kind });
            dispatch({
              type: 'runFailed',
              error: { kind: error.kind, message: error.message, detail: error.detail, source },
            });
            return;
          }

          // Anything else is a fault in our own code rather than in the APL, so
          // it is logged for development and reported plainly to the user.
          if (import.meta.env.DEV) console.error('[workspace] unexpected failure', error);
          dispatch({
            type: 'runFailed',
            error: {
              kind: 'badResponse',
              message: 'Something went wrong while running your code. Please try again.',
              detail: error instanceof Error ? error.message : String(error),
              source,
            },
          });
        }
      })();
    },
    [executionService, preset],
  );

  const run = useCallback(() => runCode(codeRef.current), [runCode]);

  const stop = useCallback(() => {
    abortController.current?.abort();
    executionService.cancel();
  }, [executionService]);

  const setCode = useCallback((code: string) => {
    dispatch({ type: 'codeChanged', code });
  }, []);

  const commitCode = useCallback((code: string, commit: CodeCommit) => {
    dispatch({ type: 'codeCommitted', code, ...commit });
  }, []);

  /*
   * Stepping back, with any run in flight disowned first.
   *
   * The token is advanced before the state changes, so a request already on its
   * way is stale by the time it answers and its result is discarded by the same
   * guard that protects against a superseded run. Without that, undoing during a
   * run would put the old source on screen and then have the new artwork land on
   * top of it — a picture and a program that do not agree.
   */
  const undo = useCallback(() => {
    runToken.current += 1;
    abortController.current?.abort();
    executionService.cancel();
    dispatch({ type: 'undone' });
  }, [executionService]);

  const inspectCell = useCallback((cell: SourceCell | null) => {
    dispatch({ type: 'cellInspected', cell });
  }, []);

  const setRenderOptions = useCallback((options: Partial<RenderOptions>) => {
    dispatch({ type: 'renderOptionsChanged', options });
  }, []);

  /**
   * An appearance change Undo can take back.
   *
   * The counterpart of `commitCode` for the way an artwork is drawn, and the same
   * bargain: routes that have not been taught to commit still record nothing.
   * Nothing is cancelled here, unlike `undo` — recolouring does not disturb a run,
   * because it never asked for one.
   */
  const commitRenderOptions = useCallback((options: Partial<RenderOptions>, commit: RenderCommit) => {
    dispatch({ type: 'renderOptionsCommitted', options, ...commit });
  }, []);

  const restore = useCallback((restored: WorkspaceState) => {
    dispatch({ type: 'restored', state: restored });
  }, []);

  return {
    state,
    setCode,
    commitCode,
    undo,
    setRenderOptions,
    commitRenderOptions,
    run,
    runCode,
    stop,
    restore,
    inspectCell,
  };
}

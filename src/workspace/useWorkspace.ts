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

export interface Workspace {
  readonly state: WorkspaceState;
  readonly setCode: (code: string) => void;
  readonly setRenderOptions: (options: Partial<RenderOptions>) => void;
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
            highResolution: preset.outputLimits?.highResolution ?? false,
            limits: {
              maxRows: preset.outputLimits?.maxRows ?? config.maxMatrixRows,
              maxColumns: preset.outputLimits?.maxColumns ?? config.maxMatrixColumns,
              maxCells: preset.outputLimits?.maxCells ?? config.maxMatrixCells,
            },
            timeoutMs: config.requestTimeoutMs,
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

  const inspectCell = useCallback((cell: SourceCell | null) => {
    dispatch({ type: 'cellInspected', cell });
  }, []);

  const setRenderOptions = useCallback((options: Partial<RenderOptions>) => {
    dispatch({ type: 'renderOptionsChanged', options });
  }, []);

  const restore = useCallback((restored: WorkspaceState) => {
    dispatch({ type: 'restored', state: restored });
  }, []);

  return { state, setCode, setRenderOptions, run, runCode, stop, restore, inspectCell };
}

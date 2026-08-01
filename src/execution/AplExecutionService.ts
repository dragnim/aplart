/**
 * The boundary between APL Art and whatever runs the APL.
 *
 * Everything above this interface — the workspace, the renderer, the gallery —
 * knows only that it can send an expression and get lines of output back. The
 * TryAPL wire format, its truncation limits and its quirks live entirely in
 * the implementation.
 *
 * Implementations: `TryAplExecutionService`, `MockAplExecutionService`.
 */

export interface AplExecutionRequest {
  /** A single APL expression. Use `flattenToExpression` on multi-line source. */
  readonly code: string;
  readonly timeoutMs: number;
  /**
   * Start from a clean workspace. Always true today: TryAPL does not preserve
   * state between requests, and one preset must never see another's variables.
   */
  readonly freshWorkspace: boolean;
  readonly signal?: AbortSignal;
}

export interface AplExecutionResult {
  /** Output lines exactly as returned, with no trimming or interpretation. */
  readonly outputLines: readonly string[];
  /** The same lines joined with newlines, for display and copying. */
  readonly rawOutput: string;
  readonly durationMs: number;
  readonly warnings: readonly string[];
}

/**
 * What a backend can carry in one response.
 *
 * The runner uses these to work out how much of a matrix it can ask for at a
 * time. Publishing them here keeps the banding logic backend-agnostic and lets
 * the mock advertise generous limits so tests are not shaped by TryAPL's.
 */
export interface ExecutionCapabilities {
  /** Lines beyond this are dropped by the backend, silently. */
  readonly maxOutputLines: number;
  /** Characters per line beyond this are dropped, silently. */
  readonly maxLineLength: number;
  /** Whether variables survive from one request to the next. */
  readonly preservesState: boolean;
}

export interface AplExecutionService {
  readonly capabilities: ExecutionCapabilities;
  execute(request: AplExecutionRequest): Promise<AplExecutionResult>;
  /** Aborts the in-flight request, if any. Safe to call when nothing is running. */
  cancel(): void;
}

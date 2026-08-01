/**
 * An in-process APL execution service for tests and offline UI work.
 *
 * It does not interpret APL. It recognises the handful of expression shapes
 * the runner generates — the type probe and the banded reads — and serves them
 * from matrices registered against a preset id. That is enough to drive the
 * whole application deterministically, which is what end-to-end tests need:
 * CI must not fail because a public service is busy.
 *
 * Nothing here is used in the production build.
 */

import { type NumericMatrix } from '@/matrix/matrixTypes';
import {
  type AplExecutionRequest,
  type AplExecutionResult,
  type AplExecutionService,
  type ExecutionCapabilities,
} from './AplExecutionService';
import { executionError } from './errors';
import { PROBE_MARKER, BAND_MARKER, formatProbeReply, formatBandReply } from './transport';

export interface MockAplExecutionServiceOptions {
  /** Milliseconds of simulated latency, so loading states are exercised. */
  readonly latencyMs?: number;
  /** Force every execution to fail this way. */
  readonly failWith?: 'timeout' | 'serverUnavailable' | 'offline';
  /** Output lines to return verbatim, bypassing the matrix machinery. */
  readonly cannedOutput?: readonly string[];
  readonly capabilities?: Partial<ExecutionCapabilities>;
}

/** Generous next to TryAPL's, so tests are not shaped by its truncation. */
const MOCK_CAPABILITIES: ExecutionCapabilities = {
  maxOutputLines: 4096,
  maxLineLength: 65_536,
  preservesState: false,
};

export class MockAplExecutionService implements AplExecutionService {
  readonly capabilities: ExecutionCapabilities;

  /** How many times `execute` has been called; asserted on in tests. */
  executionCount = 0;
  /** Every expression received, in order. */
  readonly received: string[] = [];

  private readonly matrices = new Map<string, NumericMatrix>();
  private readonly options: MockAplExecutionServiceOptions;
  private cancelled = false;

  constructor(options: MockAplExecutionServiceOptions = {}) {
    this.options = options;
    this.capabilities = { ...MOCK_CAPABILITIES, ...options.capabilities };
  }

  /** Registers the matrix returned for expressions tagged with `key`. */
  register(key: string, matrix: NumericMatrix): void {
    this.matrices.set(key, matrix);
  }

  cancel(): void {
    this.cancelled = true;
  }

  async execute(request: AplExecutionRequest): Promise<AplExecutionResult> {
    this.executionCount += 1;
    this.received.push(request.code);
    this.cancelled = false;

    const startedAt = Date.now();

    if (this.options.latencyMs !== undefined && this.options.latencyMs > 0) {
      await this.delay(this.options.latencyMs, request.signal);
    }

    if (request.signal?.aborted === true || this.cancelled) {
      throw executionError('cancelled');
    }

    if (this.options.failWith !== undefined) {
      throw executionError(this.options.failWith);
    }

    const outputLines = this.options.cannedOutput ?? this.respondTo(request.code);

    return {
      outputLines,
      rawOutput: outputLines.join('\n'),
      durationMs: Date.now() - startedAt,
      warnings: [],
    };
  }

  private respondTo(expression: string): readonly string[] {
    const matrix = this.lookup(expression);
    if (matrix === undefined) {
      return ['VALUE ERROR: Undefined name: mock', ` ${expression}`, '  ∧'];
    }

    if (expression.includes(PROBE_MARKER)) {
      return formatProbeReply(matrix);
    }

    if (expression.includes(BAND_MARKER)) {
      return formatBandReply(matrix, expression, this.capabilities);
    }

    return formatBandReply(matrix, expression, this.capabilities);
  }

  /**
   * Finds the registered matrix whose key appears in the expression.
   *
   * Keys are preset ids, which the runner leaves in the expression as a
   * comment, so the mock can tell one artwork from another.
   */
  private lookup(expression: string): NumericMatrix | undefined {
    for (const [key, matrix] of this.matrices) {
      if (expression.includes(key)) return matrix;
    }
    return this.matrices.get('default');
  }

  private delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(executionError('cancelled'));
        },
        { once: true },
      );
    });
  }
}

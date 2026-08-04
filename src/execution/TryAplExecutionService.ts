/**
 * Runs APL through TryAPL's `Exec` endpoint.
 *
 * This is the only module that knows the wire format, and the only one that
 * knows TryAPL's limits. Its measured behaviour is documented in
 * `tryAplState.ts` and in the README under "TryAPL integration notes".
 */

import { config } from '@/app/config';
import {
  type AplExecutionRequest,
  type AplExecutionResult,
  type AplExecutionService,
  type ExecutionCapabilities,
} from './AplExecutionService';
import { AplExecutionError, executionError } from './errors';
import { buildRequestPayload, parseResponsePayload } from './tryAplState';

/**
 * Measured against the live service, not documented by it.
 *
 * A response is cut off at 93 lines of 995 characters with no error and no
 * marker, so these are treated as hard truths and the runner asks for less
 * than the maximum. `⎕PW` is rejected as NOT SUPPORTED, so they cannot be
 * raised from the client.
 */
export const TRYAPL_CAPABILITIES: ExecutionCapabilities = {
  maxOutputLines: 93,
  maxLineLength: 995,
  preservesState: false,
};

export interface TryAplExecutionServiceOptions {
  readonly endpoint?: string;
  readonly maxCodeLength?: number;
  readonly maxResponseBytes?: number;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export class TryAplExecutionService implements AplExecutionService {
  readonly capabilities = TRYAPL_CAPABILITIES;

  private readonly endpoint: string;
  private readonly maxCodeLength: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImpl: typeof fetch;

  /** The in-flight request, so a new run or Stop can abort it. */
  private inFlight: AbortController | null = null;

  constructor(options: TryAplExecutionServiceOptions = {}) {
    this.endpoint = options.endpoint ?? config.aplExecEndpoint;
    this.maxCodeLength = options.maxCodeLength ?? config.maxCodeLength;
    this.maxResponseBytes = options.maxResponseBytes ?? config.maxResponseBytes;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  cancel(): void {
    this.inFlight?.abort(new DOMException('Superseded', 'AbortError'));
    this.inFlight = null;
  }

  async execute(request: AplExecutionRequest): Promise<AplExecutionResult> {
    // Counted in code points, not UTF-16 units, so an artwork full of APL
    // glyphs is measured the way a person would count it.
    const codeLength = [...request.code].length;
    if (codeLength > this.maxCodeLength) {
      throw executionError(
        'codeTooLong',
        `${codeLength} characters; the limit is ${this.maxCodeLength}`,
        `This code is ${codeLength.toLocaleString('en-GB')} characters long. The limit is ${this.maxCodeLength.toLocaleString('en-GB')}.`,
      );
    }

    // Checking this first turns a confusing network failure into a clear
    // message. It is only a hint: the browser can be wrong in both directions.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw executionError('offline');
    }

    // Only one execution may be in flight per service instance, so a second
    // Run supersedes the first rather than racing it.
    this.cancel();

    const controller = new AbortController();
    this.inFlight = controller;

    const abortForTimeout = () => controller.abort(new DOMException('Timeout', 'TimeoutError'));
    const timer = setTimeout(abortForTimeout, request.timeoutMs);

    // A caller-supplied signal (the Stop button) also aborts this request.
    const onExternalAbort = () => controller.abort(new DOMException('Cancelled', 'AbortError'));
    request.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const startedAt = Date.now();

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(buildRequestPayload(request.code)),
        signal: controller.signal,
        // No cookies or credentials are involved, and none should be sent.
        credentials: 'omit',
        mode: 'cors',
      });

      if (!response.ok) {
        throw executionError(
          'serverUnavailable',
          `HTTP ${response.status} ${response.statusText} from ${this.endpoint}`,
        );
      }

      const text = await this.readBounded(response);

      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch {
        throw executionError('badResponse', `the response was not valid JSON: ${preview(text)}`);
      }

      const parsed = parseResponsePayload(decoded);
      if (!parsed.ok) {
        throw executionError('badResponse', parsed.reason);
      }

      const { outputLines } = parsed.response;

      return {
        outputLines,
        rawOutput: outputLines.join('\n'),
        durationMs: Date.now() - startedAt,
        warnings: truncationWarnings(outputLines, this.capabilities),
      };
    } catch (error) {
      throw this.asExecutionError(error);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onExternalAbort);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  /**
   * Reads the body incrementally, counting bytes, and stops at the limit.
   *
   * Three things were wrong with reading it in one go. `response.text()` had
   * already downloaded and decoded everything before the size was looked at, so
   * the limit described what would be *reported* rather than what would be
   * received. The check then compared `text.length`, which counts UTF-16 code
   * units and not bytes — a reply full of APL glyphs is two or three bytes per
   * character, so a body well past the limit could measure comfortably inside it.
   * And `Content-Length` was treated as the early defence when it is only a claim:
   * a chunked response has none, and a hostile one can understate it.
   *
   * So the header is an early rejection when it is honest about being too big, and
   * the byte count taken from the stream is the protection that actually holds.
   */
  private async readBounded(response: Response): Promise<string> {
    const declared = response.headers.get('content-length');
    if (declared !== null) {
      const size = Number(declared);
      if (Number.isFinite(size) && size > this.maxResponseBytes) {
        throw this.tooLarge(size, 'bytes, as the service declared');
      }
    }

    const body = response.body;
    if (body === null || typeof body.getReader !== 'function') {
      /*
       * No stream to read: an environment without `ReadableStream` bodies, or a
       * response constructed without one. The body has already arrived by the time
       * this is discovered, so nothing here can prevent the download — what it can
       * still do is refuse to hand a caller more than the limit, and measure it in
       * bytes rather than characters.
       */
      const text = await response.text();
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > this.maxResponseBytes) throw this.tooLarge(bytes, 'bytes');
      return text;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;

        received += value.byteLength;
        if (received > this.maxResponseBytes) {
          // Stop the transfer rather than draining the rest of it politely.
          await reader.cancel().catch(() => undefined);
          throw this.tooLarge(received, 'bytes');
        }

        // Streaming decode, so a multi-byte character split across two chunks is
        // rejoined rather than becoming a replacement character.
        text += decoder.decode(value, { stream: true });
      }

      // Flushes any incomplete sequence left at the end.
      text += decoder.decode();
      return text;
    } finally {
      /*
       * Released so an aborted or oversized read does not hold the body open. It
       * throws if the reader is already closed or cancelled, which is exactly the
       * case here often enough to be unremarkable.
       */
      try {
        reader.releaseLock();
      } catch {
        // Already released by cancel() or by the stream ending.
      }
    }
  }

  private tooLarge(size: number, unit: string): AplExecutionError {
    return executionError(
      'tooLarge',
      `the service returned ${size.toLocaleString('en-GB')} ${unit}; the limit is ${this.maxResponseBytes.toLocaleString('en-GB')}`,
    );
  }

  /** Maps whatever went wrong onto the failure taxonomy. */
  private asExecutionError(error: unknown): AplExecutionError {
    if (error instanceof AplExecutionError) return error;

    // Abort reasons are DOMExceptions, which are not Error subclasses in the
    // browser, so the name is read defensively rather than through instanceof.
    switch (nameOf(error)) {
      case 'TimeoutError':
        return executionError('timeout');
      case 'AbortError':
        return executionError('cancelled');
      default:
        break;
    }

    // fetch rejects with a TypeError for DNS failures, refused connections and
    // CORS rejections alike; the browser deliberately does not say which.
    if (error instanceof TypeError) {
      return executionError(
        'serverUnavailable',
        `the request to ${this.endpoint} could not be completed: ${error.message}`,
      );
    }

    return executionError('badResponse', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Flags output that has hit the backend's limits.
 *
 * The truncation is silent, so noticing it is the only defence against drawing
 * a picture that is quietly missing its bottom half.
 */
function truncationWarnings(outputLines: readonly string[], capabilities: ExecutionCapabilities): string[] {
  const warnings: string[] = [];

  if (outputLines.length >= capabilities.maxOutputLines) {
    warnings.push(
      `The service returned ${outputLines.length} lines, its maximum. The result may have been cut short.`,
    );
  }

  if (outputLines.some((line) => line.length >= capabilities.maxLineLength)) {
    warnings.push(
      `At least one line reached ${capabilities.maxLineLength} characters, the service maximum. The result may have been cut short.`,
    );
  }

  return warnings;
}

/** The `name` of a thrown value, whatever kind of object it turns out to be. */
function nameOf(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) return '';
  const { name } = error;
  return typeof name === 'string' ? name : '';
}

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

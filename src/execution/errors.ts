/**
 * The failure taxonomy for running APL, and the wording shown for each case.
 *
 * Every message here is written for someone who may not know APL. Technical
 * detail goes in `detail`, which the UI puts behind a collapsible "Details"
 * section rather than showing by default. Raw stack traces never reach a user.
 */

export type ExecutionErrorKind =
  /** The interpreter rejected the expression: LENGTH ERROR, SYNTAX ERROR, and so on. */
  | 'aplError'
  /** It ran, but did not return a rectangular numeric matrix. */
  | 'invalidOutput'
  /** It ran, but the result is bigger than we are willing to draw. */
  | 'tooLarge'
  /** We gave up waiting. */
  | 'timeout'
  /** The user pressed Stop, or a newer run superseded this one. */
  | 'cancelled'
  /** The service answered, but not with anything we understand. */
  | 'badResponse'
  /** The service could not be reached or returned an HTTP error. */
  | 'serverUnavailable'
  /** The browser reports no network connection. */
  | 'offline'
  /** The submitted code exceeds the configured length limit. */
  | 'codeTooLong';

export class AplExecutionError extends Error {
  readonly kind: ExecutionErrorKind;
  /** Technical detail for the collapsible section. Never shown by default. */
  readonly detail: string | undefined;

  constructor(kind: ExecutionErrorKind, message: string, detail?: string) {
    super(message);
    this.name = 'AplExecutionError';
    this.kind = kind;
    this.detail = detail;
  }
}

/** The default wording for each failure, taken from the product copy. */
export const EXECUTION_MESSAGES: Record<ExecutionErrorKind, string> = {
  aplError: 'The APL code could not be run. Check the highlighted expression and try again.',
  invalidOutput: 'This code ran, but it did not return a rectangular numeric matrix.',
  tooLarge: 'This code ran, but the result is too large to draw.',
  timeout: 'The code took too long to run and was stopped.',
  cancelled: 'The run was stopped.',
  badResponse:
    'The APL service replied with something unexpected. Your code is still here, so you can try again.',
  serverUnavailable: 'The APL service did not respond. Your code is still here, so you can try again.',
  offline: 'You appear to be offline. Existing artwork can still be viewed, but APL code cannot be run.',
  codeTooLong: 'This code is longer than the limit and was not sent.',
};

export function executionError(
  kind: ExecutionErrorKind,
  detail?: string,
  message?: string,
): AplExecutionError {
  return new AplExecutionError(kind, message ?? EXECUTION_MESSAGES[kind], detail);
}

/**
 * Recognises an APL error report in output.
 *
 * TryAPL answers with HTTP 200 whether or not the expression worked; a failure
 * arrives as ordinary output lines. Dyalog reports them as an upper-case name
 * ending in ERROR, followed by the offending source and a caret, so the first
 * non-blank line is what identifies it.
 *
 * A few conditions do not end in ERROR — `NOT SUPPORTED: ⎕PW` and `WS FULL`
 * among them — so those are matched explicitly.
 */
const APL_ERROR_LINE = /^(?:[A-Z][A-Z ]*ERROR|WS FULL|NOT SUPPORTED.*|INTERRUPT|NONCE ERROR)\b/u;

export interface AplErrorReport {
  /** For example `LENGTH ERROR`. */
  readonly name: string;
  /** The whole report, including the echoed source and caret. */
  readonly detail: string;
}

/**
 * Scans every line, not just the first.
 *
 * When source is flattened into several diamond-separated statements, the ones
 * before the failure have already printed their output, so the error report
 * appears partway down. Looking only at the first line misses it entirely and
 * the run is then mistaken for a strange-looking success.
 *
 * Scanning everything is safe: a numeric matrix cannot produce a line that
 * looks like `SYNTAX ERROR`.
 */
export function detectAplError(lines: readonly string[]): AplErrorReport | null {
  for (const line of lines) {
    const candidate = line.trim();
    if (candidate !== '' && APL_ERROR_LINE.test(candidate)) {
      return { name: candidate, detail: lines.join('\n') };
    }
  }
  return null;
}

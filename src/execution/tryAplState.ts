/**
 * The TryAPL `Exec` wire format.
 *
 * Verified against the live service. A request is a JSON array whose fourth
 * item is the expression; the response is a JSON array whose fourth item is an
 * array of output lines:
 *
 *     -->  ["", 0, "", "3 3⍴⍳9"]
 *     <--  ["<state>", 4834, "<blob>", ["1 2 3", "4 5 6", "7 8 9"]]
 *
 * Items 1 and 2 are opaque. Item 0 is the session state: sending an empty
 * string starts a clean workspace, which is what every artwork run does.
 * Sending a returned state back does not restore variables — the service
 * answers `CORRUPT WS: Workspace was reset` — so state is never reused.
 *
 * Everything in this module treats the response as untrusted input.
 */

/** A clean workspace. */
export const FRESH_STATE = '';

export type TryAplRequestPayload = readonly [
  state: string,
  sequence: number,
  reserved: string,
  expression: string,
];

export function buildRequestPayload(expression: string, state: string = FRESH_STATE): TryAplRequestPayload {
  return [state, 0, '', expression];
}

export interface TryAplResponse {
  readonly state: string;
  readonly outputLines: readonly string[];
}

export type TryAplParseResult =
  { readonly ok: true; readonly response: TryAplResponse } | { readonly ok: false; readonly reason: string };

/**
 * Validates and narrows a decoded JSON response.
 *
 * The service is external, so nothing about the shape is assumed. A response
 * that does not match is a `badResponse` failure rather than a crash.
 */
export function parseResponsePayload(payload: unknown): TryAplParseResult {
  if (!Array.isArray(payload)) {
    return { ok: false, reason: `expected a JSON array, received ${describe(payload)}` };
  }

  if (payload.length < 4) {
    return { ok: false, reason: `expected at least 4 items, received ${payload.length}` };
  }

  const state: unknown = payload[0];
  const output: unknown = payload[3];

  if (typeof state !== 'string') {
    return { ok: false, reason: `expected item 0 to be the state string, received ${describe(state)}` };
  }

  // The fourth item is normally an array of lines. A bare string is tolerated
  // in case the service ever collapses single-line output.
  if (typeof output === 'string') {
    return { ok: true, response: { state, outputLines: output.split('\n') } };
  }

  if (!Array.isArray(output)) {
    return { ok: false, reason: `expected item 3 to be the output lines, received ${describe(output)}` };
  }

  const outputLines: string[] = [];
  for (const line of output) {
    if (typeof line !== 'string') {
      return { ok: false, reason: `expected every output line to be a string, found ${describe(line)}` };
    }
    outputLines.push(line);
  }

  return { ok: true, response: { state, outputLines } };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  return typeof value;
}

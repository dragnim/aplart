/**
 * Central application configuration.
 *
 * Every tunable that the spec exposes as an environment variable is resolved
 * here, once. Nothing else in the codebase reads `import.meta.env` — in
 * particular the execution endpoint must never be duplicated across modules.
 */

export interface AppConfig {
  /** APL execution endpoint. See TryAplExecutionService for the wire format. */
  readonly aplExecEndpoint: string;
  /** Client-side timeout applied to a whole execution, including all bands. */
  readonly requestTimeoutMs: number;
  /** Hard ceiling on rows in a rendered matrix. */
  readonly maxMatrixRows: number;
  /** Hard ceiling on columns in a rendered matrix. */
  readonly maxMatrixColumns: number;
  /** Hard ceiling on total cells, applied before rows x columns is allocated. */
  readonly maxMatrixCells: number;
  /**
   * Rows obtainable from a single TryAPL request.
   *
   * TryAPL truncates its response at 93 lines, silently. We stay below that so
   * that a preset which grows slightly does not start losing rows without
   * anyone noticing. Presets needing more declare high-resolution output and
   * are fetched in several banded requests instead.
   */
  readonly singleRequestMaxRows: number;
  /** Maximum length of submitted code, in Unicode code points. */
  readonly maxCodeLength: number;
  /** Reject raw responses larger than this, in bytes. */
  readonly maxResponseBytes: number;
}

const DEFAULTS = {
  aplExecEndpoint: 'https://tryapl.org/Exec',
  requestTimeoutMs: 8_000,
  maxMatrixRows: 256,
  maxMatrixColumns: 256,
  maxMatrixCells: 65_536,
  singleRequestMaxRows: 90,
  maxCodeLength: 10_000,
  maxResponseBytes: 2_097_152,
} as const satisfies AppConfig;

/**
 * Environment variables arrive as strings from an external boundary, so a
 * malformed value falls back to the default rather than poisoning the app with
 * NaN. Returns the default for anything that is not a finite positive number.
 */
function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[config] Ignoring invalid numeric value ${JSON.stringify(raw)}; using ${fallback}.`);
    return fallback;
  }
  return value;
}

/**
 * The build-time environment, or an empty one.
 *
 * Vite replaces `import.meta.env` with a literal object, so the check folds
 * away in the browser bundle. Under Node — the fixture and thumbnail scripts
 * import this module — there is no such object, and reading through it would
 * throw before anything could run.
 */
const env: Partial<ImportMetaEnv> = typeof import.meta.env === 'undefined' ? {} : import.meta.env;

function endpoint(raw: string | undefined, fallback: string): string {
  if (raw === undefined || raw.trim() === '') return fallback;
  try {
    const url = new URL(raw);
    // Anything other than HTTPS would be blocked as mixed content on Pages.
    // http://localhost is allowed so a local proxy can be developed against.
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      console.warn(`[config] Execution endpoint must use HTTPS; using ${fallback}.`);
      return fallback;
    }
    return url.toString();
  } catch {
    console.warn(`[config] Execution endpoint is not a valid URL; using ${fallback}.`);
    return fallback;
  }
}

export const config: AppConfig = Object.freeze({
  aplExecEndpoint: endpoint(env.VITE_APL_EXEC_ENDPOINT, DEFAULTS.aplExecEndpoint),
  requestTimeoutMs: positiveNumber(env.VITE_APL_REQUEST_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
  maxMatrixRows: positiveNumber(env.VITE_MAX_MATRIX_ROWS, DEFAULTS.maxMatrixRows),
  maxMatrixColumns: positiveNumber(env.VITE_MAX_MATRIX_COLUMNS, DEFAULTS.maxMatrixColumns),
  maxMatrixCells: positiveNumber(env.VITE_MAX_MATRIX_CELLS, DEFAULTS.maxMatrixCells),
  singleRequestMaxRows: positiveNumber(env.VITE_SINGLE_REQUEST_MAX_ROWS, DEFAULTS.singleRequestMaxRows),
  maxCodeLength: positiveNumber(env.VITE_MAX_CODE_LENGTH, DEFAULTS.maxCodeLength),
  maxResponseBytes: positiveNumber(env.VITE_MAX_RESPONSE_BYTES, DEFAULTS.maxResponseBytes),
});

/**
 * Resolves a path inside `public/` against the deployment base.
 *
 * The site is served from a subpath on GitHub Pages, so a bare `/thumbnails/x`
 * would resolve to the domain root and 404. Vite knows the base it built with.
 */
export function assetUrl(path: string): string {
  const base = env.BASE_URL ?? '/';
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  return `${withSlash}${path.replace(/^\//u, '')}`;
}

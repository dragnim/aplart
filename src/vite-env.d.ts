/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APL_EXEC_ENDPOINT?: string;
  /** The budget for one whole run, bands included. */
  readonly VITE_APL_EXECUTION_TIMEOUT_MS?: string;
  /** The former name of the above, still read so an existing `.env` keeps working. */
  readonly VITE_APL_REQUEST_TIMEOUT_MS?: string;
  readonly VITE_MAX_MATRIX_ROWS?: string;
  readonly VITE_MAX_MATRIX_COLUMNS?: string;
  readonly VITE_MAX_MATRIX_CELLS?: string;
  readonly VITE_SINGLE_REQUEST_MAX_ROWS?: string;
  readonly VITE_MAX_CODE_LENGTH?: string;
  readonly VITE_MAX_RESPONSE_BYTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

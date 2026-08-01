# APL Art

**Tiny programs. Infinite patterns.**

Create patterns, fractals and generative art with Dyalog APL. Choose a piece, change the code and see
what happens.

Live site: <https://dragnim.github.io/aplart/>

Every picture is drawn from numbers returned by actually running the APL shown in the editor. Nothing
is simulated in JavaScript.

> **Status:** in development. The foundation, routing and deployment pipeline are in place; the
> execution engine, editor and presets are being built next. See [Roadmap](#roadmap).

---

## Contents

- [Local setup](#local-setup)
- [Development commands](#development-commands)
- [Environment configuration](#environment-configuration)
- [Matrix output contract](#matrix-output-contract)
- [TryAPL integration notes](#tryapl-integration-notes)
- [CORS troubleshooting](#cors-troubleshooting)
- [Adding a new artwork preset](#adding-a-new-artwork-preset)
- [APL font](#apl-font)
- [Accessibility](#accessibility)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Licence](#licence)

---

## Local setup

Requires Node 22 or later.

```bash
git clone https://github.com/dragnim/aplart.git
cd aplart
npm install
npm run dev
```

The dev server serves the app at <http://localhost:5173/aplart/>. The `/aplart/` prefix is deliberate:
it matches the GitHub Pages base path, so local development and production resolve assets identically.

No API keys, accounts or secrets are needed.

## Development commands

| Command                    | What it does                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run dev`              | Start the development server with hot reloading.                   |
| `npm run build`            | Typecheck, then build the static site into `dist/`.                |
| `npm run preview`          | Serve the built site locally, exactly as Pages will.               |
| `npm run typecheck`        | Run TypeScript with no emit.                                       |
| `npm run lint`             | Run ESLint over the whole repository.                              |
| `npm run lint:fix`         | Run ESLint and apply the fixes it can make safely.                 |
| `npm run format`           | Format everything with Prettier.                                   |
| `npm run format:check`     | Fail if anything is unformatted — this is what CI runs.            |
| `npm test`                 | Run unit and component tests once.                                 |
| `npm run test:watch`       | Run those tests in watch mode.                                     |
| `npm run test:live`        | Run the suite that calls the **real** TryAPL endpoint (see below). |
| `npm run test:e2e`         | Build, preview and run the Playwright journeys.                    |
| `npm run validate:presets` | Validate every preset and fail if any is malformed.                |
| `npm run verify:cors`      | Check that the **deployed** site can reach the APL endpoint.       |

`npm run test:live` is deliberately excluded from `npm test` and from the required CI checks. It calls
a shared public service, and a pull request must not fail because that service is momentarily busy.

## Environment configuration

Copy `.env.example` to `.env.local` and edit as needed. Every value has a working default, so the file
is optional.

| Variable                       | Default                   | Purpose                                       |
| ------------------------------ | ------------------------- | --------------------------------------------- |
| `VITE_APL_EXEC_ENDPOINT`       | `https://tryapl.org/Exec` | Where APL is executed.                        |
| `VITE_APL_REQUEST_TIMEOUT_MS`  | `8000`                    | Client-side timeout for a whole execution.    |
| `VITE_MAX_MATRIX_ROWS`         | `256`                     | Hard ceiling on rendered rows.                |
| `VITE_MAX_MATRIX_COLUMNS`      | `256`                     | Hard ceiling on rendered columns.             |
| `VITE_MAX_MATRIX_CELLS`        | `65536`                   | Hard ceiling on total cells.                  |
| `VITE_SINGLE_REQUEST_MAX_ROWS` | `90`                      | Rows obtainable from one TryAPL request.      |
| `VITE_MAX_CODE_LENGTH`         | `10000`                   | Maximum submitted code length, in characters. |
| `VITE_MAX_RESPONSE_BYTES`      | `2097152`                 | Reject raw responses larger than this.        |
| `VITE_BASE`                    | `/aplart/`                | Deployment base path.                         |

All of these are read in exactly one place, [`src/app/config.ts`](src/app/config.ts). Nothing else in
the codebase touches `import.meta.env`. Values that are missing or malformed fall back to the default
with a console warning rather than propagating `NaN` through the application.

## Matrix output contract

Every artwork program must return a **rectangular numeric matrix**. The renderer maps each number to a
palette colour; it never receives markup, images or text from APL.

Supported:

- Rank-2 numeric arrays, minimum 2×2.
- Finite integers and floating-point values, including negatives written with the APL overbar (`¯3`).

Rejected, with a friendly message:

- Nested arrays, character arrays, complex numbers.
- Non-rectangular output, infinities, `NaN`.
- Output exceeding the configured size limits.

### Size limits, and why they are what they are

The spec this project was built from assumed a 256×256 default. **TryAPL cannot deliver that in one
request.** Measured against the live endpoint:

| Limit                         | Measured value                     |
| ----------------------------- | ---------------------------------- |
| Maximum lines in a response   | **93**, silently truncated         |
| Maximum characters per line   | **995**, silently truncated        |
| `⎕PW`                         | `NOT SUPPORTED` — cannot be raised |
| Workspace state between calls | Not preserved (`CORRUPT WS`)       |

A `256 256⍴⍳7` therefore comes back as 93 rows, with the rest gone and no error to say so. Two
consequences shape the design:

1. **Default tier — one request, up to 90 rows.** Presets return at most 90 rows so that a piece which
   grows slightly does not begin losing rows unnoticed. Values are exact and parsing is
   straightforward.
2. **High-resolution tier — several requests, up to 256×256.** A preset that sets
   `outputLimits.highResolution` is fetched in bands: the adapter re-executes the code once per band,
   each returning a different reshaped slice, and stitches the result together. Values are still
   exact — nothing is quantised — but the artwork costs one execution per band, so it is reserved for
   presets that genuinely need the detail.

In both tiers the adapter verifies the reassembled cell count against a shape probe. A short or
truncated band is a hard error, never a silently incorrect picture.

## TryAPL integration notes

Everything TryAPL-specific lives in `src/execution/TryAplExecutionService.ts`. The rest of the
application talks to the `AplExecutionService` interface and knows nothing about the wire format.

**Request.** `POST` a JSON array to the endpoint:

```json
["", 0, "", "3 3⍴⍳9"]
```

Item 0 is the session state (empty string starts a clean workspace) and item 3 is the expression.

**Response.** A four-item JSON array. Item 3 is an **array of output lines** — not a single string:

```json
["<state blob>", 4834, "<blob>", ["1 2 3", "4 5 6", "7 8 9"]]
```

**Things worth knowing, all verified against the live service:**

- **Errors return HTTP 200.** An APL error arrives as ordinary output lines (`LENGTH ERROR`, the echoed
  source, and a caret). Failure is detected by parsing the output, not by the status code.
- **One expression per request.** Multi-line preset code is flattened into a single expression joined
  with `⋄` before sending. Comments must be stripped first, quote-aware, or a `⍝` would swallow the
  rest of the line.
- **State is not preserved.** Sending a returned state back gives `CORRUPT WS: Workspace was reset`, so
  a variable cannot be assigned in one request and read in the next. Banded transport re-executes
  instead of caching.
- **Complex numbers fail.** A `0J1`-based Mandelbrot returns `DOMAIN ERROR`; use real arithmetic.
- **It is fast.** Typical round trips measured 35–175 ms.

## CORS troubleshooting

TryAPL currently sends `Access-Control-Allow-Origin: *` on both the preflight and the `POST`, so the
browser can call it directly from any origin and **no proxy is required**. This has been confirmed
end to end: a real Chromium page loaded from `https://dragnim.github.io/aplart/` successfully executed
`3 3⍴⍳9` against `https://tryapl.org/Exec` and read the result back.

Re-check it at any time with:

```bash
npm run verify:cors
```

That script loads the deployed site in a real browser and makes the request from that origin, which is
the only way to test this — `curl` will happily read a response the browser would forbid, and testing
from `localhost` proves nothing because the origin is the thing under test.

If that ever changes, the symptom is a browser console error mentioning
`No 'Access-Control-Allow-Origin' header` while `curl` against the same endpoint still succeeds — CORS
is enforced by the browser, not the server. The fix is to either have the required origins permitted on
the backend, or point `VITE_APL_EXEC_ENDPOINT` at a small proxy that adds the headers. Do not attempt
to work around CORS with browser flags or public CORS-anywhere services.

## Adding a new artwork preset

1. **Write the APL.** Named parameter assignments at the top, one per line, then the expression that
   returns the matrix:

   ```apl
   ⍝ Controls
   size←64
   modulus←9

   ⍝ Generate the artwork
   modulus|∘.×⍨⍳size
   ```

   Keep the result within 90 rows unless the preset declares `highResolution`.

2. **Create the module** in `src/presets/`, exporting an `ArtworkPreset`. The type is defined in
   [`src/presets/schema.ts`](src/presets/schema.ts).

3. **Bind the parameters.** Each `ArtworkParameter` names the `variable` it controls. The binder
   rewrites only an anchored, top-level assignment line — `^(\s*size\s*←\s*).*$` — so a variable used
   elsewhere in the expression is never touched. A parameter whose assignment the user deletes is
   marked _detached_ rather than silently rewriting unrelated code.

4. **Register it** in `src/presets/presets.ts`.

5. **Validate and generate assets:**

   ```bash
   npm run validate:presets
   ```

`validate:presets` checks the things the compiler cannot: that ranges make sense, that defaults sit
inside them, and — importantly — that every parameter actually has a matching top-level assignment in
the code. A preset that fails validation is dropped from the gallery at runtime and fails the build in
CI.

## APL font

APL glyphs are set in [APL387](https://github.com/Dyalog/APL387), Dyalog's redrawn successor to Adrian
Smith's APL385 Unicode, released into the public domain under The Unlicence.

The upstream repository does not commit a built font — it is produced by their CI. `scripts/subset-font.py`
downloads the built TTF and subsets it to the Latin, punctuation, arrow, mathematical-operator and
Miscellaneous Technical ranges, taking it from 303 KB to about 23 KB of WOFF2. The result is committed
to `src/assets/fonts/`, so contributors never need to run the script. To pick up an upstream revision:

```bash
pip install "fonttools[woff]" brotli
python scripts/subset-font.py
```

## Accessibility

The target is WCAG 2.2 AA. Specifically:

- Everything is operable by keyboard, with a visible focus indicator and a skip link.
- The canvas carries a text description of the artwork's dimensions and value range; no attempt is made
  to narrate individual cells.
- Execution status is announced through a live region.
- Information is never conveyed by colour alone — the current navigation item, for example, carries
  both a weight change and an underline.
- Touch targets are at least 44×44 CSS pixels.
- Motion respects `prefers-reduced-motion`, which zeroes the transition duration tokens outright.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which typechecks, lints, validates
presets, tests, builds and deploys to GitHub Pages using the official actions.

The base path is not hard-coded. `actions/configure-pages` reports the published base path and it is
passed to the build as `VITE_BASE`, so renaming the repository or moving to a custom domain needs no
code change.

Repository settings must have **Settings → Pages → Source** set to **GitHub Actions**. Note that Pages
does not publish from a private repository on GitHub Free.

`.github/workflows/ci.yml` runs the same checks plus the Playwright journeys on pull requests, without
deploying.

## Roadmap

**MVP, in progress:** execution engine and matrix parsing; CodeMirror 6 APL editor with symbol toolbar;
seven presets; parameter binding; palettes and render options; PNG export; share links; local saving;
responsive and accessible layouts.

**Later:** animated matrices, coordinate and path rendering, SVG export, user-defined palettes,
step-through of intermediate arrays, embeddable artworks. Accounts, cloud projects and a public
community gallery are deliberately out of scope for now, but the storage layer sits behind a
`ProjectRepository` interface so they remain possible.

## Licence

MIT — see [LICENSE](LICENSE).

APL Art is an independent project. It is not an official Dyalog product, though it depends on Dyalog's
TryAPL service and APL387 font, both used with thanks.

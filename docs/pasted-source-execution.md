# Pasted APL and banded execution

An investigation, not a change. Nothing in the application's behaviour was altered to produce this.

## The problem, reproduced

Paste Julia Set's program into Modular Bloom and press Run. It is refused:

> This artwork is too tall to fetch in one go. The APL service returns at most 92 rows. Reduce the size,
> or mark the preset as high resolution.

Open the identical text as Julia Set and it runs, in three requests, and draws.

Two tests hold this still:

- `tests/e2e/pastedSource.spec.ts` — the paste as a visitor performs it, in a real browser, because
  CodeMirror ignores synthetic events.
- `tests/integration/pastedSource.test.tsx` — the same mismatch reached through a shared link, which
  works in jsdom, with the request count and the exact wording asserted.

So what decides whether a piece of APL can run is not the APL. It is which gallery entry was open when
it was pasted. That contradicts the premise the application is built on — the visible source is the
artwork — and it is the reason this is a design fault rather than a bug.

## Where the decision lives

|             |                                                                                        |
| ----------- | -------------------------------------------------------------------------------------- |
| Field       | `ArtworkPreset.outputLimits.highResolution` (`src/presets/schema.ts`)                  |
| Declared by | `mandelbrot-field` and `julia-set` only                                                |
| Read at     | `src/workspace/useWorkspace.ts` — `preset.outputLimits?.highResolution ?? false`       |
| Acted on at | `src/execution/runArtwork.ts` — `options.highResolution ? runBanded(…) : runDirect(…)` |

One boolean, read in one place, chosen by the preset rather than by the program.

## What banding actually requires

This is the crux, and it is better news than expected. From `src/execution/transport.ts`:

1. `bindResult` joins the statements with `⋄` and binds the **last** one to `r`.
2. `buildProbeExpression` appends `(≢⍴r),(≡r),(⎕DR r),(⍴r)` — rank, depth, type and shape.
3. `planBands` splits the cell count: `perLine = ⌊(995 × 0.95) ÷ valueWidth⌋`, `linesPerBand = ⌊93 × 0.95⌋ = 88`.
4. `buildBandExpression` fetches `count↑offset↓,r` and reshapes it, **re-running the whole program each time**.

Its assumptions about the source are, in full:

- `flattenToExpression` succeeds — comments stripped, blank lines dropped, statements joined.
- The **last statement** produces the result.
- The result is rank 2, numeric and not nested. The probe rejects character, nested and complex data
  before a single cell crosses the wire.
- The program is **deterministic**, because it is executed once per band and the slices must belong to
  the same matrix.

It does **not** depend on `size`, on any particular variable name, on `planeExploration`, on the
preset's controls, or on any other metadata. Grepping `transport.ts` for those names returns nothing.
The banding contract is entirely source-level.

That matters: there is no technical obstacle to banding a pasted program. `highResolution` is a policy
switch about spending extra requests, wearing the costume of a capability.

## Three concerns currently conflated

| Concern                 | What it is                                                    | Where it belongs                                            |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| **Execution transport** | Whether a matrix must be fetched in slices                    | A property of the result's size — knowable from the program |
| **Preset controls**     | Which sliders and labels appear                               | A property of the preset                                    |
| **Rendering metadata**  | Motifs, declared ranges, inspector wording, plane exploration | A property of the preset                                    |

Pasted APL that produces a large numeric matrix needs the first. It should acquire neither of the
others: no Julia sliders, no Julia inspector wording, no plane exploration.

## Answers to the specific questions

**Why 92 rows when the service caps at 93.** `runDirect` refuses when the reply reaches the cap:
a response of exactly 93 lines is indistinguishable from one truncated at 93, so a matrix that tall
might be missing its bottom rows and drawing it would be a quiet lie. Refusing at the cap leaves 92 as
the last provably complete height. Banding then applies a further 0.95 margin, giving 88 lines per
band, for the same reason in the other direction.

**Why the error appears twice.** It is rendered by two elements with identical text: the run status
(`<p role="status" aria-live="polite" data-status="error">`) and the error panel (`<p class="errorMessage">`).
Seen twice, and announced twice. Asserted in the integration test.

**Whether retrying repeats the whole computation.** Yes, and worse than that. Every band re-executes
the entire program server-side; `bindResult` recomputes `r` on each request. For a 128² integer matrix:
`perLine = ⌊945 ÷ 9⌋ = 105`, `cellsPerBand = 105 × 88 = 9,240`, so 16,384 cells need two bands — three
requests, three full computations. A design that tries direct first and falls back adds a fourth, whose
result is discarded.

Separately, the **Retry** offer does not apply here: `retryable` requires `failedSource !== state.code`,
and a paste-then-Run leaves them equal, so no retry button appears. The visitor's only offered remedy is
the one in the message, which asks them to edit the application's source code.

## Options assessed

### A — Fall back to banding after the service-limit response

Try direct; on the truncation refusal, retry with banding.

- **Requests**: one wasted, then probe plus bands. Four instead of three at 128².
- **Runs the program twice or more**: yes, and the first result is thrown away.
- **Side effects**: no worse than banding already is, but no better either.
- **Cancellation**: the fallback must inherit the abort signal, or a stopped run resurrects itself.
- **Progressive rendering**: unchanged once banding starts, but the first hatch appears later.
- **Error clarity**: good — a real failure still ends in a real message.
- **Compatibility**: total. No preset changes, no saved state affected.
- **Verdict**: the safe option, and the wasteful one. Every tall pasted artwork pays a full extra
  computation on a shared free service.

### B — Decide before the first request, from the source

Read the declared or probed dimensions and choose transport up front.

- **Requests**: three at 128², the same as Julia gets today.
- **Runs the program twice**: no more than banding inherently does.
- **Problem**: the size is not reliably knowable from the text. `size←128` is a convention this
  application invented, not a rule of APL, and reading it would be exactly the kind of hidden
  source-sniffing this investigation is meant to remove. A dimension-carrying probe _is_ knowable — but
  that is option D with extra steps.
- **Verdict**: attractive only if it means "probe first", which is D.

### C — Make the capability workspace-level rather than preset-level

Keep the flag but let the workspace own it, so a paste can raise it.

- **Requests**: as today.
- **Problem**: something still has to decide, and the only honest input is the source or the result.
  Either it becomes a visible control — a "fetch in slices" switch, which is transport machinery
  promoted to product surface — or it is set by heuristic, which is B.
- **Save and Share**: a new field to serialise, migrate and explain, for a decision the visitor should
  never have to make.
- **Verdict**: moves the problem without solving it, and enlarges the saved-state contract.

### D — Band by default whenever the source conforms to the banding contract

Always probe; use the probe's shape to fetch directly when it fits in one reply, and in bands when it
does not. The probe already returns rank, depth, type and shape.

- **Requests**: one probe plus one read for small artworks — **two instead of one**, for every preset.
  That is the real cost, and it falls on the six artworks that are small.
- **Runs the program twice**: yes, for small artworks that currently run once. Deterministic programs
  are unaffected in result; the cost is service time.
- **Side effects and non-determinism**: the honest weak point. `?` or `⎕TS` in a pasted program already
  breaks banding today; D extends that exposure to every artwork. Worth stating plainly rather than
  hiding: the probe would be the second execution, not the first, so a non-deterministic program would
  draw a mixture. Mitigation: fetch small results from the probe reply itself, so there is exactly one
  execution when the matrix fits.
- **Cancellation and stale results**: unchanged; both paths already run under the same token and signal.
- **Progressive rendering**: improves — every artwork could report progress, not only two.
- **Save and Share**: no change at all. Nothing new is serialised, because nothing new is decided.
- **Error clarity**: improves. Rank, type and shape failures get the probe's precise reasons instead of
  guesses made from printed text.
- **Compatibility**: the flag becomes redundant and can be deleted, along with the message telling
  visitors to edit the source.

## Recommendation

**Option D, with the small-result shortcut.** Probe first, always; if the shape fits in one reply, read
the values from a single follow-up — or better, have the probe carry them when they fit, so a small
artwork costs exactly one request as it does today. Delete `highResolution` and the advice to mark a
preset.

The reason to prefer it over A is not request count, though D wins there too. It is that A leaves the
fault in place: the transport decision would still begin from preset metadata and merely recover when
that metadata proves wrong. D removes the coupling — the decision comes from the program's own result,
which is the only thing that ever knew the answer.

Costs to accept, stated rather than buried:

- One extra request for small artworks unless the probe carries small results. Whether it can is the
  first thing to measure.
- Non-deterministic pasted programs would be drawn from more than one execution. They already are on
  the two banded presets; this widens it. It deserves a note in the interface, not silence.

## What to do next, if this is accepted

1. Measure whether the probe can carry a small matrix's values within one reply, since that decides
   whether D costs an extra request.
2. Keep the two reproduction tests; invert them when the behaviour changes.
3. Remove the "mark the preset as high resolution" wording regardless of which option is chosen — it
   addresses a maintainer in a message shown to a visitor.
4. Fix the duplicated error message, which is independent of all of this.

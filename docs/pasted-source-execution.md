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

## Prototype: the adaptive first request, measured

Built and run against the live service. Not wired into the application. Raw table in
`docs/data/adaptive-prototype.md`; the expression is `scripts/lib/adaptiveProbe.ts`, driven by
`npm run prototype:adaptive`.

One request evaluates the source, binds the final result, tests that it is a rank-2 numeric array,
measures the height and width its printed form would occupy, and then either **prints the matrix** or
returns **versioned metadata** behind an unmistakable marker.

### The endpoint's glyph set is narrower than Dyalog's

The first attempt was rejected outright:

```
NOT SUPPORTED: "∈" (⎕UCS 8712)
```

Membership is therefore spelled out as three comparisons. Any production expression must stay inside
the set the endpoint actually permits, and that set has to be discovered by asking rather than assumed
from the language. Dfn guards, `⊣`, `⊃…↓`, `∨`, `⌽`, `⍕` and `⎕DR` were all checked and do work.

### All eight artworks

| Artwork           | Requests today | Adaptive | Route       | Printed lines | Printed width | Same matrix |
| ----------------- | -------------- | -------- | ----------- | ------------- | ------------- | ----------- |
| Modular Bloom     | 1              | **1**    | one request | 64            | 188           | identical   |
| Checker Shift     | 1              | **1**    | one request | 32            | 63            | identical   |
| Wave Interference | 1              | **1**    | one request | 72            | 351           | identical   |
| Truchet Grid      | 1              | **1**    | one request | 20            | 39            | identical   |
| Sierpiński Array  | 1              | **1**    | one request | 64            | 127           | identical   |
| Cellular Echo     | 1              | **1**    | one request | 81            | 241           | identical   |
| Mandelbrot Field  | 3              | **3**    | banded      | 128           | 356           | identical   |
| Julia Set         | 3              | **3**    | banded      | 128           | 383           | identical   |

Every matrix was compared cell for cell against the existing banded path. No artwork costs a request
more than it does today, and the six small ones still complete in one.

Julia's source therefore runs from any artwork: the adaptive path never consults the preset, so
"which gallery entry is open" stops being an input.

### Boundaries

| Case                      | Requests | Route                 | Lines | Width |
| ------------------------- | -------- | --------------------- | ----- | ----- |
| 91 lines                  | 1        | one request           | 91    | 15    |
| 92 lines                  | 1        | one request           | 92    | 15    |
| **93 lines — at the cap** | 2        | **banded**            | 93    | 15    |
| 94 lines                  | 2        | banded                | 94    | 15    |
| Width 989 — under         | 1        | one request           | 1     | 989   |
| **Width 998 — over**      | 2        | **banded**            | 1     | 998   |
| Width 1169 — well over    | 2        | banded                | 1     | 1169  |
| Boolean 8×8               | 1        | one request           | 8     | 15    |
| Integer 8×8               | 1        | one request           | 8     | 23    |
| Float 8×8                 | 1        | one request           | 8     | 111   |
| Integer 128²              | 3        | banded                | 128   | 767   |
| Rank 1                    | 1        | refused with metadata | —     | —     |
| Rank 3                    | 1        | refused with metadata | —     | —     |
| Character 4×4             | 1        | refused with metadata | —     | —     |
| Nested 2×2                | 1        | refused with metadata | —     | —     |

The strict rule holds at the line cap: 92 prints, 93 bands. **The width cap needs the same strictness
and gets it** — 989 prints and 998 bands. One honest gap: no case landed on _exactly_ 995, because
formatted widths cannot be dialled to a chosen value, so strictness there rests on the same argument as
the line cap rather than on an observation. It costs nothing to keep.

Undrawable results are refused **in the first request**, from metadata, with rank, depth and element
type — no second call and nothing drawn.

### Formatting an undrawable result

`f←⍕r` initially ran before the drawable test, so a large character or nested array was formatted only
to measure dimensions that would then be discarded. Measured:

| Case              | Eager     | Deferred  |
| ----------------- | --------- | --------- |
| Small numeric 8×8 | 178 ms    | 83 ms     |
| Character 300×300 | 94 ms     | 98 ms     |
| Nested 120×120    | `WS FULL` | `WS FULL` |

Two things to be careful about in reading that. The timings are round trips and vary more between
repeats than between the two variants, so they show the guard is **not slower** rather than that it is
faster. And the nested case fails identically either way, because a 120×120 array of nested vectors
exhausts the 512 KB workspace _while being constructed_, before anything is formatted — so at the sizes
this workspace permits, eager formatting has no measurable penalty.

The guard is adopted regardless. It is free, it is supported, and it removes the possibility in
principle; an undrawable result now reports its size as `0` rather than a number nobody asked for.

### A pre-existing banded-transport defect, surfaced but not caused here

A 128×128 **float** matrix cannot be assembled today. Its rows print 2,175 characters wide, so it bands
correctly — and the band replies come back containing Dyalog's `···` elision, which the parser rightly
refuses. `estimateValueWidth` allows 16 characters per float; these need about 18, and the comment
there says under-estimating "costs a retry", but no retry happens — the reply is unparseable instead.

Confirmed pre-existing: `runArtwork` with `highResolution: true` fails the same way on the same source
today. The adaptive design neither causes nor fixes it, and it needs its own change — detect `···` and
re-plan with a narrower line — which should not be folded into this one.

## Recommendation, after measuring

**Adopt the adaptive first request.** It meets every criterion set for it: small artworks stay at one
request, large ones keep three, pasted Julia runs anywhere, no execution is spent and discarded, and
`highResolution` becomes unnecessary for correctness.

The earlier reservation about costing small artworks a second request is now settled by measurement
rather than argument: a small result comes back complete in the first reply, so there is no second
request to pay for. The direct-first fallback is no longer the safer option — it is simply the one that
wastes an execution.

## What to do next, if this is accepted

1. Wire the adaptive expression into `runArtwork`, replacing the `highResolution` branch. Keep
   `outputLimits` for `maxRows`, `maxColumns` and `maxCells`, which are about what the renderer will
   accept and remain a preset's business.
2. Note, only when banding is actually used, that a large result is assembled from several evaluations
   and that code using randomness or changing state may differ between sections. Not shown for
   one-request results, which are a single evaluation.
3. Remove "mark the preset as high resolution" from the failure text.
4. Present detailed failure text once, announced once, rather than in both the status region and the
   error panel.
5. Fix the float banding bug separately, with its own reproduction.
6. Keep the two reproduction tests, inverted, as the proof that a pasted program runs.

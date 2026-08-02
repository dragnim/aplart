# Mandelbrot algorithm benchmark

**Date:** 2 August 2026 · **Endpoint:** `https://tryapl.org/Exec` · **Raw data:** [`data/mandelbrot-benchmark-raw.jsonl`](data/mandelbrot-benchmark-raw.jsonl)

## Recommendation

**Keep the current full-matrix implementation.** The active-point alternative
produces byte-identical results, so it is a genuine candidate rather than a
broken one — but it is slower in four of the five views tested, including every
view someone would deliberately look at, and it gains nothing anywhere else: the
same request counts, the same response sizes and the same resolution ceiling.

Measured against the six criteria set for adoption:

| Criterion                            | Result                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Produces equivalent matrices         | **Yes.** 240 of 240 cases identical, zero differing cells.                                                                    |
| Reliably faster in useful views      | **No.** Faster in 82 of 240 paired runs (34%). Slower in boundary-heavy, interior and deep-zoom views by 8–27%.               |
| Does not lower the safe resolution   | **Neutral.** Both succeed at 160×160 and both fail at 176×176.                                                                |
| Does not increase workspace failures | **Neutral.** Zero failures for either across 480 runs.                                                                        |
| Works with banded execution          | **Yes.** Identical request counts and byte sizes at every size.                                                               |
| Remains understandable               | **No.** The step function grows from one line of whole-array arithmetic to one line of gather, scatter and index bookkeeping. |

It clears two criteria, is neutral on two, and fails the two that would have
justified the change. The current implementation stays.

## What was compared

Two ways of counting how long each point of a grid stays near the origin under
`z ← z² + c`.

**Full matrix** iterates every point for the full count, escaped or not. This is
what the preset ships today.

**Active points** removes escaped points from later iterations, so the work per
step shrinks as the exterior falls away. The intuition is that most of a typical
view escapes in the first few iterations, so most of the arithmetic is wasted.

Both are held in [`scripts/lib/mandelbrotVariants.ts`](../scripts/lib/mandelbrotVariants.ts),
which nothing in the application imports. An experiment cannot reach the artwork
someone sees until a written recommendation says it should.

### Full matrix, as shipped

```apl
⍝ Controls
size←128
iterations←28
centreX←¯0.6
centreY←0
zoom←1.4

⍝ The patch of the plane, as two real matrices. TryAPL rejects complex
⍝ arithmetic, so the real and imaginary parts are carried separately.
ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1
ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1
cr←(size,size)⍴ax
ci←⍉(size,size)⍴ay

⍝ Repeat z←z²+c over the whole grid, counting the steps each point survives.
step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}
⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)
```

The clamp is not decoration. An escaped point's magnitude grows without bound;
an infinity minus an infinity is not-a-number, which compares false against the
escape test and would start being counted as inside again.

### Active points

```apl
⍝ Controls
size←128
iterations←28
centreX←¯0.6
centreY←0
zoom←1.4

⍝ The patch of the plane, as two real matrices. TryAPL rejects complex
⍝ arithmetic, so the real and imaginary parts are carried separately.
ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1
ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1
cr←,(size,size)⍴ax
ci←,⍉(size,size)⍴ay

⍝ Iterate only the points that have not escaped. `live` holds their indices;
⍝ `n` accumulates counts against the whole grid, flat.
step←{(zr zi live n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ n[live]←n[live]+m ⋄ k←⍸m ⋄ (((cr[live]+(zr*2)-zi*2)[k])((ci[live]+2×zr×zi)[k])(live[k])n)}
cells←size×size
(size,size)⍴⊃⌽step⍣iterations⊢(cells⍴0)(cells⍴0)(⍳cells)(cells⍴0)
```

No clamp is needed: an escaped point is removed on the step that detects it and
is never squared again.

### The convention both must honour

A `size × size` matrix of counts from 1 to `iterations`, x across the columns and
y down the rows. One, not zero: the count is taken before the escape test and
the first test is on `z = 0`, so every cell counts at least once. Whether the two
actually agree was measured rather than assumed — see
[Correctness](#correctness), below.

## Method

- 4 resolutions (64, 90, 128, 144) × 4 iteration ceilings (16, 28, 40, 60) ×
  5 views = **80 cases**, each run by both implementations, **3 times** — 480 runs
  and 1,340 requests in 24 minutes.
- **Interleaved, not batched.** Cases are visited in a rotated order each
  repetition, and which implementation goes first alternates. Running all of one
  and then all of the other would let a slow ten minutes on a shared service land
  entirely on one of them.
- **Warm-up discarded.** The first request of a session pays for connection setup
  and whatever the service does to wake up; charging that to whichever
  implementation happened to go first would be a lie.
- **Median of three**, not a single timing, and min–max reported alongside.
- **900 ms between every request**, including between the bands of one run.
  Sequential throughout — no parallel bursts against a free service.
- Run through the application's own `runArtwork` with `highResolution: true`, so
  what is measured is the transport a visitor actually waits for.

### The views

| View            | Centre      | Span  | What it exercises                                                    | Observed value range at ceiling 60 |
| --------------- | ----------- | ----- | -------------------------------------------------------------------- | ---------------------------------- |
| Full set        | ¯0.6, 0     | 1.4   | The default. Interior, boundary and fast-escaping exterior together. | 1–60                               |
| Mostly exterior | 1.2, 1.2    | 0.6   | Far from the set; nearly everything escapes at once.                 | 1–3                                |
| Boundary heavy  | ¯0.745, 0.1 | 0.05  | Seahorse valley. Points escape at every count.                       | 20–60                              |
| Mostly interior | ¯0.25, 0    | 0.15  | Inside the main cardioid. Nothing escapes; nothing to drop.          | 60–60                              |
| Deeper zoom     | ¯0.748, 0.1 | 0.005 | The kind of view dragging on the artwork produces.                   | 29–60                              |

The observed ranges confirm the views do what they were chosen to do. "Mostly
exterior" really does empty its active set by the third iteration, which is the
best case the alternative could hope for; "mostly interior" really is uniformly
at the ceiling, which is its worst.

## What timing a shared remote service can and cannot tell you

These numbers are not a measurement of two algorithms. They are a measurement of
two algorithms _plus_ a public service under unknown load, reached over the
public internet, from one machine on one day. Specifically:

- **A fixed floor dominates the small cases.** The fastest round-trip observed
  was 151 ms, and a 64×64 run at any ceiling sits at roughly 200 ms. Almost all
  of that is network and request handling. At the small end the benchmark is
  mostly measuring the distance to the server.
- **Variance is large and one-sided.** Individual runs stretch to three or four
  times their median — 144×144 at ceiling 28 ranges from 441 ms to 1,571 ms for
  the same code. Slow outliers come from the service, not the algorithm, which is
  why medians and paired comparisons are used and means are not.
- **Nothing here is reproducible in the strict sense.** Re-running on another day
  will give different absolute numbers. The _relative_ finding is more durable,
  and the paired comparison is designed to be the part that survives.
- **Server-side compute is not separable.** There is no way from outside to see
  how much of a response time was interpreter work. A difference smaller than the
  network floor cannot be detected at all by this method.
- **One client, one location.** No claim is made about how this behaves from
  elsewhere.

What the method _can_ support is the comparison actually being asked for: given
two implementations measured alternately, seconds apart, on the same case, which
one comes back sooner more often.

## Correctness

Every one of the 240 case-repetitions produced **byte-identical matrices**: zero
differing cells, at every size, every ceiling and every view.

This was not a foregone conclusion, and one specific disagreement was expected.
The full-matrix version keeps iterating escaped points with clamped values, and a
clamped value can in principle land back inside the escape radius and resume
counting — `|z²| > 4` and `|c| ≲ 2.5` leaves `|z² + c|` as low as about 1.5, which
is inside. The active-point version removes such a point permanently. The two
would then differ.

It never happened across 240 comparisons spanning 2,958,960 cells. The
behaviour is not proven impossible by this evidence — only unobserved at these
parameters. Anyone reviving the alternative should re-check it rather than trust
this paragraph.

## Results

<!-- Generated by `npm run benchmark:report`; regenerate rather than hand-edit. -->

### Headline

| Measure                           | Full matrix | Active points |
| --------------------------------- | ----------- | ------------- |
| Median service time, all 240 runs | **319 ms**  | 362 ms        |
| Paired runs won                   | **156**     | 82            |
| Failures in 240 runs              | 0           | 0             |
| Highest resolution reached        | 160×160     | 160×160       |

### Where each one wins

The alternative's advantage tracks exactly what the theory predicts, and the
theory turns out not to be worth much:

| Case                                               | Full matrix | Active points | Change   |
| -------------------------------------------------- | ----------- | ------------- | -------- |
| Mostly exterior, 144², ceiling 60 — its best case  | 658 ms      | **469 ms**    | **−29%** |
| Mostly interior, 144², ceiling 60 — its worst case | **562 ms**  | 762 ms        | +36%     |
| Boundary heavy, 128², ceiling 60                   | **451 ms**  | 524 ms        | +16%     |

It wins where nearly every point escapes in the first few iterations, so the
active set empties and 57 of 60 iterations run on almost nothing. It loses where
points survive, because it then pays for `⍸`, three gathers and an indexed
update every iteration while dropping nothing. Dyalog's whole-array arithmetic on
a contiguous 16,000-element vector is fast enough that the bookkeeping needed to
avoid some of it costs more than the arithmetic saved.

The views where it wins are the empty ones. A view that escapes by iteration 3 is
a flat two-colour rectangle — not a thing anyone zooms in on. The views where it
loses are the interesting ones.

<!-- BEGIN GENERATED TABLES -->

### Run parameters

| Field                | Value                    |
| -------------------- | ------------------------ |
| Started              | 2026-08-02T06:28:36.420Z |
| Finished             | 2026-08-02T06:52:13.413Z |
| Endpoint             | https://tryapl.org/Exec  |
| Repetitions          | 3                        |
| Gap between requests | 900 ms                   |
| Per-request timeout  | 30000 ms                 |
| Runs recorded        | 480                      |
| Node                 | v24.15.0                 |

### Output agreement, every case

| View            | Size    | Ceiling | Centre      | Span  | Differing cells | Max difference | First difference |
| --------------- | ------- | ------- | ----------- | ----- | --------------- | -------------- | ---------------- |
| boundary-heavy  | 64×64   | 16      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 64×64   | 28      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 64×64   | 40      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 64×64   | 60      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 90×90   | 16      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 90×90   | 28      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 90×90   | 40      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 90×90   | 60      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 128×128 | 16      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 128×128 | 28      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 128×128 | 40      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 128×128 | 60      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 144×144 | 16      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 144×144 | 28      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 144×144 | 40      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| boundary-heavy  | 144×144 | 60      | -0.745, 0.1 | 0.05  | 0               | 0              | —                |
| deep-zoom       | 64×64   | 16      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 64×64   | 28      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 64×64   | 40      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 64×64   | 60      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 90×90   | 16      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 90×90   | 28      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 90×90   | 40      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 90×90   | 60      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 128×128 | 16      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 128×128 | 28      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 128×128 | 40      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 128×128 | 60      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 144×144 | 16      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 144×144 | 28      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 144×144 | 40      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| deep-zoom       | 144×144 | 60      | -0.748, 0.1 | 0.005 | 0               | 0              | —                |
| full-set        | 64×64   | 16      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 64×64   | 28      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 64×64   | 40      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 64×64   | 60      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 90×90   | 16      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 90×90   | 28      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 90×90   | 40      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 90×90   | 60      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 128×128 | 16      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 128×128 | 28      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 128×128 | 40      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 128×128 | 60      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 144×144 | 16      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 144×144 | 28      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 144×144 | 40      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| full-set        | 144×144 | 60      | -0.6, 0     | 1.4   | 0               | 0              | —                |
| mostly-exterior | 64×64   | 16      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 64×64   | 28      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 64×64   | 40      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 64×64   | 60      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 90×90   | 16      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 90×90   | 28      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 90×90   | 40      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 90×90   | 60      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 128×128 | 16      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 128×128 | 28      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 128×128 | 40      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 128×128 | 60      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 144×144 | 16      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 144×144 | 28      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 144×144 | 40      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-exterior | 144×144 | 60      | 1.2, 1.2    | 0.6   | 0               | 0              | —                |
| mostly-interior | 64×64   | 16      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 64×64   | 28      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 64×64   | 40      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 64×64   | 60      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 90×90   | 16      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 90×90   | 28      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 90×90   | 40      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 90×90   | 60      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 128×128 | 16      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 128×128 | 28      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 128×128 | 40      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 128×128 | 60      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 144×144 | 16      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 144×144 | 28      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 144×144 | 40      | -0.25, 0    | 0.15  | 0               | 0              | —                |
| mostly-interior | 144×144 | 60      | -0.25, 0    | 0.15  | 0               | 0              | —                |

240 of 240 cases had both implementations succeed. Differing cells across all of them: **0**.

### Median service time by size and ceiling

Round-trip time summed over the requests a run needed, with the benchmark’s own pacing delay excluded.

| Size    | Ceiling | Full median ms | Full min–max | Active median ms | Active min–max | Change |
| ------- | ------- | -------------- | ------------ | ---------------- | -------------- | ------ |
| 64×64   | 16      | 193            | 151–288      | 194              | 153–281        | +1%    |
| 64×64   | 28      | 198            | 185–275      | 249              | 185–272        | +26%   |
| 64×64   | 40      | 206            | 177–281      | 255              | 171–367        | +24%   |
| 64×64   | 60      | 256            | 175–359      | 227              | 179–372        | -11%   |
| 90×90   | 16      | 192            | 162–391      | 263              | 193–385        | +37%   |
| 90×90   | 28      | 214            | 167–674      | 261              | 176–618        | +22%   |
| 90×90   | 40      | 233            | 179–299      | 259              | 188–376        | +11%   |
| 90×90   | 60      | 248            | 190–350      | 264              | 184–462        | +6%    |
| 128×128 | 16      | 323            | 280–889      | 381              | 270–845        | +18%   |
| 128×128 | 28      | 364            | 292–494      | 387              | 286–563        | +6%    |
| 128×128 | 40      | 389            | 298–812      | 433              | 355–795        | +11%   |
| 128×128 | 60      | 442            | 368–562      | 471              | 295–660        | +7%    |
| 144×144 | 16      | 532            | 361–988      | 571              | 449–1134       | +7%    |
| 144×144 | 28      | 706            | 441–1571     | 576              | 451–1645       | -18%   |
| 144×144 | 40      | 496            | 393–862      | 568              | 401–1099       | +15%   |
| 144×144 | 60      | 648            | 454–1360     | 687              | 449–1949       | +6%    |

### Median service time by view

| View            | Runs each | Full median ms | Active median ms | Change |
| --------------- | --------- | -------------- | ---------------- | ------ |
| full-set        | 48        | 335            | 335              | +0%    |
| mostly-exterior | 48        | 333            | 344              | +3%    |
| boundary-heavy  | 48        | 340            | 379              | +11%   |
| mostly-interior | 48        | 301            | 367              | +22%   |
| deep-zoom       | 48        | 308            | 374              | +22%   |

### Paired comparison, same case and repetition

Each pair is one case measured twice within a few seconds. Counting wins avoids attributing a slow minute on a shared service to whichever implementation happened to be measured during it.

| Group           | Pairs | Active faster | Full faster | Active win rate |
| --------------- | ----- | ------------- | ----------- | --------------- |
| All cases       | 240   | 82            | 156         | 34%             |
| full-set        | 48    | 24            | 23          | 50%             |
| mostly-exterior | 48    | 29            | 19          | 60%             |
| boundary-heavy  | 48    | 8             | 40          | 17%             |
| mostly-interior | 48    | 10            | 38          | 21%             |
| deep-zoom       | 48    | 11            | 36          | 23%             |

### Median service time by view and size

Where the difference between the two is largest, and in which direction.

| View            | Size    | Full median ms | Active median ms | Change |
| --------------- | ------- | -------------- | ---------------- | ------ |
| full-set        | 64×64   | 208            | 254              | +22%   |
| full-set        | 90×90   | 238            | 264              | +11%   |
| full-set        | 128×128 | 430            | 387              | -10%   |
| full-set        | 144×144 | 552            | 494              | -11%   |
| mostly-exterior | 64×64   | 205            | 204              | -0%    |
| mostly-exterior | 90×90   | 210            | 224              | +7%    |
| mostly-exterior | 128×128 | 386            | 372              | -4%    |
| mostly-exterior | 144×144 | 574            | 557              | -3%    |
| boundary-heavy  | 64×64   | 203            | 254              | +25%   |
| boundary-heavy  | 90×90   | 250            | 270              | +8%    |
| boundary-heavy  | 128×128 | 372            | 462              | +24%   |
| boundary-heavy  | 144×144 | 590            | 668              | +13%   |
| mostly-interior | 64×64   | 208            | 245              | +18%   |
| mostly-interior | 90×90   | 209            | 265              | +27%   |
| mostly-interior | 128×128 | 358            | 450              | +26%   |
| mostly-interior | 144×144 | 528            | 642              | +22%   |
| deep-zoom       | 64×64   | 206            | 204              | -1%    |
| deep-zoom       | 90×90   | 222            | 247              | +11%   |
| deep-zoom       | 128×128 | 379            | 448              | +18%   |
| deep-zoom       | 144×144 | 601            | 647              | +8%    |

### Failures, requests and response size

| Implementation | Runs | Failures | Failure kinds | Requests per run | Median bytes |
| -------------- | ---- | -------- | ------------- | ---------------- | ------------ |
| Full matrix    | 240  | 0        | —             | 2–4              | 28782        |
| Active points  | 240  | 0        | —             | 2–4              | 28782        |

### Requests per run, by size

| Size    | Full matrix | Active points |
| ------- | ----------- | ------------- |
| 64×64   | 2           | 2             |
| 90×90   | 2           | 2             |
| 128×128 | 3           | 3             |
| 144×144 | 4           | 4             |

### Highest resolution reached

| Implementation | Size    | Outcome           | Requests | Time    |
| -------------- | ------- | ----------------- | -------- | ------- |
| Full matrix    | 144×144 | succeeded         | 4        | 3165 ms |
| Full matrix    | 160×160 | succeeded         | 4        | 3217 ms |
| Full matrix    | 176×176 | failed — aplError | —        | —       |
| Full matrix    | 192×192 | failed — aplError | —        | —       |
| Active points  | 144×144 | succeeded         | 4        | 3340 ms |
| Active points  | 160×160 | succeeded         | 4        | 3276 ms |
| Active points  | 176×176 | failed — aplError | —        | —       |
| Active points  | 192×192 | failed — aplError | —        | —       |

<!-- END GENERATED TABLES -->

## Workspace and reliability findings

- **No failures at all** in 480 runs, either implementation, at any tested size.
- **Identical resolution ceiling.** Both succeed at 144×144 and 160×160 and both
  fail at 176×176 and 192×192, with the same `aplError`. The 512 KB workspace
  runs out at the same place for both, which suggests the limit is reached
  building the coordinate matrices — which both do identically — rather than in
  the iteration.
- **Identical transport.** Same requests per run at every size (2 at 64² and 90²,
  3 at 128², 4 at 144²) and the same median response size, because the response is
  the finished matrix and the matrix is the same. The banded transport neither
  helps nor hinders either implementation more than the other.
- **The preset's shipped maximum of 144 is conservative but not wrong.** 160
  worked in this session; 176 did not. Since the ceiling is identical for both,
  this benchmark gives no reason to move it, and a limit that works on a quiet
  afternoon is not a limit worth shipping.

## If this is revisited

The most promising direction is not this one. Both implementations pay the same
fixed cost — building `cr` and `ci` as full `size × size` matrices — and both send
back a response of the same size. A 64×64 run costs about 200 ms against a
network floor of roughly 150 ms, so whatever computation is worth optimising is
a small part of what a visitor waits for — how large a part, this method cannot
say. That points at fewer or smaller round-trips rather than faster arithmetic,
and Stage 9's banded transport is already the lever there.

If the active-point idea is tried again, the case for it would have to come from
a view type not tested here, or from a much higher iteration ceiling than 60,
where the wasted arithmetic finally outweighs the bookkeeping. Nothing in this
data suggests where that crossover is, other than that it is above 60.

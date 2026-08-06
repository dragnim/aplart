# Changelog

## v1.2.0 — Instant Play

Added a new Start creating experience that opens an attractive artwork immediately
with expressive creative controls. Randomise, Undo, Save image and Share are
available directly from the Play surface, and each creative control can reveal and
open the APL assignment it changes.

### A way in that has already made something

The gallery's hero offers **Start creating** beside the existing invitation to
browse. It opens Modular Bloom on one of eight curated variations and draws it, so
the first thing you see is an artwork rather than a blank canvas and a Run button.

The seed is written into the link. Reloading, sharing the address, Back and Forward
all show the same artwork, because the variation is a pure function of the preset
and that number — nothing is stored, and nothing is chosen again behind your back.
Coming back to the gallery offers a fresh one.

### Complexity, Scale and Detail

Three controls in the artwork's own words, over the parameters the workspace
already had. Each reads its value out of the visible APL and writes changes back
into it, so the technical sliders agree with them without being told to and the
picture changes because the program did. Their ranges are narrower than the
technical ones on purpose: dependable rather than complete.

The labels come from watching the artwork rather than reading the code. A higher
multiplier makes the pattern finer, so that is Complexity; a higher modulus makes
each bloom larger and therefore fewer of them, so that is Scale.

### Randomise, Undo, Save image and Share

All four are on the Play surface. Randomise moves to another curated variation,
never the one already on screen, and keeps its seed for sharing.

Undo is workspace state rather than a stack belonging to one surface: it restores
the source, the seed and the artwork together, without asking the service for
something it already had. A drag of a slider is one step back however many values
it passed through. Anything the history does not describe — typing, a technical
control, a Reset — ends it rather than being silently undone past, so Undo stops
offering rather than offering something untrue.

### How this changes the APL

Every creative control can show its working: the variable it writes, the
assignment as the source currently has it, and a way straight to that line in the
editor. The text comes from the code rather than from the configuration, so it
follows a slider, a Randomise and an Undo, and says plainly when a line has been
edited into something a control can no longer claim.

**Edit the APL** opens the editor wherever the layout keeps it — behind the
disclosure, in the Code tab, or in the Focus-mode drawer — scrolls to the line and
selects the value, ready to type over. It changes nothing on the way: not the
source, the artwork, the seed, the palette, the history or the address.

### Elsewhere

The rounded square holding a `⍴` has gone from the header. It dated from when the
wordmark was plain text and the header needed a mark of its own; the pixel logo
says the same thing, and one mark reads better than two.

Play is responsive and keyboard-operable throughout: the artwork leads on a wide
screen with its controls beside it, stacks above them on a phone, and floats its
controls clear of the drawer in Focus mode. Every action is reachable by Tab, the
disclosures announce their state, the assignment is text rather than a highlight,
and the editor can always be left the way it was entered.

## v1.1.0 — 2026-08-05

### Palette-responsive branding

APL Art's pixel logo and interface now respond to the palette used by the current
artwork. `APL` remains neutral while `Art`, active controls and selected workspace
details use colours derived safely from the artwork palette.

Colours are adjusted automatically for contrast across light and dark surfaces —
separately, because no single colour can serve both a white panel and the near-black
editor. So a pale palette produces darker, readable text rather than unreadable
text, and a monochrome palette produces a monochrome interface rather than an
invented hue.

The artwork title and the main controls-column headings now carry restrained pixel
accents that follow the artwork palette, and the wordmark is the real pixel artwork
rather than text.

Custom palettes, shared artworks, animation and Focus mode are all supported, while
semantic colours and general navigation links remain stable. A palette that is
momentarily unusable — mid-edit in a colour field — leaves the interface where it
was rather than flashing through a default. The gallery and information pages keep
APL Art's own accent. An animating artwork does not repaint the interface frame by
frame: the theme follows the palette definition, never the rendered pixels.

## v1.0.1 — hardening

No change to what APL Art looks like or how it behaves when everything goes right.
Every item here is about what happens when something goes wrong, or about a limit
that was described but not enforced.

### Hostile input

- **Share links are bounded before they are decoded.** The decoder measured its input
  only after `atob` had already turned it into bytes, and compared the _compressed_
  size against the _decompressed_ ceiling. A very long link therefore allocated first
  and objected second. There are now two named limits — 64 KB compressed, 256 KB
  decompressed — and the accepted Base64 length is derived from the first, so an
  over-long link is refused on sight.
- **Decompression is output-bounded.** `inflateSync` ran to completion before its
  result was measured, so a few kilobytes of zeroes could become megabytes of memory
  before anything refused them. Inflation is now given exactly one byte more than the
  ceiling to write into; filling that byte is the signal that the payload was too big.
- **Responses are read incrementally and counted in bytes.** The service called
  `response.text()` — downloading and decoding the whole body — and then compared
  `text.length`, which counts UTF-16 code units rather than bytes. A reply full of APL
  glyphs is two or three bytes per character, so a body well past the limit could
  measure comfortably inside it. The body is now read chunk by chunk, real bytes are
  counted, and the reader is cancelled as soon as the limit is passed.
  `Content-Length` is still an early rejection when it admits to being too large, but
  it is no longer the protection.

Valid links written by v1.0.0 continue to open, and the palette and schema migrations
are untouched.

### Limits that now hold

- **One deadline for one run.** The timeout was documented as covering a whole
  execution and was handed to every request unchanged, so a banded artwork could take
  thirty times the configured budget while each request stayed inside it. A run now
  has a single deadline; each request is given only what remains, and a run with no
  time left stops instead of asking for more.
- **One ceiling on requests for one run.** The limit of thirty-two was consulted only
  when a truncated band forced a re-plan, so an ordinary sequence of successful narrow
  bands never met it. It is now checked before every request, counting the first, and
  the maximum is a maximum: the thirty-second request is allowed and the thirty-third
  is refused.
- `VITE_APL_REQUEST_TIMEOUT_MS` is now `VITE_APL_EXECUTION_TIMEOUT_MS`, because it was
  named for a request and documented for a run. The old name is still read.

### Recovering and getting around

- **A render failure no longer outlives the page that caused it.** "Back to the
  gallery" changed the route while the error boundary went on showing its fallback
  over the top of the gallery, leaving the only escape as "Try again". The boundary now
  resets when the route changes, and "Try again" behaves exactly as before.
- **Focus follows the route.** Opening a gallery card left focus on `<body>`, and using
  the header navigation left it on the link that had just been activated — still
  pointing at the page the visitor had left. A route change now moves focus into the
  `main` landmark, which puts the next `Tab` at the top of the new page and gives
  assistive technology something definite to announce. Interacting with one page never
  moves focus.

### Deployment

- **Nothing is published until every check has passed.** Two workflows used to start
  from the same push: one verified, the other verified rather less — no formatting
  check and no Playwright — and deployed. A commit that broke an end-to-end journey
  could be live before CI had finished discovering it. There is now one workflow in
  which packaging depends on both the verification and the end-to-end jobs, and it
  publishes the commit those jobs ran against. Pull requests verify and never deploy;
  a queued deployment abandons itself rather than publishing over a newer one.

### Documentation

- The README describes the eleven artworks that exist, the palette editor, animation,
  plane exploration, the inspector, tiling, Focus mode and the share-link limits, and
  what is deliberately absent — including the Fullscreen API, column banding and wide
  floating-point transport.
- [`docs/assistive-technology-plan.md`](docs/assistive-technology-plan.md) records the
  manual screen-reader passes that are still owed. Nothing here has been tested with a
  real screen reader, and the documentation says so.

## v1.0.0

The first release: eleven artworks, real Dyalog APL executed through TryAPL, palette
and display controls, plane exploration, the matrix inspector, tiling, PNG export,
saved projects and shareable links.

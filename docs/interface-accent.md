# How the interface takes its colour from an artwork

Four ideas hold this together. Each exists because the obvious alternative fails
in a way that is easy to reintroduce, so each is written down with the failure it
avoids.

## The derivation is pure

`src/theme/interfaceAccent.ts` exports `deriveInterfaceAccentTheme(palette,
surfaces, fallback)`. It takes serialisable data and returns fourteen hex colours.
No DOM, no React, no clock, no randomness, no canvas — the same palette and
surfaces always produce the same tokens.

That is what lets an animated artwork leave the interface alone. The theme follows
the palette _definition_; nothing samples what was rendered, so a moving picture
cannot repaint the controls. It is also what makes the colour behaviour testable
without a browser: `tests/unit/interfaceAccent.test.ts` asserts contrast
numerically for every kind of palette, including the ones that cannot work
(`{}`, empty, unparseable, alpha) and must fall back.

There is deliberately **no cache inside the module**. Memoisation belongs to the
caller, where React already has `useMemo` and a dependency it can state honestly.

## Roles, not one colour

A palette is chosen to look good as a picture, which is a different job from being
readable as text on a white panel. So no palette colour is used directly. One is
chosen as the source, and each role — text, border, filled control, tinted
background, focus ring, the wordmark's neutral half — is derived from it by moving
lightness and chroma in OKLCH until it meets the contrast that role needs, keeping
the hue so the result still belongs to the palette.

Two consequences worth not undoing:

**Light and dark are separate tokens.** Nothing reaches 4.5:1 against both
`#ffffff` and `#232323`, and this interface has both — white panels, and a
near-black editor, symbol toolbar and canvas frame. So `text`/`textOnDark`,
`border`/`borderOnDark` and `soft`/`softOnDark` are pairs. Choose by the _immediate_
surface: the Focus-mode drawer is light even though the page behind it is dark.

**The filled control is not such a pair**, because filled controls only ever sit on
light ground here. An earlier draft required the fill to survive both grounds as
well, which left a band about six thousandths of a unit of luminance wide — every
palette produced the same muddy colour and hover had nowhere to go.

The source is chosen by score, not by position: chroma (capped, so a fluorescent
pink does not beat a good red for being louder), distance from the interface's own
greys (so a palette's near-white end does not become an accent indistinguishable
from a panel), minus fidelity — how far the colour must move to do the jobs asked
of it. That last term is what stops the extremes winning; a palest tint can be made
into readable text, but only by becoming a different colour.

## The last valid theme belongs to React

`src/theme/InterfaceAccentBoundary.tsx` holds the most recent palette the workspace
published, in ordinary component state. Mid-edit, a custom palette can be
momentarily unusable; `accentPaletteFor` reports `null` for it and the workspace
publishes nothing, so the previous theme is simply the state that was never
replaced.

This is the whole reason the derivation can stay pure. A "remember the last good
answer" cache inside the module would be the same behaviour with the state hidden,
and would make the function's output depend on what it had been asked before.

Note that this rule differs from the renderer's on purpose. `paletteFor` answers
with a default ramp when a custom palette is unusable, because the canvas must draw
something. The interface has a better option and takes it.

## One element carries the properties

The fourteen custom properties are set with a `style` prop on the application
shell — the outermost element `App` renders.

- **Above the route**, so the header can follow an artwork rendered below it.
- **Never unmounts**, so applying a theme cannot remount the artwork, discard a
  result or reset Focus mode. Custom properties inherit, so the fixed full-screen
  Focus-mode page and the top-layer `<dialog>` elements are covered without being
  given anything of their own.
- **React's to own.** Writing to `document.documentElement` from an effect would put
  the theme outside the render that decided it, with a teardown to get wrong on
  every route change. A `style` prop cannot leave a stale colour behind: the value
  simply becomes the default again.

The workspace remains the only palette state. It publishes the colours it draws
with, keyed by preset; a publication belonging to an artwork the visitor has left is
ignored. Until the workspace has loaded — every direct visit, since it loads lazily
— the preset's own declared palette is used, which is why a link to a Poolrooms
artwork does not open orange and correct itself.

Consumers read custom properties and nothing else. No control receives a colour
prop, no control imports the derivation, and only two modules import anything from
`src/theme`: `App` for the boundary and `WorkspacePage` to publish.

## The wordmark is split, not redrawn

`src/assets/branding/aplart_logo.svg` is the canonical artwork and stays that way.
`src/components/branding/AplArtLogo.tsx` carries a copy of its path data divided in
two — subpaths 0–3 spell "apl", subpaths 4–7 spell "art" — and concatenating the two
strings reproduces the original character for character, which the test asserts
rather than trusts.

Inline rather than an `<img>`, because a custom property set by this application
cannot reach inside a separately loaded document, and colouring one half from the
palette is the entire point.

`shape-rendering: crispEdges` is not decoration. Splitting one path into two changes
how it antialiases — a path's coverage mask aligns to its own bounding box, and the
halves have different bounds than the whole — which moved up to two dozen edge
pixels at fractional scales. Snapping to the pixel grid removes the variance
completely, measured at zero differing pixels from 24px to 1248px wide, and hard
edges are what a pixel face is drawn for anyway.

## Where the branding appears, and how loudly

One motif at three strengths, deliberately ordered:

1. **The wordmark's "art"** — the signature, and the largest coloured element.
2. **A block beside the artwork title** — `--ui-accent-solid`, 0.42em.
3. **A block beside the three headings that structure the controls column** —
   `--ui-accent-border`, 0.3em.

Nothing below that level: not the group legends, the primitive reference, the
Focus-mode drawer, or any form label. Repeating a motif at every level turns a
hierarchy into a texture. `tests/unit/brandingTokens.test.ts` pins the ordering by
comparing the two sizes and the two tokens, so a change that flattens it fails.

# Testing APL Art with assistive technology

What the automated suite can and cannot establish, and the manual passes that are
still owed.

## What is automated, and what that is worth

`tests/e2e/accessibility.spec.ts` runs axe-core over fifteen page states, and
`tests/e2e/navigationScroll.spec.ts` asserts focus behaviour directly: focus lands
in the `main` landmark after a route change, does not stay on the navigation link
that was used, and is never taken away during ordinary interaction on one page.
`tests/e2e/failureAnnouncement.spec.ts` resolves the effective politeness of every
live region from the live DOM and asserts that a failed run is announced exactly
once, by the assertive alert.

Those are real checks against a real browser. They are not the same as listening to
the application. Automated tooling catches a minority of genuine accessibility
problems, and none of the above proves that what a screen reader _says_ is useful —
only that the structures it reads are present, correctly labelled and correctly
ordered.

**Nothing in APL Art has been tested with an actual screen reader.** That was true at
v1.0.0 and this release does not change it. The plan below is what would establish it; until
somebody runs it, the honest claim is "the ARIA contract is verified, the experience
is not".

## NVDA with Firefox, on Windows

1. **Gallery.** Load the site. Confirm the page title is announced. Browse the cards
   with `Tab` and with NVDA's element list (`Insert+F7`): each card should give a
   title, a category, a difficulty, a character count and one clearly named "Open"
   link — not a second, unnamed thumbnail link.
2. **Opening an artwork.** Activate an "Open" link. Focus should arrive in the main
   region; confirm NVDA announces the new page rather than staying silent, and that
   the heading is reachable immediately with `H`.
3. **Running.** Press Run. Confirm the polite status region announces progress and
   completion once, not repeatedly, and that the canvas is described with its
   dimensions, value range and palette.
4. **A failure.** Set the resolution to its maximum, edit the code to something
   invalid, and Run. Confirm the failure is announced **once**, by the alert, and
   that "Run failed." in the status region is not announced as a second event.
5. **Inspecting.** Use the row and column fields and the Inspect button. Confirm the
   reading is announced, and that it never claims a point is "in the set".
6. **Recovery.** Force a render failure if one can be provoked, or navigate away and
   back, and confirm the fallback's "Back to the gallery" link returns to a usable
   gallery.
7. **Skip link.** From a fresh load, `Tab` once and activate it. Confirm focus moves
   to the main region and the page does **not** change to a not-found state.

## VoiceOver with Safari, on macOS or iOS

1. Repeat steps 1–7 above with `VO+arrow` navigation and the rotor.
2. **Landmarks.** Check the rotor lists banner, main and contentinfo, and that the
   workspace's regions are distinguishable.
3. **The narrow layout.** On iOS, confirm the artwork, code and controls tabs are
   announced as tabs, that the selected one is stated, and that the reading produced
   by Inspect can be found — it is rendered with the artwork, so it is on the artwork
   tab rather than beside the controls that requested it.
4. **Focus mode.** Enter it and confirm the drawer is reachable and dismissible, and
   that leaving it returns focus somewhere sensible.

## Keyboard only, any browser

1. Complete the whole journey without a pointer: gallery → open an artwork → edit the
   code → Run → change a palette → inspect a cell → export → back to the gallery.
2. Confirm a visible focus indicator at every stop, and that `Tab` order follows the
   visual order.
3. Confirm `Escape` closes the export menu and the reset dialog, and returns focus to
   the control that opened it.
4. Confirm the artwork's pan and zoom buttons are reachable and that dragging is not
   the only way to explore the plane.

## Recording a result

Note the tool and version, the browser, the platform, and one line per step: what was
announced, and whether it was enough to act on. A step that cannot be completed is a
finding, not a failure of the plan.

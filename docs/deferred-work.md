# Deferred work

Things consciously left undone, with enough context to pick up. Not a wish list:
each of these was met during real work and set aside for a stated reason.

## The palette editor's hex field cannot be typed into

Recorded in full at [`palette-editor-hex-input.md`](palette-editor-hex-input.md).
A controlled input whose handler commits nothing has its value restored by React,
so an incomplete colour never survives a keystroke and the field can only be
changed through the swatch beside it. Pre-existing; found while testing the
interface accent, which is unaffected because it keeps the last valid theme.

**Why not now:** it is a change to how a control behaves, with its own tests to
write, and bundling it into a styling pass would have hidden it.

## Should general links ever become workspace-aware?

Today every link uses `--accent-orange-strong`, including the footer on an artwork
route, where the surrounding controls follow the palette. It can read as slightly
disconnected.

The alternative — scoping link colour to the workspace — means the same footer link
changes colour depending on which page it is read on, and Help and About must keep a
stable, legible treatment regardless. That trade was judged worse than the mismatch.

**If revisited:** decide it as a question about the site's link identity, not as a
branding detail, and introduce an explicit class for artwork-context links rather
than route-aware component logic.

## Should the share notice carry a semantic failure colour?

`.shareNotice` is one element with two meanings: "this artwork was shared with you"
and "this shared link could not be opened". Its left border is now neutral, which is
honest for both but flattering to neither.

A better treatment would distinguish them — the failure in the established warning
or error colour, the success left neutral or palette-tinted. That is a semantic
change to a notice rather than a styling one, so it was left alone.

## Manual assistive-technology checks

Still owed, and unchanged by the branding work:
[`assistive-technology-plan.md`](assistive-technology-plan.md) holds the NVDA,
VoiceOver and keyboard-only plans. **No screen reader has been driven against APL
Art**; the ARIA contract is verified by automated tests, the experience is not.

The branding pass adds nothing that needs narrating — the wordmark is decorative
inside a named link, and every state it colours also carries a non-colour
indicator — but the plan should be run before claiming the interface is accessible
rather than structurally correct.

## Near-black palettes: hover is numerically, not visually, distinct

A palette whose source is near-black (`#0a0118`, say) produces a near-black fill.
Its hover and pressed states are distinct colours — `#020009` and `#000002` — but
almost indistinguishable to the eye, because there is nowhere darker to go.

Every contrast requirement still passes with a wide margin, the pressed state also
moves by a pixel, and every selected state keeps its ring, weight and tint. Brightening
the palette to manufacture a visible difference would be infidelity to the artwork,
so this stays as it is: a fidelity trade-off, not a defect.

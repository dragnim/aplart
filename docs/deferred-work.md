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

## Instant Play needs two things the workspace does not have yet

Both were found while building the Instant Play configuration and generator, and
both were deliberately left for the stages that need them — adding either during a
data-and-generator stage would have meant untested production code sitting unused.
They are recorded here as interfaces so the later stages inherit a decision rather
than a discovery.

### Undo belongs to the workspace, not to Play

Play offers an Undo, but `workspaceState.ts` has no history: its actions
(`codeChanged`, `cellInspected`, `renderOptionsChanged`, the run lifecycle,
`restored`) each replace state outright. A Play-only undo stack would be a second
history that disagrees with the editor's own, so the reducer is where this goes.

Sketch of the required shape:

- `readonly past: readonly WorkspaceSnapshot[]` on the existing state, where a
  snapshot holds the code and a short label for what produced it ("Randomise",
  "Complexity").
- A new `undone` action that pops the most recent snapshot, and a `canUndo`
  derivation for the button's disabled state.
- Pushes happen on **discrete commits** only — a variation applied, a control
  released — never per keystroke, or typing floods the stack.
- `restored` must not push: rebuilding from a shared link is not something the
  visitor did, so there is nothing there to undo back past.
- Bound the stack (twenty is ample) so a long session cannot grow without limit.

### The editor cannot be asked to show a line

`AplEditorHandle` exposes `insertAtCursor`, `focus`, `undo` and `redo`. Peek's whole
claim is "this control changes that line", which means scrolling the line into view,
so it needs one more method:

```ts
revealLine(line: number, options?: { readonly select?: boolean }): void;
```

`line` is zero-based, matching `AssignmentLocation.line`, and `select` highlights
the assigned value rather than the whole line. No new parsing is required for
either: `findAssignment` already returns the line index and the `prefix` whose
length is the value's start column. `tests/unit/instantPlay.test.ts` already asserts
that every Play control resolves to a real assignment, so the line Peek will be
handed is known to exist.

## Near-black palettes: hover is numerically, not visually, distinct

A palette whose source is near-black (`#0a0118`, say) produces a near-black fill.
Its hover and pressed states are distinct colours — `#020009` and `#000002` — but
almost indistinguishable to the eye, because there is nowhere darker to go.

Every contrast requirement still passes with a wide margin, the pressed state also
moves by a pixel, and every selected state keeps its ring, weight and tint. Brightening
the palette to manufacture a visible difference would be infidelity to the artwork,
so this stays as it is: a fidelity trade-off, not a defect.

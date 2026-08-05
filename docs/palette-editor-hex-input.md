# Follow-up: the palette editor's hex field cannot be typed into

Found while building the palette-responsive branding, in a test that tried to
type a partial colour to prove the interface holds still mid-edit. Recorded
rather than fixed: it is a behaviour change in a control, not a styling one, and
it predates the branding work.

## Current behaviour

`src/workspace/PaletteEditor.tsx` renders each stop's hex field as a controlled
input:

```tsx
<input
  type="text"
  value={stop.colour}
  onChange={(event) => {
    const parsed = normaliseColour(event.target.value);
    if (parsed !== null) update(stop.id, { colour: parsed });
  }}
/>
```

Typing into it does nothing visible. Every keystroke is reverted and the field
redisplays the colour that was already there, so a stop's colour cannot be
changed by typing a new one — only by the colour swatch beside it, which opens
the operating system's picker.

Measured in Chromium through the real component: `clear()` followed by typing
`#ff0000` leaves the field showing the original `#04262b` and the palette
unchanged. A single `change` event carrying a complete colour — which is what the
swatch produces — commits normally.

## What the code intends

The handler's own comment says the opposite:

> Typed a character at a time, so most keystrokes are not yet a colour. The field
> keeps what was typed; the artwork changes when it becomes one.

That is the right intention. The field should accept `#`, then `#f`, then `#ff`
without complaint, and commit when the text becomes a colour.

## Why it does not happen

React restores a controlled input's DOM value after every change event whose
handler did not change state. The handler deliberately does not call `update` for
an incomplete value, so React sees a `value` prop identical to the one it last
rendered, concludes the DOM has drifted, and writes the prop back. The
intermediate text is erased before the next keystroke arrives, so the field never
accumulates one.

The comment describes what would happen with an _uncontrolled_ input, or with a
controlled one holding the typed text rather than the committed colour.

## Recommended fix

Hold the text being typed, separately from the committed colour:

- Keep a per-stop draft string in `PaletteEditor` state, initialised from the
  stop's colour, and render that as the field's `value`.
- On change, always store the draft; call `update` only when `normaliseColour`
  accepts it.
- On blur, and on `Escape`, discard a draft that never became a colour and
  redisplay the committed value, so the field cannot be left showing something
  the palette does not contain.
- Re-seed the draft when the stop's colour changes from elsewhere — the swatch,
  a shared link, or Randomise — or the two will disagree.

The interface accent needs nothing from this: it already holds the last valid
theme while a palette is unusable, and that is exercised by
`tests/integration/interfaceTheme.test.tsx`.

## Tests it would need

- Typing `#`, `#1`, `#19` commits nothing and leaves the palette alone.
- Continuing to `#199b9d` commits once, and the artwork's palette follows.
- The field shows exactly what was typed at every step, including invalid text.
- Blurring an incomplete value restores the committed colour.
- `Escape` restores the committed colour without committing.
- Changing the colour through the swatch, or loading a shared link, updates the
  field rather than leaving a stale draft.
- The interface accent holds the previous valid theme throughout, and takes the
  new one on commit — the assertion that already exists, kept honest against the
  new input path.

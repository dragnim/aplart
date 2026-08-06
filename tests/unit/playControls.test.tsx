/**
 * What the controls say when the code stops agreeing with them.
 *
 * Mounted directly, because the interesting sources are ones no interface can
 * produce: an assignment rewritten into an expression, or deleted outright. Both
 * are a keystroke away in the editor, and both are where a confident control
 * becomes a lying one.
 *
 * The ordinary case is here too, so the honest wording can be compared against
 * what the same component says when everything is fine.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { modularBloom } from '@/presets/modular-bloom';
import { type InstantPlayConfig } from '@/presets/instantPlay';
import { PlayControls } from '@/workspace/PlayControls';

const config = modularBloom.instantPlay as InstantPlayConfig;

function mount(code: string) {
  const onEditApl = vi.fn();

  render(
    <PlayControls
      preset={modularBloom}
      config={config}
      code={code}
      onAdjust={() => undefined}
      onAdjustEnd={() => undefined}
      onEditApl={onEditApl}
      onRandomise={() => undefined}
      onUndo={() => undefined}
      undoLabel={null}
      onSaveImage={() => undefined}
      onShare={() => undefined}
      canSave={false}
      busy={false}
    />,
  );

  return { onEditApl };
}

/**
 * The disclosure belonging to one control.
 *
 * Found through its action, whose accessible name is the one thing in it that
 * names the control — the summary reads the same in all three, which is the point
 * of it, and so is no way to tell them apart.
 */
function disclosureFor(label: string): HTMLElement {
  return screen.getByRole('button', { name: `Edit the APL for ${label}` }).closest('details') as HTMLElement;
}

describe('a control that is bound', () => {
  const code = 'size←64\nmodulus←17\nmultiplier←7';

  it('names the variable and shows the assignment the source makes', () => {
    mount(code);
    const peek = disclosureFor('Complexity');

    expect(within(peek).getByText('multiplier')).toBeInTheDocument();
    expect(within(peek).getByText('multiplier←7')).toBeInTheDocument();
    // And what moving it does to that line, so the disclosure explains as well as
    // points. The control's own sentence is already on screen above it, and is
    // deliberately not printed here a second time.
    expect(peek).toHaveTextContent('Moving Complexity rewrites this line');
    expect(peek).not.toHaveTextContent('How intricate the pattern becomes');
  });

  it('starts closed, and opens like the disclosure it is', () => {
    mount(code);
    const peek = disclosureFor('Scale') as HTMLDetailsElement;

    expect(peek.open).toBe(false);
    fireEvent.click(within(peek).getByText('How this changes the APL'));
    expect(peek.open).toBe(true);
  });

  it('offers an action named after the control it belongs to', () => {
    // Three buttons reading "Edit the APL" would be three identical names in a
    // list of what is on the page.
    const { onEditApl } = mount(code);

    const action = within(disclosureFor('Detail')).getByRole('button', { name: 'Edit the APL for Detail' });
    fireEvent.click(action);

    expect(onEditApl).toHaveBeenCalledTimes(1);
    expect(onEditApl.mock.calls[0]?.[0]).toMatchObject({ id: 'size', variable: 'size' });
  });
});

describe('a control whose line has become an expression', () => {
  const code = 'size←64\nmodulus←2+3×5\nmultiplier←1';

  it('says so, and claims no value', () => {
    mount(code);
    const peek = disclosureFor('Scale');

    expect(peek).toHaveTextContent('no longer connected to a simple assignment');
    expect(peek).toHaveTextContent('modulus');
    // Nothing that reads as "this control sets that".
    expect(peek).not.toHaveTextContent('modulus←');
    expect(within(peek).queryByText(/^modulus←/)).toBeNull();
  });

  it('still offers the way to the line, because that is where the repair is', () => {
    const { onEditApl } = mount(code);

    const action = within(disclosureFor('Scale')).getByRole('button', { name: 'Edit the APL for Scale' });
    expect(action).toBeEnabled();

    fireEvent.click(action);
    expect(onEditApl).toHaveBeenCalledTimes(1);
  });

  it('shows no slider whose position would be a guess', () => {
    mount(code);

    expect(screen.queryByLabelText('Scale')).toBeNull();
    expect(screen.getByText('The code no longer sets this to a number.')).toBeInTheDocument();
    // The other two are untouched by their neighbour's trouble.
    expect(screen.getByLabelText('Complexity')).toBeInTheDocument();
    expect(screen.getByLabelText('Detail')).toBeInTheDocument();
  });
});

describe('a control whose assignment has gone', () => {
  const code = 'size←64\nmultiplier←1\nr←modulus|multiplier×∘.×⍨⍳size';

  it('says that too, without naming a line it cannot find', () => {
    mount(code);
    const peek = disclosureFor('Scale');

    expect(peek).toHaveTextContent('the code no longer sets modulus');
    expect(within(peek).queryByText(/modulus←/)).toBeNull();
  });

  it('keeps the editor reachable, which is all it can honestly offer', () => {
    const { onEditApl } = mount(code);

    fireEvent.click(within(disclosureFor('Scale')).getByRole('button', { name: 'Edit the APL for Scale' }));

    expect(onEditApl).toHaveBeenCalledTimes(1);
  });
});

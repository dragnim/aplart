/**
 * The simplified Play workspace, driven the way somebody drives it.
 *
 * Three claims are being checked here. That the controls are the preset's own
 * words over the preset's own parameters — so the artwork changes because the APL
 * changed, not because a second model of it did. That a gesture is one thing: one
 * run and one step back, however many values it passed through. And that the
 * ordinary workspace is untouched underneath, both in what it does and in still
 * being there.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { type InstantPlayConfig } from '@/presets/instantPlay';
import { numberAssignedTo, setParameterValues } from '@/editor/parameterBinding';
import { decodeShareState } from '@/sharing/decodeShareState';
import { generateInstantPlayVariation } from '@/workspace/instantPlayVariation';
import { startCreating } from '@/workspace/startCreating';
import { WorkspacePage } from '@/workspace/WorkspacePage';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // The wide layout, so the artwork, the Play panel and the disclosure are all
  // on the page at once rather than behind tabs.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

  /*
   * CodeMirror measures text, and jsdom has no layout to measure with — it has no
   * `Range.prototype.getClientRects` at all. Revealing a line asks the editor to
   * scroll, which starts a measure, which throws from inside CodeMirror's own
   * asynchronous measure phase: not a failing assertion, but an unhandled error,
   * which Vitest reports and exits non-zero for even when every test has passed.
   */
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
});

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

const SEED = 20_260_805;
const config = modularBloom.instantPlay as InstantPlayConfig;
const started = startCreating(modularBloom, SEED);

function serviceReturning(size = 8) {
  const service = new MockAplExecutionService();
  service.register(
    'default',
    fromNested(
      Array.from({ length: size }, (_unusedRow, row) =>
        Array.from({ length: size }, (_unusedColumn, column) => (row * column) % 5),
      ),
    ),
  );
  return service;
}

function openPlay(play: string | null = String(SEED), service = serviceReturning()) {
  const view = render(
    <WorkspacePage presetId={modularBloom.id} sharedState={null} play={play} service={service} />,
  );
  return { service, view };
}

/**
 * A service that answers the session's own source with a differently shaped
 * artwork from everything else.
 *
 * So that "the picture came back" can be asserted at all: with one matrix
 * registered for every expression, two different programs draw identical pictures
 * and an undo that restored the wrong one would look right.
 */
function serviceTellingArtworksApart(): MockAplExecutionService {
  const service = serviceReturning(8);
  service.register(
    `size←${String(numberAssignedTo(started?.code ?? '', 'size'))}`,
    fromNested([
      [1, 2, 3, 4, 5, 6],
      [2, 3, 4, 5, 6, 1],
      [3, 4, 5, 6, 1, 2],
      [4, 5, 6, 1, 2, 3],
      [5, 6, 1, 2, 3, 4],
      [6, 1, 2, 3, 4, 5],
    ]),
  );
  return service;
}

const playPanel = () => screen.getByRole('region', { name: 'Make it yours' });
const noPlayPanel = () => screen.queryByRole('region', { name: 'Make it yours' });
const slider = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
/**
 * CodeMirror's own sample text, for measuring character widths.
 *
 * jsdom has no layout, so the measurement never succeeds and the sample is left
 * in the content as an extra line the moment the editor is displayed — which
 * revealing a line does. It is not part of the document and must not be read as
 * though it were.
 */
const MEASUREMENT_LINE = 'abc def ghi jkl mno pqr stu';

/** The program the editor holds, assembled from its line elements. */
const source = () =>
  [...screen.getByRole('textbox', { name: /APL/i }).querySelectorAll('.cm-line')]
    .map((line) => line.textContent ?? '')
    .filter((text) => text !== MEASUREMENT_LINE)
    .join('');
const asRendered = (code: string) => code.split('\n').join('');

/** How many runs have happened: one first request per run, then its bands. */
const runs = (received: readonly string[]) =>
  received.filter((expression) => expression.includes(ADAPTIVE_MARKER)).length;

const drawn = () => waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Moves a slider the way a drag does: several steps, then a release. */
function drag(label: string, values: readonly number[]) {
  const input = slider(label);
  for (const value of values) fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.pointerUp(input);
}

describe('when a session is what opened the workspace', () => {
  it('offers the three configured controls, in the preset’s words', async () => {
    openPlay();
    await drawn();

    const panel = playPanel();
    for (const control of config.controls) {
      const input = within(panel).getByLabelText(control.label);

      expect(input).toHaveAttribute('type', 'range');
      // The words for the ends, which is what a number cannot say — on screen for
      // anybody reading it, and in the description for anybody who is not.
      expect(panel).toHaveTextContent(control.endpoints?.low ?? '');
      expect(panel).toHaveTextContent(control.endpoints?.high ?? '');
      /*
       * Both sentences, in order. Matched rather than compared because the
       * accessible description is assembled from two nodes and the computation
       * trims the whitespace between them — a difference in the string, not in
       * what a screen reader says.
       */
      expect(input).toHaveAccessibleDescription(
        new RegExp(
          `^${escapeForRegExp(control.description)}\\s*From ${control.endpoints?.low ?? ''} to ${
            control.endpoints?.high ?? ''
          }\\.$`,
          'u',
        ),
      );
    }

    expect(within(panel).getAllByRole('slider')).toHaveLength(3);
  });

  it('offers the Play range, which is narrower than the parameter’s', () => {
    openPlay();

    // Complexity is 1–11 of a parameter that goes to 16; Detail 32–72 of 8–88.
    expect(slider('Complexity')).toHaveAttribute('min', '1');
    expect(slider('Complexity')).toHaveAttribute('max', '11');
    expect(slider('Scale')).toHaveAttribute('min', '5');
    expect(slider('Scale')).toHaveAttribute('max', '24');
    expect(slider('Detail')).toHaveAttribute('min', '32');
    expect(slider('Detail')).toHaveAttribute('max', '72');
    expect(slider('Detail')).toHaveAttribute('step', '1');
  });

  it('shows the values the session opened with, read out of the code', () => {
    openPlay();

    // From the source, not from the variation object: what a control shows has to
    // be what the APL says, or the two could drift without anything noticing.
    for (const [control, variable] of [
      ['Complexity', 'multiplier'],
      ['Scale', 'modulus'],
      ['Detail', 'size'],
    ] as const) {
      expect(Number(slider(control).value), control).toBe(numberAssignedTo(started?.code ?? '', variable));
    }
  });

  it('exposes Randomise, Undo, Save image and Share directly', () => {
    openPlay();
    const panel = playPanel();

    for (const name of ['Randomise', 'Save image', 'Share']) {
      expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(panel).getByRole('button', { name: /^Undo/ })).toBeInTheDocument();
  });

  it('keeps the whole technical workspace one press away, and never unmounts it', async () => {
    const { view } = openPlay();
    await drawn();

    // The disclosure that owns this summary, named through it: the controls have
    // disclosures of their own now, and the first in the document is one of those.
    const summary = screen.getByText('Code and full controls');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);

    /*
     * Rendered while closed, which is what a disclosure gives and a conditional
     * render would not: the editor is never torn down, so it never loses its own
     * undo history. That a closed disclosure also takes its contents out of the
     * tab order is the browser's doing, so it is asserted end to end — jsdom
     * applies no stylesheet and would agree with anything here.
     */
    expect(view.container.querySelector('.cm-content')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Run/ })).toBeInTheDocument();
    // Every technical control, including the parameters Play does not offer.
    // Under their own technical names, beside the Play controls' creative ones.
    expect(screen.getByLabelText('Modulus')).toBeInTheDocument();
    expect(screen.getByLabelText('Multiplier')).toBeInTheDocument();
    expect(screen.getByLabelText('Size')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset parameters' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Code and full controls'));
    expect(details?.open).toBe(true);
  });

  it('survives Focus mode, controls and all', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    await user.click(screen.getByRole('button', { name: 'Focus mode' }));

    // One element, moved by CSS rather than a second copy rendered for Focus
    // mode, so the values in it are necessarily the same ones.
    expect(playPanel()).toBeInTheDocument();
    expect(slider('Complexity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
  });
});

describe('when it is not', () => {
  it('an artwork opened from its card has no Play surface', () => {
    openPlay(null);

    expect(noPlayPanel()).toBeNull();
    expect(screen.getByText('Press Run to draw this artwork.')).toBeInTheDocument();
    // And the full workspace is in front of you, not behind a disclosure.
    expect(screen.queryByText('Code and full controls')).toBeNull();
  });

  it('a seed that is not a seed opens the ordinary workspace', () => {
    openPlay('nonsense');

    expect(noPlayPanel()).toBeNull();
  });
});

describe('a Play control', () => {
  it('rewrites the real APL, and the technical control agrees', async () => {
    openPlay();
    await drawn();

    drag('Scale', [11]);

    // The source itself, which is the only thing the artwork is drawn from.
    expect(source()).toContain('modulus←11');
    expect(slider('Scale').value).toBe('11');
    // The same parameter's own slider in the full controls below, which reads the
    // same code rather than a copy of the value.
    expect((screen.getByLabelText('Modulus') as HTMLInputElement).value).toBe('11');
  });

  it('draws once when the gesture ends, not once per step', async () => {
    const { service } = openPlay();
    await drawn();
    const before = runs(service.received);

    drag('Detail', [40, 44, 48, 52, 60]);

    await waitFor(() => expect(runs(service.received)).toBe(before + 1));
    // The last value is the one that ran, so what is drawn is where the drag
    // ended rather than where it passed through.
    expect(service.received.at(-1)).toContain('size←60');

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(runs(service.received)).toBe(before + 1);
  });

  it('asks for nothing when the gesture moved nothing', async () => {
    const { service } = openPlay();
    await drawn();
    const before = runs(service.received);

    // Focused and left, and pressed without moving: neither is a new artwork.
    fireEvent.blur(slider('Complexity'));
    fireEvent.pointerUp(slider('Complexity'));

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(runs(service.received)).toBe(before);
  });

  it('asks for nothing when a drag ends where it started', async () => {
    const { service } = openPlay();
    await drawn();
    const before = runs(service.received);
    const from = Number(slider('Detail').value);

    // Dragged away and back. The picture on screen is already this artwork, and
    // the public service should not be asked to produce it twice.
    drag('Detail', [40, 48, from]);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(runs(service.received)).toBe(before);
  });

  it('is one step back however far it was dragged', async () => {
    openPlay();
    await drawn();
    const opened = source();

    drag('Detail', [40, 44, 48, 52, 56]);
    expect(source()).toContain('size←56');

    await userEvent.setup().click(within(playPanel()).getByRole('button', { name: /^Undo/ }));

    expect(source()).toBe(opened);
  });

  it('is a step of its own each time it is picked up again', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    drag('Detail', [40, 44]);
    drag('Detail', [60, 64]);
    expect(source()).toContain('size←64');

    const undo = () => within(playPanel()).getByRole('button', { name: /^Undo/ });
    await user.click(undo());
    expect(source()).toContain('size←44');

    await user.click(undo());
    expect(source()).toBe(asRendered(started?.code ?? ''));
  });

  it('treats each key let go of as its own step', async () => {
    /*
     * A keyboard step, as the browser produces one: the value changes, then the
     * key comes up. Two presses are two things somebody did, so each is its own
     * step back — unlike one drag, which is one. That real arrow keys move a range
     * input at all is the browser's own behaviour, so it is asserted end to end
     * rather than simulated here.
     */
    const user = userEvent.setup();
    openPlay();
    await drawn();

    const input = slider('Scale');
    const from = Number(input.value);

    for (const value of [from + 1, from + 2]) {
      fireEvent.change(input, { target: { value: String(value) } });
      fireEvent.keyUp(input, { key: 'ArrowRight' });
    }

    expect(source()).toContain(`modulus←${String(from + 2)}`);

    await user.click(within(playPanel()).getByRole('button', { name: /^Undo/ }));
    expect(Number(slider('Scale').value)).toBe(from + 1);
  });
});

describe('Randomise, on the Play surface', () => {
  /** Fixes the seed the button will pick, so the variation is a known one. */
  function withFixedSeed(fraction: number): number {
    vi.spyOn(Math, 'random').mockReturnValue(fraction);
    return Math.floor(fraction * 0xffff_ffff);
  }

  it('moves to another curated variation and draws it', async () => {
    const user = userEvent.setup();
    const { service } = openPlay();
    await drawn();
    const before = runs(service.received);

    const seed = withFixedSeed(0.4242);
    const expected = generateInstantPlayVariation(modularBloom, seed, started?.recipeId);
    expect(expected).not.toBeNull();

    await user.click(within(playPanel()).getByRole('button', { name: 'Randomise' }));

    // Exactly the generator's answer, written into the source that was showing.
    expect(source()).toBe(asRendered(setParameterValues(started?.code ?? '', expected?.values ?? new Map())));
    await waitFor(() => expect(runs(service.received)).toBe(before + 1));
    vi.restoreAllMocks();
  });

  it('does not offer the recipe already on screen', () => {
    // The generator is asked to avoid it; this is that request being made with the
    // recipe the session actually opened on.
    const seeds = Array.from({ length: 40 }, (_unused, index) => index * 104_729);

    for (const seed of seeds) {
      const next = generateInstantPlayVariation(modularBloom, seed, started?.recipeId);
      expect(next?.recipeId).not.toBe(started?.recipeId);
    }
  });

  it('is one step back, code and artwork together, with nothing re-run', async () => {
    const user = userEvent.setup();
    const { service } = openPlay(String(SEED), serviceTellingArtworksApart());
    await drawn();
    const opened = source();
    const openedArtwork = screen.getByRole('img').getAttribute('aria-label');

    withFixedSeed(0.77);
    await user.click(within(playPanel()).getByRole('button', { name: 'Randomise' }));
    await waitFor(() => expect(source()).not.toBe(opened));
    await drawn();
    const afterRandomise = runs(service.received);

    // A different picture, not merely a different program: this is what makes the
    // restoration below something that can be got wrong.
    const randomisedArtwork = screen.getByRole('img').getAttribute('aria-label');
    expect(randomisedArtwork).not.toBe(openedArtwork);

    await user.click(within(playPanel()).getByRole('button', { name: /^Undo/ }));

    expect(source()).toBe(opened);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(openedArtwork);
    // The artwork came back from the history, not from the service.
    expect(runs(service.received)).toBe(afterRandomise);
    vi.restoreAllMocks();
  });

  it('keeps the new seed for sharing', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    const seed = withFixedSeed(0.1234);
    await user.click(within(playPanel()).getByRole('button', { name: 'Randomise' }));
    vi.restoreAllMocks();

    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (written: string) => {
          copied = written;
          return Promise.resolve();
        },
      },
    });

    await user.click(within(playPanel()).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(copied).not.toBe(''));

    const shared = decodeShareState(new URL(copied).hash.split('?s=')[1] ?? '');
    expect(shared.ok).toBe(true);
    expect(shared.ok ? shared.state.seed : null).toBe(seed);
    // The seed and the source in one link describe one artwork.
    expect(asRendered(shared.ok ? shared.state.code : '')).toBe(source());
  });

  it('puts the previous seed back when it is undone', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    withFixedSeed(0.31);
    await user.click(within(playPanel()).getByRole('button', { name: 'Randomise' }));
    vi.restoreAllMocks();
    await user.click(within(playPanel()).getByRole('button', { name: /^Undo/ }));

    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (written: string) => {
          copied = written;
          return Promise.resolve();
        },
      },
    });

    await user.click(within(playPanel()).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(copied).not.toBe(''));

    // The seed the session opened with, because that is what produced the artwork
    // on screen again. A link claiming the undone seed would describe something
    // nobody is looking at.
    const shared = decodeShareState(new URL(copied).hash.split('?s=')[1] ?? '');
    expect(shared.ok ? shared.state.seed : null).toBe(SEED);
  });
});

describe('Undo', () => {
  it('offers nothing at the start of a session, and says what it would take back', async () => {
    openPlay();
    await drawn();

    const undo = () => within(playPanel()).getByRole('button', { name: /^Undo/ });
    expect(undo()).toBeDisabled();
    expect(undo()).toHaveAccessibleName('Undo');

    drag('Scale', [11]);
    expect(undo()).toBeEnabled();
    // Named after the control in the preset's words, not after the variable.
    expect(undo()).toHaveAccessibleName('Undo Scale');
  });

  it('names Randomise when that is what it would take back', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await user.click(within(playPanel()).getByRole('button', { name: 'Randomise' }));
    vi.restoreAllMocks();

    expect(within(playPanel()).getByRole('button', { name: /^Undo/ })).toHaveAccessibleName('Undo Randomise');
  });

  it('runs out, and is disabled again when it does', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    drag('Scale', [11]);
    drag('Detail', [44]);

    const undo = () => within(playPanel()).getByRole('button', { name: /^Undo/ });
    await user.click(undo());
    await user.click(undo());

    expect(source()).toBe(asRendered(started?.code ?? ''));
    expect(undo()).toBeDisabled();
  });
});

describe('what Undo may and may not reach', () => {
  const undo = () => within(playPanel()).getByRole('button', { name: /^Undo/ });

  /** A session with one Play gesture behind it, so there is something to lose. */
  async function withAGestureBehindIt() {
    const opened = openPlay();
    await drawn();
    const before = source();

    drag('Scale', [11]);
    expect(undo()).toBeEnabled();

    return { ...opened, before };
  }

  it('opening the code and full controls costs nothing', async () => {
    const { before } = await withAGestureBehindIt();

    fireEvent.click(screen.getByText('Code and full controls'));

    // Reading the workspace is not changing the artwork.
    expect(undo()).toBeEnabled();
    await userEvent.setup().click(undo());
    expect(source()).toBe(before);
  });

  it('nor does putting the caret in the editor', async () => {
    const { view } = await withAGestureBehindIt();

    fireEvent.click(screen.getByText('Code and full controls'));
    const editor = view.container.querySelector('.cm-content') as HTMLElement;
    editor.focus();
    fireEvent.focus(editor);

    expect(undo()).toBeEnabled();
  });

  it('nor does recolouring, or running the artwork again', async () => {
    const { service, before } = await withAGestureBehindIt();
    const user = userEvent.setup();

    await user.click(screen.getByRole('checkbox', { name: /Invert palette/ }));
    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(runs(service.received)).toBeGreaterThan(2));

    expect(undo()).toBeEnabled();
    await user.click(undo());
    expect(source()).toBe(before);
  });

  it('nor does saving the image or sharing the link', async () => {
    await withAGestureBehindIt();
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });

    await user.click(within(playPanel()).getByRole('button', { name: 'Save image' }));
    await user.click(within(playPanel()).getByRole('button', { name: 'Share' }));

    expect(undo()).toBeEnabled();
  });

  it('but a technical control does, rather than undoing past it', async () => {
    /*
     * The Modulus slider writes the same line the Scale control does, and nothing
     * records it. Stepping back would restore a program from before it and discard
     * it in silence, so the offer is withdrawn instead.
     */
    await withAGestureBehindIt();

    fireEvent.change(screen.getByLabelText('Modulus'), { target: { value: '13' } });

    expect(source()).toContain('modulus←13');
    expect(undo()).toBeDisabled();
    expect(undo()).toHaveAccessibleName('Undo');
  });

  it('and so does a Reset, which cannot be stepped back over', async () => {
    const user = userEvent.setup();
    await withAGestureBehindIt();

    await user.click(screen.getByRole('button', { name: 'Reset parameters' }));

    // The preset's own values, and no way back to a session that is gone.
    expect(source()).toBe(asRendered(modularBloom.code));
    expect(undo()).toBeDisabled();
  });

  it('and a Play control afterwards starts a fresh sequence', async () => {
    const user = userEvent.setup();
    await withAGestureBehindIt();

    fireEvent.change(screen.getByLabelText('Modulus'), { target: { value: '13' } });
    expect(undo()).toBeDisabled();

    drag('Detail', [64]);
    expect(undo()).toBeEnabled();

    // One step back reaches the technical change, which is where the source stood
    // when this sequence began — never past it.
    await user.click(undo());
    expect(source()).toContain('modulus←13');
    expect(source()).not.toContain('size←64');
    expect(undo()).toBeDisabled();
  });
});

describe('what a control says about the code', () => {
  /** The disclosure belonging to one control, found through its own action. */
  const peekFor = (label: string) =>
    screen.getByRole('button', { name: `Edit the APL for ${label}` }).closest('details') as HTMLElement;

  const assignmentFor = (label: string, variable: string) =>
    within(peekFor(label)).getByText(new RegExp(`^${variable}←`, 'u')).textContent;

  it('names the variable and the assignment the source currently makes', async () => {
    openPlay();
    await drawn();

    expect(peekFor('Complexity')).toHaveTextContent('Changes multiplier in the APL.');
    for (const [label, variable] of [
      ['Complexity', 'multiplier'],
      ['Scale', 'modulus'],
      ['Detail', 'size'],
    ] as const) {
      // The value the session opened on, read from its source rather than from
      // the configuration the session was built from.
      expect(assignmentFor(label, variable), label).toBe(
        `${variable}←${String(numberAssignedTo(started?.code ?? '', variable))}`,
      );
    }
  });

  it('follows a Play control as it is moved', async () => {
    openPlay();
    await drawn();

    drag('Scale', [11]);

    expect(assignmentFor('Scale', 'modulus')).toBe('modulus←11');
  });

  it('follows Randomise', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    const seed = Math.floor(0.4242 * 0xffff_ffff);
    const expected = generateInstantPlayVariation(modularBloom, seed, started?.recipeId);
    vi.spyOn(Math, 'random').mockReturnValue(0.4242);
    await user.click(within(playPanel()).getByRole('button', { name: 'Randomise' }));
    vi.restoreAllMocks();

    // The value the generator chose, named by the disclosure — which is the same
    // number the source now holds, since the source is where it read it.
    for (const [label, variable] of [
      ['Complexity', 'multiplier'],
      ['Scale', 'modulus'],
      ['Detail', 'size'],
    ] as const) {
      expect(assignmentFor(label, variable), label).toBe(
        `${variable}←${String(expected?.values.get(variable))}`,
      );
    }
  });

  it('follows Undo back', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();
    const opened = assignmentFor('Scale', 'modulus');

    drag('Scale', [11]);
    expect(assignmentFor('Scale', 'modulus')).toBe('modulus←11');

    await user.click(within(playPanel()).getByRole('button', { name: /^Undo/ }));

    expect(assignmentFor('Scale', 'modulus')).toBe(opened);
  });
});

describe('Edit the APL', () => {
  const editAction = (label: string) => screen.getByRole('button', { name: `Edit the APL for ${label}` });

  it('opens the technical workspace and puts the caret in the editor', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    const details = screen.getByText('Code and full controls').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);

    await user.click(editAction('Scale'));

    expect(details.open).toBe(true);
    // Focus lands in the editor, not on the button that opened it: the point of
    // the action is to be somewhere you can type.
    expect(document.activeElement?.className).toContain('cm-content');
  });

  it('changes nothing: not the source, not the artwork, not the history', async () => {
    const user = userEvent.setup();
    const { service } = openPlay();
    await drawn();

    drag('Scale', [11]);
    const before = { code: source(), runs: runs(service.received) };
    const artwork = screen.getByRole('img').getAttribute('aria-label');

    await user.click(editAction('Detail'));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(source()).toBe(before.code);
    expect(runs(service.received)).toBe(before.runs);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(artwork);
    // And the step back is still there to take, which is the one somebody would
    // most expect to lose by opening the code.
    const undo = within(playPanel()).getByRole('button', { name: /^Undo/ });
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(source()).toBe(asRendered(started?.code ?? ''));
  });

  it('can be pressed again for another control', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    await user.click(editAction('Complexity'));
    await user.click(editAction('Detail'));

    // Nothing latched: a second request is honoured like the first.
    expect(document.activeElement?.className).toContain('cm-content');
    expect(source()).toBe(asRendered(started?.code ?? ''));
  });

  it('is offered by every control, and only inside a session', async () => {
    openPlay();
    await drawn();
    expect(screen.getAllByRole('button', { name: /^Edit the APL/ })).toHaveLength(3);

    cleanup();

    openPlay(null);
    expect(screen.queryByRole('button', { name: /^Edit the APL/ })).toBeNull();
    expect(screen.queryByText('How this changes the APL')).toBeNull();
  });
});

describe('Save image', () => {
  it('waits until there is an artwork to save', async () => {
    // Nothing has been drawn on arrival for a heartbeat, so the button says so by
    // being unavailable rather than by failing when pressed.
    openPlay();
    const save = () => within(playPanel()).getByRole('button', { name: 'Save image' });
    expect(save()).toBeDisabled();

    await drawn();
    expect(save()).toBeEnabled();
  });
});

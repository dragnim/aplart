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
import { colour, selectedPalette } from '../helpers/workspaceModes';

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
/**
 * Randomise, Undo and Reset.
 *
 * Beneath the editing modes rather than inside the curated controls: they belong
 * to the artwork, not to one way of changing it, so they stay put as the tab
 * changes. Tests reach them here rather than through the Create panel, which is
 * where they used to live.
 */
const sessionActions = () => screen.getByRole('group', { name: 'Artwork actions' });

/**
 * Chooses an editing mode, as somebody pressing its icon would.
 *
 * The panel behind every other tab is `hidden`, so its controls are out of the
 * accessibility tree and a role query will not find them — which is exactly what
 * should happen, and why a test that wants a technical control now says which
 * mode it is in first.
 */
const chooseTab = (name: 'Create' | 'Colour' | 'Advanced' | 'Code') => {
  fireEvent.click(screen.getByRole('tab', { name }));
};
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

/**
 * The program the editor holds, assembled from its line elements.
 *
 * Read from the document rather than through a role query, because the editor
 * now lives in a tab panel: while another mode is showing, that panel is hidden
 * and therefore absent from the accessibility tree — correctly so. The source is
 * a fact about the workspace whichever mode happens to be on screen, which is the
 * whole point of there being only one of it.
 */
const source = () =>
  [...(document.querySelector('.cm-content')?.querySelectorAll('.cm-line') ?? [])]
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

  it('exposes Randomise, Undo and Reset directly, in every mode', () => {
    openPlay();

    for (const mode of ['Create', 'Colour', 'Advanced', 'Code'] as const) {
      chooseTab(mode);
      const actions = sessionActions();

      for (const name of ['Randomise', 'Reset']) {
        expect(within(actions).getByRole('button', { name }), `${name} in ${mode}`).toBeInTheDocument();
      }
      expect(within(actions).getByRole('button', { name: /^Undo/ }), `Undo in ${mode}`).toBeInTheDocument();
    }

    const actions = within(sessionActions());

    // Run is not among them: it means "run this source", which is a Code idea.
    expect(actions.queryByRole('button', { name: /^Run/ })).toBeNull();

    /*
     * And neither is Share nor Save image, which used to be here.
     *
     * Share belongs to the artwork as an output and is in the toolbar above,
     * where Export is; offering it in both places made two of these four
     * duplicates of controls already on screen. Save image is gone altogether —
     * it called the same function Export calls, at a fixed 1024 pixels and with
     * no say over the size, the caption or the composition.
     */
    expect(actions.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(actions.queryByRole('button', { name: 'Save image' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save image' })).toBeNull();
  });

  it('puts Focus mode, Share and Export in the toolbar, and nothing else', () => {
    openPlay();

    const toolbar = screen.getByRole('link', { name: /Gallery/ }).closest('div')?.parentElement;
    expect(toolbar).not.toBeNull();

    const named = within(toolbar as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());
    expect(named).toEqual(['Focus mode', 'Share', 'Export']);
  });

  it('keeps the whole technical workspace one press away, and never unmounts it', async () => {
    const { view } = openPlay();
    await drawn();

    const panelFor = (name: string) =>
      view.container.querySelector(`#editor-panel-${name}`) as HTMLElement | null;

    // Create is where a session opens, and the only panel on show.
    expect(screen.getByRole('tab', { name: 'Create' })).toHaveAttribute('aria-selected', 'true');
    expect(panelFor('code')?.hidden).toBe(true);

    /*
     * Rendered while hidden, which is what `hidden` gives and a conditional render
     * would not: the editor is never torn down, so it never loses its own undo
     * history. That a hidden panel also leaves the tab order is the browser's
     * doing, so it is asserted end to end — jsdom applies no stylesheet and would
     * agree with anything here.
     */
    expect(view.container.querySelector('.cm-content')).not.toBeNull();

    // Every technical control, including the parameters Create does not offer,
    // under their own technical names — one mode away rather than a page away.
    chooseTab('Advanced');
    expect(screen.getByLabelText('Modulus')).toBeInTheDocument();
    expect(screen.getByLabelText('Multiplier')).toBeInTheDocument();
    expect(screen.getByLabelText('Size')).toBeInTheDocument();

    /*
     * And no Randomise or Reset parameters of its own.
     *
     * Advanced used to carry both, beside a persistent row offering the same two
     * words — and they were not even the same actions: this Randomise drew from
     * the raw parameter ranges while that one draws from the curated recipes.
     * One artwork, one Randomise, one Reset, in the row that belongs to the
     * artwork rather than to one way of editing it.
     */
    expect(screen.queryByRole('button', { name: 'Reset parameters' })).toBeNull();
    expect(
      within(screen.getByRole('tabpanel', { name: 'Advanced' })).queryByRole('button', { name: 'Randomise' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    expect(screen.getByRole('button', { name: /^Run/ })).toBeInTheDocument();
    expect(panelFor('code')?.hidden).toBe(false);
    expect(panelFor('create')?.hidden).toBe(true);
    // The same editor as before the tab changed, not a second one.
    expect(view.container.querySelectorAll('.cm-content')).toHaveLength(1);
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

/*
 * There used to be two workspaces, and this block asked which one you got.
 *
 * There is one now. What the seed decides is no longer the interface but the
 * artwork: with a seed you are given a curated variation, without one you get
 * the preset as it ships — or whatever you last left on it. So these ask what
 * actually differs.
 */
describe('opening the same artwork without a seed', () => {
  it('uses the same workspace, with the same modes', () => {
    openPlay(null);

    expect(screen.getByRole('tab', { name: 'Create' })).toBeInTheDocument();
    for (const mode of ['Colour', 'Animate', 'Advanced', 'Code']) {
      expect(screen.getByRole('tab', { name: mode }), mode).toBeInTheDocument();
    }
    // Create is where an artwork with curated controls opens.
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'Create');
  });

  it('shows the preset’s own code, not a variation of it', () => {
    openPlay(null);

    // Without a seed there is no session, so the code is the preset's. It still
    // draws itself on arrival, as every workspace does.
    expect(source()).toBe(asRendered(modularBloom.code));
  });

  it('and a seed that is not a seed is the same as no seed at all', () => {
    openPlay('nonsense');

    expect(source()).toBe(asRendered(modularBloom.code));
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

    await userEvent.setup().click(within(sessionActions()).getByRole('button', { name: /^Undo/ }));

    expect(source()).toBe(opened);
  });

  it('is a step of its own each time it is picked up again', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    drag('Detail', [40, 44]);
    drag('Detail', [60, 64]);
    expect(source()).toContain('size←64');

    const undo = () => within(sessionActions()).getByRole('button', { name: /^Undo/ });
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

    await user.click(within(sessionActions()).getByRole('button', { name: /^Undo/ }));
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

    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));

    // Exactly the generator's answer, written into the source that was showing.
    expect(source()).toBe(asRendered(setParameterValues(started?.code ?? '', expected?.values ?? new Map())));
    await waitFor(() => expect(runs(service.received)).toBe(before + 1));
    vi.restoreAllMocks();
  });

  it('recolours as well as reshapes, because a new artwork is a new artwork', async () => {
    /*
     * Randomise used to change the numbers and leave the palette, so a dozen
     * presses produced a dozen pictures that all looked like relations. Colour is
     * most of what an artwork looks like from across a room.
     */
    const user = userEvent.setup();
    openPlay();
    await drawn();

    const before = selectedPalette();
    withFixedSeed(0.4242);
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));

    expect(selectedPalette()).not.toBe(before);
    vi.restoreAllMocks();
  });

  it('takes the shape and the colour back together, in one press', async () => {
    // Two commits, one thing somebody did. Undo must not need pressing twice.
    const user = userEvent.setup();
    openPlay(String(SEED), serviceTellingArtworksApart());
    await drawn();

    const openedCode = source();
    const openedPalette = selectedPalette();

    withFixedSeed(0.77);
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));
    await waitFor(() => expect(source()).not.toBe(openedCode));
    expect(selectedPalette()).not.toBe(openedPalette);
    await drawn();

    await user.click(within(sessionActions()).getByRole('button', { name: /^Undo/ }));

    expect(source()).toBe(openedCode);
    expect(selectedPalette()).toBe(openedPalette);
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
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));
    await waitFor(() => expect(source()).not.toBe(opened));
    await drawn();
    const afterRandomise = runs(service.received);

    // A different picture, not merely a different program: this is what makes the
    // restoration below something that can be got wrong.
    const randomisedArtwork = screen.getByRole('img').getAttribute('aria-label');
    expect(randomisedArtwork).not.toBe(openedArtwork);

    await user.click(within(sessionActions()).getByRole('button', { name: /^Undo/ }));

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
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));
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

    // Share is a toolbar action now: it acts on the artwork as an output.
    await user.click(screen.getByRole('button', { name: 'Share' }));
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
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));
    vi.restoreAllMocks();
    await user.click(within(sessionActions()).getByRole('button', { name: /^Undo/ }));

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

    // Share is a toolbar action now: it acts on the artwork as an output.
    await user.click(screen.getByRole('button', { name: 'Share' }));
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

    const undo = () => within(sessionActions()).getByRole('button', { name: /^Undo/ });
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
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));
    vi.restoreAllMocks();

    expect(within(sessionActions()).getByRole('button', { name: /^Undo/ })).toHaveAccessibleName(
      'Undo Randomise',
    );
  });

  it('runs out, and is disabled again when it does', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    drag('Scale', [11]);
    drag('Detail', [44]);

    const undo = () => within(sessionActions()).getByRole('button', { name: /^Undo/ });
    await user.click(undo());
    await user.click(undo());

    expect(source()).toBe(asRendered(started?.code ?? ''));
    expect(undo()).toBeDisabled();
  });
});

describe('what Undo may and may not reach', () => {
  const undo = () => within(sessionActions()).getByRole('button', { name: /^Undo/ });

  /** A session with one Play gesture behind it, so there is something to lose. */
  async function withAGestureBehindIt() {
    const opened = openPlay();
    await drawn();
    const before = source();

    drag('Scale', [11]);
    expect(undo()).toBeEnabled();

    return { ...opened, before };
  }

  it('changing editing mode costs nothing', async () => {
    const { before } = await withAGestureBehindIt();

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));

    // Reading the workspace is not changing the artwork.
    expect(undo()).toBeEnabled();
    await userEvent.setup().click(undo());
    expect(source()).toBe(before);
  });

  it('nor does putting the caret in the editor', async () => {
    const { view } = await withAGestureBehindIt();

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    const editor = view.container.querySelector('.cm-content') as HTMLElement;
    editor.focus();
    fireEvent.focus(editor);

    expect(undo()).toBeEnabled();
  });

  it('and running the artwork again reaches the gesture behind it', async () => {
    const { service, before } = await withAGestureBehindIt();
    const user = userEvent.setup();
    // The gesture's own run has to land first, or the button says Stop.
    await waitFor(() => expect(runs(service.received)).toBeGreaterThan(1));

    chooseTab('Code');
    await user.click(await screen.findByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(runs(service.received)).toBeGreaterThan(2));

    expect(undo()).toBeEnabled();
    await user.click(undo());
    expect(source()).toBe(before);
  });

  it('recolouring is itself a step back, and leaves the source alone', async () => {
    await withAGestureBehindIt();
    const user = userEvent.setup();
    const afterGesture = source();

    /*
     * Undo is one button, so it answers for the last thing somebody changed —
     * and after inverting a palette that is the palette. Appearance travels in
     * the same history as the source rather than a second one of its own, which
     * is why a step back here restores the colour and leaves the slider alone.
     */
    chooseTab('Colour');
    const invert = () => colour().getByRole('checkbox', { name: /Invert palette/ }) as HTMLInputElement;

    await user.click(invert());
    expect(invert().checked).toBe(true);
    expect(undo()).toHaveAccessibleName('Undo Invert');

    await user.click(undo());
    expect(invert().checked).toBe(false);
    // The recolour never touched the program, so undoing it does not either —
    // and the gesture before it is still there to step back to.
    expect(source()).toBe(afterGesture);
    expect(undo()).toBeEnabled();
  });

  it('nor does sharing the link', async () => {
    // Save image used to be tested here beside Share. It has gone: Export does
    // the same thing with the choices it was missing, and the two of them being
    // separate controls for one act was the reason to remove it.
    await withAGestureBehindIt();
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });

    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(undo()).toBeEnabled();
  });

  it('and a technical control is a step of its own, not the end of the history', async () => {
    /*
     * The Modulus slider writes the same line the Scale control does, so in a
     * session it is recorded the same way. It used to invalidate the history
     * instead — the only honest answer while nothing recorded it, and the reason
     * the two panels could not sit together: one offered Undo and the other took
     * it away.
     */
    await withAGestureBehindIt();
    const user = userEvent.setup();
    const afterGesture = source();

    chooseTab('Advanced');
    const modulus = screen.getByLabelText('Modulus');
    fireEvent.change(modulus, { target: { value: '13' } });
    fireEvent.pointerUp(modulus);

    expect(source()).toContain('modulus←13');
    expect(undo()).toBeEnabled();
    expect(undo()).toHaveAccessibleName('Undo Modulus');

    await user.click(undo());
    expect(source()).toBe(afterGesture);
    // And the gesture before it is still there to step back to.
    expect(undo()).toBeEnabled();
  });

  it('and a Reset can now be stepped back over, which it could not before', async () => {
    /*
     * The one assertion in this file whose meaning is the opposite of what it
     * was, and deliberately so.
     *
     * Reset used to write the preset's values through the uncommitted path,
     * which discarded the history — so it was true that nothing could step back
     * over it, and it was why the action needed a confirmation dialog warning
     * that it could not be undone. It is now a recorded action like any other:
     * it takes one snapshot of the artwork as it stood, replaces source, seed
     * and appearance together, and draws the result. The dialog went with it.
     */
    const user = userEvent.setup();
    await withAGestureBehindIt();
    const beforeReset = source();

    await user.click(within(sessionActions()).getByRole('button', { name: 'Reset' }));

    expect(source()).toBe(asRendered(modularBloom.code));
    expect(undo()).toBeEnabled();
    expect(undo()).toHaveAccessibleName('Undo Reset');

    await user.click(undo());
    expect(source()).toBe(beforeReset);
  });

  it('and Reset redraws the artwork without waiting for Run', async () => {
    const { service } = openPlay(String(SEED));
    await drawn();

    const drawnRuns = runs(service.received);
    fireEvent.click(within(sessionActions()).getByRole('button', { name: 'Reset' }));

    // The preset's own source, submitted in the same breath it was restored.
    await waitFor(() => expect(runs(service.received)).toBe(drawnRuns + 1));
    expect(service.received.at(-1)).toContain('multiplier←1');
  });

  it('and a Create control afterwards continues the same history', async () => {
    const user = userEvent.setup();
    await withAGestureBehindIt();

    chooseTab('Advanced');
    const modulus = screen.getByLabelText('Modulus');
    fireEvent.change(modulus, { target: { value: '13' } });
    fireEvent.pointerUp(modulus);

    chooseTab('Create');
    drag('Detail', [64]);
    expect(undo()).toBeEnabled();

    // One step back reaches the technical change, which is where the source stood
    // when this sequence began — and another reaches past it, because both kinds
    // of control now record.
    await user.click(undo());
    expect(source()).toContain('modulus←13');
    expect(source()).not.toContain('size←64');
    expect(undo()).toBeEnabled();
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
    await user.click(within(sessionActions()).getByRole('button', { name: 'Randomise' }));
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

    await user.click(within(sessionActions()).getByRole('button', { name: /^Undo/ }));

    expect(assignmentFor('Scale', 'modulus')).toBe(opened);
  });
});

describe('Edit the APL', () => {
  const editAction = (label: string) => screen.getByRole('button', { name: `Edit the APL for ${label}` });

  it('selects the Code mode and puts the caret in the editor', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    const codeTab = () => screen.getByRole('tab', { name: 'Code' });
    expect(codeTab()).toHaveAttribute('aria-selected', 'false');

    await user.click(editAction('Scale'));

    // The panel changes mode; the artwork beside it does not move, and no page
    // has been left. Peek and edit are the same place now.
    expect(codeTab()).toHaveAttribute('aria-selected', 'true');
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
    const undo = within(sessionActions()).getByRole('button', { name: /^Undo/ });
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(source()).toBe(asRendered(started?.code ?? ''));
  });

  it('can be pressed again for another control', async () => {
    const user = userEvent.setup();
    openPlay();
    await drawn();

    await user.click(editAction('Complexity'));
    // Back to Create for the second one: the first press moved the panel to Code,
    // and a control that is not on show cannot be pressed — which is the point of
    // the modes, and the reason this is worth asserting rather than assuming.
    chooseTab('Create');
    await user.click(editAction('Detail'));

    // Nothing latched: a second request is honoured like the first.
    expect(document.activeElement?.className).toContain('cm-content');
    expect(source()).toBe(asRendered(started?.code ?? ''));
  });

  it('is offered by every curated control, seed or no seed', async () => {
    /*
     * It used to be "only inside a session", because Create only existed when a
     * seed had opened the workspace. Create is a property of the artwork now —
     * Modular Bloom has curated controls whether you arrived by a seeded link or
     * from its card — so the disclosure is there either way. What the seed
     * decides is the values, not the controls.
     */
    openPlay();
    await drawn();
    expect(
      within(screen.getByRole('tabpanel', { name: 'Create' })).getAllByRole('button', {
        name: /^Edit the APL/,
      }),
    ).toHaveLength(3);

    cleanup();

    openPlay(null);
    expect(
      within(screen.getByRole('tabpanel', { name: 'Create' })).getAllByRole('button', {
        name: /^Edit the APL/,
      }),
    ).toHaveLength(3);
  });
});

/*
 * "Save image" had a describe block of its own here, asserting that it waited
 * until there was an artwork to save. The control is gone — Export does the same
 * thing and offers the size, caption and composition it never did — so the
 * behaviour it described belongs to Export, which has its own coverage in
 * `tests/e2e/studio.spec.ts`. Its absence from the session actions is asserted
 * at the top of this file, where the row is described.
 */

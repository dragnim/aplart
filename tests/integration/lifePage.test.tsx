/**
 * The immersive page, driven the way somebody drives it.
 *
 * The rules themselves are proved in `lifeEngine.test.ts` against known
 * creatures; what is checked here is the experience around them — that the world
 * is already running when the page opens, that the controls do what they say,
 * and above all that opening the APL does not restart the thing it is describing.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifePage } from '@/life/LifePage';

/** The generation and population the canvas reports about itself. */
function readout(): { generation: number; alive: number } {
  const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
  const generation = /Generation (\d+)/u.exec(label)?.[1] ?? '0';
  const alive = /(\d+) living cells/u.exec(label)?.[1] ?? '0';
  return { generation: Number(generation), alive: Number(alive) };
}

let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  // The resize tests below move the window, and a world is sized from it — so
  // every test starts from the same one rather than from whatever ran last.
  window.innerWidth = 1024;
  window.innerHeight = 768;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // jsdom has no canvas; the page must survive that rather than throw.
  HTMLCanvasElement.prototype.getContext = () => null;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

describe('opening the page', () => {
  it('arrives at five cells, already running', () => {
    render(<LifePage />);

    // No Run, no empty canvas, no form: the address was the whole request.
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    // Small on purpose. What makes the page is what these five turn into.
    expect(readout()).toEqual({ generation: 0, alive: 5 });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('describes itself for somebody who cannot see it', () => {
    render(<LifePage />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      /Conway's Game of Life on a \d+ by \d+ toroidal grid/u,
    );
  });

  it('offers Steady by default, and names the fastest speed Godspeed You!', () => {
    render(<LifePage />);

    const speed = screen.getByLabelText('Speed');
    expect(speed).toHaveValue('steady');
    expect(within(speed).getByRole('option', { name: 'Godspeed You!' })).toBeInTheDocument();
  });

  it('opens in Sunset, with the other palettes still on offer', () => {
    render(<LifePage />);

    const palette = screen.getByLabelText('Palette');
    expect(palette).toHaveValue('sunset');
    expect(within(palette).getAllByRole('option').length).toBeGreaterThan(4);
  });

  it('credits the formulation on the bar without making a fuss of it', () => {
    render(<LifePage />);

    // In the bar, where it is always visible. The drawer carries the same line
    // and is mounted while closed, so the query says which one it means.
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('APL formulation by John Scholes')).toBeInTheDocument();
  });
});

describe('reduced motion', () => {
  it('opens on a world that has already grown, and holds it still', () => {
    reducedMotion = true;
    render(<LifePage />);

    /*
     * Five motionless cells would be a picture of nothing. Somebody who has
     * asked not to be moved at gets the state everybody else watches arrive —
     * the same seed, wound on, and then left alone.
     */
    const opening = readout();
    expect(opening.generation).toBe(400);
    // How many survive depends on how big the window is — jsdom's is small, and
    // a small torus meets its own debris sooner. What matters is that it grew.
    expect(opening.alive).toBeGreaterThan(40);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});

describe('the controls', () => {
  it('steps one generation at a time, and only when asked', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    const before = readout();

    await user.click(screen.getByRole('button', { name: 'Step' }));
    expect(readout().generation).toBe(before.generation + 1);

    await user.click(screen.getByRole('button', { name: 'Step' }));
    expect(readout().generation).toBe(before.generation + 2);
  });

  it('plays and pauses, and says which it is doing', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('empties the world when cleared, and leaves it empty', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(readout().alive).toBe(0);

    /*
     * An empty world is an authentic state, and the page must sit in it rather
     * than reseeding itself to have something to show. Stepping an empty world
     * advances the clock and nothing else.
     */
    await user.click(screen.getByRole('button', { name: 'Step' }));
    await user.click(screen.getByRole('button', { name: 'Step' }));
    expect(readout().alive).toBe(0);
    expect(readout().generation).toBeGreaterThan(0);
  });

  it('fills it again with something chaotic when randomised', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Randomise' }));

    // The opposite of the opening, which is the point of offering both: a
    // screenful of noise rather than five cells with somewhere to go.
    expect(readout().alive).toBeGreaterThan(500);
  });

  it('puts the seed back when reset', async () => {
    const user = userEvent.setup();
    render(<LifePage />);
    const opening = readout().alive;

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(readout().alive).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(readout().alive).toBe(opening);
  });
});

describe('resizing the window', () => {
  /** The grid the canvas says it is, which is the world's own shape. */
  function shape(): string {
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    return /on a (\d+ by \d+) toroidal grid/u.exec(label)?.[1] ?? '';
  }

  const resizeTo = (width: number, height: number) => {
    window.innerWidth = width;
    window.innerHeight = height;
    fireEvent(window, new Event('resize'));
  };

  it('leaves the running world exactly as it was', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    for (let step = 0; step < 40; step += 1) fireEvent.keyDown(window, { key: '.' });

    const before = { shape: shape(), ...readout() };
    expect(before.alive).toBeGreaterThan(5);

    /*
     * The point of the whole model. Dragging a corner used to reshape the grid,
     * which deleted every cell outside the new rectangle and changed the torus
     * those cells were living on — a window doing arithmetic on a universe.
     */
    resizeTo(640, 480);
    expect(shape()).toBe(before.shape);
    expect(readout()).toEqual({ generation: before.generation, alive: before.alive });

    resizeTo(2560, 1440);
    expect(shape()).toBe(before.shape);
    expect(readout()).toEqual({ generation: before.generation, alive: before.alive });
  });

  it('gives a new run the size of the window it is started in', async () => {
    const user = userEvent.setup();
    render(<LifePage />);
    const opening = shape();

    // A resize alone changes nothing...
    resizeTo(2560, 1440);
    expect(shape()).toBe(opening);

    // ...but the next run is entitled to fit the window it begins in.
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(shape()).not.toBe(opening);
    expect(readout()).toEqual({ generation: 0, alive: 5 });
  });
});

describe('hiding the interface', () => {
  it('takes the whole interface away and leaves one way back', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Hide controls' }));

    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View APL' })).toBeNull();
    // `hidden: true` because a hidden bar is gone from the accessibility tree
    // too, which is the point — this is asserting it is still in the document.
    expect(screen.getByRole('banner', { hidden: true })).not.toBeVisible();

    // Small, but present, named, and reachable by keyboard.
    const back = screen.getByRole('button', { name: 'Show controls' });
    await user.click(back);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('toggles on H, and leaves the world entirely alone', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.keyDown(window, { key: '.' });
    const before = readout();

    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    // Hiding the chrome is not a simulation event: no step, no reset, no pause.
    expect(readout()).toEqual(before);

    fireEvent.keyDown(window, { key: 'h' });
    // Still paused, so still offering Play — the interface came back as it was.
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(readout()).toEqual(before);
  });

  it('brings the interface back on Escape, for somebody who has lost it', () => {
    render(<LifePage />);

    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('plays and pauses on space, and steps on a full stop', () => {
    render(<LifePage />);

    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    const before = readout().generation;
    fireEvent.keyDown(window, { key: '.' });
    expect(readout().generation).toBe(before + 1);

    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

describe('editing the world', () => {
  it('brings a cell to life where it is pressed, and pauses to let you draw', () => {
    render(<LifePage />);
    const canvas = screen.getByRole('img');

    // jsdom lays nothing out, so the canvas is told where it is.
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 340, height: 200 }) as DOMRect;

    const before = readout().alive;
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, button: 0, pointerId: 1 });

    // Drawing on a moving world fights back, so the stroke pauses it.
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(readout().alive).not.toBe(before);
  });
});

describe('View APL', () => {
  it('opens over the world without restarting it, and closes back to it', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Step' }));
    const before = readout();

    await user.click(screen.getByRole('button', { name: 'View APL' }));
    const panel = screen.getByRole('dialog', { name: /APL behind this artwork/u });
    expect(panel).toBeVisible();

    /*
     * The whole point of the drawer. A panel that reset the world would make the
     * code look like a description of something that had just stopped.
     */
    expect(readout()).toEqual(before);

    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(readout()).toEqual(before);
  });

  it('shows the formulation it credits, and offers to copy it', async () => {
    const user = userEvent.setup();
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied = text;
          return Promise.resolve();
        },
      },
    });

    render(<LifePage />);
    await user.click(screen.getByRole('button', { name: 'View APL' }));
    const panel = screen.getByRole('dialog', { name: /APL behind this artwork/u });

    // The expression itself, not a description of it.
    expect(panel).toHaveTextContent('life←{↑1 ⍵∨.∧3 4=+/,¯1 0 1∘.⊖¯1 0 1∘.⌽⊂⍵}');

    await user.click(within(panel).getByRole('button', { name: 'Copy APL' }));
    await waitFor(() => expect(copied).toContain('life←{'));
    expect(await within(panel).findByText('APL copied.')).toBeInTheDocument();
  });

  it('states Conway’s rules, and does not claim Life wraps', async () => {
    /*
     * Two separate claims, and the panel is what teaches somebody the
     * difference: B3/S23 is Conway's Game of Life, while the torus is this
     * implementation's boundary, chosen to match the expression above it.
     */
    const user = userEvent.setup();
    render(<LifePage />);
    await user.click(screen.getByRole('button', { name: 'View APL' }));
    const panel = screen.getByRole('dialog', { name: /APL behind this artwork/u });

    expect(panel).toHaveTextContent(/three living neighbours is born/u);
    expect(panel).toHaveTextContent(/two or three survives/u);
    expect(panel).toHaveTextContent(/rules say nothing about edges/u);
    // Attributed to the formulation being shown, not to Life in general.
    expect(panel).toHaveTextContent(/Scholes’s rotations make opposite edges adjacent/u);
    // And the colour is declared to be only a way of seeing.
    expect(panel).toHaveTextContent(/never changes what happens next/u);
  });

  it('says what is executing, without implying APL runs every frame', async () => {
    /*
     * The honesty of the whole demo sits in these two sentences. A visitor
     * watching forty-eight generations a second could reasonably assume they
     * were watching APL interpreted frame by frame; the panel has to say
     * otherwise, and has to say that "equivalent" was checked rather than
     * asserted — `tests/live/life.test.ts` is the check it is referring to.
     */
    const user = userEvent.setup();
    render(<LifePage />);
    await user.click(screen.getByRole('button', { name: 'View APL' }));
    const panel = screen.getByRole('dialog', { name: /APL behind this artwork/u });

    expect(panel).toHaveTextContent(/The expression above defines the transformation/u);
    expect(panel).toHaveTextContent(/applies it in your browser/u);
    expect(panel).toHaveTextContent(/not APL being interpreted frame by frame/u);
    expect(panel).toHaveTextContent(/compared against real APL execution/u);
  });

  it('is out of the way, and out of the tab order, until it is asked for', () => {
    render(<LifePage />);
    const panel = screen.getByRole('dialog', { name: /APL behind this artwork/u, hidden: true });
    expect(panel).toHaveAttribute('data-open', 'closed');
    expect(panel).toHaveAttribute('inert');
  });
});

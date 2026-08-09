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
  it('arrives at a world that is already alive and already running', () => {
    render(<LifePage />);

    // No Run, no empty canvas, no form: the address was the whole request.
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    expect(readout().alive).toBeGreaterThan(200);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('describes itself for somebody who cannot see it', () => {
    render(<LifePage />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      /Conway's Game of Life on a \d+ by \d+ toroidal grid/u,
    );
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
  it('opens on the composition, but paused rather than moving', () => {
    reducedMotion = true;
    render(<LifePage />);

    // The attractive state is still there; it simply is not animating.
    expect(readout().alive).toBeGreaterThan(200);
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

  it('empties the world when cleared', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(readout().alive).toBe(0);
  });

  it('fills it again with something chaotic when randomised', async () => {
    const user = userEvent.setup();
    render(<LifePage />);

    const opening = readout().alive;
    await user.click(screen.getByRole('button', { name: 'Randomise' }));

    // A random field is far denser than the composition, which is the point of
    // offering both.
    expect(readout().alive).toBeGreaterThan(opening);
  });

  it('puts the deliberate composition back when reset', async () => {
    const user = userEvent.setup();
    render(<LifePage />);
    const opening = readout().alive;

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(readout().alive).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(readout().alive).toBe(opening);
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

  it('is out of the way, and out of the tab order, until it is asked for', () => {
    render(<LifePage />);
    const panel = screen.getByRole('dialog', { name: /APL behind this artwork/u, hidden: true });
    expect(panel).toHaveAttribute('data-open', 'closed');
    expect(panel).toHaveAttribute('inert');
  });
});

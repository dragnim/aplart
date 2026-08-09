/**
 * Animating a palette in the workspace.
 *
 * The transform has its own tests. These are about the separation it depends
 * on: the saved palette, the phase, and the frame on screen are three different
 * things, and only the last of them changes while an animation runs.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { animate, artworkAction, paletteChoice, pressRunWith } from '../helpers/workspaceModes';
import type * as CanvasRenderer from '@/renderer/CanvasRenderer';

type CanvasRendererModule = typeof CanvasRenderer;

const CANVAS = { left: 0, top: 0, width: 400, height: 400 };

/**
 * Every request to paint, recorded.
 *
 * jsdom has no canvas to draw on, so the drawing calls are the only observable
 * — and the palette carried in each one is the frame that would have been
 * shown. Replaced through `vi.mock` rather than spied on: the component binds
 * the import when it loads, so a later spy on the module's export is never the
 * function it actually calls.
 */
const { drawCalls } = vi.hoisted(() => ({ drawCalls: [] as { palette?: { colours: string[] } }[] }));

vi.mock('@/renderer/CanvasRenderer', async (importOriginal) => {
  const actual = await importOriginal<CanvasRendererModule>();
  return {
    ...actual,
    drawArtwork: (_canvas: unknown, request: { palette?: { colours: string[] } }) => {
      drawCalls.push(request);
    },
  };
});

/** The palettes painted so far, most recent last. */
function painted(): string[][] {
  return drawCalls.map((request) => [...(request.palette?.colours ?? [])]);
}

function clearPaints() {
  drawCalls.length = 0;
}

/**
 * Frames the test drives by hand, so nothing depends on real time passing.
 *
 * Cancellation is honoured. A stub that ignored it would leave the frame the
 * loop had already queued sitting in the list, and the next advance would run
 * it — so a paused animation would appear to paint one more time and the test
 * for stopping would fail against code that had stopped perfectly well.
 */
let scheduled = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let clock = 0;

function advance(byMs: number) {
  clock += byMs;
  const due = [...scheduled.values()];
  scheduled = new Map();
  for (const frame of due) frame(clock);
}

beforeEach(() => {
  localStorage.clear();
  scheduled = new Map();
  nextFrameId = 1;
  clock = 0;
  clearPaints();

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    // Wide layout, and motion not reduced unless a test says so.
    matches: !query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    scheduled.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    scheduled.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  /*
   * The canvas *and the frame around it*, and nothing else.
   *
   * Painting measures the frame and gives up if it has no size, which in jsdom
   * it never has — so stubbing only the canvas left every one of these tests
   * watching a painter that had already returned. Stubbing every element
   * instead sent the code editor down a layout path jsdom cannot follow, and it
   * threw. Two elements is the answer; a blanket is not.
   */
  const measured = { ...CANVAS, right: CANVAS.width, bottom: CANVAS.height, x: 0, y: 0 } as DOMRect;
  // Everything else keeps the size jsdom gives it, which is none. Said outright
  // rather than delegated: holding a reference to the real method so the stub
  // can fall back to it is how the stub ends up calling itself.
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const classes = typeof this.className === 'string' ? this.className : '';
    return this instanceof HTMLCanvasElement || classes.includes('frame') ? measured : nothing;
  });
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function labelled(rows: number, columns: number) {
  return fromNested(
    Array.from({ length: rows }, (_unusedRow, row) =>
      Array.from({ length: columns }, (_unusedColumn, column) => (row + 1) * 100 + (column + 1)),
    ),
  );
}

async function openAndRun() {
  const user = userEvent.setup({ advanceTimers: () => undefined });
  const service = new MockAplExecutionService();
  service.register('default', labelled(8, 8));
  render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

describe('starting and stopping', () => {
  it('is never running when the artwork opens', async () => {
    await openAndRun();
    // Not part of the artwork, so nothing about a saved project or a link can
    // set it going.
    expect(animate().getByRole('button', { name: 'Animate palette' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('offers Pause the moment anything moves', async () => {
    const { user } = await openAndRun();
    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('costs no execution', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(500);
    advance(500);

    expect(service.executionCount).toBe(before);
  });

  it('leaves the matrix alone', async () => {
    const { user } = await openAndRun();
    const described = screen.getByRole('img', { name: /grid/ }).getAttribute('aria-label');

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(1200);

    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(described ?? '');
  });

  it('leaves the saved palette alone', async () => {
    const { user } = await openAndRun();
    await user.click(paletteChoice(/Custom/));
    const before = screen
      .getAllByLabelText(/^Hex value of stop/)
      .map((element) => (element as HTMLInputElement).value);

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(900);

    // The stops are the artwork; the animation is something being done to it.
    const after = screen
      .getAllByLabelText(/^Hex value of stop/)
      .map((element) => (element as HTMLInputElement).value);
    expect(after).toEqual(before);
  });

  it('adds nothing to the undo history, however long it runs', async () => {
    /*
     * The same claim as before, against a history that now records appearance.
     *
     * Choosing a palette is a decision and is undoable, so this can no longer
     * ask whether Undo is disabled — it asks whether two thousand milliseconds
     * of animation changed what Undo would take back. Movement is done *to* the
     * artwork rather than being part of it, and a history that filled up with
     * frames would be a history nobody could step back through.
     */
    const { user } = await openAndRun();
    await user.click(paletteChoice(/Custom/));
    const before = artworkAction(/^Undo/).getAttribute('aria-label');

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(2000);

    expect(artworkAction(/^Undo/).getAttribute('aria-label')).toBe(before);
  });

  it('keeps the cell being read', async () => {
    const { user } = await openAndRun();
    const canvas = screen.getByRole('img', { name: /grid/ });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    await screen.findByText('Row 2, column 3');

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(1000);

    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
    expect(screen.getByText('203')).toBeInTheDocument();
  });
});

describe('the frames', () => {
  it('moves the palette without moving anything else', async () => {
    const { user } = await openAndRun();
    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    clearPaints();

    advance(700);
    advance(700);

    const frames = painted();
    expect(frames.length).toBeGreaterThanOrEqual(2);
    // Two different frames, from one unchanged base.
    expect(frames.at(-1)).not.toEqual(frames[0]);
  });

  it('freezes where it was when paused', async () => {
    const { user } = await openAndRun();

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(700);
    expect(painted().at(-1)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    clearPaints();
    advance(5000);
    advance(5000);

    // No further frames at all: the loop is gone, not merely idling.
    expect(painted()).toHaveLength(0);
  });

  it('carries on from where it paused', async () => {
    const { user } = await openAndRun();

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(700);
    const before = painted().at(-1);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    // Time passes while paused, and must not count towards the phase.
    clock += 10_000;
    await user.click(animate().getByRole('button', { name: 'Animate palette' }));

    clearPaints();
    advance(0);
    expect(painted()[0]).toEqual(before);
  });

  it('does not advance while the document is hidden', async () => {
    const { user } = await openAndRun();
    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(700);
    const before = painted().at(-1);

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    clearPaints();
    advance(5000);
    advance(5000);
    // Nothing was drawn while away, either.
    expect(painted()).toHaveLength(0);

    hidden.mockReturnValue(false);
    advance(0);
    // Back exactly where it was, rather than leaping forward by however long
    // somebody was on another tab.
    expect(painted()[0]).toEqual(before);
  });

  it('puts the saved palette back on reset', async () => {
    const { user } = await openAndRun();
    const atRest = painted().at(-1);
    expect(atRest).toBeDefined();

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    advance(700);
    expect(painted().at(-1)).not.toEqual(atRest);

    await user.click(animate().getByRole('button', { name: 'Reset animation' }));

    // Identical to the unanimated palette, not merely close to it.
    expect(painted().at(-1)).toEqual(atRest);
    expect(animate().getByRole('button', { name: 'Animate palette' })).toBeInTheDocument();
  });
});

describe('with a hard-edged palette', () => {
  it('stays valid all the way round', async () => {
    const { user } = await openAndRun();

    await user.click(paletteChoice(/Custom/));
    // Two stops in the same place.
    fireEvent.change(screen.getByLabelText('Position of stop 2, per cent'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Position of stop 3, per cent'), { target: { value: '50' } });

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    clearPaints();
    for (let step = 0; step < 12; step += 1) advance(600);

    const frames = painted();
    expect(frames.length).toBeGreaterThan(4);
    for (const colours of frames) {
      expect(colours.length).toBeGreaterThanOrEqual(2);
      for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });
});

describe('in Focus mode', () => {
  it('uses the same loop rather than starting another', async () => {
    const { user } = await openAndRun();
    await user.click(animate().getByRole('button', { name: 'Animate palette' }));

    await user.click(screen.getByRole('button', { name: 'Focus mode' }));
    clearPaints();
    advance(500);

    // One canvas, one loop. Two would paint twice per frame.
    expect(painted()).toHaveLength(1);

    // And the controls in the drawer are the same ones.
    const drawer = document.getElementById('focus-drawer');
    expect(within(drawer as HTMLElement).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

describe('when motion is reduced', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  it('says so, and still offers to animate', async () => {
    const { user } = await openAndRun();

    expect(screen.getByText(/set to reduce motion/)).toBeInTheDocument();
    const start = animate().getByRole('button', { name: 'Animate palette' });
    expect(start).toBeEnabled();

    // Available on request, never on arrival.
    await user.click(start);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByText(/set to reduce motion/)).not.toBeInTheDocument();
  });
});

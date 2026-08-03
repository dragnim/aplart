/**
 * What a matrix means, and where that meaning comes from.
 *
 * Escape counts do not interpret themselves. A cell holding CEILING means "reached
 * the limit" against a ceiling of CEILING and "escaped comfortably" against a
 * ceiling of 60, so the source that produced the numbers has to travel with
 * them. Editing the code decides what the *next* run will mean; it says nothing
 * about the result already on screen.
 *
 * These are the boundary cases: edited but not run, run and failed, run and
 * succeeded, and reset. In every one of them the question is the same — is the
 * artwork still being read by the code that produced it?
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { mandelbrotField } from '@/presets/mandelbrot-field';

/**
 * The preset's own iteration ceiling, read from its code.
 *
 * Derived rather than written out, because these tests are about what a
 * value *means* against the ceiling that produced it. Restating the number
 * made them all fail when the default moved from 28 to 48, which told us
 * nothing except that the number had moved.
 */
const CEILING = numberAssignedTo(mandelbrotField.code, 'iterations') ?? 0;
import { WorkspacePage } from '@/workspace/WorkspacePage';
import type * as CanvasRenderer from '@/renderer/CanvasRenderer';

type CanvasRendererModule = typeof CanvasRenderer;

const CANVAS = { left: 0, top: 0, width: 400, height: 400 };

/**
 * Every request to paint, recorded.
 *
 * jsdom has no canvas, so the draw call is the only place the colour mapping
 * is observable — and its `escape.range` is the thing under test. Replaced
 * through `vi.mock` rather than spied on: the component binds the import when
 * it loads, so a later spy is never the function it actually calls.
 */
const { drawCalls } = vi.hoisted(() => ({
  drawCalls: [] as { escape?: { range: { min: number; max: number } } }[],
}));

vi.mock('@/renderer/CanvasRenderer', async (importOriginal) => {
  const actual = await importOriginal<CanvasRendererModule>();
  return {
    ...actual,
    drawArtwork: (_canvas: unknown, request: { escape?: { range: { min: number; max: number } } }) => {
      drawCalls.push(request);
    },
  };
});

/** The ceiling the most recent paint used, or null if it had no range. */
function paintedCeiling(): number | null {
  const last = drawCalls.at(-1);
  return last?.escape?.range.max ?? null;
}

beforeEach(() => {
  localStorage.clear();
  drawCalls.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const measured = { ...CANVAS, right: CANVAS.width, bottom: CANVAS.height, x: 0, y: 0 } as DOMRect;
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const classes = typeof this.className === 'string' ? this.className : '';
    return this instanceof HTMLCanvasElement || classes.includes('frame') ? measured : nothing;
  });

  /*
   * jsdom's Range measures nothing, and CodeMirror's cursor layer asks it to.
   * Left alone it throws from inside a measure callback, which surfaces as a
   * failure in whichever assertion happened to be waiting at the time.
   */
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;

  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;

  // jsdom implements <dialog> as an element but not as a dialog, and the reset
  // confirmation is a real one.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

/** A slice whose diagonal sits at the ceiling and whose rest escaped. */
function counts(ceiling: number, size = 8): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) =>
        row === column ? ceiling : 1 + ((row * size + column) % (ceiling - 1)),
      ),
    ),
  );
}

function announced(): string {
  const spoken = screen
    .getAllByRole('status')
    .find((element) => /Row \d+, column \d+|Every point in this view/u.test(element.textContent ?? ''));
  return spoken?.textContent ?? '';
}

async function inspect(user: ReturnType<typeof userEvent.setup>, row: number, column: number) {
  fireEvent.change(screen.getByLabelText(/^Row/), { target: { value: String(row) } });
  fireEvent.change(screen.getByLabelText(/^Column/), { target: { value: String(column) } });
  await user.click(screen.getByRole('button', { name: /^Inspect$/ }));
  return announced();
}

async function runAndWait(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Run/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Run/ })).toBeEnabled());
}

/**
 * Opens the artwork with a service that answers differently at 60.
 *
 * The 60 matrix is registered under the assignment itself, so the mock returns
 * it only once the code really says 60 — which is what makes "the run
 * succeeded" and "the run never happened" tell apart.
 */
async function openAndRun(options: { readonly at60?: NumericMatrix | 'oversized' } = {}) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();

  if (options.at60 !== undefined) {
    service.register(
      'iterations←60',
      /*
       * Beyond the workspace's matrix limits, so the run fails on validation the
       * way a genuinely too-large result would. It used to be 200², which was
       * beyond a limit this preset declared for itself; those are gone, and 200²
       * now draws — which is the point of removing them. 300² is past the limits
       * that remain.
       */
      options.at60 === 'oversized' ? counts(60, 300) : options.at60,
    );
  }
  service.register('default', counts(CEILING));

  render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);
  await runAndWait(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

/** Raises the iteration ceiling in the editor, without running. */
function editTo60() {
  fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
  return waitFor(() =>
    expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('iterations←60'),
  );
}

describe('a successful run at 28', () => {
  it('colours and describes the matrix against 28', async () => {
    const { user } = await openAndRun();

    expect(paintedCeiling()).toBe(CEILING);
    expect(await inspect(user, 3, 3)).toContain(`reached the maximum of ${String(CEILING)} iterations`);
  });
});

describe('edited to 60 without running', () => {
  it('leaves the canvas coloured against 28', async () => {
    await openAndRun();
    expect(paintedCeiling()).toBe(CEILING);

    await editTo60();

    /*
     * The numbers on screen were produced under a ceiling of 28. Recolouring
     * them against 60 would change the artwork with no execution behind it —
     * the one thing this application must never do.
     */
    expect(paintedCeiling()).toBe(CEILING);
  });

  it('still reads CEILING as having reached the limit', async () => {
    const { user } = await openAndRun();
    await inspect(user, 3, 3);

    await editTo60();

    // The sentence describes a calculation that happened, not one that is
    // merely written down.
    expect(announced()).toContain(`reached the maximum of ${String(CEILING)} iterations`);
    expect(announced()).not.toContain('Escaped before');
    expect(announced()).not.toContain('60');
  });

  it('keeps the whole-view message at 28', async () => {
    const user = userEvent.setup();
    const service = new MockAplExecutionService();
    service.register(
      'default',
      fromNested(Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => CEILING))),
    );
    render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);
    await runAndWait(user);
    await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
    expect(announced()).toContain('reached the current iteration limit');

    await editTo60();

    /*
     * Uniformly CEILING is at the limit under the ceiling that produced it. Reading
     * it against 60 would decide the view had escaped and silently withdraw the
     * only message explaining why the artwork is one flat colour.
     */
    expect(announced()).toContain('reached the current iteration limit');
  });

  it('interprets the matrix at CEILING under every colouring mode', async () => {
    const { user } = await openAndRun();
    await editTo60();

    for (const mode of ['bands', 'repeating', 'insideOutside', 'threshold', 'smooth']) {
      fireEvent.change(screen.getByLabelText('Mode'), { target: { value: mode } });
      // Changing how the numbers are read must not change which numbers they
      // are being read against.
      expect(paintedCeiling()).toBe(CEILING);
    }

    expect(await inspect(user, 3, 3)).toContain(`reached the maximum of ${String(CEILING)} iterations`);
  });
});

describe('a failed run at 60', () => {
  it('leaves the CEILING result and its meaning intact', async () => {
    const { user } = await openAndRun({ at60: 'oversized' });
    await editTo60();
    await runAndWait(user);

    // The error is real, and the previous artwork survived it.
    await waitFor(() => expect(announced().length + drawCalls.length).toBeGreaterThan(0));
    expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument();

    /*
     * The failure is the dangerous case: the code now says 60 and no result
     * ever came back at 60. Anything reading the editor would reinterpret a
     * CEILING-iteration matrix permanently, with nothing on screen to explain it.
     */
    expect(paintedCeiling()).toBe(CEILING);
    expect(await inspect(user, 3, 3)).toContain(`reached the maximum of ${String(CEILING)} iterations`);
  });
});

describe('a successful run at 60', () => {
  it('moves the matrix and its meaning together', async () => {
    const { user } = await openAndRun({ at60: counts(60) });
    expect(paintedCeiling()).toBe(CEILING);

    await editTo60();
    await runAndWait(user);

    await waitFor(() => expect(paintedCeiling()).toBe(60));

    // CEILING escaped under this ceiling, and the diagonal now holds 60.
    expect(await inspect(user, 3, 3)).toContain('reached the maximum of 60 iterations');
    expect(await inspect(user, 1, 2)).toContain('Escaped before the iteration limit.');
  });
});

describe('dragging after an unrun edit', () => {
  it('zooms from the view on screen, not the one only written down', async () => {
    const { user } = await openAndRun();

    /*
     * The span is edited and not run, so the canvas still shows the 1.4 view.
     * The control is geometric, so its input carries a position rather than the
     * value; 160 of 200 across 0.002…2 is a span of about 0.5.
     */
    fireEvent.change(screen.getByLabelText('Span'), { target: { value: '160' } });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('zoom←0.502'),
    );

    // The right-hand half of the artwork, which under a span of 1.4 is centred
    // near -0.6 + 0.7 = 0.1 and half as wide: span 0.7.
    const canvas = screen.getByRole('img', { name: /grid/ });
    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300, pointerId: 1 });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('zoom←0.7'),
    );

    /*
     * Read through the unrun 0.5 the same drag would have produced a span of
     * 0.25 and a centre a quarter of the way through a view nobody was looking
     * at — the pointer landing somewhere other than where it was put.
     */
    expect(screen.getByRole('textbox', { name: /APL/i }).textContent).not.toContain('zoom←0.251');
    expect(await inspect(user, 1, 1)).toContain('Row 1, column 1');
  });
});

describe('resetting the artwork', () => {
  it('does not reinterpret the result that is still on screen', async () => {
    const { user } = await openAndRun({ at60: counts(60) });
    await editTo60();
    await runAndWait(user);
    await waitFor(() => expect(paintedCeiling()).toBe(60));

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(await screen.findByRole('button', { name: 'Reset everything' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain(
        `iterations←${String(CEILING)}`,
      ),
    );

    /*
     * Reset puts the code back; it does not run it. The artwork on screen is
     * still the 60-iteration result, so it is still read at 60. There is no
     * separate range to go stale — the range is part of the result.
     */
    expect(paintedCeiling()).toBe(60);
    expect(await inspect(user, 3, 3)).toContain('reached the maximum of 60 iterations');
  });
});

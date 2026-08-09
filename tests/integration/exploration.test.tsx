/**
 * Exploring the plane by dragging on the artwork.
 *
 * The arithmetic has its own unit tests. What is checked here is the promise
 * the application makes about it: that a drag changes the *code*, that the code
 * which then runs is the code the drag wrote, and that a preset which has not
 * declared itself explorable offers none of it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { pressRunWith } from '../helpers/workspaceModes';

/** The canvas, as jsdom would never lay it out. Square, so u = x / 400. */
const CANVAS = { left: 0, top: 0, width: 400, height: 400 };

beforeEach(() => {
  /*
   * The workspace saves work in progress, and the save is flushed on unmount.
   * Without this, the second test in the file opens the artwork where the first
   * one left it — so the starting view is not 1.4, the piece already says
   * "Edited", and every expected number is wrong for reasons nothing on screen
   * would explain.
   */
  localStorage.clear();

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

  // jsdom performs no layout, so the element would measure zero and every
  // fraction would be NaN.
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...CANVAS,
    right: CANVAS.width,
    bottom: CANVAS.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  // Not implemented by jsdom at all; the drag needs it to survive the pointer
  // leaving the canvas.
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

function serviceReturning(rows = 16) {
  const service = new MockAplExecutionService();
  service.register(
    'default',
    fromNested(
      Array.from({ length: rows }, (_, row) =>
        Array.from({ length: rows }, (_, column) => (row * column) % 7),
      ),
    ),
  );
  return service;
}

async function openAndRun(presetId: string) {
  const user = userEvent.setup();
  const service = serviceReturning();
  render(<WorkspacePage presetId={presetId} sharedState={null} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  return { user, service };
}

/** A press, a move and a release, in canvas pixels. */
function drag(from: readonly [number, number], to: readonly [number, number]) {
  const canvas = screen.getByRole('img');
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] });
}

/** Everything the service has been sent, as one string to search. */
function sent(service: MockAplExecutionService) {
  return service.received.join('\n---\n');
}

/**
 * What the Span control reports.
 *
 * Its slider carries a geometric position rather than the value, so its DOM
 * value is not the span. `aria-valuetext` is what a screen reader announces and
 * what the readout beside the label shows, which is the thing worth asserting.
 */
function spanShown() {
  return screen.getByLabelText('Span').getAttribute('aria-valuetext');
}

describe('exploring the plane', () => {
  it('rewrites the view assignments, and runs what it wrote', async () => {
    const { service } = await openAndRun(mandelbrotField.id);
    const before = service.executionCount;

    // The upper-left quarter, offset: centre moves to a quarter of the way in
    // from the middle, span to a quarter of what it was.
    drag([100, 100], [200, 200]);

    await waitFor(() => expect(service.executionCount).toBeGreaterThan(before));

    /*
     * The whole point of the stage. The picture did not change because a camera
     * moved; it changed because these three numbers in the visible APL did.
     */
    const executed = sent(service);
    expect(executed).toContain('centreX←¯0.95');
    expect(executed).toContain('centreY←¯0.35');
    expect(executed).toContain('zoom←0.35');
  });

  it('shows the new view on the controls that set it', async () => {
    await openAndRun(mandelbrotField.id);

    drag([100, 100], [200, 200]);

    // The sliders and the drag are two ways of writing the same assignments,
    // so they cannot disagree about where the view is.
    await waitFor(() => expect(spanShown()).toBe('0.35'));
    expect(screen.getByLabelText('Centre across')).toHaveValue('-0.95');
    expect(screen.getByLabelText('Centre down')).toHaveValue('-0.35');
  });

  it('marks the artwork as edited, because the code changed', async () => {
    await openAndRun(mandelbrotField.id);
    expect(screen.getByText('Original')).toBeInTheDocument();

    drag([100, 100], [200, 200]);

    await waitFor(() => expect(screen.getByText('Edited')).toBeInTheDocument());
  });

  it('ignores a press that was not a drag', async () => {
    const { service } = await openAndRun(mandelbrotField.id);
    const before = service.executionCount;

    // A stray click must not throw the view somewhere unrecoverable, and a
    // few pixels would be a zoom of several thousand times.
    drag([200, 200], [204, 203]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(service.executionCount).toBe(before);
    expect(spanShown()).toBe('1.4');
  });

  it('ignores a secondary-button press', async () => {
    const { service } = await openAndRun(mandelbrotField.id);
    const before = service.executionCount;

    const canvas = screen.getByRole('img');
    fireEvent.pointerDown(canvas, { button: 2, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { button: 2, pointerId: 1, clientX: 300, clientY: 300 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(service.executionCount).toBe(before);
  });

  describe('zooming out and stepping back', () => {
    it('doubles the span about the same centre', async () => {
      const { user } = await openAndRun(mandelbrotField.id);

      await user.click(screen.getByRole('button', { name: 'Zoom out' }));

      // 1.4 doubled is 2.8, which the Span control tops out at 2.
      await waitFor(() => expect(spanShown()).toBe('2'));
      expect(screen.getByLabelText('Centre across')).toHaveValue('-0.6');
    });

    it('halves the span on the way in', async () => {
      const { user } = await openAndRun(mandelbrotField.id);

      await user.click(screen.getByRole('button', { name: 'Zoom in' }));

      await waitFor(() => expect(spanShown()).toBe('0.7'));
    });

    it('pans by a fraction of the span, so it still works when zoomed in', async () => {
      const { user } = await openAndRun(mandelbrotField.id);

      // Everything the drag does, reachable from the keyboard. The centre
      // sliders alone step by 0.01, which is five whole views at the deepest
      // zoom and a thousandth of one at the widest.
      await user.click(screen.getByRole('button', { name: 'Zoom in' }));
      await waitFor(() => expect(spanShown()).toBe('0.7'));

      await user.click(screen.getByRole('button', { name: 'Pan right' }));

      // Half of 0.7, not half of 1.4.
      await waitFor(() => expect(screen.getByLabelText('Centre across')).toHaveValue('-0.25'));
      expect(spanShown()).toBe('0.7');
    });

    it('offers nothing to go back to until somewhere has been left', async () => {
      const { user } = await openAndRun(mandelbrotField.id);
      expect(screen.getByRole('button', { name: /^Back/ })).toBeDisabled();

      drag([100, 100], [200, 200]);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Back (1)' })).toBeEnabled());

      await user.click(screen.getByRole('button', { name: 'Back (1)' }));

      await waitFor(() => expect(spanShown()).toBe('1.4'));
      expect(screen.getByLabelText('Centre across')).toHaveValue('-0.6');
      // Stepping back is not itself somewhere to come back from.
      expect(screen.getByRole('button', { name: /^Back/ })).toBeDisabled();
    });

    it('steps back through several views in turn', async () => {
      const { user } = await openAndRun(mandelbrotField.id);

      drag([100, 100], [200, 200]);
      await waitFor(() => expect(spanShown()).toBe('0.35'));
      drag([100, 100], [200, 200]);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Back (2)' })).toBeEnabled());

      await user.click(screen.getByRole('button', { name: 'Back (2)' }));
      await waitFor(() => expect(spanShown()).toBe('0.35'));

      await user.click(screen.getByRole('button', { name: 'Back (1)' }));
      await waitFor(() => expect(spanShown()).toBe('1.4'));
    });
  });

  describe('the controls after a deep zoom', () => {
    /** Zooms in far enough that the span is well below the old slider step. */
    async function zoomDeep(user: ReturnType<typeof userEvent.setup>) {
      for (let step = 0; step < 6; step += 1) {
        await user.click(screen.getByRole('button', { name: 'Zoom in' }));
        await waitFor(() => expect(screen.getByRole('button', { name: /^Back \(/ })).toBeEnabled());
      }
    }

    it('keeps the exact span the navigation chose', async () => {
      const { user } = await openAndRun(mandelbrotField.id);
      await zoomDeep(user);

      // 1.4 halved six times.
      await waitFor(() => expect(spanShown()).toBe('0.021875'));
    });

    it('does not throw the view away when the span slider is nudged', async () => {
      const { user, service } = await openAndRun(mandelbrotField.id);
      await zoomDeep(user);
      const chosen = Number(spanShown());

      // The failure this guards: with a linear slider from 0.002 in steps of
      // 0.05, the nearest stop to 0.0219 was 0.002 — one press away from a
      // different piece of the plane entirely.
      const slider = screen.getByLabelText('Span');
      const position = Number((slider as HTMLInputElement).value);
      fireEvent.change(slider, { target: { value: String(position - 1) } });

      await waitFor(() => expect(Number(spanShown())).not.toBe(chosen));
      const nudged = Number(spanShown());
      expect(nudged / chosen).toBeGreaterThan(0.94);
      expect(nudged / chosen).toBeLessThan(1.06);
      expect(sent(service)).not.toContain('zoom←0.002');
    });

    it('does not throw the view away when the centre slider is nudged', async () => {
      const { user } = await openAndRun(mandelbrotField.id);
      await zoomDeep(user);
      const span = Number(spanShown());

      const slider = screen.getByLabelText('Centre across');
      const before = Number((slider as HTMLInputElement).value);
      fireEvent.change(slider, { target: { value: String(before + 0.001) } });

      // One step has to be smaller than the view it moves, or a nudge is a jump.
      await waitFor(() => expect(screen.getByLabelText('Centre across')).not.toHaveValue(String(before)));
      const moved = Number((screen.getByLabelText('Centre across') as HTMLInputElement).value);
      expect(Math.abs(moved - before)).toBeLessThan(span);
    });
  });

  describe('when the code stops describing a view', () => {
    /** Arrives with the span line rewritten as an expression. */
    async function openWithExpressionSpan() {
      const { encodeShareState } = await import('@/sharing/encodeShareState');
      const encoded = encodeShareState({
        v: 1,
        preset: mandelbrotField.id,
        // Someone has taken the line over. A drag that replaced it would throw
        // away deliberate work, and there is no number to read a view from.
        code: mandelbrotField.code.replace('zoom←1.4', 'zoom←2÷3'),
        params: {},
        palette: 'heat',
        render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
      });

      const user = userEvent.setup();
      const service = serviceReturning();
      render(<WorkspacePage presetId={mandelbrotField.id} sharedState={encoded} service={service} />);
      await screen.findByText(/shared with you/);

      await pressRunWith(user);
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      return { user, service };
    }

    it('says so, and withdraws the view controls', async () => {
      await openWithExpressionSpan();

      /*
       * The navigation cluster on the artwork explains itself rather than
       * offering buttons that would overwrite somebody's expression. It stays put
       * — vanishing mid-session would be its own kind of surprise — and says
       * where the lines it needs have gone.
       */
      expect(screen.queryByRole('button', { name: 'Zoom out' })).toBeNull();
      expect(screen.getByText(/no longer says where the view is/)).toBeInTheDocument();
      expect(screen.getByText(/the artwork’s navigation cannot move them/)).toBeInTheDocument();
    });

    it('does not overwrite the expression when the artwork is dragged', async () => {
      const { service } = await openWithExpressionSpan();
      const before = service.executionCount;

      drag([100, 100], [200, 200]);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(service.executionCount).toBe(before);
      // Still theirs.
      expect(sent(service)).toContain('zoom←2÷3');
    });
  });
});

describe('a preset that has not declared itself explorable', () => {
  it('offers no view controls at all', async () => {
    await openAndRun(modularBloom.id);

    expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Back/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Drag a region/)).not.toBeInTheDocument();
  });

  it('does nothing when its artwork is dragged', async () => {
    const { service } = await openAndRun(modularBloom.id);
    const before = service.executionCount;

    drag([100, 100], [300, 300]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(service.executionCount).toBe(before);
  });
});

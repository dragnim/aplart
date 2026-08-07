/**
 * Navigating the plane from the artwork, and the two histories behind it.
 *
 * Two mechanisms answer two questions, and the risk is that they contradict each
 * other. Undo takes back the last change to the artwork of any kind — a slider, a
 * palette, a zoom. Back walks the places you have looked. What is checked here is
 * that a viewport change is recorded like any other committed control, that Back
 * still steps through views, and that neither leaves the other offering a step to
 * where you already are.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { modularBloom } from '@/presets/modular-bloom';
import { initialWorkspaceState, workspaceReducer } from '@/workspace/workspaceState';
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
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
});

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  cleanup();
});

function serviceReturning(size = 6) {
  const service = new MockAplExecutionService();
  service.register(
    'default',
    fromNested(
      Array.from({ length: size }, (_unusedRow, row) =>
        Array.from({ length: size }, (_unusedColumn, column) => (row + column) % 4),
      ),
    ),
  );
  return service;
}

function openFractal() {
  const service = serviceReturning();
  const view = render(
    <WorkspacePage presetId={mandelbrotField.id} sharedState={null} play={null} service={service} />,
  );
  return { service, view };
}

const source = () => document.querySelector('.cm-content')?.textContent ?? '';
/**
 * The span the code is currently showing.
 *
 * Read with a pattern rather than the parameter binding, because the editor's
 * lines are separate elements and the text taken from them has no line breaks
 * left to bind against.
 */
const span = () => Number(/zoom←(?<value>[\d.]+)/u.exec(source())?.groups?.['value'] ?? Number.NaN);
const zoomIn = () => screen.getByRole('button', { name: 'Zoom in' });
const back = () => screen.getByRole('button', { name: /^Back/ });

describe('the navigation cluster on the artwork', () => {
  it('is there for an artwork with a plane, and not for one without', async () => {
    openFractal();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide navigation' })).toBeVisible());

    for (const name of ['Pan up', 'Pan down', 'Pan left', 'Pan right', 'Zoom in', 'Zoom out']) {
      expect(screen.getByRole('button', { name }), name).toBeInTheDocument();
    }

    cleanup();

    // Modular Bloom has no plane to move about in, so it is offered no compass.
    render(
      <WorkspacePage
        presetId={modularBloom.id}
        sharedState={null}
        play="20260805"
        service={serviceReturning()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Hide navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
  });

  it('collapses without disabling navigation', async () => {
    const user = userEvent.setup();
    openFractal();
    await waitFor(() => expect(zoomIn()).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Hide navigation' }));

    // Hidden, not removed: the toggle stays, and says what pressing it does.
    const toggle = screen.getByRole('button', { name: 'Show navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();

    // And the artwork is still navigable by every other route — the parameters
    // in the panel, and the drag on the canvas — which is why this hides controls
    // rather than switching anything off.
    expect(screen.getByLabelText('Span')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  });

  it('keeps the precise values in the panel, not on the artwork', async () => {
    openFractal();
    await waitFor(() => expect(zoomIn()).toBeVisible());

    // The exact centre and span are still controls you can type into; the cluster
    // over the artwork is for looking around, which is a different act.
    for (const label of ['Centre across', 'Centre down', 'Span']) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
    // And they are sliders in the panel, not buttons over the picture.
    expect(screen.getByLabelText('Span')).toHaveAttribute('type', 'range');
  });
});

describe('viewport history and the artwork history', () => {
  it('records a zoom the way every other committed control is recorded', async () => {
    const user = userEvent.setup();
    openFractal();
    await waitFor(() => expect(zoomIn()).toBeVisible());

    const before = span();
    await user.click(zoomIn());

    await waitFor(() => expect(span()).toBeLessThan(before));

    /*
     * The record itself is asserted through the reducer rather than through a
     * button, because no preset today offers both a plane to explore and the
     * session that shows Undo. What matters is that the same pipeline is used:
     * a committed change, which a step back can restore.
     */
    const state = initialWorkspaceState(mandelbrotField);
    const zoomed = workspaceReducer(
      state,
      { type: 'codeCommitted', code: state.code.replace('zoom←1.4', 'zoom←0.7'), label: 'Zoom' },
      mandelbrotField,
    );
    expect(zoomed.past).toHaveLength(1);
    expect(zoomed.past.at(-1)?.label).toBe('Zoom');

    const undone = workspaceReducer(zoomed, { type: 'undone' }, mandelbrotField);
    expect(undone.code).toContain('zoom←1.4');
    expect(undone.past).toHaveLength(0);
  });

  it('steps back through views without offering a step to where you already are', async () => {
    const user = userEvent.setup();
    openFractal();
    await waitFor(() => expect(zoomIn()).toBeVisible());

    // Nowhere to go back to until somewhere has been left.
    expect(back()).toBeDisabled();

    await user.click(zoomIn());
    await waitFor(() => expect(back()).toBeEnabled());
    expect(back()).toHaveAccessibleName('Back (1)');

    await user.click(zoomIn());
    await waitFor(() => expect(back()).toHaveAccessibleName('Back (2)'));

    const zoomedTwice = span();

    await user.click(back());
    await waitFor(() => expect(span()).toBeGreaterThan(zoomedTwice));

    /*
     * One step consumed, and the count says so. A Back that left the view it had
     * just returned from on the stack would offer a step that goes nowhere: the
     * viewport is never applied on top of itself, so pressing it would appear to
     * do nothing at all.
     */
    expect(back()).toHaveAccessibleName('Back (1)');

    await user.click(back());
    await waitFor(() => expect(back()).toBeDisabled());
  });

  it('keeps offering the step back while the new view is still being drawn', async () => {
    const user = userEvent.setup();
    openFractal();
    await waitFor(() => expect(zoomIn()).toBeVisible());

    await user.click(zoomIn());

    /*
     * Caught in a screenshot rather than by a test: mid-run the artwork on screen
     * is still the view you left, so a Back stack compared against the *drawn*
     * viewport decided that view was where you already were, and the button greyed
     * out until the run landed. It is compared against what the code asks for
     * instead, which is what the zoom actually changed.
     */
    expect(span()).toBe(0.7);
    expect(back()).toBeEnabled();
    expect(back()).toHaveAccessibleName('Back (1)');

    // And still there once the picture catches up.
    await waitFor(() => expect(back()).toBeEnabled());
  });

  it('leaves no phantom step behind when the view returns by another route', async () => {
    const user = userEvent.setup();
    openFractal();
    await waitFor(() => expect(zoomIn()).toBeVisible());

    await user.click(zoomIn());
    await waitFor(() => expect(back()).toBeEnabled());

    /*
     * Back to where the artwork started, by another route entirely — a Reset and
     * a Run rather than the Back button. This is the shape of what a global Undo
     * does to a viewport change: the view returns to one the stack is still
     * offering, and the offer has to go, or Back would promise a step to where
     * you already are.
     *
     * The viewport follows the artwork rather than the editor, so the Run is part
     * of the journey and not a detail of the test: until it lands, the picture is
     * still the zoomed one.
     */
    fireEvent.click(screen.getByRole('button', { name: 'Reset parameters' }));
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));

    await waitFor(() => expect(span()).toBe(1.4));
    await waitFor(() => expect(back()).toBeDisabled());
  });
});

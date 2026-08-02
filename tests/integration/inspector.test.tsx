/**
 * Pressing the artwork to read a value.
 *
 * The mapping arithmetic has its own tests. What is checked here is what a press
 * does to the application: which cell it names, that it costs no execution, that
 * it survives recolouring and turning, and that a drag is never mistaken for it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { modularBloom } from '@/presets/modular-bloom';
import { truchetGrid } from '@/presets/truchet-grid';
import { WorkspacePage } from '@/workspace/WorkspacePage';

/** Square, so a square matrix fills it and u = x / 400. */
const CANVAS = { left: 0, top: 0, width: 400, height: 400 };

beforeEach(() => {
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...CANVAS,
    right: CANVAS.width,
    bottom: CANVAS.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

/** A matrix whose every cell is distinguishable by row and column. */
function labelled(rows: number, columns: number) {
  return fromNested(
    Array.from({ length: rows }, (_unusedRow, row) =>
      Array.from({ length: columns }, (_unusedColumn, column) => (row + 1) * 100 + (column + 1)),
    ),
  );
}

async function openAndRun(presetId: string, matrix = labelled(8, 8)) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', matrix);
  render(<WorkspacePage presetId={presetId} sharedState={null} service={service} />);

  await user.click(screen.getByRole('button', { name: /^Run/ }));
  await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  return { user, service };
}

/** A press: down and up in the same place. */
function press(x: number, y: number) {
  const canvas = screen.getByRole('img');
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y });
}

function drag(from: readonly [number, number], to: readonly [number, number]) {
  const canvas = screen.getByRole('img');
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] });
}

describe('inspecting a cell', () => {
  it('names the cell pressed and reports its value', async () => {
    await openAndRun(modularBloom.id);

    // An 8×8 matrix in a 400px square: each cell is 50px. (125, 75) is column 3,
    // row 2 — counting from one, the way the code does.
    press(125, 75);

    expect(await screen.findByText('Row 2, column 3')).toBeInTheDocument();
    expect(screen.getByText('203')).toBeInTheDocument();
  });

  it('costs no execution', async () => {
    const { service } = await openAndRun(modularBloom.id);
    const before = service.executionCount;

    press(125, 75);
    await screen.findByText('Row 2, column 3');

    // The value is already in the browser. Asking about it must not ask TryAPL.
    expect(service.executionCount).toBe(before);
  });

  it('says how many cells share the value', async () => {
    await openAndRun(
      modularBloom.id,
      fromNested([
        [5, 5, 5, 5],
        [5, 5, 1, 1],
      ]),
    );

    // A 4×2 matrix letterboxed into a square canvas: 400 wide, 200 tall, so the
    // artwork runs from y=100 to y=300. (50, 150) is row 1, column 1.
    press(50, 150);

    expect(await screen.findByText(/6 cells share it/)).toBeInTheDocument();
    expect(screen.getByText(/75% of the artwork/)).toBeInTheDocument();
  });

  it('says when a value is unique', async () => {
    await openAndRun(modularBloom.id);
    press(125, 75);
    expect(await screen.findByText('The only cell with this value.')).toBeInTheDocument();
  });

  it('ignores a press beside the artwork', async () => {
    await openAndRun(
      modularBloom.id,
      fromNested([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ]),
    );

    // The mat above a letterboxed artwork, which occupies y=100 to y=300.
    press(200, 40);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/^Row /)).not.toBeInTheDocument();
  });

  it('reports the tile class for a motif artwork, not a rendered pixel', async () => {
    // Truchet draws many pixels per cell, so a press has to be resolved against
    // the logical matrix rather than the raster.
    await openAndRun(
      truchetGrid.id,
      fromNested([
        [0, 1],
        [1, 0],
      ]),
    );

    press(100, 100);
    expect(await screen.findByText('Row 1, column 1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();

    press(300, 100);
    expect(await screen.findByText('Row 1, column 2')).toBeInTheDocument();
  });

  it('does not rank a tile class against the others', async () => {
    await openAndRun(
      truchetGrid.id,
      fromNested([
        [0, 1],
        [1, 1],
      ]),
    );

    press(300, 100);
    await screen.findByText('Row 1, column 2');

    /*
     * Tile class 1 is not more than tile class 0; it is a different shape.
     * "The largest value in this artwork" is true of it and says nothing, so
     * magnitude goes unmentioned — while how common the shape is still matters.
     */
    expect(screen.queryByText(/largest value/)).not.toBeInTheDocument();
    expect(screen.queryByText(/smallest value/)).not.toBeInTheDocument();
    expect(screen.getByText(/3 cells share it/)).toBeInTheDocument();
  });
});

describe('the reading and the presentation', () => {
  it('survives a change of palette', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.click(screen.getByRole('radio', { name: /Poolrooms/ }));

    // Recolouring changes nothing about which cell was chosen.
    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
    expect(screen.getByText('203')).toBeInTheDocument();
  });

  it('follows the cell when the artwork is turned', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.click(screen.getByRole('radio', { name: '90°' }));

    /*
     * The cell is remembered in the matrix's own coordinates, so a quarter turn
     * leaves it naming the same cell. Remembering a screen position instead would
     * have quietly moved the reading to a different one.
     */
    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
    expect(screen.getByText('203')).toBeInTheDocument();
  });

  it('resolves a press correctly once the artwork has been turned', async () => {
    const { user } = await openAndRun(modularBloom.id);
    await user.click(screen.getByRole('radio', { name: '90°' }));

    /*
     * A quarter turn sends the matrix's first row to the display's last column,
     * so a press near the top right is row 1. Getting this wrong is invisible on
     * a square matrix of unremarkable values, which is why the values here encode
     * their own position.
     */
    press(375, 25);
    expect(await screen.findByText('Row 1, column 1')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
  });
});

describe('putting the reading away', () => {
  it('clears on the panel’s own control', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Row 2, column 3')).not.toBeInTheDocument();
  });

  it('clears on Escape', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Row 2, column 3')).not.toBeInTheDocument();
  });

  it('clears on a press that misses the artwork', async () => {
    await openAndRun(
      modularBloom.id,
      fromNested([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ]),
    );
    press(50, 150);
    await screen.findByText('Row 1, column 1');

    press(200, 40);
    await waitFor(() => expect(screen.queryByText('Row 1, column 1')).not.toBeInTheDocument());
  });

  it('lets go of a cell a new result no longer has', async () => {
    const { user, service } = await openAndRun(modularBloom.id, labelled(8, 8));
    press(375, 375);
    await screen.findByText('Row 8, column 8');

    // The next run returns something smaller, which has no row 8.
    service.register('default', labelled(3, 3));
    await user.click(screen.getByRole('button', { name: /^Run/ }));

    await waitFor(() => expect(screen.queryByText('Row 8, column 8')).not.toBeInTheDocument());
    // And nothing is reported in its place, rather than a cell nobody chose.
    expect(screen.queryByText(/^Row /)).not.toBeInTheDocument();
  });
});

describe('a drag is not a press', () => {
  it('zooms without also reporting a value', async () => {
    const { service } = await openAndRun(mandelbrotField.id);
    const before = service.executionCount;

    drag([100, 100], [200, 200]);

    // The drag ends over a cell, and must not be read as a press on it: that
    // would report a value from the view being left behind.
    await waitFor(() => expect(service.executionCount).toBeGreaterThan(before));
    expect(screen.queryByText(/^Row /)).not.toBeInTheDocument();
  });

  it('still reports a value for a press too small to be a drag', async () => {
    await openAndRun(mandelbrotField.id);

    // Three pixels of travel is a press with a shaky hand, not a gesture.
    const canvas = screen.getByRole('img');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 127, clientY: 76 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 127, clientY: 76 });

    expect(await screen.findByText('Row 2, column 3')).toBeInTheDocument();
  });

  it('inspects on an artwork that cannot be explored at all', async () => {
    // Modular Bloom declares no plane, so a drag does nothing — but a press must
    // still work, because any matrix has cells worth asking about.
    await openAndRun(modularBloom.id);
    drag([100, 100], [300, 300]);
    expect(await screen.findByText(/^Row /)).toBeInTheDocument();
  });
});

describe('what a preset can add', () => {
  it('quotes the ceiling from the visible code', async () => {
    const ceiling = fromNested([
      [1, 2],
      [3, 28],
    ]);
    await openAndRun(mandelbrotField.id, ceiling);

    press(300, 300);
    expect(await screen.findByText('This point reached the maximum of 28 iterations.')).toBeInTheDocument();
  });

  it('quotes the limit the code now sets, not the one it shipped with', async () => {
    const { user } = await openAndRun(
      mandelbrotField.id,
      fromNested([
        [1, 2],
        [3, 40],
      ]),
    );

    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '40' } });
    await waitFor(() => expect(screen.getByLabelText('Maximum iterations')).toHaveValue('40'));
    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    press(300, 300);
    expect(await screen.findByText('This point reached the maximum of 40 iterations.')).toBeInTheDocument();
  });

  it('explains a view that is entirely at the limit', async () => {
    await openAndRun(
      mandelbrotField.id,
      fromNested([
        [28, 28],
        [28, 28],
      ]),
    );

    // Mathematically correct, and indistinguishable from a fault unless said.
    expect(
      await screen.findByText(/Every point in this view reached the current iteration limit/),
    ).toBeInTheDocument();
  });

  it('says it once, not again for every press', async () => {
    await openAndRun(
      mandelbrotField.id,
      fromNested([
        [28, 28],
        [28, 28],
      ]),
    );
    await screen.findByText(/Every point in this view/);

    press(100, 100);

    // Pressing answers the same question more precisely; repeating the general
    // note over it would be noise in a live region.
    await waitFor(() => expect(screen.queryByText(/Every point in this view/)).not.toBeInTheDocument());
    expect(screen.getByText('This point reached the maximum of 28 iterations.')).toBeInTheDocument();
  });

  it('says nothing of the sort for an artwork with no ceiling to speak of', async () => {
    await openAndRun(
      modularBloom.id,
      fromNested([
        [4, 4],
        [4, 4],
      ]),
    );

    expect(screen.queryByText(/iteration limit/)).not.toBeInTheDocument();
    press(100, 100);
    // Still described, just without a claim the preset never made.
    expect(await screen.findByText('The largest value in this artwork.')).toBeInTheDocument();
  });
});

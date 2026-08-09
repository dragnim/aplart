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
import { modularBloom } from '@/presets/modular-bloom';
import { truchetGrid } from '@/presets/truchet-grid';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { advanced, paletteChoice, pressRunWith } from '../helpers/workspaceModes';

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

  await pressRunWith(user);
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

/**
 * The sentence the live region announces.
 *
 * The panel says everything twice: once as a visible layout and once as a
 * sentence written to be heard. Regex queries match both, so anything asking
 * about wording asks this.
 */
function announced(): string {
  const spoken = screen
    .getAllByRole('status')
    .find((element) => /Row \d+, column \d+|Every point in this view/u.test(element.textContent ?? ''));
  return spoken?.textContent ?? '';
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

    await screen.findByText('Row 1, column 1');
    expect(announced()).toContain('6 cells share it');
    expect(announced()).toContain('75% of the artwork');
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
    expect(announced()).not.toContain('largest value');
    expect(announced()).not.toContain('smallest value');
    expect(announced()).toContain('3 cells share it');
  });
});

describe('the reading and the presentation', () => {
  it('survives a change of palette', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.click(paletteChoice(/Poolrooms/));

    // Recolouring changes nothing about which cell was chosen.
    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
    expect(screen.getByText('203')).toBeInTheDocument();
  });

  it('follows the cell when the artwork is turned', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.click(advanced().getByRole('radio', { name: '90°' }));

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
    await user.click(advanced().getByRole('radio', { name: '90°' }));

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
    await pressRunWith(user);

    await waitFor(() => expect(screen.queryByText('Row 8, column 8')).not.toBeInTheDocument());
    // And nothing is reported in its place, rather than a cell nobody chose.
    expect(screen.queryByText(/^Row /)).not.toBeInTheDocument();
  });

  it('forgets it rather than hiding it, so it cannot come back', async () => {
    /*
     * The selection is dropped at the moment the matrix is replaced, not merely
     * left unrendered. Keeping it out of sight would have been enough to pass
     * the test above and still wrong: the next result large enough to contain it
     * would have brought it back, pointing at a cell nobody had chosen, in an
     * artwork they had not been looking at when they chose it.
     */
    const { user, service } = await openAndRun(modularBloom.id, labelled(8, 8));
    press(375, 375);
    await screen.findByText('Row 8, column 8');

    service.register('default', labelled(3, 3));
    await pressRunWith(user);
    await waitFor(() => expect(screen.queryByText(/^Row /)).not.toBeInTheDocument());

    // Big enough to hold row 8 again.
    service.register('default', labelled(8, 8));
    await pressRunWith(user);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAccessibleName(/8 by 8 grid/));

    expect(screen.queryByText('Row 8, column 8')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Row /)).not.toBeInTheDocument();
  });

  it('keeps the selection across a run of the same shape', async () => {
    // Only an incompatible shape drops it. A re-run at the same size leaves the
    // cell meaningful, so it stays chosen.
    const { user, service } = await openAndRun(modularBloom.id, labelled(8, 8));
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    service.register('default', labelled(8, 8));
    await pressRunWith(user);

    await waitFor(() => expect(screen.getByText('Row 2, column 3')).toBeInTheDocument());
  });
});

describe('choosing a cell without a pointer', () => {
  it('inspects the coordinates that were typed', async () => {
    const { user } = await openAndRun(modularBloom.id);

    await user.clear(advanced().getByLabelText(/^Row/));
    await user.type(advanced().getByLabelText(/^Row/), '4');
    await user.clear(advanced().getByLabelText(/^Column/));
    await user.type(advanced().getByLabelText(/^Column/), '7');
    await user.click(advanced().getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText('Row 4, column 7')).toBeInTheDocument();
    expect(screen.getByText('407')).toBeInTheDocument();
  });

  it('waits for the deliberate action rather than reading each keystroke', async () => {
    const { user } = await openAndRun(modularBloom.id);

    await user.clear(advanced().getByLabelText(/^Row/));
    await user.type(advanced().getByLabelText(/^Row/), '12');

    // "1" on the way to "12" must not choose a cell — and must not count every
    // matching cell in the matrix while doing it.
    expect(screen.queryByText(/^Row /)).not.toBeInTheDocument();
  });

  it('names the extent of each axis', async () => {
    await openAndRun(modularBloom.id, labelled(5, 9));
    // The range has to be knowable before a value is rejected.
    expect(screen.getByLabelText('Row of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Column of 9')).toBeInTheDocument();
  });

  it('refuses a coordinate the matrix does not have', async () => {
    const { user } = await openAndRun(modularBloom.id, labelled(4, 4));
    await user.click(advanced().getByRole('button', { name: 'Inspect' }));
    await screen.findByText('Row 1, column 1');

    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '99' } });
    await user.click(advanced().getByRole('button', { name: 'Inspect' }));

    /*
     * The field declares its extent, so the browser refuses the submission and
     * says why. Better than accepting it and quietly reading a different cell —
     * which is what an application-side clamp alone would do, and is how this
     * was first written.
     */
    expect(advanced().getByLabelText(/^Row/)).toBeInvalid();
    expect(screen.getByText('Row 1, column 1')).toBeInTheDocument();
  });

  it('treats an empty field as the first row or column', async () => {
    // An empty number input is perfectly valid, so this one does reach the
    // application and has to mean something sensible.
    const { user } = await openAndRun(modularBloom.id, labelled(4, 4));

    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '3' } });
    await user.click(advanced().getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText('Row 1, column 3')).toBeInTheDocument();
  });

  it('steps through the cells in reading order', async () => {
    const { user } = await openAndRun(modularBloom.id, labelled(4, 4));

    await user.click(advanced().getByRole('button', { name: 'Inspect' }));
    await screen.findByText('Row 1, column 1');

    await user.click(advanced().getByRole('button', { name: 'Next cell' }));
    expect(await screen.findByText('Row 1, column 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous cell' }));
    expect(await screen.findByText('Row 1, column 1')).toBeInTheDocument();
  });

  it('carries on to the next row at the end of one', async () => {
    const { user } = await openAndRun(modularBloom.id, labelled(4, 4));

    await user.clear(advanced().getByLabelText(/^Column/));
    await user.type(advanced().getByLabelText(/^Column/), '4');
    await user.click(advanced().getByRole('button', { name: 'Inspect' }));
    await screen.findByText('Row 1, column 4');

    await user.click(advanced().getByRole('button', { name: 'Next cell' }));
    expect(await screen.findByText('Row 2, column 1')).toBeInTheDocument();
  });

  it('follows a cell chosen by pressing the artwork', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    // The fields show where the press landed, so stepping goes on from there
    // rather than from wherever they were left.
    expect(advanced().getByLabelText(/^Row/)).toHaveValue(2);
    expect(advanced().getByLabelText(/^Column/)).toHaveValue(3);

    await user.click(advanced().getByRole('button', { name: 'Next cell' }));
    expect(await screen.findByText('Row 2, column 4')).toBeInTheDocument();
  });

  it('reaches the same reading as a press does', async () => {
    const { user } = await openAndRun(modularBloom.id);

    press(125, 75);
    await screen.findByText('Row 2, column 3');
    const pressed = announced();

    await user.click(advanced().getByRole('button', { name: 'Clear selection' }));
    await user.clear(advanced().getByLabelText(/^Row/));
    await user.type(advanced().getByLabelText(/^Row/), '2');
    await user.clear(advanced().getByLabelText(/^Column/));
    await user.type(advanced().getByLabelText(/^Column/), '3');
    await user.click(advanced().getByRole('button', { name: 'Inspect' }));

    await screen.findByText('Row 2, column 3');
    // Two routes, one result model.
    expect(announced()).toBe(pressed);
  });

  it('clears the selection', async () => {
    const { user } = await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    await user.click(advanced().getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText('Row 2, column 3')).not.toBeInTheDocument();
  });

  it('costs no execution', async () => {
    const { user, service } = await openAndRun(modularBloom.id);
    const before = service.executionCount;

    await user.click(advanced().getByRole('button', { name: 'Inspect' }));
    await screen.findByText('Row 1, column 1');
    await user.click(advanced().getByRole('button', { name: 'Next cell' }));
    await screen.findByText('Row 1, column 2');

    expect(service.executionCount).toBe(before);
  });
});

describe('what is announced', () => {
  it('reads as a sentence rather than as a layout', async () => {
    await openAndRun(modularBloom.id);
    press(125, 75);

    await screen.findByText('Row 2, column 3');
    // Not "Row 2, column 3 Clear 203 The only cell…", which is what reading the
    // panel as it falls would give.
    expect(announced()).toBe('Row 2, column 3. Value 203. The only cell with this value.');
  });

  it('lets the preset’s note follow the value', async () => {
    await openAndRun(
      mandelbrotField.id,
      fromNested([
        [1, 2],
        [3, CEILING],
      ]),
    );
    press(300, 300);

    await screen.findByText('Row 2, column 2');
    expect(announced()).toMatch(
      new RegExp(
        `Row 2, column 2\\. Value ${String(CEILING)}\\..*This point reached the maximum of ${String(CEILING)} iterations\\.`,
        'u',
      ),
    );
  });

  it('announces from one place, not two', async () => {
    await openAndRun(modularBloom.id);
    press(125, 75);
    await screen.findByText('Row 2, column 3');

    // The visible layout is hidden from assistive technology so that it is not
    // announced alongside the sentence written for the purpose.
    const speaking = screen
      .getAllByRole('status')
      .filter((element) => /Value 203/u.test(element.textContent ?? ''));
    expect(speaking).toHaveLength(1);
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
    await waitFor(() => expect(announced()).toMatch(/^Row \d+, column \d+\./u));
  });
});

describe('what a preset can add', () => {
  it('quotes the ceiling from the visible code', async () => {
    const ceiling = fromNested([
      [1, 2],
      [3, CEILING],
    ]);
    await openAndRun(mandelbrotField.id, ceiling);

    press(300, 300);
    expect(
      await screen.findByText(`This point reached the maximum of ${String(CEILING)} iterations.`),
    ).toBeInTheDocument();
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
    await pressRunWith(user);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    press(300, 300);
    expect(await screen.findByText('This point reached the maximum of 40 iterations.')).toBeInTheDocument();
  });

  it('explains a view that is entirely at the limit', async () => {
    await openAndRun(
      mandelbrotField.id,
      fromNested([
        [CEILING, CEILING],
        [CEILING, CEILING],
      ]),
    );

    // Mathematically correct, and indistinguishable from a fault unless said.
    await waitFor(() =>
      expect(announced()).toMatch(/Every point in this view reached the current iteration limit/u),
    );
  });

  it('says it once, not again for every press', async () => {
    await openAndRun(
      mandelbrotField.id,
      fromNested([
        [CEILING, CEILING],
        [CEILING, CEILING],
      ]),
    );
    await waitFor(() => expect(announced()).toMatch(/Every point in this view/u));

    press(100, 100);

    // Pressing answers the same question more precisely; repeating the general
    // note over it would be noise in a live region.
    await waitFor(() => expect(announced()).not.toMatch(/Every point in this view/u));
    expect(announced()).toContain(`This point reached the maximum of ${String(CEILING)} iterations.`);
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

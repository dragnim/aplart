/**
 * Choosing how iteration counts become colours, in the workspace.
 *
 * The mapping has its own unit tests. These are about the promises around it:
 * that reading the numbers differently never re-runs the APL, that the setting
 * travels with the artwork, that the inspector describes what was actually
 * drawn, and that a flat result is still called flat rather than dressed up.
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
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { advanced, codeEditor, pressRunWith } from '../helpers/workspaceModes';

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

/** Escape counts that look like a real slice: some escaped, some did not. */
function escapeCounts(size = 8, ceiling = CEILING): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) =>
        row === column ? ceiling : 1 + ((row * size + column) % (ceiling - 1)),
      ),
    ),
  );
}

async function openAndRun(matrix = escapeCounts(), sharedState: string | null = null) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', matrix);
  render(<WorkspacePage presetId={mandelbrotField.id} sharedState={sharedState} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

function modeSelect() {
  return screen.getByLabelText('Mode') as HTMLSelectElement;
}

/**
 * What the inspector's live region says.
 *
 * The panel says everything twice — a visible layout and a sentence written to
 * be heard — and the workspace has a second status region of its own for run
 * notices, so this picks out the one being asked about.
 */
function announced(): string {
  const spoken = screen
    .getAllByRole('status')
    .find((element) => /Row \d+, column \d+|Every point in this view/u.test(element.textContent ?? ''));
  return spoken?.textContent ?? '';
}

/** Chooses a cell without a pointer, through the controls the keyboard has. */
async function inspect(user: ReturnType<typeof userEvent.setup>, row: number, column: number) {
  fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: String(row) } });
  fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: String(column) } });
  await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));
  return announced();
}

describe('where the controls appear', () => {
  it('offers colouring modes for a preset that declares a range', async () => {
    await openAndRun();
    expect(modeSelect()).toBeInTheDocument();
    expect(screen.getByText(/Iteration colouring/)).toBeInTheDocument();
  });

  it('offers none for a preset whose values have no known bounds', async () => {
    const user = userEvent.setup();
    const service = new MockAplExecutionService();
    service.register('default', escapeCounts());
    render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);
    await pressRunWith(user);
    await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());

    // Nothing here has a ceiling to map against, so there is nothing honest to
    // offer. It keeps normalising against its own contents.
    expect(screen.queryByText(/Iteration colouring/)).not.toBeInTheDocument();
  });

  it('shows a mode’s own setting only while that mode is chosen', async () => {
    await openAndRun();
    expect(screen.queryByLabelText(/Iterations per band/)).not.toBeInTheDocument();

    fireEvent.change(modeSelect(), { target: { value: 'repeating' } });
    expect(screen.getByLabelText(/Iterations per band/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Number of bands/)).not.toBeInTheDocument();

    fireEvent.change(modeSelect(), { target: { value: 'threshold' } });
    expect(screen.getByLabelText(/Number of bands/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Iterations per band/)).not.toBeInTheDocument();
  });
});

describe('what changing the colouring costs', () => {
  it('never runs the APL', async () => {
    const { service } = await openAndRun();
    const before = service.executionCount;

    for (const mode of ['bands', 'repeating', 'insideOutside', 'threshold', 'smooth']) {
      fireEvent.change(modeSelect(), { target: { value: mode } });
    }
    fireEvent.change(modeSelect(), { target: { value: 'repeating' } });
    fireEvent.change(screen.getByLabelText(/Iterations per band/), { target: { value: '9' } });

    // It is a different reading of numbers already in hand. Asking TryAPL again
    // would be both slower and dishonest about what changed.
    expect(service.executionCount).toBe(before);
  });

  it('leaves the visible APL alone', async () => {
    await openAndRun();
    const before = codeEditor().textContent;

    fireEvent.change(modeSelect(), { target: { value: 'insideOutside' } });

    // The rule the whole application runs on: if it did not change the
    // calculation, it must not pretend to have changed the code.
    expect(codeEditor().textContent).toBe(before);
  });

  it('leaves the matrix and the chosen cell alone', async () => {
    const { user } = await openAndRun();
    const described = screen.getByRole('img', { name: /grid/ }).getAttribute('aria-label');
    await inspect(user, 4, 7);

    fireEvent.change(modeSelect(), { target: { value: 'bands' } });

    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(described ?? '');
    expect(announced()).toContain('Row 4, column 7');
  });
});

describe('what the inspector says', () => {
  it('always shows the raw value, whatever the mode', async () => {
    const { user } = await openAndRun();
    for (const mode of ['smooth', 'bands', 'repeating', 'insideOutside', 'threshold']) {
      fireEvent.change(modeSelect(), { target: { value: mode } });
      // The number is what the APL produced. A colouring is a reading of it and
      // can never replace it.
      expect(await inspect(user, 1, 2)).toContain('Value 2.');
    }
  });

  it('gives the band number when the mode has bands, and none when it does not', async () => {
    const { user } = await openAndRun();

    fireEvent.change(modeSelect(), { target: { value: 'threshold' } });
    fireEvent.change(screen.getByLabelText(/Number of bands/), { target: { value: '6' } });
    expect(await inspect(user, 1, 2)).toMatch(/Colour band \d+ of 6\./);

    fireEvent.change(modeSelect(), { target: { value: 'smooth' } });
    expect(announced()).not.toMatch(/Colour band/);
  });

  it('says a cell reached the limit only when it reached the declared limit', async () => {
    const { user } = await openAndRun();

    // Row 3, column 3 is on the diagonal, which this matrix sets to the ceiling.
    expect(await inspect(user, 3, 3)).toContain(`reached the maximum of ${String(CEILING)} iterations`);

    /*
     * Row 1, column 2 holds 2. Before the declared range existed the note fired
     * on the largest value *in the matrix*, so a view where nothing reached the
     * limit still claimed one had.
     */
    expect(await inspect(user, 1, 2)).toContain('Escaped before the iteration limit.');
    expect(announced()).not.toContain('reached the maximum');
  });

  it('never claims a point is in the set', async () => {
    const { user } = await openAndRun();
    fireEvent.change(modeSelect(), { target: { value: 'insideOutside' } });
    const status = await inspect(user, 3, 3);

    // It reached the limit. Nothing here proves it never escapes, and the
    // wording must not suggest otherwise.
    expect(status).toMatch(/reached the maximum/);
    expect(status).not.toMatch(/in the set|inside the set|member/i);
  });

  it('follows the ceiling the result was produced under, not the editor', async () => {
    const { user } = await openAndRun();
    expect(await inspect(user, 3, 3)).toContain(`reached the maximum of ${String(CEILING)} iterations`);

    /*
     * Raised in the editor and not run. The matrix on screen is still a
     * CEILING-iteration result, so it still means what CEILING iterations produced —
     * `tests/integration/resultSemantics.test.tsx` covers that boundary in
     * full, including the failed-run case.
     */
    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
    await waitFor(() => expect(codeEditor().textContent).toContain('iterations←60'));

    expect(await inspect(user, 3, 3)).toContain(`reached the maximum of ${String(CEILING)} iterations`);
  });
});

describe('a result with no variation in it', () => {
  it('keeps saying so, under every mode', async () => {
    const uniform = fromNested(Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => CEILING)));
    await openAndRun(uniform);

    for (const mode of ['smooth', 'bands', 'repeating', 'insideOutside', 'threshold']) {
      fireEvent.change(modeSelect(), { target: { value: mode } });
      // No mode can add detail to a matrix that has none, so the message has to
      // survive all of them rather than being treated as a colouring problem.
      // The live region and the visible note carry the same sentence, which is
      // why this asks the region rather than the document.
      expect(announced()).toContain('Every point in this view reached the current iteration limit');
    }
  });

  it('says nothing of the kind about a view that is flat well below the limit', async () => {
    const flat = fromNested(Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 1)));
    await openAndRun(flat);

    // Equally uniform, and it reached nothing at all.
    expect(screen.queryByText(/reached the current iteration limit/)).not.toBeInTheDocument();
  });
});

describe('keeping the choice', () => {
  it('saves it and restores it', async () => {
    await openAndRun();
    fireEvent.change(modeSelect(), { target: { value: 'repeating' } });
    fireEvent.change(screen.getByLabelText(/Iterations per band/), { target: { value: '7' } });

    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');
    await waitFor(
      () => {
        const project = readSavedProjectImmediate(mandelbrotField.id);
        expect(project?.renderOptions.colouring).toEqual({
          mode: 'repeating',
          bandWidth: 7,
          thresholdBands: 6,
        });
      },
      { timeout: 4000 },
    );
  });

  it('survives a shared link', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'heat',
      colouring: { mode: 'threshold', bandWidth: 4, thresholdBands: 9 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(escapeCounts(), encoded);
    await screen.findByText(/shared with you/);

    expect(modeSelect()).toHaveValue('threshold');
    expect(screen.getByLabelText(/Number of bands/)).toHaveValue('9');
  });

  it('opens a link written before colouring modes existed', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'heat',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(escapeCounts(), encoded);
    await screen.findByText(/shared with you/);

    // The smooth gradient, which is what those links were drawn with.
    expect(modeSelect()).toHaveValue('smooth');
  });

  it('draws something sensible when a link carries nonsense', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'heat',
      colouring: { mode: 'psychedelic', bandWidth: -2, thresholdBands: 900 } as never,
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(escapeCounts(), encoded);
    await screen.findByText(/shared with you/);

    expect(modeSelect()).toHaveValue('smooth');
    expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument();
  });

  it('is not undone by moving about', async () => {
    await openAndRun();
    fireEvent.change(modeSelect(), { target: { value: 'bands' } });

    // A drag rewrites the centre and span and runs again. The colouring is not
    // part of the view, so it has no business being reset by one.
    const canvas = screen.getByRole('img', { name: /grid/ });
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: 300, pointerId: 1 });
    await waitFor(() => expect(modeSelect()).toBeInTheDocument());

    // Still bands, and the code really did move — otherwise this proves nothing.
    expect(modeSelect()).toHaveValue('bands');
    expect(codeEditor().textContent).not.toContain('zoom←1.4');
  });
});

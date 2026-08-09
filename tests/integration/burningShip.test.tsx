/**
 * Burning Ship in the workspace.
 *
 * The artwork is one line's difference from Mandelbrot, so what matters here is
 * that the line is the thing on screen and the thing that runs: the editor shows
 * the absolute values, the controls rewrite only the five assignments they own,
 * and exploring the plane leaves the step line alone. A drag that reformatted
 * `x←|zr` would leave the arithmetic intact and the artwork's source spoiled.
 *
 * Nothing here asserts that a picture looks like a ship. That belongs to the
 * fixture tests, which read real service output; a mock returns whatever it was
 * handed, and a test that drew conclusions from it would be describing itself.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { burningShip } from '@/presets/burning-ship';
import { encodeShareState } from '@/sharing/encodeShareState';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { advanced, codeEditor, pressRunWith } from '../helpers/workspaceModes';

const CANVAS = { left: 0, top: 0, width: 400, height: 400 };
const CEILING = 48;

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

/** Escape counts with both ends of the declared range present. */
function counts(size = 8, ceiling = CEILING): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) => {
        if (row === 0 && column === 0) return 1;
        return row === column ? ceiling : 1 + ((row * size + column) % (ceiling - 1));
      }),
    ),
  );
}

function serviceWith(matrix = counts()) {
  const service = new MockAplExecutionService();
  service.register('default', matrix);
  return service;
}

const editor = () => codeEditor();
const source = () => editor().textContent ?? '';

/** One run sends exactly one first request, whatever transport follows. */
const runCount = (received: readonly string[]) =>
  received.filter((code) => code.includes(ADAPTIVE_MARKER)).length;

async function open(service = serviceWith()) {
  const user = userEvent.setup();
  render(<WorkspacePage presetId={burningShip.id} sharedState={null} service={service} />);
  await pressRunWith(user);
  await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument(), { timeout: 5000 });
  return { user, service };
}

describe('the artwork opens as itself', () => {
  it('shows the absolute values in the editor', async () => {
    await open();

    // The difference from Mandelbrot, on screen, unedited.
    expect(source()).toContain('x←|zr');
    expect(source()).toContain('y←|zi');
    expect(source()).toContain('(x*2)-y*2');
  });

  it('offers five controls and no switch for the absolute values', async () => {
    await open();

    for (const label of ['Resolution', 'Maximum iterations', 'Centre across', 'Centre down', 'Span']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/absolute/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /absolute|magnitude/i })).not.toBeInTheDocument();
  });

  it('opens at the view that shows the ship', async () => {
    await open();

    expect(source()).toContain('centreX←¯1.755');
    expect(source()).toContain('centreY←¯0.02');
    expect(source()).toContain('zoom←0.06');
  });
});

describe('the controls', () => {
  it('rewrites its own assignment and costs exactly one run', async () => {
    const { user, service } = await open();
    const before = runCount(service.received);

    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
    await waitFor(() => expect(source()).toContain('iterations←60'));

    await pressRunWith(user);
    await waitFor(() => expect(runCount(service.received)).toBe(before + 1));

    // The step line is untouched by anything a slider does.
    expect(source()).toContain('x←|zr ⋄ y←|zi');
  });

  it('writes a negative centre in APL’s own notation', async () => {
    await open();

    fireEvent.change(screen.getByLabelText('Centre across'), { target: { value: '-1.8' } });
    await waitFor(() => expect(source()).toContain('centreX←¯1.8'));

    // Not a hyphen: `-1.8` is a function applied to 1.8, and the artwork's source
    // has to remain APL somebody could retype.
    expect(source()).not.toContain('centreX←-1.8');
  });
});

describe('exploring the plane', () => {
  it('leaves the step line byte-identical after a drag', async () => {
    const { service } = await open();
    /*
     * Compared as a substring, not by splitting on newlines: CodeMirror renders
     * each line as its own element and the accessible text runs them together, so
     * a line-based comparison would silently find nothing and pass.
     */
    const STEP =
      'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ x←|zr ⋄ y←|zi ⋄ ' +
      '(¯9⌈9⌊cr+(x*2)-y*2)(¯9⌈9⌊ci+2×x×y)a(n+a)}';
    expect(source()).toContain(STEP);

    const canvas = screen.getByRole('img', { name: /grid/ });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 80, clientY: 80 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 240, clientY: 240 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 240, clientY: 240 });

    await waitFor(() => expect(source()).not.toContain('zoom←0.06'));

    // The view moved; the arithmetic did not.
    expect(source()).toContain(STEP);
    expect(runCount(service.received)).toBeGreaterThan(0);
  });
});

describe('the artwork travels', () => {
  it('comes back from a shared link with its own program', async () => {
    const service = serviceWith();
    const encoded = encodeShareState({
      v: 1,
      preset: burningShip.id,
      code: burningShip.code.replace('iterations←48', 'iterations←52'),
      params: {},
      palette: 'heat',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    render(<WorkspacePage presetId={burningShip.id} sharedState={encoded} service={service} />);
    await screen.findByText(/shared with you/);

    expect(source()).toContain('iterations←52');
    expect(source()).toContain('x←|zr');
  });
});

describe('what a cell means', () => {
  it('never claims a point is inside anything', async () => {
    const { user } = await open(serviceWith(counts(8)));

    // The diagonal is at the ceiling in this fixture, so (3, 3) is a ceiling cell.
    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '2' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '2' } });
    await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));

    const wording = await screen.findByText(
      `This point reached the maximum of ${String(CEILING)} iterations.`,
    );
    expect(wording).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/inside the set|in the burning ship|is a member/iu);
  });
});

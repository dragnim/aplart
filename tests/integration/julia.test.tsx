/**
 * Julia Set in the workspace.
 *
 * The constant is the artwork. Everything here is about that: moving it costs
 * exactly one run, changing how the result is drawn costs none, and exploring
 * the plane must not touch it — not numerically and not textually, because a
 * rewrite that turned `¯0.8` into `-0.8` or `0.156` into a float's full decimal
 * expansion would leave the arithmetic intact and the artwork's source spoiled.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { juliaSet } from '@/presets/julia-set';
import { encodeShareState } from '@/sharing/encodeShareState';
import { LocalProjectRepository } from '@/storage/LocalProjectRepository';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { advanced, codeEditor, paletteChoice, pressRunWith } from '../helpers/workspaceModes';

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

async function openAndRun(sharedState: string | null = null) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', counts());
  render(<WorkspacePage presetId={juliaSet.id} sharedState={sharedState} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  /*
   * Waited out, not merely painted. This preset declares high-resolution output,
   * so one run is a probe followed by bands — several calls to the service. A
   * count taken while the first run is still arriving is not a baseline.
   */
  await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
  return { user, service };
}

const editor = () => codeEditor();
const source = () => editor().textContent ?? '';
const canvas = () => screen.getByRole('img', { name: /grid/ });

/**
 * The two assignments, exactly as they appear in the editor.
 *
 * Matched out of the whole text rather than split into lines: CodeMirror renders
 * each line as its own element and `textContent` runs them together, so there
 * are no newlines to split on.
 */
function constantLines(text = source()): string[] {
  return [/realC←[^\sa-zA-Z⍝]*/u, /imagC←[^\sa-zA-Z⍝]*/u].map((pattern) => pattern.exec(text)?.[0] ?? '');
}

/**
 * How many runs have happened.
 *
 * Counted by first requests, not by all requests. A result this size does not
 * print, so one run is a first request followed by one or more bands — counting
 * every call to the service would report a number that depends on the matrix
 * size rather than on how many times the artwork ran. Exactly one first request
 * is sent per run, whichever way the result comes back.
 */
function runCount(received: readonly string[]): number {
  return received.filter((code) => code.includes(ADAPTIVE_MARKER)).length;
}

async function setControl(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await waitFor(() => expect(screen.getByLabelText(label)).toHaveValue(value));
}

describe('the artwork opens as itself', () => {
  it('shows its own program, with the constant in it', async () => {
    await openAndRun();
    expect(source()).toContain('realC←¯0.8');
    expect(source()).toContain('imagC←0.156');
    expect(source()).toContain('startR←(size,size)⍴ax');
  });

  it('offers both parts of c as ordinary sliders', async () => {
    await openAndRun();
    expect(screen.getByLabelText('Real part of c')).toHaveValue('-0.8');
    expect(screen.getByLabelText('Imaginary part of c')).toHaveValue('0.156');

    // No complex-number widget and no list of interesting constants.
    expect(screen.queryByLabelText(/complex/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /constant|preset|example/iu })).not.toBeInTheDocument();
  });
});

describe('moving the constant', () => {
  it('rewrites the visible source and costs exactly one run', async () => {
    const { user, service } = await openAndRun();
    const before = runCount(service.received);
    expect(before).toBe(1);

    await setControl('Real part of c', '-0.75');
    // The code changes at once; the run is a separate, deliberate act.
    expect(source()).toContain('realC←¯0.75');
    expect(runCount(service.received)).toBe(before);

    await pressRunWith(user);
    await waitFor(() => expect(runCount(service.received)).toBe(before + 1));

    // One run, and no second one of its own accord.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(runCount(service.received)).toBe(before + 1);
    expect(service.received.at(-1)).toContain('realC←¯0.75');
  });

  it('writes the imaginary part in APL’s own notation', async () => {
    const { user } = await openAndRun();

    await setControl('Imaginary part of c', '-0.2');
    // High minus, not a hyphen: the source has to remain APL somebody can paste.
    expect(source()).toContain('imagC←¯0.2');
    expect(source()).not.toContain('imagC←-0.2');

    await pressRunWith(user);
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
  });
});

describe('exploring the plane', () => {
  it('leaves the constant byte-identical after a drag', async () => {
    const { service } = await openAndRun();
    const constantBefore = constantLines();
    expect(constantBefore).toEqual(['realC←¯0.8', 'imagC←0.156']);

    const target = canvas();
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: 80, clientY: 90 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 260, clientY: 270 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 260, clientY: 270 });

    // The drag did what it is for.
    await waitFor(() => expect(source()).not.toContain('zoom←1.3'));
    expect(service.executionCount).toBeGreaterThan(0);

    /*
     * And did not touch the constant. Compared as text, not as numbers: a
     * rewrite that reformatted the high minus or expanded 0.156 to a float's
     * full decimal would pass a numeric check and still have vandalised the
     * program somebody is reading.
     */
    expect(constantLines()).toEqual(constantBefore);
  });

  it('leaves it alone through zoom and pan buttons too', async () => {
    const { user } = await openAndRun();
    const constantBefore = constantLines();

    for (const name of ['Zoom in', 'Pan left', 'Zoom out', 'Pan down']) {
      await user.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
      expect(constantLines(), name).toEqual(constantBefore);
    }
  });
});

describe('changing only how it is drawn', () => {
  it('costs no execution and leaves the source alone', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;
    const code = source();

    await user.click(paletteChoice(/Abyss/));
    await user.click(advanced().getByRole('radio', { name: 'Smooth' }));
    await user.click(advanced().getByRole('radio', { name: 'Mirror repeat' }));
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'bands' } });

    expect(service.executionCount).toBe(before);
    expect(source()).toBe(code);
    expect(canvas()).toHaveAccessibleName(/Abyss palette/);
  });
});

describe('the constant travels with the artwork', () => {
  it('is saved and restored, both parts', async () => {
    await openAndRun();
    await setControl('Real part of c', '-0.65');
    await setControl('Imaginary part of c', '0.42');

    const repository = new LocalProjectRepository();
    await waitFor(async () => {
      const summaries = await repository.list();
      expect(summaries.length).toBeGreaterThan(0);
      const project = await repository.get(summaries[0]?.id ?? '');
      expect(project?.code).toContain('realC←¯0.65');
      expect(project?.code).toContain('imagC←0.42');
    });
  });

  it('comes back from a shared link, both parts', async () => {
    const shared = juliaSet.code.replace('realC←¯0.8', 'realC←0.285').replace('imagC←0.156', 'imagC←0.01');

    const encoded = encodeShareState({
      v: 1,
      preset: juliaSet.id,
      code: shared,
      params: {},
      palette: 'poolrooms',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);

    expect(source()).toContain('realC←0.285');
    expect(source()).toContain('imagC←0.01');
    expect(screen.getByLabelText('Real part of c')).toHaveValue('0.285');
    expect(screen.getByLabelText('Imaginary part of c')).toHaveValue('0.01');
  });
});

describe('what a cell means', () => {
  it('says a ceiling value did not escape, never that it is in the set', async () => {
    const { user } = await openAndRun();

    // The diagonal holds the ceiling; row 2, column 2 is on it.
    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '2' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '2' } });
    await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));

    const wording = await screen.findByText(
      `This point did not escape within ${String(CEILING)} iterations.`,
    );
    expect(wording).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/in the julia set|inside the set|is a member/iu);
  });
});

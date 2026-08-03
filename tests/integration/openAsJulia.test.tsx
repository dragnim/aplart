/**
 * Which point on the Mandelbrot set the handoff actually hands over.
 *
 * Every expected coordinate below is worked out by hand from the axis the preset
 * declares — `centre + span × (¯1 + 2×(i−1)÷(n−1))` — and written as a literal.
 * None of them is produced by calling the code under test. Two paths through the
 * same helper agreeing proves nothing if the helper has row and column the wrong
 * way round, and that is exactly the fault that would hand over a plausible
 * coordinate for the wrong point: a Julia set nobody chose, that looks like a
 * Julia set.
 *
 * The presentation cases matter for the same reason. Rotation, mirroring and
 * repeated composition are unwound before a cell is recorded, so all four should
 * resolve to the same underlying cell — but "should" is the word that has caught
 * this project out before, so each is pressed on screen and checked.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { juliaSet } from '@/presets/julia-set';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { modularBloom } from '@/presets/modular-bloom';
import { PROBE_MARKER } from '@/execution/transport';
import { decodeShareState } from '@/sharing/decodeShareState';
import { WorkspacePage } from '@/workspace/WorkspacePage';

/** A square canvas, so the artwork fills it and a press maps to a clean fraction. */
const CANVAS = { left: 0, top: 0, width: 360, height: 360 };

/**
 * An odd size, so there is a true centre cell.
 *
 * Nine columns means column 5 is exactly the middle; with an even size the middle
 * falls between two cells and neither is the centre.
 */
const SIZE = 9;

/**
 * A deliberately asymmetric view, so a transposition cannot pass unnoticed.
 *
 * The span is the preset's own default, because the Span control is logarithmic
 * and setting a range input by position rather than by value would make the
 * arithmetic below depend on the slider's scale instead of on the view.
 */
const CENTRE_X = 0.5;
const CENTRE_Y = -0.25;
const SPAN = 1.4;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
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

  // CodeMirror measures text, and jsdom has no layout to measure.
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
});

/** Escape counts that differ per cell, so a misread cell shows up as a value. */
function counts(size = SIZE, ceiling = 48): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) => 1 + ((row * size + column) % (ceiling - 1))),
    ),
  );
}

const canvas = () => screen.getByRole('img', { name: /grid/ });
const source = () => screen.getByRole('textbox', { name: /APL/i }).textContent ?? '';
const juliaAction = () => screen.queryByRole('button', { name: 'Open as Julia set' });

async function openMandelbrot(matrix = counts()) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', matrix);
  render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);

  // The known viewport, then a run, so the completed result carries it.
  fireEvent.change(screen.getByLabelText('Centre across'), { target: { value: String(CENTRE_X) } });
  fireEvent.change(screen.getByLabelText('Centre down'), { target: { value: String(CENTRE_Y) } });
  await waitFor(() => expect(source()).toContain(`centreX←${String(CENTRE_X)}`));

  await user.click(screen.getByRole('button', { name: /^Run/ }));
  await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
  return { user, service };
}

/** Presses the centre of a display cell, 1-based, on a square filled canvas. */
function pressDisplayCell(row: number, column: number) {
  const x = ((column - 0.5) / SIZE) * CANVAS.width;
  const y = ((row - 0.5) / SIZE) * CANVAS.height;
  const target = canvas();
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: x, clientY: y });
}

/** How many runs have happened, counted by probes rather than by requests. */
function runCount(received: readonly string[]): number {
  return received.filter((code) => code.includes(PROBE_MARKER)).length;
}

/** The token the action navigated to, or null if it did not navigate. */
function handoffToken(): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('h');
}

/**
 * The coordinate the action stored, read back the way Julia will read it.
 *
 * Observed through the payload rather than through a rendered Julia, because
 * these tests mount one workspace directly and there is no router in them to
 * follow the hash. What Julia then does with the payload is the next group down.
 */
function handedOverConstant(): { realC: number; imagC: number } | null {
  const token = handoffToken();
  if (token === null) return null;
  const raw = sessionStorage.getItem(`apl-art:handoff:${token}`);
  if (raw === null) return null;
  const payload = JSON.parse(raw) as { realC: number; imagC: number };
  return { realC: payload.realC, imagC: payload.imagC };
}

describe('the coordinate a selected cell stands for', () => {
  it('assumes the preset’s own span, and says so', () => {
    // Every expected value below is worked out at this span. Stated as an
    // assertion so that changing the preset's default fails here, loudly,
    // rather than quietly invalidating the arithmetic in the comments.
    expect(numberAssignedTo(mandelbrotField.code, 'zoom')).toBe(SPAN);
    expect(numberAssignedTo(mandelbrotField.code, 'size')).not.toBe(SIZE);
  });

  it('maps the exact centre cell of an odd matrix to the centre of the view', async () => {
    /*
     * Column 5 of 9 is u = (5−1)/8 = 0.5, so x = centreX + span×(2×0.5−1) =
     * centreX exactly. Likewise for the row. Written out because it is the one
     * case with an answer that needs no arithmetic at all.
     */
    const { user } = await openMandelbrot();
    pressDisplayCell(5, 5);
    await screen.findByText('Row 5, column 5');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());

    expect(handedOverConstant()).toEqual({ realC: 0.5, imagC: -0.25 });
  });

  it('maps an off-centre cell with the right orientation and signs', async () => {
    /*
     * Row 2, column 7 of 9, by hand:
     *   u = (7−1)/8 = 0.75  → x = 0.5 + 1.4×(1.5−1) = 0.5 + 0.7 = 1.2
     *   v = (2−1)/8 = 0.125 → y = ¯0.25 + 1.4×(0.25−1) = ¯0.25 − 1.05 = ¯1.3
     *
     * Asymmetric in both axes, so a transposed row and column, a flipped axis or
     * a lost sign each produce a different answer.
     */
    const { user } = await openMandelbrot();
    pressDisplayCell(2, 7);
    await screen.findByText('Row 2, column 7');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());

    expect(handedOverConstant()).toEqual({ realC: 1.2, imagC: -1.3 });
  });
});

describe('the same point through every presentation', () => {
  /**
   * Each case presses a display cell chosen so that the *source* cell is row 3,
   * column 2 — whose coordinate, by hand, is:
   *   u = (2−1)/8 = 0.125 → x = 0.5 + 1.4×(0.25−1) = 0.5 − 1.05 = ¯0.55
   *   v = (3−1)/8 = 0.25  → y = ¯0.25 + 1.4×(0.5−1) = ¯0.25 − 0.7 = ¯0.95
   */
  const EXPECTED = { realC: -0.55, imagC: -0.95 };

  it('reads the same cell with no transformation at all', async () => {
    const { user } = await openMandelbrot();
    pressDisplayCell(3, 2);
    await screen.findByText('Row 3, column 2');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());
    expect(handedOverConstant()).toEqual(EXPECTED);
  });

  it('reads the same cell under a quarter turn', async () => {
    /*
     * The documented forward transform sends a source column to a display row
     * and a source row to a display column counted from the right. Undoing it:
     * su = v, sv = 1 − u. For source (row 3, column 2) of 9 the source
     * fractions are su ∈ [1/9, 2/9) and sv ∈ [2/9, 3/9), so a display press
     * needs v ∈ [1/9, 2/9) → display row 2, and 1 − u ∈ [2/9, 3/9) → u ∈
     * (6/9, 7/9] → display column 7.
     */
    const { user } = await openMandelbrot();
    await user.click(screen.getByRole('radio', { name: '90°' }));

    pressDisplayCell(2, 7);
    await screen.findByText('Row 3, column 2');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());
    expect(handedOverConstant()).toEqual(EXPECTED);
  });

  it('reads the same cell under a mirror', async () => {
    // Mirroring horizontally reverses the columns: source column 2 of 9 is
    // display column 8.
    const { user } = await openMandelbrot();
    await user.click(screen.getByLabelText('Mirror horizontally'));

    pressDisplayCell(3, 8);
    await screen.findByText('Row 3, column 2');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());
    expect(handedOverConstant()).toEqual(EXPECTED);
  });

  it('reads the same cell from a repeated copy', async () => {
    /*
     * Two by two, so each copy is half the box. Pressing inside the lower-right
     * copy must give the same cell as pressing the single artwork would: the
     * repeat is a way of looking at one matrix, not a larger one.
     */
    const { user } = await openMandelbrot();
    await user.click(screen.getByRole('radio', { name: 'Repeat' }));
    await user.click(screen.getByRole('radio', { name: '2 by 2' }));

    const x = CANVAS.width / 2 + ((2 - 0.5) / SIZE) * (CANVAS.width / 2);
    const y = CANVAS.height / 2 + ((3 - 0.5) / SIZE) * (CANVAS.height / 2);
    fireEvent.pointerDown(canvas(), { button: 0, pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas(), { button: 0, pointerId: 1, clientX: x, clientY: y });
    await screen.findByText('Row 3, column 2');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());
    expect(handedOverConstant()).toEqual(EXPECTED);
  });

  it('reads the same cell from a mirrored copy', async () => {
    /*
     * Under Mirror repeat the second column of copies is reflected, so pressing
     * the equivalent place in it lands on the same source cell — with the press
     * mirrored within the copy, which is what `unreflect` undoes.
     */
    const { user } = await openMandelbrot();
    await user.click(screen.getByRole('radio', { name: 'Mirror repeat' }));
    await user.click(screen.getByRole('radio', { name: '2 by 2' }));

    // Copy at column index 1 is reflected horizontally, so source column 2
    // appears at (SIZE − 2 + 1) = column 8 within that copy.
    const x = CANVAS.width / 2 + ((8 - 0.5) / SIZE) * (CANVAS.width / 2);
    const y = ((3 - 0.5) / SIZE) * (CANVAS.height / 2);
    fireEvent.pointerDown(canvas(), { button: 0, pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas(), { button: 0, pointerId: 1, clientX: x, clientY: y });
    await screen.findByText('Row 3, column 2');

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());
    expect(handedOverConstant()).toEqual(EXPECTED);
  });
});

describe('when the action is offered', () => {
  it('is absent on an artwork that is not Mandelbrot', async () => {
    const user = userEvent.setup();
    const service = new MockAplExecutionService();
    service.register('default', counts());
    render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);
    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(canvas()).toBeInTheDocument());

    pressDisplayCell(3, 2);
    // The panel names the cell twice — once to see and once to hear — so this
    // waits for any of them rather than insisting on exactly one.
    await waitFor(() => expect(screen.getAllByText(/Row \d+, column \d+/).length).toBeGreaterThan(0));

    expect(juliaAction()).not.toBeInTheDocument();
  });

  it('is absent before a run has completed', () => {
    const service = new MockAplExecutionService();
    service.register('default', counts());
    render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);

    // Nothing has been calculated, so there is no result to take a point from.
    expect(juliaAction()).not.toBeInTheDocument();
  });

  it('is absent until a cell is selected', async () => {
    await openMandelbrot();
    expect(juliaAction()).not.toBeInTheDocument();

    pressDisplayCell(4, 4);
    await screen.findByText('Row 4, column 4');
    expect(juliaAction()).toBeInTheDocument();
  });

  it('is reachable and usable from the keyboard', async () => {
    const { user } = await openMandelbrot();

    // Chosen through the inspector's own controls rather than a pointer.
    fireEvent.change(screen.getByLabelText(/^Row/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/^Column/), { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: /^Inspect$/ }));
    await screen.findByText('Row 5, column 5');

    const action = screen.getByRole('button', { name: 'Open as Julia set' });
    action.focus();
    expect(action).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(handedOverConstant()).toEqual({ realC: 0.5, imagC: -0.25 }));
  });
});

describe('which result the coordinate comes from', () => {
  it('ignores unexecuted edits in the editor', async () => {
    const { user } = await openMandelbrot();
    pressDisplayCell(5, 5);
    await screen.findByText('Row 5, column 5');

    // Moved but not run: this describes the next run, not the picture on screen.
    fireEvent.change(screen.getByLabelText('Centre across'), { target: { value: '-1.9' } });
    await waitFor(() => expect(source()).toContain('centreX←¯1.9'));

    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());

    // Still the completed result's centre, not the editor's.
    expect(handedOverConstant()).toEqual({ realC: 0.5, imagC: -0.25 });
  });

  it('follows a later successful run', async () => {
    const { user } = await openMandelbrot();

    // A second run at a different centre becomes the authority.
    fireEvent.change(screen.getByLabelText('Centre across'), { target: { value: '0' } });
    await waitFor(() => expect(source()).toContain('centreX←0'));
    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

    pressDisplayCell(5, 5);
    await screen.findByText('Row 5, column 5');
    await user.click(screen.getByRole('button', { name: 'Open as Julia set' }));
    await waitFor(() => expect(handoffToken()).not.toBeNull());

    expect(handedOverConstant()).toEqual({ realC: 0, imagC: -0.25 });
  });
});

describe('what Julia does with the handoff', () => {
  const TOKEN = 'test-token';
  const CONSTANT = { realC: -0.55, imagC: -0.95 };

  function storePayload(payload: unknown, token = TOKEN) {
    sessionStorage.setItem(`apl-art:handoff:${token}`, JSON.stringify(payload));
  }

  function valid(overrides: Record<string, unknown> = {}) {
    return { version: 1, preset: juliaSet.id, ...CONSTANT, ...overrides };
  }

  function openJulia(token: string | null = TOKEN) {
    const user = userEvent.setup();
    const service = new MockAplExecutionService();
    service.register('default', counts());
    const view = render(
      <WorkspacePage presetId={juliaSet.id} sharedState={null} handoff={token} service={service} />,
    );
    return { user, service, view };
  }

  it('opens on the handed-over constant, in APL’s own notation', () => {
    storePayload(valid());
    openJulia();

    // High minus, and no float noise: the same rounding rule the viewport uses.
    expect(source()).toContain('realC←¯0.55');
    expect(source()).toContain('imagC←¯0.95');
    expect(screen.getByLabelText('Real part of c')).toHaveValue('-0.55');
    expect(screen.getByLabelText('Imaginary part of c')).toHaveValue('-0.95');
  });

  it('keeps Julia’s own view and presentation, not Mandelbrot’s', () => {
    storePayload(valid());
    openJulia();

    /*
     * Only the constant was replaced. Mandelbrot's centre and span described the
     * plane c was chosen from, not the plane this set lives on.
     */
    expect(source()).toContain('centreX←0');
    expect(source()).toContain('centreY←0');
    expect(source()).toContain('zoom←1.3');
    expect(source()).toContain('size←128');
    expect(source()).toContain('iterations←48');

    expect(screen.getByRole('radio', { name: /Poolrooms/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Pixel' })).toHaveAttribute('aria-checked', 'true');
  });

  it('is marked Edited, because its APL differs from the preset', () => {
    storePayload(valid());
    openJulia();

    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
  });

  it('runs once, and a reload rebuilds the same artwork and runs once again', async () => {
    storePayload(valid());
    const first = openJulia();

    /*
     * Counted by probes, because a high-resolution preset makes several requests
     * per run and counting requests would report the matrix size instead.
     */
    await waitFor(() => expect(runCount(first.service.received)).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(runCount(first.service.received)).toBe(1);
    expect(first.service.received.at(-1)).toContain('realC←¯0.55');

    /*
     * A reload, done properly: the workspace is torn down and mounted again with
     * the same token, which is what Reload and Forward both amount to. Merely
     * finding the payload still in storage would not have shown that a fresh
     * mount reconstructs the artwork from it.
     */
    first.view.unmount();
    const second = openJulia();

    expect(source()).toContain('realC←¯0.55');
    expect(source()).toContain('imagC←¯0.95');
    await waitFor(() => expect(runCount(second.service.received)).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(runCount(second.service.received)).toBe(1);
  });

  it.each([
    ['no token at all', null, undefined],
    ['a token with nothing stored', 'missing', undefined],
    ['a payload from a future version', TOKEN, { version: 2 }],
    ['a payload meant for another artwork', TOKEN, { preset: 'mandelbrot-field' }],
    ['a payload with an infinite constant', TOKEN, { realC: Number.POSITIVE_INFINITY }],
    ['a payload with a missing constant', TOKEN, { imagC: undefined }],
    ['a payload whose constant is text', TOKEN, { realC: '-0.55' }],
  ])('opens ordinary Julia for %s, without running anything', async (_name, token, overrides) => {
    /*
     * Session storage can be edited by hand, so a payload is untrusted input in
     * the way a shared link is. Anything that is not exactly a handoff for this
     * artwork must leave the preset alone: a half-applied constant would be a
     * Julia set nobody chose.
     */
    if (overrides !== undefined) storePayload(valid(overrides));
    const { service } = openJulia(token);

    expect(source()).toContain('realC←¯0.8');
    expect(source()).toContain('imagC←0.156');
    expect(screen.getByText('Original')).toBeInTheDocument();

    // Nothing ran: an artwork nobody asked for must not reach the service.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(service.received).toHaveLength(0);
  });

  it('shares the constant and never the token', async () => {
    storePayload(valid());
    const { user } = openJulia();
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

    /*
     * `navigator.clipboard` is a getter in jsdom, so it is defined over rather
     * than assigned to. Stubbed at all because Share's whole observable effect
     * is what it writes there.
     */
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (written: string) => {
          copied = written;
          return Promise.resolve();
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(copied).not.toBe(''));

    // The ordinary share representation, carrying the source — and no trace of
    // the handoff token, which means nothing outside this tab.
    expect(copied).toContain('#/art/julia-set?s=');
    expect(copied).not.toContain('h=');
    expect(copied).not.toContain(TOKEN);

    const encoded = new URL(copied).hash.split('?s=')[1] ?? '';
    const shared = decodeShareState(encoded);
    expect(shared.ok).toBe(true);
    expect(shared.ok ? shared.state.code : '').toContain('realC←¯0.55');
    expect(shared.ok ? shared.state.code : '').toContain('imagC←¯0.95');
  });
});

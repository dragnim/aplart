/**
 * Repeating the artwork, in the workspace.
 *
 * Tile preview is an appearance setting and the tests are mostly about proving
 * that: no execution, no change to the matrix, no change to the code, and the
 * cell somebody was reading still the cell they were reading. The geometry has
 * its own tests; these are about what repeating must not disturb.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { advanced, animate, codeEditor, paletteChoice, pressRunWith } from '../helpers/workspaceModes';
import type * as CanvasRenderer from '@/renderer/CanvasRenderer';

type CanvasRendererModule = typeof CanvasRenderer;

const CANVAS = { left: 0, top: 0, width: 400, height: 400 };

interface Painted {
  readonly options: {
    readonly tiling?: {
      mode: string;
      columns: number;
      rows: number;
      scale: number;
      showSeamGuides: boolean;
    };
  };
  readonly matrix: { readonly rows: number; readonly columns: number };
  readonly palette?: { readonly colours: readonly string[] };
}

const { drawCalls } = vi.hoisted(() => ({ drawCalls: [] as Painted[] }));

vi.mock('@/renderer/CanvasRenderer', async (importOriginal) => {
  const actual = await importOriginal<CanvasRendererModule>();
  return {
    ...actual,
    drawArtwork: (_canvas: unknown, request: Painted) => {
      drawCalls.push(request);
    },
  };
});

function lastTiling() {
  return drawCalls.at(-1)?.options.tiling;
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
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

function labelled(rows: number, columns: number) {
  return fromNested(
    Array.from({ length: rows }, (_unusedRow, row) =>
      Array.from({ length: columns }, (_unusedColumn, column) => (row + 1) * 100 + (column + 1)),
    ),
  );
}

async function openAndRun(sharedState: string | null = null) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', labelled(8, 8));
  render(<WorkspacePage presetId={modularBloom.id} sharedState={sharedState} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

const repeatButton = () => advanced().getByRole('radio', { name: 'Repeat' });
const singleButton = () => advanced().getByRole('radio', { name: 'Single' });

function announced(): string {
  const spoken = screen
    .getAllByRole('status')
    .find((element) => /Row \d+, column \d+/u.test(element.textContent ?? ''));
  return spoken?.textContent ?? '';
}

describe('turning the repeat on', () => {
  it('starts on a single copy', async () => {
    await openAndRun();
    expect(singleButton()).toHaveAttribute('aria-checked', 'true');
    // No count control until there is something to count.
    expect(advanced().queryByRole('radio', { name: '3 by 3' })).not.toBeInTheDocument();
  });

  it('offers the counts once repeating, and defaults to three by three', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());

    expect(advanced().getByRole('radio', { name: '3 by 3' })).toHaveAttribute('aria-checked', 'true');
    expect(lastTiling()).toMatchObject({ mode: 'repeat', columns: 3, rows: 3 });
  });

  it('draws the grid the count asks for', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());

    for (const count of [2, 5, 3]) {
      await user.click(advanced().getByRole('radio', { name: `${String(count)} by ${String(count)}` }));
      expect(lastTiling()).toMatchObject({ columns: count, rows: count });
    }
  });

  it('says so in the artwork’s description', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());

    // The repeat is part of what is on screen, so somebody who cannot see it
    // should still be told it is happening.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /Repeat preview, 3 columns by 3 rows/ })).toBeInTheDocument(),
    );
  });
});

describe('what repeating must not disturb', () => {
  it('never runs the APL', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;

    await user.click(repeatButton());
    await user.click(advanced().getByRole('radio', { name: '5 by 5' }));
    await user.click(singleButton());

    // Drawing the same result again is not a reason to compute it again.
    expect(service.executionCount).toBe(before);
  });

  it('leaves the visible APL alone', async () => {
    const { user } = await openAndRun();
    const before = codeEditor().textContent;

    await user.click(repeatButton());

    expect(codeEditor().textContent).toBe(before);
  });

  it('leaves the matrix alone', async () => {
    const { user } = await openAndRun();
    const before = drawCalls.at(-1)?.matrix;

    await user.click(repeatButton());

    expect(drawCalls.at(-1)?.matrix).toEqual(before);
  });

  it('keeps the cell somebody was reading', async () => {
    const { user } = await openAndRun();
    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '4' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '7' } });
    await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));
    expect(announced()).toContain('Row 4, column 7');

    await user.click(repeatButton());

    // Repeating changes where a cell is drawn, not which cell was chosen.
    expect(announced()).toContain('Row 4, column 7');
  });

  it('is undone by choosing Single', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    await user.click(singleButton());

    expect(lastTiling()?.mode).toBe('single');
  });
});

describe('pressing a repeated copy', () => {
  it('reads the same source cell from every copy', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    await user.click(advanced().getByRole('radio', { name: '3 by 3' }));

    const canvas = screen.getByRole('img', { name: /grid/ });
    const readings: string[] = [];

    /*
     * The centre of one particular cell in each of the nine copies, not an
     * arbitrary fraction. The artwork is 8 × 8, so a quarter of the way in
     * lands exactly on a cell boundary and rounding decides which side — a real
     * ambiguity, but not the one this test is about.
     */
    const intoCell = 2.5 / 8;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const x = (400 * (column + intoCell)) / 3;
        const y = (400 * (row + intoCell)) / 3;
        fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1, button: 0 });
        fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: 1 });
        readings.push((/Row \d+, column \d+/u.exec(announced()) ?? [''])[0]);
      }
    }

    expect(new Set(readings).size).toBe(1);
    expect(readings[0]).toMatch(/Row \d+, column \d+/u);
  });

  it('does not pretend the copies are extra matrix cells', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());

    // Eight rows, whatever is drawn. The keyboard controls address the source
    // matrix and repeating does not enlarge it.
    expect(advanced().getByLabelText(/^Row/)).toHaveAttribute('max', '8');
    expect(advanced().getByLabelText(/^Column/)).toHaveAttribute('max', '8');
  });
});

describe('keeping the setting', () => {
  it('saves it and restores it', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    await user.click(advanced().getByRole('radio', { name: '5 by 5' }));

    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');
    await waitFor(
      () => {
        const project = readSavedProjectImmediate(modularBloom.id);
        expect(project?.renderOptions.tiling).toMatchObject({ mode: 'repeat', columns: 5, rows: 5 });
      },
      { timeout: 4000 },
    );
  });

  it('survives a shared link', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'repeat', columns: 2, rows: 2 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    expect(repeatButton()).toHaveAttribute('aria-checked', 'true');
    expect(advanced().getByRole('radio', { name: '2 by 2' })).toHaveAttribute('aria-checked', 'true');
  });

  it('opens a link written before repeating existed', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    // No tiling block, no repeat: exactly what that link always showed.
    expect(singleButton()).toHaveAttribute('aria-checked', 'true');
  });

  it('falls back to a single copy for a mode it cannot draw', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'brick-offset', columns: 3, rows: 3 } as never,
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    // A composition this build has never heard of. Showing an ordinary repeat
    // and calling it something else would be the wrong kind of wrong.
    expect(singleButton()).toHaveAttribute('aria-checked', 'true');
  });

  it('clamps counts a link asks for that are out of range', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'repeat', columns: 999, rows: 0 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    expect(lastTiling()).toMatchObject({ mode: 'repeat', columns: 8, rows: 1 });
  });
});

describe('tile scale', () => {
  it('is offered only while repeating, and starts at 100%', async () => {
    const { user } = await openAndRun();
    expect(screen.queryByRole('radio', { name: '100%' })).not.toBeInTheDocument();

    await user.click(repeatButton());
    expect(advanced().getByRole('radio', { name: '100%' })).toHaveAttribute('aria-checked', 'true');
  });

  it('changes the copies without touching the artwork', async () => {
    const { user, service } = await openAndRun();
    await user.click(repeatButton());
    const before = service.executionCount;
    const matrix = drawCalls.at(-1)?.matrix;

    await user.click(screen.getByRole('radio', { name: '50%' }));

    expect(lastTiling()?.scale).toBe(0.5);
    expect(service.executionCount).toBe(before);
    expect(drawCalls.at(-1)?.matrix).toEqual(matrix);
  });

  it('keeps the cell somebody was reading', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '4' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '7' } });
    await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));

    await user.click(screen.getByRole('radio', { name: '200%' }));

    // The scale is how large a copy is drawn, not which cell was chosen.
    expect(announced()).toContain('Row 4, column 7');
  });

  it('saves and shares', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    await user.click(screen.getByRole('radio', { name: '150%' }));

    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');
    await waitFor(
      () => {
        expect(readSavedProjectImmediate(modularBloom.id)?.renderOptions.tiling?.scale).toBe(1.5);
      },
      { timeout: 4000 },
    );
  });

  it('defaults safely when a link carries no scale', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'repeat', columns: 3, rows: 3 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    expect(lastTiling()?.scale).toBe(1);
    expect(advanced().getByRole('radio', { name: '100%' })).toHaveAttribute('aria-checked', 'true');
  });

  it('clamps an absurd scale from a link', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'repeat', columns: 3, rows: 3, scale: 500 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    expect(lastTiling()?.scale).toBe(4);
  });
});

describe('palette animation across the copies', () => {
  it('paints every copy from one palette, in one loop', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    await user.click(animate().getByRole('button', { name: 'Animate palette' }));

    /*
     * There is nothing to synchronise, and that is the point: the copies are
     * drawn inside a single paint from a single effective palette, so they
     * cannot drift apart. One draw call carries one palette and all nine copies
     * come out of it.
     */
    const painted = drawCalls.at(-1);
    expect(painted?.palette?.colours).toBeDefined();
    expect(painted?.options.tiling).toMatchObject({ mode: 'repeat', columns: 3, rows: 3 });

    await user.click(animate().getByRole('button', { name: 'Pause' }));
  });
});

const mirrorButton = () => advanced().getByRole('radio', { name: 'Mirror repeat' });

describe('mirror repeat', () => {
  it('is offered beside the other modes and describes itself honestly', async () => {
    const { user } = await openAndRun();
    await user.click(mirrorButton());

    expect(lastTiling()?.mode).toBe('mirror-repeat');
    // Reflection hides a join; it does not make one. The wording must not
    // borrow the word the seamless feature will need.
    const note = screen.getByText(/Alternate copies are reflected/);
    expect(note.textContent).toContain('The artwork is unchanged');
    expect(note.textContent).not.toMatch(/seamless/i);
  });

  it('says so in the artwork’s description', async () => {
    const { user } = await openAndRun();
    await user.click(mirrorButton());

    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: /Mirrored repeat preview, 3 columns by 3 rows/ }),
      ).toBeInTheDocument(),
    );
  });

  it('never runs the APL or touches the code', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;
    const code = codeEditor().textContent;

    await user.click(mirrorButton());
    await user.click(advanced().getByRole('radio', { name: '5 by 5' }));
    await user.click(screen.getByRole('radio', { name: '50%' }));

    expect(service.executionCount).toBe(before);
    expect(codeEditor().textContent).toBe(code);
  });

  it('leaves the artwork’s own mirror settings alone', async () => {
    const { user } = await openAndRun();
    await user.click(screen.getByLabelText(/Mirror horizontally/));
    await user.click(mirrorButton());

    /*
     * Two different mirrors. The artwork's own is part of the base tile and is
     * applied before anything is repeated; the composition's reflects alternate
     * copies of the finished result. Turning on the second must not disturb the
     * first, or a user's appearance choice would be silently overwritten.
     */
    expect(screen.getByLabelText(/Mirror horizontally/)).toBeChecked();
    expect(lastTiling()?.mode).toBe('mirror-repeat');
  });

  it('reads the same source cell from every parity', async () => {
    const { user } = await openAndRun();
    await user.click(mirrorButton());
    await user.click(advanced().getByRole('radio', { name: '2 by 2' }));

    const canvas = screen.getByRole('img', { name: /grid/ });
    const readings: string[] = [];

    /*
     * The visually corresponding point in each of the four copies. In a
     * reflected copy that point sits on the opposite side, which is exactly
     * what the inspector has to undo.
     */
    const intoCell = 2.5 / 8;
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const withinX = column % 2 === 1 ? 1 - intoCell : intoCell;
        const withinY = row % 2 === 1 ? 1 - intoCell : intoCell;
        const x = 200 * (column + withinX);
        const y = 200 * (row + withinY);
        fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1, button: 0 });
        fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: 1 });
        readings.push((/Row \d+, column \d+/u.exec(announced()) ?? [''])[0]);
      }
    }

    expect(new Set(readings).size).toBe(1);
    expect(readings[0]).toMatch(/Row \d+, column \d+/u);
  });

  it('reads a different cell from the same absolute point in a reflected copy', async () => {
    // The counterpart, so the test above cannot pass by the mapping being a
    // no-op: the same offset into a reflected copy is a different cell.
    const { user } = await openAndRun();
    await user.click(mirrorButton());
    await user.click(advanced().getByRole('radio', { name: '2 by 2' }));

    const canvas = screen.getByRole('img', { name: /grid/ });
    const read = (x: number, y: number) => {
      fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1, button: 0 });
      fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: 1 });
      return (/Row \d+, column \d+/u.exec(announced()) ?? [''])[0];
    };

    const plain = read(200 * (2.5 / 8), 20);
    const reflected = read(200 + 200 * (2.5 / 8), 20);
    expect(reflected).not.toBe(plain);
  });

  it('saves and restores locally', async () => {
    const { user } = await openAndRun();
    await user.click(mirrorButton());
    await user.click(advanced().getByRole('radio', { name: '5 by 5' }));

    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');
    await waitFor(
      () => {
        expect(readSavedProjectImmediate(modularBloom.id)?.renderOptions.tiling).toMatchObject({
          mode: 'mirror-repeat',
          columns: 5,
        });
      },
      { timeout: 4000 },
    );
  });

  it('survives a shared link, scale and all', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'mirror-repeat', columns: 2, rows: 2, scale: 1.5 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    expect(mirrorButton()).toHaveAttribute('aria-checked', 'true');
    expect(lastTiling()).toMatchObject({ mode: 'mirror-repeat', columns: 2, scale: 1.5 });
  });

  it('keeps the inspected cell when switching between repeat and mirror', async () => {
    const { user } = await openAndRun();
    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '4' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '7' } });
    await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));

    await user.click(repeatButton());
    await user.click(mirrorButton());
    await user.click(singleButton());

    expect(announced()).toContain('Row 4, column 7');
  });
});

const guidesToggle = () => screen.getByLabelText(/Show seam guides/);
const edgeText = () => screen.getByText(/Left and right edges/).parentElement?.textContent ?? '';

describe('seam guides', () => {
  it('are offered only where there is a join to mark', async () => {
    const { user } = await openAndRun();
    expect(screen.queryByLabelText(/Show seam guides/)).not.toBeInTheDocument();

    await user.click(repeatButton());
    expect(guidesToggle()).not.toBeChecked();

    await user.click(singleButton());
    expect(screen.queryByLabelText(/Show seam guides/)).not.toBeInTheDocument();
  });

  it('are available in mirror repeat too', async () => {
    const { user } = await openAndRun();
    await user.click(advanced().getByRole('radio', { name: 'Mirror repeat' }));
    expect(guidesToggle()).toBeInTheDocument();
  });

  it('cost no execution and change no code', async () => {
    const { user, service } = await openAndRun();
    await user.click(repeatButton());
    const before = service.executionCount;
    const code = codeEditor().textContent;

    await user.click(guidesToggle());

    expect(lastTiling()?.showSeamGuides).toBe(true);
    expect(service.executionCount).toBe(before);
    expect(codeEditor().textContent).toBe(code);
  });

  it('leave the chosen cell exactly where it was', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    fireEvent.change(advanced().getByLabelText(/^Row/), { target: { value: '4' } });
    fireEvent.change(advanced().getByLabelText(/^Column/), { target: { value: '7' } });
    await user.click(advanced().getByRole('button', { name: /^Inspect$/ }));

    await user.click(guidesToggle());

    // An overlay. It marks where the copies join and touches nothing else.
    expect(announced()).toContain('Row 4, column 7');
  });

  it('save and restore locally', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    await user.click(guidesToggle());

    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');
    await waitFor(
      () => {
        expect(readSavedProjectImmediate(modularBloom.id)?.renderOptions.tiling?.showSeamGuides).toBe(true);
      },
      { timeout: 4000 },
    );
  });

  it('come back on through a shared link', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'repeat', columns: 3, rows: 3, showSeamGuides: true },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);
    expect(guidesToggle()).toBeChecked();
  });

  it('default to off on a link written before they existed', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'ember',
      tiling: { mode: 'repeat', columns: 3, rows: 3 },
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);
    expect(guidesToggle()).not.toBeChecked();
  });
});

describe('the edge check', () => {
  it('reports both axes and never claims more than it knows', async () => {
    await openAndRun();

    expect(screen.getByText('Edge check')).toBeInTheDocument();
    expect(edgeText()).toMatch(/Left and right edges/);
    expect(edgeText()).toMatch(/Top and bottom edges/);
    expect(edgeText()).toContain('not proof of mathematical seamlessness');
    // Modular Bloom is a cell artwork, so the values were compared.
    expect(edgeText()).toContain('values along the edges');
    expect(edgeText()).not.toMatch(/seamless pattern|guaranteed|verified/i);
  });

  it('describes the base tile, not the composition', async () => {
    /*
     * The distinction the whole check rests on. Mirror repeat makes a join
     * disappear by reflecting one side onto the other; if the check measured
     * the composed view it would report a match for an artwork whose edges do
     * not match at all.
     */
    const { user } = await openAndRun();
    const before = edgeText();

    await user.click(advanced().getByRole('radio', { name: 'Mirror repeat' }));
    expect(edgeText()).toBe(before);

    await user.click(repeatButton());
    await user.click(advanced().getByRole('radio', { name: '5 by 5' }));
    await user.click(screen.getByRole('radio', { name: '200%' }));
    expect(edgeText()).toBe(before);
  });

  it('is unchanged by the repeat count, the scale or the guides', async () => {
    const { user } = await openAndRun();
    await user.click(repeatButton());
    const readings = new Set<string>();

    for (const count of ['2 by 2', '3 by 3', '5 by 5']) {
      await user.click(screen.getByRole('radio', { name: count }));
      for (const scale of ['50%', '100%', '200%']) {
        await user.click(screen.getByRole('radio', { name: scale }));
        readings.add(edgeText());
      }
    }
    await user.click(guidesToggle());
    readings.add(edgeText());

    expect(readings.size).toBe(1);
  });

  it('changes when the artwork’s own appearance changes the tile', async () => {
    // Rotation is part of the base tile, so it can genuinely change which edges
    // are being compared — the counterpart to the test above.
    const { user } = await openAndRun();
    const upright = edgeText();

    await user.click(advanced().getByRole('radio', { name: '90°' }));
    // Rotating swaps the axes, so the two sentences trade places.
    const turned = edgeText();
    expect(turned).toMatch(/Left and right edges/);
    expect(upright).toMatch(/Left and right edges/);
  });

  it('is unmoved by a running palette animation', async () => {
    /*
     * The reason it compares values rather than colours. A rotating ramp can
     * hand two different values the same colour at one phase and different
     * colours at another, so an answer read off the rendering would change while
     * nothing about the artwork had.
     */
    const { user } = await openAndRun();
    const before = edgeText();

    await user.click(animate().getByRole('button', { name: 'Animate palette' }));
    expect(edgeText()).toBe(before);

    await user.click(paletteChoice(/Neon/));
    expect(edgeText()).toBe(before);

    await user.click(animate().getByRole('button', { name: 'Pause' }));
    expect(edgeText()).toBe(before);
  });

  it('says nothing before a first run', async () => {
    const service = new MockAplExecutionService();
    service.register('default', labelled(8, 8));
    render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);

    // Only a completed result is ever analysed.
    expect(screen.queryByText('Edge check')).not.toBeInTheDocument();
  });
});

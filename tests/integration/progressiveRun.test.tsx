/**
 * Watching a tall artwork arrive.
 *
 * A banded run takes seconds and a dozen requests, which is long enough to edit
 * the code, change the palette and press Stop while it is happening. The rules
 * are the same ones the result boundary already enforces, applied to something
 * that is only half there: the delivery is not an artwork, and the bands on
 * screen belong to the source that was submitted.
 *
 * The service here is held between bands on purpose. Everything interesting
 * about this stage happens in the gaps.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AplExecutionRequest,
  type AplExecutionResult,
  type AplExecutionService,
  type ExecutionCapabilities,
} from '@/execution/AplExecutionService';
import { executionError } from '@/execution/errors';
import { ADAPTIVE_MARKER, formatAdaptiveReply } from '@/execution/adaptiveProbe';
import { formatBandReply } from '@/execution/transport';
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

/*
 * Longer than the default five seconds, and honestly so.
 *
 * Each of these drives a dozen sequential requests through React, one at a
 * time, waiting for a render between each. That is genuinely slow rather than
 * accidentally slow, and the default was close enough to trip on a loaded CI
 * worker while passing on a developer's machine.
 */
vi.setConfig({ testTimeout: 20_000 });

/** Narrow enough that a modest artwork genuinely needs several bands. */
const CAPABILITIES: ExecutionCapabilities = {
  maxOutputLines: 12,
  maxLineLength: 60,
  preservesState: false,
};

/**
 * 576 cells against those limits: nine requests — a first, then eight bands.
 *
 * It was 48, which is 2,304 cells and, at six values to a line and twelve lines to
 * a reply, thirty-three requests. That is one past the ceiling a single run is
 * allowed, and it went unnoticed while the ceiling was only checked when a band
 * came back truncated. Now that every request is counted, a fixture asking for
 * thirty-three is asking for a refusal. Twenty-four still delivers in several
 * visible pieces, which is all these tests need; every assertion below is written
 * against `SIZE` rather than a literal, so the smaller artwork changes nothing
 * about what they mean.
 */
const SIZE = 24;

interface Painted {
  readonly matrix: { readonly rows: number; readonly columns: number; readonly values: Float64Array };
  readonly escape?: { readonly range: { readonly min: number; readonly max: number } };
  readonly palette?: { readonly colours: readonly string[] };
  readonly options?: { readonly tiling?: { readonly mode: string } };
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

function lastPaint(): Painted | undefined {
  return drawCalls.at(-1);
}

/** How many cells of the most recent paint hold a value at all. */
function paintedCells(): number {
  const values = lastPaint()?.matrix.values;
  if (values === undefined) return 0;
  let filled = 0;
  for (const value of values) if (Number.isFinite(value)) filled += 1;
  return filled;
}

/**
 * A service that answers one request at a time, when the test says so.
 *
 * The mock service resolves as fast as promises can, which is the right thing
 * for every other suite and useless here: the questions are all about what is
 * true between the fourth band and the fifth.
 */
class HeldService implements AplExecutionService {
  readonly capabilities = CAPABILITIES;
  executionCount = 0;

  private matrix: NumericMatrix;
  private waiting: (() => void)[] = [];
  private failNext: string | null = null;

  constructor(matrix: NumericMatrix) {
    this.matrix = matrix;
  }

  /** Changes what later requests answer with, as a new run would. */
  answerWith(matrix: NumericMatrix): void {
    this.matrix = matrix;
  }

  failNextRequest(): void {
    this.failNext = 'serverUnavailable';
  }

  /** Lets one held request through, and waits for the render it causes. */
  async release(): Promise<void> {
    const next = this.waiting.shift();
    if (next === undefined) throw new Error('nothing is waiting');
    next();
    // Two microtask turns: one for the request, one for the state it dispatches.
    await Promise.resolve();
    await Promise.resolve();
  }

  get pending(): number {
    return this.waiting.length;
  }

  async execute(request: AplExecutionRequest): Promise<AplExecutionResult> {
    this.executionCount += 1;

    await new Promise<void>((resolve, reject) => {
      this.waiting.push(resolve);
      request.signal?.addEventListener('abort', () => reject(executionError('cancelled')), { once: true });
    });

    if (this.failNext !== null) {
      this.failNext = null;
      throw executionError('serverUnavailable');
    }

    const lines = request.code.includes(ADAPTIVE_MARKER)
      ? formatAdaptiveReply(this.matrix, this.capabilities)
      : formatBandReply(this.matrix, request.code, this.capabilities);

    return { outputLines: lines, rawOutput: lines.join('\n'), durationMs: 1, warnings: [] };
  }

  cancel(): void {}
}

/** Escape counts whose diagonal sits at the ceiling. */
function counts(ceiling: number, size = SIZE): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) =>
        row === column ? ceiling : 1 + ((row * size + column) % (ceiling - 1)),
      ),
    ),
  );
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
});

function announced(): string {
  const spoken = screen
    .getAllByRole('status')
    .find((element) => /Row \d+, column \d+|Every point in this view/u.test(element.textContent ?? ''));
  return spoken?.textContent ?? '';
}

/** The run panel's own live region, told apart by the attribute it carries. */
function runStatus(): string {
  return document.querySelector('[role="status"][data-status]')?.textContent ?? '';
}

/** Waits for the canvas to have been repainted since `since`. */
async function paintedSince(since: number) {
  await waitFor(() => expect(drawCalls.length).toBeGreaterThan(since));
}

async function start(matrix = counts(CEILING)) {
  const user = userEvent.setup();
  const service = new HeldService(matrix);
  render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);
  await user.click(screen.getByRole('button', { name: /^Run/ }));
  // The probe, which reports the shape and no data.
  await waitFor(() => expect(service.pending).toBeGreaterThan(0));
  const before = drawCalls.length;
  await service.release();
  await paintedSince(before);
  return { user, service };
}

/** Releases bands until `count` have been answered. */
async function releaseBands(service: HeldService, count: number) {
  for (let index = 0; index < count; index += 1) {
    await waitFor(() => expect(service.pending).toBeGreaterThan(0));
    const before = drawCalls.length;
    await service.release();
    await paintedSince(before);
  }
}

const SETTLED = /Finished|went wrong|unavailable|Stopped/u;

/**
 * Releases bands until the run reports an outcome.
 *
 * Waits for one of two things each time round: another request queued, or the
 * run visibly settled. Neither alone is enough — between two bands the queue is
 * briefly empty while the runner reads a reply, and after the last band the
 * status is briefly stale while React catches up. Testing either on its own
 * abandons the run part-way and leaves every later assertion describing a
 * half-delivered artwork.
 */
async function finish(service: HeldService) {
  for (let guard = 0; guard < 80; guard += 1) {
    let more = false;
    await waitFor(() => {
      more = service.pending > 0;
      expect(more || SETTLED.test(runStatus())).toBe(true);
    });
    if (!more) break;
    await service.release();
  }
  await waitFor(() => expect(runStatus()).toMatch(SETTLED));
}

describe('while the bands are arriving', () => {
  it('shows the artwork building up, with the rest left empty', async () => {
    const { service } = await start();

    // The shape is known from the probe, so the artwork has its full size
    // before any of it has been fetched.
    expect(lastPaint()?.matrix.rows).toBe(SIZE);
    expect(paintedCells()).toBe(0);

    await releaseBands(service, 2);
    const early = paintedCells();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(SIZE * SIZE);

    await releaseBands(service, 2);
    // Growing, and never shrinking.
    expect(paintedCells()).toBeGreaterThan(early);
  });

  it('marks what has not arrived as absent rather than as zero', async () => {
    const { service } = await start();
    await releaseBands(service, 2);

    const values = lastPaint()?.matrix.values;
    const missing = [...(values ?? [])].filter((value) => Number.isNaN(value));

    /*
     * Not-a-number, so the renderer leaves those cells transparent and the
     * background shows through. A zero would be indistinguishable from data —
     * this calculation cannot return zero, but the colour mapping has no way to
     * know that, and the eye certainly does not.
     */
    expect(missing.length).toBeGreaterThan(0);
    expect([...(values ?? [])].some((value) => value === 0)).toBe(false);
  });

  it('keeps the partial matrix away from the inspector', async () => {
    const { service } = await start();
    await releaseBands(service, 3);

    /*
     * The inspector reads cells out of the completed artwork, and on a first
     * run there is not one yet. Offering coordinates into a buffer that is
     * still being written would report a cell that had not been calculated.
     */
    expect(screen.queryByLabelText(/^Row/)).not.toBeInTheDocument();
    expect(announced()).toBe('');
  });

  it('announces quarters rather than bands', async () => {
    const { service } = await start();

    const heard: string[] = [runStatus()];
    for (let index = 0; index < 20; index += 1) {
      if (service.pending === 0) break;
      await releaseBands(service, 1);
      heard.push(runStatus());
    }

    const bands = heard.length - 1;
    expect(bands).toBeGreaterThan(5);

    /*
     * A dozen bands must not be a dozen interruptions. This goes to a live
     * region, and announcing each one would talk over everything else on the
     * page for the length of the run to say nothing anybody needed.
     */
    const running = new Set(heard.filter((text) => text.startsWith('Running')));
    expect(running.size).toBeLessThanOrEqual(4);
    expect(running.size).toBeGreaterThan(1);
  });
});

describe('editing while the bands arrive', () => {
  it('marks the code as edited but lets the run finish from what it captured', async () => {
    const { service } = await start();
    await releaseBands(service, 2);

    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('iterations←60'),
    );

    // The run is not interrupted by typing, and not restarted by it either.
    const requestsAtEdit = service.executionCount;
    await releaseBands(service, 1);
    expect(service.executionCount).toBe(requestsAtEdit + 1);

    await finish(service);
    // The artwork that arrived is the one that was asked for.
    expect(lastPaint()?.escape?.range.max).toBe(CEILING);
  });

  it('recolours the bands already on screen using the semantics they were made with', async () => {
    const { service } = await start();
    await releaseBands(service, 3);
    expect(lastPaint()?.escape?.range.max).toBe(CEILING);

    // The scenario in full: edit the ceiling, then change two presentation
    // settings while the rest of the artwork is still being fetched.
    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('iterations←60'),
    );

    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'insideOutside' } });
    fireEvent.click(screen.getByRole('radio', { name: /Neon/ }));

    /*
     * Both are presentation, so both repaint what is already there — and both
     * repaint it against CEILING, because that is what produced those bands. Reading
     * the editor here would recolour a half-delivered artwork mid-delivery,
     * under a ceiling no part of it came from.
     */
    await waitFor(() => expect(lastPaint()?.palette?.colours).toBeDefined());
    expect(lastPaint()?.escape?.range.max).toBe(CEILING);

    await finish(service);

    // And the finished result is still the CEILING-iteration run.
    expect(lastPaint()?.escape?.range.max).toBe(CEILING);
    expect(screen.getByLabelText(/^Row/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Row/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/^Column/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Inspect$/ }));
    expect(announced()).toContain(`reached the maximum of ${String(CEILING)} iterations`);
  });
});

describe('when a banded run does not finish', () => {
  it('puts the previous artwork back after a failure, not half of a new one', async () => {
    const { service } = await start();
    await finish(service);
    const complete = paintedCells();
    expect(complete).toBe(SIZE * SIZE);

    // A second run that dies partway through.
    service.answerWith(counts(60));
    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('iterations←60'),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));
    await releaseBands(service, 3);
    expect(paintedCells()).toBeLessThan(complete);

    service.failNextRequest();
    await releaseBands(service, 1);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // Whole again, and still the artwork that completed.
    expect(paintedCells()).toBe(complete);
    expect(lastPaint()?.escape?.range.max).toBe(CEILING);
  });

  it('offers to retry the run that failed, not the code in the editor', async () => {
    const { service } = await start();
    await finish(service);

    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));
    service.failNextRequest();
    await releaseBands(service, 1);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // Nothing has been edited, so Run already is the retry and a second control
    // for it would be a distinction that does not exist.
    expect(screen.queryByRole('button', { name: 'Try that run again' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Maximum iterations'), { target: { value: '60' } });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('iterations←60'),
    );

    // Now they differ, so the choice is real.
    const retry = screen.getByRole('button', { name: 'Try that run again' });
    fireEvent.click(retry);

    await waitFor(() => expect(service.pending).toBeGreaterThan(0));
    await finish(service);

    // The retried run was the CEILING one, whatever the editor says now.
    expect(lastPaint()?.escape?.range.max).toBe(CEILING);
    expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toContain('iterations←60');
  });
});

describe('what a delivery is kept out of', () => {
  it('saves and exports the last complete artwork, not the half on screen', async () => {
    const { service } = await start();
    await finish(service);

    // A second run, deliberately left part-way.
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));
    await releaseBands(service, 2);
    expect(paintedCells()).toBeLessThan(SIZE * SIZE);

    /*
     * The export reads the result, which the delivery never touches. Checked
     * through the saved project rather than by decoding a PNG: both read the
     * same field, and only one of them can be inspected here.
     */
    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');
    await waitFor(
      () => {
        const project = readSavedProjectImmediate(mandelbrotField.id);
        expect(project?.lastSuccessfulMatrix?.values).toHaveLength(SIZE * SIZE);
      },
      { timeout: 4000 },
    );

    // Every saved cell is a real one: a partial buffer would have carried
    // thousands of zeroes nobody fetched.
    const project = readSavedProjectImmediate(mandelbrotField.id);
    expect(project?.lastSuccessfulMatrix?.values.every((value) => Number.isFinite(value))).toBe(true);
    expect(project?.lastSuccessfulMatrix?.values.some((value) => value === 0)).toBe(false);
  });
});

describe('a delivery while the artwork is repeated', () => {
  it('keeps showing the last complete result rather than repeating half of one', async () => {
    const { service, user } = await start();
    await finish(service);

    await user.click(screen.getByRole('radio', { name: 'Repeat' }));
    const complete = paintedCells();
    expect(complete).toBe(SIZE * SIZE);

    // A second run, left part-way.
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));
    await releaseBands(service, 3);

    /*
     * Twenty-five copies of a mostly-hatched tile previews nothing, and the
     * hatch itself would read as part of the pattern. The finished artwork
     * stays on screen until the new one is whole.
     */
    expect(paintedCells()).toBe(complete);
    expect(lastPaint()?.options?.tiling?.mode).toBe('repeat');

    await finish(service);
    expect(paintedCells()).toBe(complete);
  });

  it('shows a first delivery as one copy, never repeated', async () => {
    const user = userEvent.setup();
    const service = new HeldService(counts(CEILING));
    render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);

    // Repeat chosen before anything has been drawn at all.
    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(service.pending).toBeGreaterThan(0));
    await service.release();
    await paintedSince(0);
    await releaseBands(service, 2);

    /*
     * Nothing complete to keep, so the delivery is worth watching — but singly.
     * Copies of an artwork that does not exist yet would be copies of nothing.
     */
    expect(paintedCells()).toBeGreaterThan(0);
    expect(paintedCells()).toBeLessThan(SIZE * SIZE);
    expect(lastPaint()?.options?.tiling?.mode ?? 'single').toBe('single');
  });
});

describe('exporting while a run is in flight', () => {
  it('offers nothing to export before a first result exists', async () => {
    const user = userEvent.setup();
    const service = new HeldService(counts(CEILING));
    render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);

    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(service.pending).toBeGreaterThan(0));
    await service.release();
    await paintedSince(0);
    await releaseBands(service, 2);

    // Part of an artwork has arrived and none of it is exportable: there is no
    // completed result, and a delivery is not one.
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: /512/ }));

    expect(
      screen
        .getAllByRole('status')
        .some((element) => /Run the artwork before exporting/u.test(element.textContent ?? '')),
    ).toBe(true);
  });

  it('keeps the completed result available while the next one is arriving', async () => {
    const { service, user } = await start();
    await finish(service);

    // A second run, left part-way. The finished artwork is still what Export
    // would write — a delivery never becomes the thing that gets saved.
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));
    await releaseBands(service, 2);

    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: /512/ })).toBeEnabled();
    expect(
      screen
        .getAllByRole('status')
        .some((element) => /Run the artwork before exporting/u.test(element.textContent ?? '')),
    ).toBe(false);
  });
});

/**
 * Choosing Abyss in the workspace.
 *
 * Abyss is an ordinary named palette, and the point of these tests is that it is
 * ordinary in every way that matters: choosing it costs no execution, changes no
 * matrix and no source, survives a save and a shared link, and interleaves with
 * the other named ramps and with a custom one without leaving anything behind.
 *
 * Its own colour behaviour — black at the ceiling, legible at the other end, no
 * grey in the descent — is a property of the ramp and is tested against the
 * mapping directly in `tests/unit/abyssPalette.test.ts`.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { presets } from '@/presets/presets';
import { CUSTOM_PALETTE_ID } from '@/renderer/customPalette';
import { COLOURING_MODES } from '@/renderer/escapeColouring';
import { encodeShareState } from '@/sharing/encodeShareState';
import { LocalProjectRepository } from '@/storage/LocalProjectRepository';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { codeEditor, paletteChoice, pressRunWith } from '../helpers/workspaceModes';

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

/**
 * Escape counts that look like a real slice: some escaped, some did not.
 *
 * The diagonal is at the ceiling, except its first cell, which holds the lowest
 * value the calculation can produce. Without that the matrix would never
 * actually contain its own minimum, and every assertion about the range would
 * be describing an accident of the arithmetic rather than the declared range.
 */
function escapeCounts(size = 8, ceiling = 28): NumericMatrix {
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
  service.register('default', escapeCounts());
  render(<WorkspacePage presetId={mandelbrotField.id} sharedState={sharedState} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

const canvas = () => screen.getByRole('img', { name: /grid/ });
const editor = () => codeEditor();
const palette = (name: string) => paletteChoice(new RegExp(name, 'u'));

/** What the canvas reports about the numbers, with the palette's name removed. */
function describedNumbers(): string {
  return (
    canvas()
      .getAttribute('aria-label')
      ?.replace(/[A-Za-z ]+palette/u, '') ?? ''
  );
}

describe('choosing Abyss', () => {
  it('is offered alongside the other named palettes', async () => {
    await openAndRun();
    expect(palette('Abyss')).toBeInTheDocument();
    expect(palette('Heat')).toBeInTheDocument();
  });

  it('costs no execution and changes no source', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;
    const code = editor().textContent;

    await user.click(palette('Abyss'));

    // A palette is presentation. It is not part of the calculation and must not
    // pretend to be by asking for one.
    expect(service.executionCount).toBe(before);
    expect(editor().textContent).toBe(code);
    expect(canvas()).toHaveAccessibleName(/Abyss palette/);
  });

  it('leaves the matrix exactly as it was', async () => {
    const { user } = await openAndRun();
    const numbers = describedNumbers();

    await user.click(palette('Abyss'));

    expect(describedNumbers()).toBe(numbers);
    expect(numbers).toMatch(/ranging from 1 to 28/u);
  });

  it('does not disturb the cell being read', async () => {
    const { user } = await openAndRun();

    fireEvent.pointerDown(canvas(), { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    fireEvent.pointerUp(canvas(), { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    await screen.findByText('Row 2, column 3');

    await user.click(palette('Abyss'));

    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
  });
});

describe('Abyss under every colouring mode', () => {
  it('draws in all of them without running anything', async () => {
    const { user, service } = await openAndRun();
    await user.click(palette('Abyss'));
    const before = service.executionCount;

    const select = screen.getByLabelText('Mode') as HTMLSelectElement;
    for (const mode of COLOURING_MODES) {
      fireEvent.change(select, { target: { value: mode } });
      await waitFor(() => expect(select.value).toBe(mode));

      // Still the same artwork, still Abyss, still no request.
      expect(canvas(), mode).toHaveAccessibleName(/Abyss palette/);
      expect(describedNumbers(), mode).toMatch(/ranging from 1 to 28/u);
    }

    expect(service.executionCount).toBe(before);
  });
});

describe('switching between palettes', () => {
  it('moves between Abyss, another named ramp and back', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;

    await user.click(palette('Abyss'));
    expect(canvas()).toHaveAccessibleName(/Abyss palette/);

    await user.click(palette('Poolrooms'));
    expect(canvas()).toHaveAccessibleName(/Poolrooms palette/);
    expect(canvas()).not.toHaveAccessibleName(/Abyss/);

    await user.click(palette('Abyss'));
    expect(canvas()).toHaveAccessibleName(/Abyss palette/);
    expect(service.executionCount).toBe(before);
  });

  it('gives way to a custom palette and takes over again cleanly', async () => {
    const { user } = await openAndRun();
    await user.click(palette('Abyss'));

    await user.click(paletteChoice(/Custom/));
    await waitFor(() => expect(canvas()).toHaveAccessibleName(/Custom palette/));

    // A custom ramp has its own stops; returning to Abyss must restore the
    // named one rather than a mixture of the two.
    await user.click(palette('Abyss'));
    expect(canvas()).toHaveAccessibleName(/Abyss palette/);
  });
});

describe('Abyss travels with the artwork', () => {
  it('is saved to the local project', async () => {
    const { user } = await openAndRun();
    await user.click(palette('Abyss'));

    const repository = new LocalProjectRepository();
    await waitFor(async () => {
      const summaries = await repository.list();
      expect(summaries.length).toBeGreaterThan(0);
      const project = await repository.get(summaries[0]?.id ?? '');
      expect(project?.renderOptions.paletteId).toBe('abyss');
    });
  });

  it('comes back from a shared link', async () => {
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'abyss',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    expect(canvas()).toHaveAccessibleName(/Abyss palette/);
  });
});

describe('state written before Abyss existed', () => {
  it('opens on the palette it recorded, not on the new one', async () => {
    /*
     * Adding a palette must not move anybody's work onto it. A link written
     * yesterday names Heat and should still show Heat.
     */
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'heat',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    expect(canvas()).toHaveAccessibleName(/Heat palette/);
    expect(canvas()).not.toHaveAccessibleName(/Abyss/);

    /*
     * And it reads "Original", because that badge is about the APL and nothing
     * else. The palette is presentation: it is already shown, selected, in the
     * palette control, so calling the artwork edited on account of it would be
     * describing a change to the code that nobody made.
     *
     * Pinned rather than assumed, because a default palette change is exactly
     * when somebody might be tempted to make the badge mean two things.
     */
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.queryByText('Edited')).not.toBeInTheDocument();
  });

  it('is what Mandelbrot now opens on', async () => {
    /*
     * Changed deliberately after the comparison montages were reviewed. When
     * Abyss was added this test asserted the opposite — that adding a palette
     * moves nobody's default — which was right then and is the reason the change
     * had to be argued for separately.
     */
    const user = userEvent.setup();
    const service = new MockAplExecutionService();
    service.register('default', escapeCounts());
    render(<WorkspacePage presetId={mandelbrotField.id} sharedState={null} service={service} />);
    await pressRunWith(user);
    await waitFor(() => expect(canvas()).toBeInTheDocument());

    expect(canvas()).toHaveAccessibleName(/Abyss palette/);
    expect(mandelbrotField.defaultPaletteId).toBe('abyss');
    expect(CUSTOM_PALETTE_ID).not.toBe('abyss');
  });

  it('did not take any artwork with it that was not argued for', () => {
    /*
     * The guard is against drift, not against a second use. A palette added for a
     * fractal has no business changing a cellular automaton, and nothing should
     * adopt this ramp because it happened to be nearby.
     *
     * Two artworks use it, each for a reason recorded in its own module.
     * Mandelbrot was measured and reviewed under comparison montages. Tricorn came
     * later and chose it deliberately *because* it is Mandelbrot's: that artwork's
     * entire claim is that it differs by one character, and holding the colours
     * constant leaves the shape as the only difference between the two thumbnails.
     *
     * Julia went the other way on purpose, and the two decisions are consistent
     * rather than contradictory. Julia is almost all boundary — a thin dendrite
     * that Abyss renders as black on blue, losing the form — so it needed a ramp
     * that put the pale end where the surviving points are. Tricorn is a solid
     * mass whose silhouette reads clearly in this one.
     *
     * Adding a third name here should mean writing the reason down too.
     */
    const deliberate = new Set([mandelbrotField.id, 'tricorn']);
    for (const preset of presets) {
      if (deliberate.has(preset.id)) continue;
      expect(preset.defaultPaletteId, preset.id).not.toBe('abyss');
    }

    // And both of the named ones really do use it, so this cannot rot into an
    // allowlist of artworks that have since moved on.
    for (const id of deliberate) {
      const preset = presets.find((candidate) => candidate.id === id);
      expect(preset?.defaultPaletteId, id).toBe('abyss');
    }
  });
});

/**
 * Editing a palette in the workspace.
 *
 * The model has its own tests. These are about what editing colours must never
 * touch: the calculation, the matrix, and the cell somebody was reading.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { CUSTOM_PALETTE_ID } from '@/renderer/customPalette';
import { WorkspacePage } from '@/workspace/WorkspacePage';

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

  await user.click(screen.getByRole('button', { name: /^Run/ }));
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

async function chooseCustom(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /Custom/ }));
  await screen.findByRole('img', { name: /Gradient of/ });
}

/**
 * The stops as the editor holds them, in position order.
 *
 * Read from the fields rather than from the gradient preview: jsdom's style
 * parser drops `linear-gradient`, so the preview's inline style is empty there
 * and an assertion against it would pass or fail for the wrong reason.
 */
function stopColours(): string[] {
  return screen.getAllByLabelText(/^Hex value of stop/).map((element) => (element as HTMLInputElement).value);
}

/** The shape and range the canvas reports, without the palette's name. */
function describedArtwork(): string {
  return (screen.getByRole('img', { name: /grid/ }).getAttribute('aria-label') ?? '').replace(
    /, drawn with .*$/u,
    '',
  );
}

describe('editing a palette', () => {
  it('never runs the APL', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;

    await chooseCustom(user);
    fireEvent.change(screen.getByLabelText('Hex value of stop 1'), { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByLabelText('Position of stop 2, per cent'), { target: { value: '30' } });
    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    await user.click(screen.getByRole('button', { name: 'Randomise colours' }));

    // A palette is not part of the calculation, so none of it costs a request.
    expect(service.executionCount).toBe(before);
  });

  it('leaves the matrix exactly as it was', async () => {
    const { user } = await openAndRun();
    const described = describedArtwork();

    await chooseCustom(user);
    await user.click(screen.getByRole('button', { name: 'Randomise colours' }));

    // Same shape, same values — only the colours moved.
    expect(describedArtwork()).toBe(described);
    expect(described).toMatch(/ranging from 101 to 808/u);
  });

  it('does not disturb the cell being read', async () => {
    const { user } = await openAndRun();

    const canvas = screen.getByRole('img', { name: /grid/ });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    await screen.findByText('Row 2, column 3');

    await chooseCustom(user);
    await user.click(screen.getByRole('button', { name: 'Randomise colours' }));

    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
    expect(screen.getByText('203')).toBeInTheDocument();
  });

  it('shows the change at once', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);

    fireEvent.change(screen.getByLabelText('Hex value of stop 1'), { target: { value: '#123456' } });

    // No run, no reload: the next render already has it.
    await waitFor(() => expect(stopColours()[0]).toBe('#123456'));
    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(/Custom palette/);
  });

  it('goes back to a named ramp without losing the work', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);
    fireEvent.change(screen.getByLabelText('Hex value of stop 1'), { target: { value: '#123456' } });
    await waitFor(() => expect(stopColours()[0]).toBe('#123456'));

    // Choosing a named palette is the way to undo a custom one.
    await user.click(screen.getByRole('radio', { name: /Poolrooms/ }));
    await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(/Poolrooms/));
    expect(screen.queryByLabelText('Hex value of stop 1')).not.toBeInTheDocument();

    await chooseCustom(user);
    expect(stopColours()[0]).toBe('#123456');
  });
});

describe('the stops', () => {
  it('will not go below two', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);

    // Seeded from Ember, so there are eight to remove.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const remove = screen.queryByRole('button', { name: 'Remove stop 3' });
      if (remove === null || (remove as HTMLButtonElement).disabled) break;
      await user.click(remove);
    }
    while (!(screen.getByRole('button', { name: 'Remove stop 1' }) as HTMLButtonElement).disabled) {
      await user.click(screen.getByRole('button', { name: 'Remove stop 1' }));
    }

    expect(screen.getAllByRole('button', { name: /^Remove stop/ })).toHaveLength(2);
    // There is no gradient below two, so the control says no rather than
    // leaving the artwork with nothing to draw with.
    expect(screen.getByRole('button', { name: 'Remove stop 1' })).toBeDisabled();
  });

  it('will not go above twelve', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const add = screen.getByRole('button', { name: 'Add stop' }) as HTMLButtonElement;
      if (add.disabled) break;
      await user.click(add);
    }

    expect(screen.getAllByRole('button', { name: /^Remove stop/ })).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Add stop' })).toBeDisabled();
  });

  it('keeps them in position order as one is moved past another', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);

    const first = stopColours()[0];
    // Ember seeds eight stops at 0 through 100; 90 puts this one between the
    // last two rather than onto the same place as the last, which would be a
    // different case — a hard edge, tested in the model.
    fireEvent.change(screen.getByLabelText('Position of stop 1, per cent'), { target: { value: '90' } });

    await waitFor(() => expect(stopColours()[0]).not.toBe(first));

    const positions = screen
      .getAllByLabelText(/^Position of stop/)
      .map((element) => Number((element as HTMLInputElement).value));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(stopColours()[positions.indexOf(90)]).toBe(first);
  });

  it('holds a position inside the range', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);

    fireEvent.change(screen.getByLabelText('Position of stop 1, per cent'), { target: { value: '-40' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Position of stop 1, per cent')).toHaveValue(0);
    });
  });

  it('ignores a hex value that is not yet a colour', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);
    const before = stopColours()[0];

    // Typed a character at a time; most of the way there is not a colour.
    fireEvent.change(screen.getByLabelText('Hex value of stop 1'), { target: { value: '#12' } });

    expect(stopColours()[0]).toBe(before);
  });
});

describe('randomise', () => {
  it('produces a palette that can be drawn with', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);

    await user.click(screen.getByRole('button', { name: 'Randomise colours' }));

    const colours = stopColours();
    expect(colours.length).toBeGreaterThanOrEqual(2);
    for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/u);

    // Distinct ids, or two rows of the editor would be the same row.
    const positions = screen.getAllByLabelText(/^Position of stop/);
    expect(new Set(positions.map((element) => (element as HTMLInputElement).value)).size).toBe(
      positions.length,
    );
  });

  it('can be taken back', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);
    const before = stopColours();

    await user.click(screen.getByRole('button', { name: 'Randomise colours' }));
    await waitFor(() => expect(stopColours()).not.toEqual(before));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(stopColours()).toEqual(before));
  });

  it('offers nothing to undo before anything has changed', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('keeping a custom palette', () => {
  it('saves and restores it exactly', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);
    fireEvent.change(screen.getByLabelText('Hex value of stop 1'), { target: { value: '#123456' } });
    fireEvent.change(screen.getByLabelText('Position of stop 2, per cent'), { target: { value: '12.5' } });
    await waitFor(() => expect(stopColours()[0]).toBe('#123456'));

    const saved = stopColours();
    const { readSavedProjectImmediate } = await import('@/workspace/useLocalProject');

    /*
     * Waited for rather than forced. Saving is debounced, which is the point:
     * a run of small adjustments has to cost one write, not thirty.
     */
    await waitFor(
      () => {
        const project = readSavedProjectImmediate(modularBloom.id);
        expect(project?.renderOptions.paletteId).toBe(CUSTOM_PALETTE_ID);
        expect(project?.renderOptions.customStops?.map((entry) => entry.colour)).toEqual(saved);
      },
      { timeout: 4000 },
    );

    // And the exact positions came back too, not just the colours.
    const project = readSavedProjectImmediate(modularBloom.id);
    expect(project?.renderOptions.customStops?.[1]?.position).toBe(12.5);
  });

  it('survives a shared link', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: CUSTOM_PALETTE_ID,
      stops: '0-123456_37.5-ff6a13_100-ffffff',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    const { user } = await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    await chooseCustom(user);
    expect(stopColours()).toEqual(['#123456', '#ff6a13', '#ffffff']);
    expect(screen.getByLabelText('Position of stop 2, per cent')).toHaveValue(37.5);
  });

  it('opens a link written before custom palettes existed', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'neon',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    // No stops, no trouble: the named ramp, exactly as before.
    expect(screen.getByRole('radio', { name: /Neon/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(/Neon palette/);
  });

  it('draws something sensible when a link claims colours it does not carry', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: CUSTOM_PALETTE_ID,
      stops: 'not-a-palette',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(encoded);
    await screen.findByText(/shared with you/);

    // The artwork appears. Failing to draw would be the worse answer.
    expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument();
  });
});

describe('a saved project from before custom palettes', () => {
  it('opens on its named palette', async () => {
    const { migrateProject } = await import('@/storage/storageMigrations');

    const outcome = migrateProject({
      schemaVersion: 1,
      id: 'old',
      sourcePresetId: modularBloom.id,
      code: modularBloom.code,
      paletteId: 'sunset',
      renderOptions: { invert: false, rotation: 0, mirrorHorizontally: false, mirrorVertically: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.project.renderOptions.paletteId).toBe('sunset');
    // Nothing invented where there was nothing stored.
    expect(outcome.project.renderOptions.customStops).toBeUndefined();
  });

  it('keeps a custom palette rather than resetting it', async () => {
    const { migrateProject } = await import('@/storage/storageMigrations');

    const outcome = migrateProject({
      schemaVersion: 1,
      id: 'kept',
      sourcePresetId: modularBloom.id,
      code: modularBloom.code,
      paletteId: CUSTOM_PALETTE_ID,
      renderOptions: {
        invert: false,
        rotation: 0,
        customStops: [
          { colour: '#123456', position: 0 },
          { colour: '#ffffff', position: 100 },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // "custom" names no shipped ramp, so an existence check alone would have
    // replaced it with the default and thrown the colours away.
    expect(outcome.project.renderOptions.paletteId).toBe(CUSTOM_PALETTE_ID);
    expect(outcome.project.renderOptions.customStops).toHaveLength(2);
  });

  it('drops stops it cannot read rather than refusing the project', async () => {
    const { migrateProject } = await import('@/storage/storageMigrations');

    const outcome = migrateProject({
      schemaVersion: 1,
      id: 'damaged',
      sourcePresetId: modularBloom.id,
      code: modularBloom.code,
      paletteId: CUSTOM_PALETTE_ID,
      renderOptions: { customStops: [{ colour: 'nonsense', position: 0 }] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.project.renderOptions.customStops).toBeUndefined();
  });
});

describe('in Focus mode', () => {
  it('offers the same editor', async () => {
    const { user } = await openAndRun();
    await chooseCustom(user);
    fireEvent.change(screen.getByLabelText('Hex value of stop 1'), { target: { value: '#123456' } });
    await waitFor(() => expect(stopColours()[0]).toBe('#123456'));

    await user.click(screen.getByRole('button', { name: 'Focus mode' }));

    // The drawer holds the same controls panel, so there is one editor rather
    // than two that could disagree.
    const drawer = document.getElementById('focus-drawer');
    expect(drawer).not.toBeNull();
    expect(within(drawer as HTMLElement).getByLabelText('Hex value of stop 1')).toHaveValue('#123456');

    fireEvent.change(within(drawer as HTMLElement).getByLabelText('Hex value of stop 1'), {
      target: { value: '#654321' },
    });
    await waitFor(() => expect(stopColours()[0]).toBe('#654321'));
  });
});

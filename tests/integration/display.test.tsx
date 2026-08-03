/**
 * Choosing between crisp cells and interpolation.
 *
 * The capability was already there as a "smooth scaling" tick, wired through
 * drawing, export, sharing and storage. What was missing was any account of what
 * it means — and the account matters more than the control, because the one thing
 * Smooth must never appear to do is calculate anything. It blurs the gaps between
 * cells. There is exactly as much information on screen either way, and the
 * wording is the only thing standing between that fact and a visitor who assumes
 * the softer picture is the more detailed one.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { truchetGrid } from '@/presets/truchet-grid';
import { COLOURING_MODES } from '@/renderer/escapeColouring';
import { encodeShareState } from '@/sharing/encodeShareState';
import { LocalProjectRepository } from '@/storage/LocalProjectRepository';
import { migrateProject } from '@/storage/storageMigrations';
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

async function openAndRun(preset = mandelbrotField.id, sharedState: string | null = null) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', escapeCounts());
  render(<WorkspacePage presetId={preset} sharedState={sharedState} service={service} />);

  await user.click(screen.getByRole('button', { name: /^Run/ }));
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
  return { user, service };
}

const canvas = () => screen.getByRole('img', { name: /grid/ });
// Testing-library matches an accessible name in full, so "Repeat" cannot
// accidentally select "Mirror repeat" here the way a Playwright locator would.
const mode = (name: string) => screen.getByRole('radio', { name });
const label = () => canvas().getAttribute('aria-label') ?? '';

describe('the Display control', () => {
  it('offers Pixel and Smooth, starting on Pixel', async () => {
    await openAndRun();

    expect(mode('Pixel')).toHaveAttribute('aria-checked', 'true');
    expect(mode('Smooth')).toHaveAttribute('aria-checked', 'false');
  });

  it('describes each choice without claiming extra detail', async () => {
    const { user } = await openAndRun();

    expect(screen.getByText('Shows each calculated matrix cell as a crisp square.')).toBeInTheDocument();

    await user.click(mode('Smooth'));
    const description = screen.getByText(/Softens the display between calculated cells/);
    expect(description).toBeInTheDocument();
    expect(description.textContent).toContain('It does not calculate additional detail.');

    // The words that would make it a lie.
    const panel = description.closest('fieldset')?.textContent ?? '';
    expect(panel).not.toMatch(/higher resolution|high quality|better|sharper detail|enhance/iu);
  });

  it('says which is in use, in the canvas description', async () => {
    const { user } = await openAndRun();
    expect(label()).toContain('Shown as crisp cells.');

    await user.click(mode('Smooth'));
    expect(label()).toContain('Displayed with smooth interpolation.');
    expect(label()).not.toMatch(/resolution|quality/iu);
  });

  it('words itself for an artwork that draws motifs rather than squares', async () => {
    // Truchet draws a shape per cell, so "each cell as a crisp square" would be
    // describing something the renderer does not do.
    await openAndRun(truchetGrid.id);

    expect(screen.getByText('Keeps the drawn edges crisp.')).toBeInTheDocument();
    expect(
      screen.queryByText('Shows each calculated matrix cell as a crisp square.'),
    ).not.toBeInTheDocument();
  });
});

describe('switching display', () => {
  it('costs no execution and changes no source', async () => {
    const { user, service } = await openAndRun();
    const before = service.executionCount;
    const code = screen.getByRole('textbox', { name: /APL/i }).textContent;

    await user.click(mode('Smooth'));
    await user.click(mode('Pixel'));
    await user.click(mode('Smooth'));

    expect(service.executionCount).toBe(before);
    expect(screen.getByRole('textbox', { name: /APL/i }).textContent).toBe(code);
  });

  it('leaves the matrix and its range alone', async () => {
    const { user } = await openAndRun();
    const numbers = label().replace(/ (Shown as|Displayed with).*$/u, '');

    await user.click(mode('Smooth'));

    expect(label().replace(/ (Shown as|Displayed with).*$/u, '')).toBe(numbers);
    expect(numbers).toMatch(/ranging from 1 to 28/u);
  });

  it('does not disturb the cell being read', async () => {
    const { user } = await openAndRun();

    fireEvent.pointerDown(canvas(), { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    fireEvent.pointerUp(canvas(), { button: 0, pointerId: 1, clientX: 125, clientY: 75 });
    await screen.findByText('Row 2, column 3');

    await user.click(mode('Smooth'));

    // Interpolation changes which colours sit between cells; it does not change
    // which cell was selected or what it holds.
    expect(screen.getByText('Row 2, column 3')).toBeInTheDocument();
  });

  it('works under every colouring mode', async () => {
    const { user, service } = await openAndRun();
    await user.click(mode('Smooth'));
    const before = service.executionCount;

    const select = screen.getByLabelText('Mode') as HTMLSelectElement;
    for (const colouring of COLOURING_MODES) {
      fireEvent.change(select, { target: { value: colouring } });
      await waitFor(() => expect(select.value).toBe(colouring));

      expect(mode('Smooth'), colouring).toHaveAttribute('aria-checked', 'true');
      expect(label(), colouring).toContain('Displayed with smooth interpolation.');
    }

    expect(service.executionCount).toBe(before);
  });

  it('stays chosen while a palette changes underneath it', async () => {
    const { user } = await openAndRun();
    await user.click(mode('Smooth'));

    await user.click(screen.getByRole('radio', { name: /Abyss/ }));
    expect(mode('Smooth')).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: /Custom/ }));
    await waitFor(() => expect(canvas()).toHaveAccessibleName(/Custom palette/));
    expect(mode('Smooth')).toHaveAttribute('aria-checked', 'true');
  });

  it('survives being repeated and mirrored', async () => {
    const { user } = await openAndRun();
    await user.click(mode('Smooth'));

    for (const view of ['Repeat', 'Mirror repeat']) {
      await user.click(screen.getByRole('radio', { name: view }));
      expect(mode('Smooth'), view).toHaveAttribute('aria-checked', 'true');
      expect(label(), view).toContain('Displayed with smooth interpolation.');
    }
  });
});

describe('the display choice travels with the artwork', () => {
  it('is saved to the local project', async () => {
    const { user } = await openAndRun();
    await user.click(mode('Smooth'));

    const repository = new LocalProjectRepository();
    await waitFor(async () => {
      const summaries = await repository.list();
      expect(summaries.length).toBeGreaterThan(0);
      const project = await repository.get(summaries[0]?.id ?? '');
      expect(project?.renderOptions.smoothScaling).toBe(true);
    });
  });

  it('comes back from a shared link', async () => {
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'heat',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: true },
    });

    await openAndRun(mandelbrotField.id, encoded);
    expect(mode('Smooth')).toHaveAttribute('aria-checked', 'true');
    expect(label()).toContain('Displayed with smooth interpolation.');
  });
});

describe('state that says nothing about display', () => {
  it('opens on Pixel', async () => {
    /*
     * Everything saved before this existed, and anything hand-edited into
     * nonsense, has to land on the crisp default rather than on a softened
     * picture nobody asked for.
     */
    const encoded = encodeShareState({
      v: 1,
      preset: mandelbrotField.id,
      code: mandelbrotField.code,
      params: {},
      palette: 'heat',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    await openAndRun(mandelbrotField.id, encoded);
    expect(mode('Pixel')).toHaveAttribute('aria-checked', 'true');
  });

  it('restores a stored true as Smooth, unchanged from the old behaviour', () => {
    // The tick this replaces wrote the same boolean. Somebody who left it on
    // must find the artwork softened, not reset to crisp because the control
    // was renamed.
    const outcome = migrateProject({
      schemaVersion: 1,
      id: 'old-smooth',
      sourcePresetId: mandelbrotField.id,
      title: 'Mandelbrot Field',
      code: mandelbrotField.code,
      parameterValues: {},
      paletteId: 'heat',
      renderOptions: { invert: false, rotation: 0, smoothScaling: true },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.project.renderOptions.smoothScaling : false).toBe(true);
  });

  it.each([undefined, null, 'yes', 1, {}])('reads %s as Pixel in a stored project', (value) => {
    const outcome = migrateProject({
      schemaVersion: 1,
      id: 'old',
      sourcePresetId: mandelbrotField.id,
      title: 'Mandelbrot Field',
      code: mandelbrotField.code,
      parameterValues: {},
      paletteId: 'heat',
      renderOptions: { invert: false, rotation: 0, smoothScaling: value },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.project.renderOptions.smoothScaling : true).toBe(false);
  });
});

describe('what the export offers', () => {
  it('names the matrix it would be drawn from', async () => {
    const { user } = await openAndRun();
    await user.click(screen.getByRole('button', { name: 'Export' }));

    // So that asking for 1024 from an 8-cell result is an informed choice
    // rather than an implied promise about how it was calculated.
    expect(screen.getByText('Source matrix: 8 × 8')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '1024 × 1024' })).toBeInTheDocument();
  });
});

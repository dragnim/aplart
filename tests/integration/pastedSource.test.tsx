/**
 * The same APL, two artworks, two outcomes.
 *
 * A reproduction, not a fix. Julia's program pasted into an artwork that does
 * not declare `highResolution` is refused for being too tall, while the
 * identical text runs from the Julia preset — so what decides whether a piece of
 * APL can run is not the APL but which gallery entry happened to be open.
 *
 * That cuts against the premise the whole application rests on: the visible
 * source is the artwork. These tests exist to hold the current behaviour still
 * while the design is decided, and are expected to change when it is.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { encodeShareState } from '@/sharing/encodeShareState';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { juliaSet } from '@/presets/julia-set';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';

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
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

/** A matrix taller than one response can carry: 128 rows against a 93-line cap. */
function tall(size = 128): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) => 1 + ((row * size + column) % 47)),
    ),
  );
}

/**
 * A service with the real service's limits.
 *
 * The mock is generous by default — 4096 lines — which is right for tests about
 * something else and useless here: the whole subject is what happens at the
 * line cap.
 */
function limitedService(matrix = tall()) {
  const service = new MockAplExecutionService({
    capabilities: { maxOutputLines: TRYAPL_CAPABILITIES.maxOutputLines },
  });
  service.register('default', matrix);
  return service;
}

const editor = () => screen.getByRole('textbox', { name: /APL/i });

/**
 * Opens an artwork whose code is somebody else's program.
 *
 * Through a shared link rather than through the editor: CodeMirror is a
 * contenteditable and does not respond to synthetic events in jsdom, so a
 * "paste" here would silently do nothing and the test would pass for the wrong
 * reason. The paste itself is reproduced in a real browser in
 * `tests/e2e/pastedSource.spec.ts`; what this establishes is the same mismatch —
 * this source, that preset's metadata — by a door that works in jsdom.
 */
function openWithForeignSource(presetId: string, code: string, service: MockAplExecutionService) {
  const encoded = encodeShareState({
    v: 1,
    preset: presetId,
    code,
    params: {},
    palette: 'ember',
    render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
  });
  render(<WorkspacePage presetId={presetId} sharedState={encoded} service={service} />);
}

describe('pasting Julia’s program into another artwork', () => {
  it('is refused for being too tall, and says to change the preset', async () => {
    const user = userEvent.setup();
    const service = limitedService();
    openWithForeignSource(modularBloom.id, juliaSet.code, service);

    await screen.findByText(/shared with you/);
    expect(editor().textContent).toContain('realC←');
    await user.click(screen.getByRole('button', { name: /^Run/ }));

    /*
     * The current failure, recorded as it is. Two things are wrong with it: the
     * artwork was refused for a property of the destination rather than of the
     * source, and the remedy offered is an instruction to edit the source code
     * of the application.
     */
    const shown = await screen.findAllByText(/too tall to fetch in one go/);

    /*
     * Twice, which is the third thing wrong with it. The same sentence is
     * rendered by the run status — a polite live region — and again by the error
     * panel beneath it, so it is seen twice and heard twice.
     */
    expect(shown).toHaveLength(2);
    expect(shown[0]?.getAttribute('role')).toBe('status');

    // And the remedy is an instruction to edit the application's own source.
    expect(shown[0]?.textContent).toContain('mark the preset as high resolution');

    // 92, because a reply of exactly 93 lines cannot be told from a truncated
    // one, so the last usable row is one below the cap.
    expect(shown[0]?.textContent).toContain('at most 92 rows');

    // One request: refused after the direct read came back at the cap. The
    // program ran on the service and its result was thrown away.
    expect(service.executionCount).toBe(1);
  });

  it('runs from Julia’s own preset, with the identical source', async () => {
    /*
     * The control. Character for character the same program, and the only
     * difference is which gallery entry is open — which is the whole finding.
     */
    const user = userEvent.setup();
    const service = limitedService();
    render(<WorkspacePage presetId={juliaSet.id} sharedState={null} service={service} />);

    expect(editor().textContent).toContain('realC←');
    await user.click(screen.getByRole('button', { name: /^Run/ }));

    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(/128 by 128/);

    // Banded: a probe and then slices, each re-running the whole program.
    expect(service.executionCount).toBeGreaterThan(1);
  });
});

/**
 * The same APL, two artworks, one outcome.
 *
 * This file began as a reproduction: Julia's program pasted into an artwork that
 * did not declare `highResolution` was refused for being too tall, while the
 * identical text ran from the Julia preset — so what decided whether a piece of
 * APL could run was not the APL but which gallery entry happened to be open.
 *
 * It is now the proof that this is fixed, and inverted rather than deleted so
 * that the fault cannot come back unnoticed. The premise the application rests
 * on is that the visible source is the artwork; these tests hold it to that.
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
import { codeEditor, pressRunWith } from '../helpers/workspaceModes';

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

const editor = () => codeEditor();

/**
 * Opens an artwork whose code is somebody else's program.
 *
 * Through a shared link rather than through the editor: CodeMirror is a
 * contenteditable and does not respond to synthetic events in jsdom, so a
 * "paste" here would silently do nothing and the test would pass for the wrong
 * reason. The paste itself is exercised in a real browser in
 * `tests/e2e/pastedSource.spec.ts`; what this establishes is the same pairing —
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
  return render(<WorkspacePage presetId={presetId} sharedState={encoded} service={service} />);
}

async function runAndFinish(user: ReturnType<typeof userEvent.setup>) {
  await pressRunWith(user);
  await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument(), { timeout: 5000 });
}

describe('pasting Julia’s program into another artwork', () => {
  it('draws all 128 rows of it, from a preset that never declared it could', async () => {
    const user = userEvent.setup();
    const service = limitedService();
    openWithForeignSource(modularBloom.id, juliaSet.code, service);

    await screen.findByText(/shared with you/);
    expect(editor().textContent).toContain('realC←');

    await runAndFinish(user);

    // The whole artwork, not a refusal and not a truncation.
    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(/128 by 128/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(service.executionCount).toBeGreaterThan(1);
  });

  it('costs the same as running it from Julia’s own preset', async () => {
    /*
     * The control, and now the equality. Character for character the same
     * program; the gallery entry that happens to be open no longer changes what
     * it costs or whether it runs at all.
     */
    const user = userEvent.setup();

    const pasted = limitedService();
    const mounted = openWithForeignSource(modularBloom.id, juliaSet.code, pasted);
    await screen.findByText(/shared with you/);
    await runAndFinish(user);
    const pastedRequests = pasted.executionCount;

    // Unmounted rather than emptied, so the second render starts from nothing and
    // the queries below cannot find the first artwork's elements.
    mounted.unmount();

    const own = limitedService();
    render(<WorkspacePage presetId={juliaSet.id} sharedState={null} service={own} />);
    expect(editor().textContent).toContain('realC←');
    await runAndFinish(user);

    expect(screen.getByRole('img', { name: /grid/ })).toHaveAccessibleName(/128 by 128/);
    expect(own.executionCount).toBe(pastedRequests);
  });

  it('says the program was run more than once, because it was', async () => {
    const user = userEvent.setup();
    openWithForeignSource(modularBloom.id, juliaSet.code, limitedService());
    await screen.findByText(/shared with you/);
    await runAndFinish(user);

    /*
     * Once, not twice: a banded result really is several evaluations joined
     * together, and code that uses randomness can differ between the joins. It is
     * worth saying, and worth saying only where it is true.
     */
    const notes = screen.getAllByText(/run several times/);
    expect(notes).toHaveLength(1);
  });

  it('says nothing of the sort for an artwork that came back in one request', async () => {
    const service = limitedService(tall(8));
    render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);

    // The opening run is the one under test: a small artwork comes back whole, in
    // a single request, so there is nothing to warn about.
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

    expect(service.executionCount).toBe(1);
    expect(screen.queryByText(/run several times/)).not.toBeInTheDocument();
  });
});

/**
 * Every region that would actually speak, with the politeness it would speak at.
 *
 * `role="status"` implies polite and `role="alert"` implies assertive, so an
 * element's effective politeness is its explicit `aria-live` when it has one and
 * the role's implication otherwise. A region set to `off` is in the page but
 * silent, which is the whole mechanism under test here.
 */
function announcingRegions(): { politeness: string; text: string }[] {
  const candidates = document.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
  return [...candidates]
    .map((element) => {
      const role = element.getAttribute('role');
      const implied = role === 'alert' ? 'assertive' : role === 'status' ? 'polite' : 'off';
      return {
        politeness: element.getAttribute('aria-live') ?? implied,
        text: element.textContent ?? '',
      };
    })
    .filter((region) => region.politeness !== 'off');
}

describe('a refusal', () => {
  it('is shown once, and never tells the visitor to edit the application', async () => {
    const user = userEvent.setup();
    // Past the workspace's matrix limits, which is the one size question left.
    const service = limitedService(tall(300));
    render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);

    await pressRunWith(user);
    const alert = await screen.findByRole('alert');

    /*
     * The detailed sentence used to appear in the polite status region as well as
     * in this alert, so it was read out twice as though two things had gone
     * wrong. The status region now says only that the run failed.
     */
    const shown = screen.getAllByText(/too large for APL Art to draw safely/);
    expect(shown).toHaveLength(1);
    expect(alert).toContainElement(shown[0] ?? null);
    /*
     * Checked across every status region, because there is more than one on the
     * page: one of them says that the run failed, and none of them repeats what
     * the alert has already said.
     */
    const statuses = screen.getAllByRole('status').map((status) => status.textContent ?? '');
    expect(statuses).toContain('Run failed.');
    expect(statuses.some((text) => text.includes('too large'))).toBe(false);

    // And the remedy is something the visitor can act on, not an instruction to
    // change the source code of the application.
    expect(alert.textContent).toContain('Reduce the size and run again');
    expect(document.body.textContent).not.toContain('high resolution');
  });

  it('is announced once, by the alert and not by the status region', async () => {
    const user = userEvent.setup();
    const service = limitedService(tall(300));
    render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);

    await pressRunWith(user);
    await screen.findByRole('alert');

    /*
     * One voice, not two. Shortening the status region's wording stopped the
     * detail being read out twice, but both regions still changed at once, so a
     * single failure arrived as two announcements: "Run failed." politely, then
     * the message assertively. The status region is now `off` while a run has
     * failed, so the alert is the only region that speaks.
     */
    const speaking = announcingRegions().filter((region) => /failed|too large/u.test(region.text));
    expect(speaking).toHaveLength(1);
    expect(speaking[0]?.politeness).toBe('assertive');
    expect(speaking[0]?.text).toContain('too large for APL Art to draw safely');

    // Still visible, though: silencing the region did not empty it.
    const statuses = screen.getAllByRole('status').map((status) => status.textContent ?? '');
    expect(statuses).toContain('Run failed.');
  });
});

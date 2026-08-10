/**
 * One workspace, for every artwork.
 *
 * There used to be two ways to edit a piece: a seeded link opened a tabbed
 * workspace with curated controls, and the gallery's own card opened a long
 * column of technical ones. Which you got depended on whether the preset had an
 * Instant Play block, so ten of the eleven artworks could only be edited the old
 * way and the two experiences drifted apart — different execution models,
 * different histories, different actions.
 *
 * There is one now, and this file holds it to that. What the seed decides is the
 * artwork you are given, not the interface you are given it in; what curated
 * controls decide is whether there is a Create tab, and nothing else.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from '@/gallery/GalleryPage';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { parseRoute } from '@/app/router';
import { basketWeave } from '@/presets/basket-weave';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { artworkActions, offeredModes, selectedMode, showMode } from '../helpers/workspaceModes';

beforeAll(() => {
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

  // CodeMirror measures text, and jsdom has no layout to measure with.
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
});

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

function serviceReturning(size = 8) {
  const service = new MockAplExecutionService();
  service.register(
    'default',
    fromNested(
      Array.from({ length: size }, (_unusedRow, row) =>
        Array.from({ length: size }, (_unusedColumn, column) => (row * column) % 5),
      ),
    ),
  );
  return service;
}

const open = (presetId: string, play: string | null = null) => {
  const service = serviceReturning();
  render(<WorkspacePage presetId={presetId} sharedState={null} play={play} service={service} />);
  return service;
};

/** The source the editor holds, whichever mode happens to be showing. */
const source = () => document.querySelector('.cm-content')?.textContent ?? '';
const asRendered = (code: string) => code.split('\n').join('');

describe('how the gallery opens an artwork', () => {
  it('links to the plain artwork address, with no seed on it', () => {
    render(<GalleryPage />);

    for (const link of screen.getAllByRole('link', { name: /^Open/ })) {
      const href = link.getAttribute('href') ?? '';
      const route = parseRoute(href);

      expect(route.name, href).toBe('artwork');
      // A seed is a request for a fresh curated variation. Choosing an artwork
      // from the catalogue is not that, and must not discard saved work.
      expect(route.name === 'artwork' ? route.play : 'unset', href).toBeNull();
    }
  });

  it('opens it in the tabbed workspace all the same', () => {
    open(modularBloom.id);

    expect(screen.getByRole('tablist', { name: 'Editing mode' })).toBeInTheDocument();
    expect(offeredModes()).toContain('Advanced');
  });

  it('shows the artwork as it ships when this browser has left nothing on it', () => {
    open(modularBloom.id);

    // Not a variation: without a seed there is nothing asking for one.
    expect(source()).toBe(asRendered(modularBloom.code));
  });

  it('and a seed opens something else entirely', () => {
    open(modularBloom.id, '20260805');

    expect(source()).not.toBe(asRendered(modularBloom.code));
  });

  /*
   * That saved work survives an ordinary open, and that a seed deliberately
   * beats it, are asserted in `startCreating.test.tsx` against the project
   * repository's own shape. Repeating them here would be a second, worse copy of
   * a fixture rather than a second piece of evidence.
   */
});

describe('which modes an artwork offers', () => {
  it('gives every artwork Colour, Animate, Advanced and Code', () => {
    for (const presetId of [modularBloom.id, mandelbrotField.id]) {
      const { unmount } = render(
        <WorkspacePage presetId={presetId} sharedState={null} service={serviceReturning()} />,
      );

      for (const mode of ['Colour', 'Animate', 'Advanced', 'Code']) {
        expect(offeredModes(), `${mode} for ${presetId}`).toContain(mode);
      }

      unmount();
    }
  });

  it('gives Create only to an artwork that has curated controls, and opens there', () => {
    open(modularBloom.id);

    // Tile sits between Animate and Advanced: it is a creative question about
    // the artwork, not one of the exact numbers underneath it.
    expect(offeredModes()).toEqual(['Create', 'Colour', 'Animate', 'Tile', 'Advanced', 'Code']);
    expect(selectedMode()).toBe('Create');
  });

  it('leaves Create out for an artwork that has none, and opens on Advanced', () => {
    /*
     * Left out rather than shown empty. A Create tab with nothing behind it
     * invites a press and answers with a blank panel, which is a worse account
     * of the artwork than not claiming to have curated controls at all — and
     * Advanced is where this artwork's real parameters are.
     */
    open(mandelbrotField.id);

    expect(offeredModes()).toEqual(['Colour', 'Animate', 'Advanced', 'Code']);
    expect(selectedMode()).toBe('Advanced');
    expect(screen.queryByRole('tab', { name: 'Create' })).toBeNull();
  });
});

describe('where the actions live', () => {
  it('puts exactly Focus mode, Share and Export in the toolbar', () => {
    open(mandelbrotField.id);

    // Anchored on the title rather than on the old back link: the way home is
    // the wordmark and the site menu in the app bar now, not a button here.
    // Anchored on the toolbar itself. The title is not here any more — it went
    // back to the workspace, above the artwork it names.
    const toolbar = screen.getByRole('button', { name: 'Focus mode' }).closest('div[class*="toolbar"]');
    const named = within(toolbar as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(named).toEqual(['Focus mode', 'Share', 'Export']);
  });

  it('gives the artwork back its way to the gallery, on the title’s own line', () => {
    /*
     * Lost when three bars became one, and it mattered: the wordmark goes to the
     * gallery too, but it is the site's mark at the corner of the window rather
     * than a way out of this artwork, and nothing on the page said "back".
     *
     * It belongs with the title rather than in the app bar. Both name the
     * artwork's own column and sit on the artwork's left edge; the bar holds the
     * site and the three things that can be done to a picture.
     */
    open(basketWeave.id);

    const back = screen.getByRole('link', { name: 'Gallery' });
    expect(back).toHaveAttribute('href', '#/');

    const heading = screen.getByRole('heading', { level: 1, name: 'Basket Weave' });
    // One line, in that order: the way out, then what you are looking at.
    expect(back.parentElement).toBe(heading.parentElement);
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // And none of what the consolidation removed comes back with it.
    expect(screen.queryByText(/^Pattern$/u)).toBeNull();
    expect(screen.queryByText(/Pattern · Original/u)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Focus mode' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Export' })).toHaveLength(1);
  });

  it('puts exactly Randomise, Undo and Reset beneath the modes', () => {
    open(mandelbrotField.id);

    const named = within(artworkActions())
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(named).toEqual(['Randomise', 'Undo', 'Reset']);
  });

  it('offers Save image nowhere at all, because Export subsumes it', () => {
    open(modularBloom.id);
    expect(screen.queryByRole('button', { name: 'Save image' })).toBeNull();
  });

  it('offers Share once, in the toolbar rather than in both places', () => {
    open(modularBloom.id);
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
  });

  it('puts Run and Copy APL together in Code, where the program is', async () => {
    open(mandelbrotField.id);

    // Waited out: the workspace draws itself on arrival, and Run stands down for
    // Stop while a run is in flight.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());

    const code = within(showMode('Code'));
    expect(code.getByRole('button', { name: /^Run/ })).toBeInTheDocument();
    expect(code.getByRole('button', { name: 'Copy APL' })).toBeInTheDocument();

    // And Copy APL is no longer offered from the toolbar, where it was the only
    // action about the program rather than about the picture.
    expect(screen.getAllByRole('button', { name: 'Copy APL' })).toHaveLength(1);
  });
});

describe('Reset, for an artwork with no curated controls', () => {
  it('redraws immediately and can be stepped back over', async () => {
    const user = userEvent.setup();
    const service = open(mandelbrotField.id);

    // A technical control is a recorded change now, in every artwork.
    const advanced = within(showMode('Advanced'));
    const iterations = advanced.getByLabelText('Maximum iterations');
    fireEvent.change(iterations, { target: { value: '60' } });
    fireEvent.pointerUp(iterations);
    await waitFor(() => expect(source()).toContain('iterations←60'));

    const before = source();
    const runsBefore = service.executionCount;

    await user.click(within(artworkActions()).getByRole('button', { name: 'Reset' }));

    // Drawn without anybody having to find Run.
    await waitFor(() => expect(service.executionCount).toBeGreaterThan(runsBefore));
    expect(source()).toBe(asRendered(mandelbrotField.code));

    const undo = within(artworkActions()).getByRole('button', { name: /^Undo/ });
    expect(undo).toBeEnabled();
    expect(undo).toHaveAccessibleName('Undo Reset');

    await user.click(undo);
    expect(source()).toBe(before);
  });
});

/**
 * Start creating, from the press to the drawn artwork.
 *
 * The property under test throughout is that the link decides the artwork. A
 * seed is chosen once, by the press; everything after that — the first render,
 * every re-render, a reload, a revisit — reads it rather than choosing again. The
 * failure this guards against is subtle and would look like a feature: an artwork
 * that quietly becomes a different artwork, so nobody can send anyone the thing
 * they actually made.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from '@/gallery/GalleryPage';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { START_CREATING_POOL, starterFor, startCreatingPool } from '@/presets/presets';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { parseRoute } from '@/app/router';
import { decodeShareState } from '@/sharing/decodeShareState';
import { encodeShareState } from '@/sharing/encodeShareState';
import { SHARE_SCHEMA_VERSION } from '@/sharing/shareState';
import { PROJECT_SCHEMA_VERSION, type Project } from '@/storage/ProjectRepository';
import { defaultRenderOptions } from '@/renderer/renderOptions';
import { localProjects, projectIdFor } from '@/workspace/useLocalProject';
import { readPlaySeed, startCreating } from '@/workspace/startCreating';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { colour } from '../helpers/workspaceModes';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // The wide layout, so the editor, the run panel and the controls are all on
  // the page at once rather than behind tabs.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

/** A seed with a known answer, worked out through the generator rather than guessed. */
const SEED = 20_260_805;
const started = startCreating(modularBloom, SEED);

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

/*
 * From the document rather than through a role query: in a session the editor
 * lives in the Code tab, and every panel but the one on show is hidden and so
 * absent from the accessibility tree. The source is the same either way, which
 * is the point of there being one of it.
 */
const source = () => document.querySelector('.cm-content')?.textContent ?? '';

/**
 * A program as the editor renders it.
 *
 * CodeMirror puts each line in its own element, so the accessible text of the
 * whole editor holds every character except the newlines. Comparing against this
 * rather than against a substring keeps the assertion whole-program: nothing else
 * in the source may have moved either.
 */
const asRendered = (code: string) => code.split('\n').join('');

function openWith(play: string | null, service = serviceReturning()) {
  const view = render(
    <WorkspacePage presetId={modularBloom.id} sharedState={null} play={play} service={service} />,
  );
  return { service, view };
}

/** The href of the gallery's primary action. */
function startHref(): string {
  return screen.getByRole('link', { name: 'Start creating' }).getAttribute('href') ?? '';
}

describe('the gallery hero', () => {
  it('offers Start creating first and Browse the gallery second', () => {
    render(<GalleryPage />);

    const actions = screen.getAllByRole('link', { name: /Start creating|Browse the gallery/ });
    expect(actions.map((link) => link.textContent)).toEqual(['Start creating', 'Browse the gallery']);
  });

  it('points Start creating at one of the curated artworks, with a seed', () => {
    /*
     * The pool rather than one artwork. Start creating opened Modular Bloom every
     * time only because it was the sole preset with curated controls; now the
     * seed chooses the artwork as well as the variation within it, from a list
     * chosen for being the strongest first impression.
     */
    render(<GalleryPage />);

    const route = parseRoute(startHref());
    expect(route.name).toBe('artwork');
    expect(START_CREATING_POOL).toContain(route.name === 'artwork' ? route.presetId : '');
    expect(readPlaySeed(route.name === 'artwork' ? route.play : null)).not.toBeNull();
  });

  it('reaches every artwork in the pool, and never one outside it', () => {
    /*
     * Driven through the selector rather than by re-rendering the gallery, which
     * would need as many mounts as it took to see all four. What matters is that
     * the mapping is total and closed: every seed lands somewhere in the pool,
     * and every member of the pool is reachable.
     */
    const reached = new Set<string>();
    for (let seed = 0; seed < 64; seed += 1) {
      const preset = starterFor(seed);
      expect(preset, `seed ${String(seed)}`).toBeDefined();
      expect(START_CREATING_POOL).toContain(preset?.id);
      if (preset !== undefined) reached.add(preset.id);
    }

    expect([...reached].sort()).toEqual([...START_CREATING_POOL].sort());
  });

  it('gives the same seed the same artwork every time', () => {
    for (const seed of [0, 1, 7, 4242, 20_260_805]) {
      expect(starterFor(seed)?.id, `seed ${String(seed)}`).toBe(starterFor(seed)?.id);
      expect(starterFor(seed)?.id).toBe(starterFor(seed)?.id);
    }

    // And a seed's variation is decided by the same number, so one seed is one
    // artwork at one set of values.
    const preset = starterFor(SEED);
    expect(preset).toBeDefined();
    if (preset !== undefined) {
      expect(startCreating(preset, SEED)?.code).toBe(startCreating(preset, SEED)?.code);
    }
  });

  it('offers only artworks that actually have curated controls', () => {
    for (const preset of startCreatingPool()) {
      expect(preset.instantPlay, preset.id).toBeDefined();
    }
    expect(startCreatingPool()).toHaveLength(START_CREATING_POOL.length);
  });

  it('sends Browse the gallery to the artworks, not to another page', () => {
    render(<GalleryPage />);

    const href = screen.getByRole('link', { name: 'Browse the gallery' }).getAttribute('href');
    expect(href).toBe('#gallery');

    /*
     * A jump within this page rather than a route: the target has to be here, and
     * the fragment must not look like one of this application's paths, all of
     * which begin `#/`. What keeps such a fragment from replacing the page is the
     * router's own snapshot rather than `parseRoute`, so that it stays a gallery
     * is asserted where it can be: in the browser, end to end.
     */
    expect(document.getElementById('gallery')).not.toBeNull();
    expect(href?.startsWith('#/')).toBe(false);
  });

  it('does not choose a new seed when the gallery re-renders', async () => {
    const user = userEvent.setup();
    render(<GalleryPage />);

    const before = startHref();
    // A filter chip is state in this component, so this is a real re-render of
    // the element that holds the link.
    await user.click(screen.getByRole('button', { name: /^Fractals/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Fractals/ })).toBeInTheDocument());

    expect(startHref()).toBe(before);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(startHref()).toBe(before);
  });

  it('offers something new on a fresh visit', () => {
    // Each mount is a visit. Different seeds are what make coming back to the
    // gallery and pressing again worth doing.
    const seeds = new Set<string>();
    for (let visit = 0; visit < 6; visit += 1) {
      const view = render(<GalleryPage />);
      seeds.add(startHref());
      view.unmount();
    }

    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe('arriving from Start creating', () => {
  it('opens the curated variation rather than the artwork’s defaults', async () => {
    openWith(String(SEED));

    expect(started).not.toBeNull();
    /*
     * The whole program, not a value from it. Every curated value has to be in
     * the editor and nothing else may have changed, which one comparison says
     * and three value checks would not.
     */
    expect(source()).toBe(asRendered(started?.code ?? ''));
    expect(source()).not.toBe(asRendered(modularBloom.code));

    // Awaited so the run this arrival starts finishes inside the test.
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
  });

  it('draws it without waiting to be asked, exactly once', async () => {
    const { service } = openWith(String(SEED));

    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
    expect(screen.getByRole('img')).toHaveAccessibleName(/8 by 8 grid/);

    // One run, not one per render: the guard is a ref, and the effect's
    // dependencies change as the code does.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(service.executionCount).toBe(1);
    expect(service.received[0]).toContain(`size←${String(numberAssignedTo(started?.code ?? '', 'size'))}`);
  });

  it('is not announced as somebody else’s creation', async () => {
    openWith(String(SEED));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

    expect(screen.queryByText(/shared with you/)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be opened/)).not.toBeInTheDocument();
  });

  it('gives the same artwork every time the same link is opened', async () => {
    const first = openWith(String(SEED));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
    const opened = source();
    first.view.unmount();

    openWith(String(SEED));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

    expect(source()).toBe(opened);
  });

  it('does not vary when something else on the page changes', async () => {
    const user = userEvent.setup();
    const { service } = openWith(String(SEED));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
    const opened = source();

    /*
     * Appearance only, and twice, but each press re-renders the whole workspace —
     * which is exactly the moment a variation chosen during render rather than
     * from the seed would become a different one.
     *
     * Inverting lives in the Colour mode now, so the mode is chosen first: the
     * point of the test is what re-rendering does to the seed, and a session
     * offers this control one press away rather than in a column of its own.
     */
    fireEvent.click(screen.getByRole('tab', { name: 'Colour' }));
    const invert = colour().getByRole('checkbox', { name: /Invert palette/ });
    await user.click(invert);
    await user.click(invert);

    expect(source()).toBe(opened);
    expect(service.executionCount).toBe(1);
  });

  it('carries its seed into a share link, so what was made can be sent on', async () => {
    const user = userEvent.setup();
    openWith(String(SEED));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());

    // `navigator.clipboard` is a getter in jsdom, so it is defined over.
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

    /*
     * The toolbar's Share, which is the first in document order — a session also
     * offers one of its own, beside the artwork. Both call the same action; this
     * is the one that existed before sessions did, so it is the one this test
     * keeps asking about.
     */
    const [toolbarShare] = screen.getAllByRole('button', { name: 'Share' });
    await user.click(toolbarShare as HTMLElement);
    await waitFor(() => expect(copied).not.toBe(''));

    const encoded = new URL(copied).hash.split('?s=')[1] ?? '';
    const shared = decodeShareState(encoded);
    expect(shared.ok).toBe(true);
    expect(shared.ok ? shared.state.seed : null).toBe(SEED);
    expect(shared.ok ? shared.state.code : '').toBe(started?.code);
  });
});

describe('when a link carries both a shared artwork and a seed', () => {
  it('opens what was shared, because that is what somebody was sent', async () => {
    /*
     * Nothing in the application writes both, but a URL can hold anything and the
     * precedence has to be decided rather than discovered. A shared link is
     * somebody else's creation; a seed is an invitation to make your own, and the
     * creation wins.
     */
    const shared = encodeShareState({
      v: SHARE_SCHEMA_VERSION,
      preset: modularBloom.id,
      code: modularBloom.code.replace(/modulus←\d+/u, 'modulus←13'),
      params: {},
      palette: modularBloom.defaultPaletteId,
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
      title: modularBloom.title,
    });

    const service = serviceReturning();
    render(
      <WorkspacePage presetId={modularBloom.id} sharedState={shared} play={String(SEED)} service={service} />,
    );

    expect(source()).toContain('modulus←13');
    expect(source()).not.toBe(asRendered(started?.code ?? ''));
    // And it behaves as a shared link throughout: announced as one, and waiting
    // to be run rather than drawing itself.
    expect(screen.getByText(/shared with you/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(service.executionCount).toBe(0);
  });
});

describe('a play seed that is not one', () => {
  it('opens the ordinary artwork instead, and draws nothing on its own', async () => {
    const { service } = openWith('not-a-seed');

    expect(source()).toBe(asRendered(modularBloom.code));
    expect(screen.getByText('Press Run to draw this artwork.')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(service.executionCount).toBe(0);
  });
});

describe('saved work and a new session', () => {
  /** Work this browser had left behind on the same artwork. */
  const savedCode = modularBloom.code.replace(/size←\d+/u, 'size←19');

  async function saveWork() {
    const project: Project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: projectIdFor(modularBloom.id),
      sourcePresetId: modularBloom.id,
      title: modularBloom.title,
      code: savedCode,
      parameterValues: {},
      paletteId: modularBloom.defaultPaletteId,
      renderOptions: defaultRenderOptions(modularBloom.defaultPaletteId),
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    await localProjects.save(project);
  }

  it('opens saved work when no session was asked for', async () => {
    await saveWork();
    openWith(null);

    expect(source()).toBe(asRendered(savedCode));
  });

  it('lets a new session win, because pressing Start creating asks for one', async () => {
    await saveWork();
    openWith(String(SEED));

    expect(source()).toBe(asRendered(started?.code ?? ''));
    expect(source()).not.toBe(asRendered(savedCode));

    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
  });

  it('is then remembered like any other work, so it can be found again', async () => {
    /*
     * The session is not a preview. Leaving it saves what it left, exactly as
     * leaving an edited artwork does — so the artwork's own address afterwards
     * opens what was made rather than the preset's defaults. That the earlier
     * saved work is replaced is the existing behaviour of one working copy per
     * artwork, and deliberately not given a Play-only exception here.
     */
    await saveWork();
    const session = openWith(String(SEED));
    await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument());
    session.view.unmount();

    expect(localProjects.getImmediate(projectIdFor(modularBloom.id))?.code).toBe(started?.code);

    openWith(null);
    expect(source()).toBe(asRendered(started?.code ?? ''));
  });
});

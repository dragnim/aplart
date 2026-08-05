/**
 * The artwork's palette reaching the interface.
 *
 * What is checked here is the plumbing rather than the colour science: that all
 * fourteen properties arrive together on one element, that they follow the route,
 * that they never keep a colour from a piece the visitor has left, and that
 * nothing about applying them touches the artwork.
 *
 * The values themselves are asserted against the derivation rather than written
 * out, so this file cannot drift from `interfaceAccent.test.ts` — that suite owns
 * what the colours must be, this one owns where they must appear.
 *
 * jsdom does not apply the stylesheets, so what the logo's two halves *paint* is
 * proved in `tests/e2e/branding.spec.ts`, in a browser that does. Here the paths
 * and their class hooks are what can honestly be checked.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { getPalette } from '@/renderer/palettes';
import { AccentPaletteContext, usePublishAccentPalette } from '@/theme/accentContext';
import { InterfaceAccentBoundary } from '@/theme/InterfaceAccentBoundary';
import { accentCssVariables, defaultAccentTheme, deriveInterfaceAccentTheme } from '@/theme/interfaceAccent';
import { useEffect } from 'react';

const TOKENS = [
  '--ui-accent-source',
  '--ui-accent-solid',
  '--ui-accent-solid-hover',
  '--ui-accent-solid-active',
  '--ui-accent-on-solid',
  '--ui-accent-text',
  '--ui-accent-text-on-dark',
  '--ui-accent-border',
  '--ui-accent-border-on-dark',
  '--ui-accent-soft',
  '--ui-accent-soft-on-dark',
  '--ui-accent-focus',
  '--logo-neutral',
  '--logo-neutral-on-dark',
] as const;

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
});

/** The element the theme is applied to. */
function shell(): HTMLElement {
  const element = document.querySelector('[data-accent]');
  if (element === null) throw new Error('no element carries the interface accent');
  return element as HTMLElement;
}

function applied(): Record<string, string> {
  const element = shell();
  return Object.fromEntries(TOKENS.map((name) => [name, element.style.getPropertyValue(name)]));
}

const themeFor = (paletteId: string) => accentCssVariables(deriveInterfaceAccentTheme(getPalette(paletteId)));
const defaults = () => accentCssVariables(defaultAccentTheme());

async function go(hash: string): Promise<void> {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Waits for the lazily loaded workspace to arrive. */
async function openedArtwork(name: RegExp): Promise<void> {
  await screen.findByRole('heading', { level: 1, name }, { timeout: 5_000 });
}

describe('where the theme is applied', () => {
  it('puts all fourteen properties on one element, and only one', () => {
    render(<App />);

    expect(document.querySelectorAll('[data-accent]')).toHaveLength(1);
    for (const [name, value] of Object.entries(applied())) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  it('uses the default theme on the gallery', () => {
    render(<App />);

    expect(shell().dataset.accent).toBe('default');
    expect(applied()).toEqual(defaults());
  });

  it('uses the default theme on Help and About', async () => {
    render(<App />);

    for (const route of ['#/help', '#/about']) {
      await go(route);
      await waitFor(() => expect(shell().dataset.accent).toBe('default'));
      expect(applied()).toEqual(defaults());
    }
  });

  it('uses the default theme where there is no page at all', async () => {
    render(<App />);
    await go('#/nowhere');

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(applied()).toEqual(defaults());
  });
});

describe('following the route', () => {
  it('applies the artwork palette when one is opened', async () => {
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);

    // Julia Set declares Poolrooms, so the interface should be its teal.
    await waitFor(() => expect(shell().dataset.accent).toBe('palette'));
    expect(applied()).toEqual(themeFor('poolrooms'));
  });

  it('themes an artwork immediately, without passing through the default first', async () => {
    /*
     * The preset's declared palette is known from the registry, so a direct visit
     * does not have to wait for the workspace chunk to load and correct itself.
     * Asserted on the very first render, before anything is awaited.
     */
    render(<App />);
    await go('#/art/checker-shift');

    expect(applied()).toEqual(themeFor('blueprint'));
    await openedArtwork(/Checker/);
  });

  it('changes theme when a different artwork is opened', async () => {
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);
    expect(applied()).toEqual(themeFor('poolrooms'));

    await go('#/art/truchet-grid');
    await openedArtwork(/Truchet/);
    await waitFor(() => expect(applied()).toEqual(themeFor('mono')));
  });

  it('restores every default property on the way back to the gallery', async () => {
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);
    expect(applied()).not.toEqual(defaults());

    await go('#/');
    await waitFor(() => expect(shell().dataset.accent).toBe('default'));
    expect(applied()).toEqual(defaults());
  });

  it('restores the defaults on the way to Help', async () => {
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);

    await go('#/help');
    await waitFor(() => expect(applied()).toEqual(defaults()));
  });

  it('themes an artwork opened from Help', async () => {
    render(<App />);
    await go('#/help');
    await waitFor(() => expect(applied()).toEqual(defaults()));

    await go('#/art/sierpinski-array');
    await openedArtwork(/Sierpi/);
    await waitFor(() => expect(applied()).toEqual(themeFor('neon')));
  });

  it('follows the palette a valid share link carries', async () => {
    const { encodeShareState } = await import('@/sharing/encodeShareState');
    const { modularBloom } = await import('@/presets/modular-bloom');

    // Modular Bloom declares Ember; this link asks for Forest instead.
    const encoded = encodeShareState({
      v: 1,
      preset: modularBloom.id,
      code: modularBloom.code,
      params: {},
      palette: 'forest',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    render(<App />);
    await go(`#/art/${modularBloom.id}?s=${encoded}`);
    await openedArtwork(/Modular Bloom/);
    await screen.findByText(/shared with you/);

    await waitFor(() => expect(applied()).toEqual(themeFor('forest')));
  });

  it('keeps no colour from the artwork just left when a share link is unusable', async () => {
    render(<App />);
    await go('#/art/sierpinski-array');
    await openedArtwork(/Sierpi/);
    const neon = applied();

    // Not a share link at all. The artwork opens on its own defaults and says so,
    // and the interface must follow that rather than the piece before it.
    await go('#/art/julia-set?s=%21%21not-a-link');
    await openedArtwork(/Julia/);
    await screen.findByText(/could not be opened/);

    await waitFor(() => expect(applied()).toEqual(themeFor('poolrooms')));
    expect(applied()).not.toEqual(neon);
  });
});

describe('following the palette', () => {
  it('changes when a different palette is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);
    expect(applied()).toEqual(themeFor('poolrooms'));

    await user.click(screen.getByRole('radio', { name: /Neon/ }));

    await waitFor(() => expect(applied()).toEqual(themeFor('neon')));
  });

  it('does not change when a control other than the palette is used', async () => {
    const user = userEvent.setup();
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);
    const before = applied();

    await user.click(screen.getByRole('checkbox', { name: /Invert palette/ }));

    // Inverting changes the picture and not one interface colour.
    expect(applied()).toEqual(before);
  });

  it('keeps the last valid theme while a colour is half typed, then takes the new one', async () => {
    const user = userEvent.setup();
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);

    await user.click(screen.getByRole('radio', { name: /Custom/ }));
    await waitFor(() => expect(shell().dataset.accent).toBe('palette'));
    const seeded = applied();

    const hex = screen.getByLabelText(/Hex value of stop 1/);

    /*
     * Mid-edit. "#ff" is not a colour, so the editor commits nothing, the palette
     * state does not change and the interface holds still — no flash through the
     * default orange between two keystrokes.
     *
     * Changed through an event rather than by typing because the field is
     * controlled: React restores its value whenever a keystroke commits nothing,
     * so a partial value never survives in the DOM to be typed on top of.
     */
    fireEvent.change(hex, { target: { value: '#ff' } });
    expect(applied()).toEqual(seeded);

    // And once it is a colour, the interface follows it. Red, which no teal
    // palette contains, so the source has to move.
    fireEvent.change(hex, { target: { value: '#ff0000' } });

    await waitFor(() => expect(applied()['--ui-accent-source']).toBe('#ff0000'));
    expect(applied()).not.toEqual(seeded);
    for (const [name, value] of Object.entries(applied())) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });
});

describe('the last valid theme', () => {
  /**
   * A child that publishes whatever it is told to, so the retention contract can
   * be exercised without going through the palette editor.
   */
  function Publisher({
    source,
  }: {
    readonly source: { presetId: string; colours: string[] } | null | undefined;
  }) {
    const publish = usePublishAccentPalette();
    useEffect(() => {
      if (source !== undefined) publish(source);
    }, [publish, source]);
    return null;
  }

  it('is held by the caller, and kept when nothing new is published', () => {
    const { rerender } = render(
      <InterfaceAccentBoundary presetId="julia-set">
        <Publisher source={{ presetId: 'julia-set', colours: [...getPalette('neon').colours] }} />
      </InterfaceAccentBoundary>,
    );

    expect(applied()).toEqual(themeFor('neon'));

    // Publishing nothing is how "nothing valid to show you" is said.
    rerender(
      <InterfaceAccentBoundary presetId="julia-set">
        <Publisher source={undefined} />
      </InterfaceAccentBoundary>,
    );

    expect(applied()).toEqual(themeFor('neon'));
  });

  it('ignores colours published for an artwork the visitor has left', () => {
    render(
      <InterfaceAccentBoundary presetId="julia-set">
        <Publisher source={{ presetId: 'truchet-grid', colours: [...getPalette('mono').colours] }} />
      </InterfaceAccentBoundary>,
    );

    // The route says Julia Set, so its own palette wins over a stale publication.
    expect(applied()).toEqual(themeFor('poolrooms'));
  });

  it('returns to the default theme when the artwork closes', () => {
    const { rerender } = render(
      <InterfaceAccentBoundary presetId="julia-set">
        <Publisher source={{ presetId: 'julia-set', colours: [...getPalette('neon').colours] }} />
      </InterfaceAccentBoundary>,
    );
    expect(applied()).toEqual(themeFor('neon'));

    rerender(
      <InterfaceAccentBoundary presetId={null}>
        <Publisher source={null} />
      </InterfaceAccentBoundary>,
    );

    expect(applied()).toEqual(defaults());
    expect(shell().dataset.accent).toBe('default');
  });

  it('provides a publisher that does nothing outside a boundary', () => {
    // So a component can publish without knowing whether one is present.
    function Alone() {
      const publish = usePublishAccentPalette();
      expect(() => publish(null)).not.toThrow();
      return <p>fine</p>;
    }

    render(
      <AccentPaletteContext.Provider value={() => undefined}>
        <Alone />
      </AccentPaletteContext.Provider>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});

describe('what applying a theme must not disturb', () => {
  it('keeps the artwork theme in Focus mode, and on the way out', async () => {
    const user = userEvent.setup();
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);
    const before = applied();

    await user.click(screen.getByRole('button', { name: 'Focus mode' }));
    await screen.findByRole('button', { name: 'Exit focus' });

    /*
     * Focus mode covers the whole page, so the properties have to be inherited
     * from above it rather than set on the workspace — which is why they live on
     * the shell. Nothing about entering or leaving re-derives them.
     */
    expect(applied()).toEqual(before);

    await user.click(screen.getByRole('button', { name: 'Exit focus' }));
    expect(applied()).toEqual(before);
  });

  it('changes no code when the palette changes, so nothing joins the undo history', async () => {
    const user = userEvent.setup();
    render(<App />);
    await go('#/art/julia-set');
    await openedArtwork(/Julia/);

    const editor = document.querySelector('.cm-content');
    const codeBefore = editor?.textContent ?? '';
    expect(codeBefore).not.toBe('');

    await user.click(screen.getByRole('radio', { name: /Neon/ }));
    await waitFor(() => expect(applied()).toEqual(themeFor('neon')));

    // The editor is untouched, so there is nothing for an undo to undo.
    expect(document.querySelector('.cm-content')?.textContent).toBe(codeBefore);
  });
});

describe('the header wordmark', () => {
  it('is the inline logo rather than text', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'APL Art' });

    const svg = link.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 312 113');
    expect(link.querySelector('img')).toBeNull();

    /*
     * And it is the only thing in the link. The old text has gone, and so has the
     * rounded square that held a ⍴ beside it: that dated from the text wordmark,
     * and two marks in one header said less than one.
     */
    expect(link.textContent?.trim()).toBe('');
    expect(link.querySelectorAll('span')).toHaveLength(0);
  });

  it('keeps the destination and the accessible name', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'APL Art' });

    expect(link).toHaveAttribute('href', '#/');

    /*
     * Named once. The link carries the name and the wordmark inside it is hidden,
     * so nothing inside is announced a second time and the only image role on an
     * artwork page remains the artwork.
     */
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(within(link).queryAllByRole('img')).toHaveLength(0);
  });

  it('gives each half its own class, and the theme supplies both colours', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'APL Art' });

    expect(link.querySelector('path[class*="apl"]')).not.toBeNull();
    expect(link.querySelector('path[class*="art"]')).not.toBeNull();

    // The properties those classes read are present with usable values.
    expect(applied()['--logo-neutral']).toMatch(/^#[0-9a-f]{6}$/u);
    expect(applied()['--ui-accent-text']).toMatch(/^#[0-9a-f]{6}$/u);
  });
});

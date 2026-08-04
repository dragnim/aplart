/**
 * Getting out of a render failure.
 *
 * The boundary caught faults and offered two ways out, and only one of them
 * worked. "Try again" clears the error explicitly. "Back to the gallery" is an
 * ordinary link: it changed the route, React rendered the gallery — and the
 * boundary, still holding the error the artwork threw, went on showing the
 * fallback over the top of it. The visitor was stranded on an error page for a
 * page they had already left.
 *
 * The workspace module is replaced with one that throws, because a real render
 * failure is the only thing that puts the boundary into the state under test.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/workspace/WorkspacePage', () => ({
  WorkspacePage: () => {
    throw new Error('deliberate render failure for the boundary test');
  },
}));

// Imported after the mock is declared, which vitest hoists above it anyway.
const { App } = await import('@/app/App');

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/art/mandelbrot-field';
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  // React logs caught render errors; the test deliberately causes one.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('recovering from a render failure', () => {
  it('shows the fallback when an artwork fails to render', async () => {
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Something went wrong in this artwork/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the gallery' })).toBeInTheDocument();
  });

  it('returns to a usable gallery from the fallback link', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('alert');
    await user.click(screen.getByRole('link', { name: 'Back to the gallery' }));

    /*
     * jsdom follows the href and updates `location.hash`, but does not fire
     * `hashchange` for a programmatic click, so the event the router listens for is
     * dispatched here. A real browser fires it itself.
     */
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    // The gallery, not the fallback: cards to choose from and no alert.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Tiny programs/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(5);

    /*
     * And usable: the cards lead somewhere. Selected by destination rather than by
     * accessible name — the name comes from a visually-hidden span, and this test
     * is about the gallery working, not about how jsdom computes that name.
     */
    const destinations = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('#/art/'));

    expect(destinations.length).toBeGreaterThan(5);
    expect(destinations).toContain('#/art/mandelbrot-field');
  });

  it('recovers into Help too, not only the gallery', async () => {
    // Any meaningful route change clears it, so the fix is not special-cased to
    // one destination.
    render(<App />);
    await screen.findByRole('alert');

    window.location.hash = '#/help';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('still offers Try again, which re-renders the same route', async () => {
    /*
     * The existing escape route, unchanged. The component throws every time, so
     * pressing it puts the fallback straight back — what matters is that the
     * button still clears the error and re-renders rather than doing nothing.
     */
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(window.location.hash).toBe('#/art/mandelbrot-field');
  });
});

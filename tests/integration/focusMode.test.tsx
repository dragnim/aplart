/**
 * Focus mode, driven the way a person drives it.
 *
 * The claim these tests exist to hold up is that Focus mode is a change of
 * layout and not a second workspace: the same code, the same parameters, the
 * same drawn artwork, no execution, and nothing remounted. Most of the
 * assertions here are therefore about what does *not* happen.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { installFullscreenApi, removeFullscreenApi } from '../support/fullscreenApi';

/**
 * Chooses the layout, and stubs what jsdom does not implement.
 *
 * Per test rather than per suite: the workspace picks between two trees rather
 * than hiding one, so a stub that quietly disappeared between tests would run
 * the rest of a suite against the layout it was not written for — and still
 * pass often enough to look fine.
 */
function stubEnvironment(wide: boolean) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function serviceReturning(rows = 8) {
  const service = new MockAplExecutionService();
  service.register(
    'default',
    fromNested(
      Array.from({ length: rows }, (_, row) =>
        Array.from({ length: rows }, (_, column) => (row * column) % 5),
      ),
    ),
  );
  return service;
}

function renderWorkspace() {
  const service = serviceReturning();
  render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);
  return service;
}

/** The drawer and the bottom sheet are the same element under two layouts. */
function drawer() {
  const element = document.getElementById('focus-drawer');
  if (element === null) throw new Error('the controls drawer is not in the document');
  return element;
}

function enterFocus(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Focus mode' }));
}

describe('Focus mode on a wide screen', () => {
  beforeEach(() => stubEnvironment(true));

  it('replaces the ordinary header with the overlay bar', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByRole('link', { name: /Gallery/ })).toBeInTheDocument();
    await enterFocus(user);

    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
    // Navigation away is not offered while the artwork has the whole screen.
    expect(screen.queryByRole('link', { name: /Gallery/ })).not.toBeInTheDocument();
  });

  it('opens the drawer on arrival, so there is a visible way in', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await enterFocus(user);
    expect(drawer()).toHaveAttribute('data-drawer', 'open');
    expect(screen.getByRole('button', { name: 'Controls' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes and reopens the drawer without leaving Focus mode', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    await user.click(screen.getByRole('button', { name: 'Controls' }));
    expect(drawer()).toHaveAttribute('data-drawer', 'closed');
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Controls' }));
    expect(drawer()).toHaveAttribute('data-drawer', 'open');
  });

  it('takes the closed drawer out of the tab order', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    expect(drawer()).not.toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Controls' }));
    // Otherwise every slider behind the overlay is still reachable by Tab.
    expect(drawer()).toHaveAttribute('inert');
  });

  it('never marks the drawer inert outside Focus mode', () => {
    renderWorkspace();
    expect(drawer()).not.toHaveAttribute('inert');
  });

  describe('does not touch the calculation', () => {
    it('runs no APL when entering or leaving', async () => {
      const user = userEvent.setup();
      const service = renderWorkspace();

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      const runs = service.executionCount;

      await enterFocus(user);
      await user.click(screen.getByRole('button', { name: 'Exit focus' }));

      // Focus mode changes how the artwork is seen, never what was computed.
      expect(service.executionCount).toBe(runs);
    });

    it('keeps the drawn artwork, without redrawing it from nothing', async () => {
      const user = userEvent.setup();
      renderWorkspace();

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      const drawn = screen.getByRole('img');
      const describedAs = drawn.getAttribute('aria-label');

      await enterFocus(user);

      // The same DOM node, not an equivalent one: a remount would throw the
      // artwork away until the next run, and the editor's undo history with it.
      expect(screen.getByRole('img')).toBe(drawn);
      expect(screen.getByRole('img').getAttribute('aria-label')).toBe(describedAs);

      await user.click(screen.getByRole('button', { name: 'Exit focus' }));
      expect(screen.getByRole('img')).toBe(drawn);
    });

    it('carries edits made in the drawer back to the ordinary workspace', async () => {
      const user = userEvent.setup();
      const service = renderWorkspace();
      await enterFocus(user);

      fireEvent.change(screen.getByLabelText('Modulus'), { target: { value: '16' } });
      await user.click(screen.getByRole('button', { name: 'Exit focus' }));

      // One workspace, one set of edits.
      expect(screen.getByLabelText('Modulus')).toHaveValue('16');
      expect(screen.getByText('Edited')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      await waitFor(() => expect(service.received.length).toBeGreaterThan(0));
      expect(service.received[0]).toContain('modulus←16');
    });
  });

  describe('Escape', () => {
    it('closes the drawer before it leaves Focus mode', async () => {
      const user = userEvent.setup();
      renderWorkspace();
      await enterFocus(user);

      await user.keyboard('{Escape}');
      expect(drawer()).toHaveAttribute('data-drawer', 'closed');
      // Still in Focus mode: one press must not throw away two layers.
      expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('button', { name: 'Exit focus' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Gallery/ })).toBeInTheDocument();
    });

    it('closes an open menu without also unwinding Focus mode', async () => {
      const user = userEvent.setup();
      renderWorkspace();
      await enterFocus(user);
      await user.click(screen.getByRole('button', { name: 'Controls' }));

      await user.click(screen.getByRole('button', { name: 'Export' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      // The innermost layer is the menu. With the drawer already closed, an
      // Escape that reached the page handler as well would have thrown the
      // person out of Focus mode in the same keystroke.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
    });
  });

  describe('focus', () => {
    it('returns to the button that leads into Focus mode on exit', async () => {
      const user = userEvent.setup();
      renderWorkspace();
      await enterFocus(user);

      await user.click(screen.getByRole('button', { name: 'Exit focus' }));

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus mode' }));
      });
    });

    it('returns to the control that opened the drawer on close', async () => {
      const user = userEvent.setup();
      renderWorkspace();
      await enterFocus(user);

      const toggle = screen.getByRole('button', { name: 'Controls' });
      await user.click(toggle);
      await user.click(toggle);
      // Reopened, then closed from the drawer's own button.
      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Controls' }));
    });
  });
});

describe('browser fullscreen', () => {
  beforeEach(() => stubEnvironment(true));
  afterEach(() => removeFullscreenApi());

  it('is not offered when the browser will not do it', async () => {
    // No API installed at all, which is an iPhone.
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    // Focus mode is the fallback, and it already fills the window. A button
    // that cannot work is worse than no button.
    expect(screen.queryByRole('button', { name: /ullscreen/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
  });

  it('is offered inside Focus mode only', async () => {
    installFullscreenApi();
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument();
    await enterFocus(user);
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });

  it('takes the whole shell, so the controls come with it', async () => {
    const api = installFullscreenApi();
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));

    // The page, not the canvas: going fullscreen on the artwork alone would
    // leave the toolbar and the drawer on a screen nobody can see.
    const requested = api.requests[0];
    expect(requested).toBeDefined();
    expect(requested).toHaveAttribute('data-focus', 'true');
    expect(requested).toContainElement(screen.getByRole('button', { name: 'Exit focus' }));
  });

  it('offers the way back out once it is in', async () => {
    installFullscreenApi();
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    const leave = await screen.findByRole('button', { name: 'Leave fullscreen' });

    await user.click(leave);
    expect(await screen.findByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });

  it('follows the browser when fullscreen is left without being asked', async () => {
    const api = installFullscreenApi();
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await screen.findByRole('button', { name: 'Leave fullscreen' });

    act(() => api.leaveWithoutAsking());

    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
    // Fullscreen is a layer on top of Focus mode, so losing it leaves the rest.
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
  });

  it('leaves fullscreen when Focus mode is left', async () => {
    const api = installFullscreenApi();
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await screen.findByRole('button', { name: 'Leave fullscreen' });

    await user.click(screen.getByRole('button', { name: 'Exit focus' }));

    // Otherwise the ordinary workspace is left on a screen with no browser
    // chrome and no obvious way back.
    await waitFor(() => expect(api.isFullscreen()).toBe(false));
  });

  it('says so when the browser refuses, and changes nothing else', async () => {
    installFullscreenApi({ refuse: true });
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Focus mode still fills the window/);
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
  });

  it('leaves Escape to the browser while it is fullscreen', async () => {
    installFullscreenApi();
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await screen.findByRole('button', { name: 'Leave fullscreen' });

    await user.keyboard('{Escape}');

    /*
     * Escape is how fullscreen is left, and most browsers never deliver that
     * keystroke to the page at all. Unwinding a layer of our own as well would
     * mean one press did two things — and which two would differ by browser.
     */
    expect(drawer()).toHaveAttribute('data-drawer', 'open');
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeInTheDocument();
  });
});

describe('Focus mode on a narrow screen', () => {
  beforeEach(() => stubEnvironment(false));

  it('presents the controls as a bottom sheet, opened on arrival', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await enterFocus(user);
    expect(drawer()).toHaveAttribute('data-drawer', 'open');
  });

  it('leaves a handle to bring the sheet back', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await enterFocus(user);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(drawer()).toHaveAttribute('data-drawer', 'closed');

    // Two controls are named Controls here: the overlay bar's and the handle.
    const handle = screen
      .getAllByRole('button', { name: 'Controls' })
      .find((button) => button.getAttribute('aria-controls') === 'focus-drawer');
    expect(handle).toBeDefined();
    expect(handle).toHaveAttribute('data-drawer', 'closed');

    await user.click(handle as HTMLElement);
    expect(drawer()).toHaveAttribute('data-drawer', 'open');
    // Hidden while the sheet covers it, so it is not tabbable behind the panel.
    expect(handle).toHaveAttribute('data-drawer', 'open');
  });

  it('drops the artwork tab, because the artwork is the backdrop', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByRole('tab', { name: 'Artwork' })).toBeInTheDocument();
    await enterFocus(user);

    expect(screen.queryByRole('tab', { name: 'Artwork' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Controls' })).toBeInTheDocument();
  });

  it('brings the artwork tab back on leaving', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await enterFocus(user);
    await user.click(screen.getByRole('button', { name: 'Exit focus' }));

    expect(screen.getByRole('tab', { name: 'Artwork' })).toBeInTheDocument();
  });
});

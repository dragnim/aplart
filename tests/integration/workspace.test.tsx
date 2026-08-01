/**
 * The workspace, driven the way a person drives it.
 *
 * CodeMirror does not render meaningfully in jsdom, so these tests work
 * through the controls and assert on the state that reaches the renderer.
 * The editor itself is covered by the end-to-end journeys in a real browser.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';

// jsdom implements neither of these, and both run on mount.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Report the wide layout, so the editor, run controls and parameters are
  // all on the page at once rather than behind tabs.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

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

function renderWorkspace(service = serviceReturning()) {
  render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);
  return service;
}

describe('the workspace', () => {
  it('shows the artwork title and category', () => {
    renderWorkspace();
    expect(screen.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown artwork', () => {
    render(<WorkspacePage presetId="no-such-thing" sharedState={null} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We could not find that');
  });

  it('starts with nothing drawn and invites a run', () => {
    renderWorkspace();
    expect(screen.getByText('Press Run to draw this artwork.')).toBeInTheDocument();
  });

  it('draws the artwork when Run is pressed', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: /^Run/ }));

    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
    expect(screen.getByRole('img')).toHaveAccessibleName(/8 by 8 grid/);
  });

  it('describes the artwork for screen readers, including its palette', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: /^Run/ }));

    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAccessibleName(/Dyalog palette/);
    });
  });

  it('reports how long the run took', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: /^Run/ }));

    await waitFor(() => {
      expect(screen.getByText(/Finished in/)).toBeInTheDocument();
    });
  });

  describe('parameter controls', () => {
    it('renders one control per parameter, showing its current value', () => {
      renderWorkspace();
      expect(screen.getByLabelText('Size')).toHaveValue('64');
      expect(screen.getByLabelText('Modulus')).toHaveValue('17');
      expect(screen.getByLabelText('Multiplier')).toHaveValue('1');
    });

    it('marks the artwork as edited once a control is moved', async () => {
      renderWorkspace();
      expect(screen.getByText('Original')).toBeInTheDocument();

      // jsdom range inputs do not respond to arrow keys, so the change is
      // dispatched the way the browser would.
      fireEvent.change(screen.getByLabelText('Modulus'), { target: { value: '16' } });

      await waitFor(() => {
        expect(screen.getByText('Edited')).toBeInTheDocument();
      });
    });

    it('sends the changed value to the service on the next run', async () => {
      const user = userEvent.setup();
      const service = renderWorkspace();

      fireEvent.change(screen.getByLabelText('Modulus'), { target: { value: '16' } });
      await user.click(screen.getByRole('button', { name: /^Run/ }));

      await waitFor(() => {
        expect(service.received.length).toBeGreaterThan(0);
      });
      // The code that was executed carries the new value, not the default.
      expect(service.received[0]).toContain('modulus←16');
      expect(service.received[0]).not.toContain('modulus←17');
    });
  });

  describe('appearance', () => {
    it('recolours without re-running the APL', async () => {
      const user = userEvent.setup();
      const service = renderWorkspace();

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      const runsAfterFirst = service.executionCount;

      await user.click(screen.getByRole('radio', { name: /Poolrooms/ }));

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAccessibleName(/Poolrooms palette/);
      });
      // The whole point: changing a palette must not cost a request.
      expect(service.executionCount).toBe(runsAfterFirst);
    });

    it('reports the rotated dimensions after a quarter turn', async () => {
      const user = userEvent.setup();
      render(
        <WorkspacePage
          presetId={modularBloom.id}
          sharedState={null}
          service={(() => {
            const service = new MockAplExecutionService();
            service.register(
              'default',
              fromNested([
                [1, 2, 3],
                [4, 5, 6],
              ]),
            );
            return service;
          })()}
        />,
      );

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      await waitFor(() => expect(screen.getByRole('img')).toHaveAccessibleName(/2 by 3 grid/));

      await user.click(screen.getByRole('radio', { name: '90°' }));
      await waitFor(() => expect(screen.getByRole('img')).toHaveAccessibleName(/3 by 2 grid/));
    });
  });

  describe('failure', () => {
    it('shows a friendly message and keeps the previous artwork', async () => {
      const user = userEvent.setup();
      const service = serviceReturning();
      renderWorkspace(service);

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      const drawn = screen.getByRole('img').getAttribute('aria-label');

      // The next run fails.
      service.register('default', fromNested([[1]]));
      await user.click(screen.getByRole('button', { name: /^Run/ }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      // The artwork is still there, unchanged.
      expect(screen.getByRole('img').getAttribute('aria-label')).toBe(drawn);
    });

    it('offers to reset the code from the error panel', async () => {
      const user = userEvent.setup();
      const service = new MockAplExecutionService({
        cannedOutput: ['LENGTH ERROR', ' oops', '  ∧'],
      });
      renderWorkspace(service);

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      const alert = await screen.findByRole('alert');
      expect(
        within(alert).getByText(
          'The APL code could not be run. Check the highlighted expression and try again.',
        ),
      ).toBeInTheDocument();
      expect(within(alert).getByRole('button', { name: 'Reset code' })).toBeInTheDocument();
    });

    it('keeps the technical detail hidden until it is asked for', async () => {
      const user = userEvent.setup();
      renderWorkspace(new MockAplExecutionService({ cannedOutput: ['LENGTH ERROR', ' oops', '  ∧'] }));

      await user.click(screen.getByRole('button', { name: /^Run/ }));
      const alert = await screen.findByRole('alert');

      expect(screen.queryByText(/LENGTH ERROR/)).not.toBeInTheDocument();
      await user.click(within(alert).getByRole('button', { name: 'Details' }));
      expect(screen.getByText(/LENGTH ERROR/)).toBeInTheDocument();
    });
  });

  describe('shared links', () => {
    it('says the artwork was shared and waits rather than running it', async () => {
      const { encodeShareState } = await import('@/sharing/encodeShareState');
      const encoded = encodeShareState({
        v: 1,
        preset: modularBloom.id,
        code: 'size←16\nmodulus←3\nmultiplier←2\nmodulus|multiplier×∘.×⍨⍳size',
        params: {},
        palette: 'neon',
        render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
      });

      const service = serviceReturning();
      render(<WorkspacePage presetId={modularBloom.id} sharedState={encoded} service={service} />);

      expect(await screen.findByText(/shared with you/)).toBeInTheDocument();
      // Nothing is executed until the visitor asks for it.
      expect(service.executionCount).toBe(0);
      expect(screen.getByLabelText('Size')).toHaveValue('16');
      expect(screen.getByLabelText('Modulus')).toHaveValue('3');
    });

    it('detaches a control whose shared value is outside its range', async () => {
      // A slider cannot show 4 when its minimum is 8. Clamping would write the
      // clamped value back over code the sharer deliberately wrote, so the
      // control stands down instead.
      const { encodeShareState } = await import('@/sharing/encodeShareState');
      const encoded = encodeShareState({
        v: 1,
        preset: modularBloom.id,
        code: 'size←4\nmodulus←3\nmultiplier←1\nmodulus|multiplier×∘.×⍨⍳size',
        params: {},
        palette: 'neon',
        render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
      });

      render(<WorkspacePage presetId={modularBloom.id} sharedState={encoded} service={serviceReturning()} />);

      await screen.findByText(/shared with you/);
      expect(screen.queryByLabelText('Size')).not.toBeInTheDocument();
      expect(
        screen.getByText('The code sets this to something this control cannot show.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Restore control line' })).toBeInTheDocument();
    });

    it('explains a damaged link instead of failing silently', async () => {
      render(
        <WorkspacePage presetId={modularBloom.id} sharedState="not-valid" service={serviceReturning()} />,
      );
      expect(await screen.findByText(/could not be opened/)).toBeInTheDocument();
    });
  });
});

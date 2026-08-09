/**
 * What the artwork on screen can say about its repeated edges.
 *
 * Truchet's two arc motifs cross every edge at the same midpoint and
 * perpendicular to it, so any two arcs join without a gap or a kink. Its
 * diagonals arrive at a corner at an angle and cannot continue an arc. Which of
 * those is true depends on one assignment in the code, so the claim is
 * conditional — and it describes the result that ran, never the preset and never
 * the editor.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { fromNested } from '@/matrix/matrixTypes';
import { modularBloom } from '@/presets/modular-bloom';
import { truchetGrid } from '@/presets/truchet-grid';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { advanced, codeEditor, pressRunWith } from '../helpers/workspaceModes';

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
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...CANVAS,
    right: CANVAS.width,
    bottom: CANVAS.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

function classField(size: number, classes: number) {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) => (row * size + column) % classes),
    ),
  );
}

async function open(preset = truchetGrid.id) {
  const user = userEvent.setup();
  const service = new MockAplExecutionService();
  service.register('default', classField(8, 2));
  render(<WorkspacePage presetId={preset} sharedState={null} service={service} />);
  return { user, service };
}

async function run(user: ReturnType<typeof userEvent.setup>) {
  await pressRunWith(user);
  await waitFor(() => expect(screen.getByRole('img', { name: /grid/ })).toBeInTheDocument());
}

async function setClasses(value: number) {
  /*
   * Advanced's control, not Create's.
   *
   * Truchet now offers a curated "Tile shapes" as well as the raw parameter of
   * the same name, and they are two views of one assignment. The edge claim is a
   * statement about the exact class count, so it is the exact control this test
   * drives — and naming the mode is what stops the query matching both.
   */
  fireEvent.change(advanced().getByLabelText('Tile shapes'), { target: { value: String(value) } });
  await waitFor(() => expect(codeEditor().textContent).toContain(`classes←${String(value)}`));
}

const claim = () => screen.queryByText(/Seamless by construction|Edge continuity is not guaranteed/);

describe('the claim about repeated edges', () => {
  it('says nothing before a first run', async () => {
    await open();
    // There is no artwork to describe, and the editor is not one.
    expect(claim()).not.toBeInTheDocument();
  });

  it('is compatible after a run with two classes', async () => {
    const { user } = await open();
    await run(user);

    expect(screen.getByText('Seamless by construction')).toBeInTheDocument();
    expect(
      screen.getByText(/every available arc motif meets repeated edges at the same position and direction/),
    ).toBeInTheDocument();
  });

  it('does not follow the editor', async () => {
    /*
     * The rule this shares with the colouring range and the inspector's
     * wording: an unrun edit changes what the next run will be able to say and
     * nothing about the artwork on screen. Claiming continuity for an artwork
     * that has not been computed would be exactly the sort of statement this
     * whole feature exists to avoid making.
     */
    const { user } = await open();
    await run(user);
    expect(screen.getByText('Seamless by construction')).toBeInTheDocument();

    await setClasses(4);

    expect(screen.getByText('Seamless by construction')).toBeInTheDocument();
    expect(screen.queryByText('Edge continuity is not guaranteed')).not.toBeInTheDocument();
  });

  it('changes once the run with three or four classes finishes', async () => {
    const { user, service } = await open();
    await run(user);

    service.register('default', classField(8, 4));
    await setClasses(3);
    await run(user);

    expect(screen.getByText('Edge continuity is not guaranteed')).toBeInTheDocument();
    expect(
      screen.getByText(/Diagonal motifs can meet arc motifs at different positions and angles/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Seamless by construction')).not.toBeInTheDocument();

    await setClasses(4);
    await run(user);
    expect(screen.getByText('Edge continuity is not guaranteed')).toBeInTheDocument();
  });

  it('costs no execution of its own', async () => {
    const { user, service } = await open();
    await run(user);
    const before = service.executionCount;

    // Reading a number out of the code that already ran is not a reason to run
    // anything, and the claim appears without asking for one.
    expect(screen.getByText('Seamless by construction')).toBeInTheDocument();
    expect(service.executionCount).toBe(before);
  });

  it('adds no seamless control and leaves the APL alone', async () => {
    const { user } = await open();
    const code = codeEditor().textContent;
    await run(user);

    // The meaningful choice is already in the code as `classes`. Nothing here
    // adds a switch, and nothing here writes to the artwork.
    expect(screen.queryByLabelText(/seamless/i)).not.toBeInTheDocument();
    expect(codeEditor().textContent).toBe(code);
  });

  it('says nothing at all for a preset that has not proved anything', async () => {
    const { user } = await open(modularBloom.id);
    await run(user);

    // No claim is the default. A preset earns one by having its shapes checked.
    expect(claim()).not.toBeInTheDocument();
  });
});

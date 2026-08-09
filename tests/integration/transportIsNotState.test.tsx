/**
 * How an artwork was fetched is not part of what an artwork is.
 *
 * A banded run and a one-request run produce the same matrix, and the difference
 * between them belongs to the moment of fetching: it depends on the service's
 * caps and on what the numbers happened to print as, neither of which the person
 * who saved or shared the piece chose. Recording it would make it an input to a
 * later run — which is exactly how a preset-level `highResolution` flag came to
 * decide the transport for programs it knew nothing about.
 *
 * So these tests guard the absence of a thing. A saved project and a shared link
 * must carry the source, the controls and the appearance, and nothing about
 * requests, bands or resolution tiers.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAplExecutionService } from '@/execution/MockAplExecutionService';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';
import { decodeShareState } from '@/sharing/decodeShareState';
import { modularBloom } from '@/presets/modular-bloom';
import { WorkspacePage } from '@/workspace/WorkspacePage';
import { pressRunWith } from '../helpers/workspaceModes';

/**
 * Every word that would betray the transport, in the spellings a future change
 * would plausibly reach for.
 */
const TRANSPORT_WORDS = [
  'highResolution',
  'high-resolution',
  'outputLimits',
  'requestCount',
  'requests',
  'banded',
  'bands',
  'bandsDone',
  'maxOutputLines',
  'maxLineLength',
  'transport',
];

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

/** Tall enough that the result cannot print, so the run is genuinely banded. */
function tall(size: number): NumericMatrix {
  return fromNested(
    Array.from({ length: size }, (_unusedRow, row) =>
      Array.from({ length: size }, (_unusedColumn, column) => 1 + ((row * size + column) % 47)),
    ),
  );
}

function limitedService(matrix: NumericMatrix) {
  const service = new MockAplExecutionService({
    capabilities: { maxOutputLines: TRYAPL_CAPABILITIES.maxOutputLines },
  });
  service.register('default', matrix);
  return service;
}

async function runBandedArtwork() {
  const user = userEvent.setup();
  const service = limitedService(tall(128));
  render(<WorkspacePage presetId={modularBloom.id} sharedState={null} service={service} />);

  await pressRunWith(user);
  await waitFor(() => expect(screen.getByText(/Finished in/)).toBeInTheDocument(), { timeout: 5000 });

  // The premise of both tests: this really did take more than one request.
  expect(service.executionCount).toBeGreaterThan(1);
  return { user, service };
}

describe('a saved project, after a banded run', () => {
  it('records the artwork and nothing about how it was fetched', async () => {
    await runBandedArtwork();

    // Saves are debounced by 700 ms, so the record appears a moment after the run.
    await waitFor(
      () => {
        expect(Object.keys(localStorage).some((key) => key.startsWith('apl-art:project:'))).toBe(true);
      },
      { timeout: 4000 },
    );

    const stored = Object.keys(localStorage)
      .filter((key) => key.startsWith('apl-art:project:'))
      .map((key) => localStorage.getItem(key) ?? '');

    for (const record of stored) {
      // The source is there, which is what makes the absence below meaningful
      // rather than an empty record trivially passing.
      expect(record).toContain('modulus');
      for (const word of TRANSPORT_WORDS) {
        expect(record, `saved project mentions ${word}`).not.toContain(word);
      }
    }

    // The index too, in case a summary ever grew a field of its own.
    const index = localStorage.getItem('apl-art:projects') ?? '';
    expect(index).not.toBe('');
    for (const word of TRANSPORT_WORDS) {
      expect(index, `saved index mentions ${word}`).not.toContain(word);
    }
  });
});

describe('a shared link, after a banded run', () => {
  it('carries the source and the appearance, and no transport metadata', async () => {
    const { user } = await runBandedArtwork();

    // `navigator.clipboard` is a getter in jsdom, so it is defined over rather
    // than assigned to. Share's whole observable effect is what it writes there.
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

    await user.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(copied).not.toBe(''));

    const encoded = new URL(copied).hash.split('?s=')[1] ?? '';
    const shared = decodeShareState(encoded);
    expect(shared.ok).toBe(true);

    const payload = shared.ok ? shared.state : null;
    expect(payload?.code).toContain('modulus');

    /*
     * Checked as JSON rather than key by key, so a nested field would be caught
     * as well as a top-level one.
     */
    const json = JSON.stringify(payload);
    for (const word of TRANSPORT_WORDS) {
      expect(json, `shared state mentions ${word}`).not.toContain(word);
    }
  });
});

/**
 * Tests against the real TryAPL service.
 *
 * Run deliberately with `npm run test:live`. These are excluded from `npm test`
 * and from the required CI checks on purpose: a pull request must not fail
 * because a shared public service is momentarily busy.
 *
 * Their job is to catch the day TryAPL's behaviour changes underneath us.
 * Every assumption asserted here is one the adapter depends on and the README
 * documents, so a failure means the documentation and the code both need
 * revisiting — not that the test should be relaxed.
 */

import { describe, expect, it } from 'vitest';
import { TryAplExecutionService, TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { detectAplError } from '@/execution/errors';
import { runArtwork } from '@/execution/runArtwork';
import { parseMatrix } from '@/matrix/parseMatrix';
import { toNested } from '@/matrix/matrixTypes';
import { type MatrixLimits } from '@/matrix/validateMatrix';

const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';
const LIMITS: MatrixLimits = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };

function service() {
  return new TryAplExecutionService({ endpoint: ENDPOINT });
}

async function run(code: string) {
  return service().execute({ code, timeoutMs: 20_000, freshWorkspace: true });
}

/** Keeps our request rate polite between tests. */
async function pause() {
  await new Promise((resolve) => setTimeout(resolve, 600));
}

describe('the TryAPL protocol', () => {
  it('returns output lines for a simple expression', async () => {
    const result = await run('1+1');
    expect(result.outputLines).toEqual(['2']);
    await pause();
  });

  it('prints a matrix one row per line', async () => {
    const result = await run('3 3⍴⍳9');
    const parsed = parseMatrix(result.outputLines);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(toNested(parsed.matrix)).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]);
    }
    await pause();
  });

  it('accepts several statements joined with a diamond', async () => {
    // This is what flattenToExpression produces from multi-line preset source.
    const result = await run('size←5 ⋄ 9|∘.×⍨⍳size');
    expect(result.outputLines).toHaveLength(5);
    expect(result.outputLines[0]?.trim()).toBe('1 2 3 4 5');
    await pause();
  });

  it('writes negative numbers with an overbar', async () => {
    const result = await run('¯3+0.5×⍳4');
    expect(result.outputLines[0]?.trim()).toBe('¯2.5 ¯2 ¯1.5 ¯1');
    await pause();
  });

  it('reports APL errors with HTTP 200, as output rather than a status code', async () => {
    // The first statement prints before the second fails, so the error report
    // is not the first line of output.
    const result = await run('2 3⍴⍳6 ⋄ 1+');
    const detected = detectAplError(result.outputLines);
    expect(detected).not.toBeNull();
    expect(detected?.name).toMatch(/^SYNTAX ERROR/);
    expect(result.outputLines[0]?.trim()).toBe('1 2 3');
    await pause();
  });
});

describe('the limits the adapter is built around', () => {
  it('truncates output at the documented line cap', async () => {
    const result = await run('200 3⍴⍳7');
    expect(result.outputLines).toHaveLength(TRYAPL_CAPABILITIES.maxOutputLines);
    expect(result.warnings.join(' ')).toContain('lines');
    await pause();
  });

  it('truncates a long line at the documented length cap', async () => {
    const result = await run(',4096⍴⍳7');
    const longest = Math.max(...result.outputLines.map((line) => line.length));
    expect(longest).toBe(TRYAPL_CAPABILITIES.maxLineLength);
    await pause();
  });

  it('still refuses to widen the print width', async () => {
    // If this ever starts working, the banding machinery could be retired.
    const result = await run('⎕PW←1024 ⋄ 2 2⍴⍳4');
    expect(result.outputLines[0]).toContain('NOT SUPPORTED');
    await pause();
  });

  it('does not preserve variables between requests', async () => {
    // The whole reason banded reads re-execute instead of caching a variable.
    const subject = service();
    await subject.execute({ code: 'r←3 3⍴⍳9 ⋄ ⍴r', timeoutMs: 20_000, freshWorkspace: true });
    await pause();
    const second = await subject.execute({ code: '⍴r', timeoutMs: 20_000, freshWorkspace: true });
    expect(detectAplError(second.outputLines)).not.toBeNull();
    await pause();
  });
});

describe('the type probe', () => {
  it.each([
    ['3 3⍴⍳9', '2 1 83 3 3', 'a simple integer matrix'],
    ["2 3⍴'abcdef'", '2 1 80 2 3', 'a character matrix'],
    ['2 2⍴(1 2)(3 4)(5 6)(7 8)', '2 2 326 2 2', 'a nested matrix'],
    ['2 2⍴1J2 3J4 5 6', '2 1 1289 2 2', 'a complex matrix'],
  ])('reports %s as %s (%s)', async (expression, expected) => {
    const result = await run(`r←(${expression}) ⋄ (≢⍴r),(≡r),(⎕DR r),(⍴r)`);
    expect(result.outputLines[0]?.trim()).toBe(expected);
    await pause();
  });
});

describe('running a whole artwork', () => {
  it('draws a small artwork end to end in one request', async () => {
    const outcome = await runArtwork({
      service: service(),
      source: ['⍝ Controls', 'size←64', 'modulus←9', '', '⍝ Generate the artwork', 'modulus|∘.×⍨⍳size'].join(
        '\n',
      ),
      limits: LIMITS,
      timeoutMs: 20_000,
    });

    expect(outcome.matrix.rows).toBe(64);
    expect(outcome.matrix.columns).toBe(64);
    expect(outcome.requestCount).toBe(1);
    // A modulus of nine can only produce the residues zero to eight.
    expect(outcome.stats.min).toBeGreaterThanOrEqual(0);
    expect(outcome.stats.max).toBeLessThanOrEqual(8);
    await pause();
  });

  it('reassembles an artwork too large to print, in bands', async () => {
    const outcome = await runArtwork({
      service: service(),
      source: 'size←160\n9|∘.×⍨⍳size',
      limits: LIMITS,
      timeoutMs: 20_000,
    });

    expect(outcome.matrix.rows).toBe(160);
    expect(outcome.matrix.columns).toBe(160);
    expect(outcome.requestCount).toBeGreaterThan(1);

    // Verify the reassembly against the mathematics, not against itself:
    // cell (i, j) of this artwork is ((i+1) x (j+1)) mod 9.
    for (const [row, column] of [
      [0, 0],
      [3, 7],
      [80, 80],
      [159, 159],
    ] as const) {
      const expected = ((row + 1) * (column + 1)) % 9;
      expect(outcome.matrix.values[row * 160 + column]).toBe(expected);
    }
    await pause();
  }, 60_000);

  it('rejects a character result with a friendly message', async () => {
    await expect(
      runArtwork({
        service: service(),
        source: "size←3\nsize size⍴'abcdefghi'",
        limits: LIMITS,
        timeoutMs: 20_000,
      }),
    ).rejects.toMatchObject({ kind: 'invalidOutput' });
    await pause();
  });
});

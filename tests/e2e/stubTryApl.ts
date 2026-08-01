/**
 * Serves TryAPL's protocol from inside the browser test.
 *
 * The end-to-end journeys must be deterministic — CI cannot fail because a
 * public service is busy — but stubbing at the network boundary rather than
 * swapping in a mock service means the real `TryAplExecutionService` is still
 * the thing under test, wire format and all. No test-only code ships.
 */

import type { Page, Route } from '@playwright/test';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { PROBE_MARKER, formatBandReply, formatProbeReply } from '@/execution/transport';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';

export const EXEC_URL = 'https://tryapl.org/Exec';

export interface StubOptions {
  /** Milliseconds to hold the response, for exercising the loading state. */
  readonly delayMs?: number;
  /** Fail every request this way instead of answering. */
  readonly failure?: 'network' | 'server';
}

export interface StubHandle {
  /** Every expression the page has sent, in order. */
  readonly requests: string[];
}

/**
 * Evaluates the small subset of APL the presets actually use.
 *
 * `modulus|multiplier×∘.×⍨⍳size`, the Truchet hash and the Mandelbrot count —
 * between them enough to drive the whole interface, to prove a changed
 * parameter reaches the backend and changes the picture, to exercise the tile
 * renderer, which sizes its output from the matrix rather than one pixel per
 * cell, and to make a zoom actually show somewhere else.
 *
 * Returns a matrix rather than lines, because the reply has to be formatted
 * differently depending on whether the runner is probing for a shape or reading
 * a band of rows.
 */
function evaluate(expression: string): NumericMatrix | { readonly error: readonly string[] } {
  const read = (name: string): number | null => {
    const match = new RegExp(`${name}←(¯?\\d+)`, 'u').exec(expression);
    return match === null ? null : Number((match[1] as string).replace('¯', '-'));
  };

  /** As `read`, but accepts the fractional values the view assignments hold. */
  const readNumber = (name: string): number | null => {
    const match = new RegExp(`${name}←(¯?\\d+(?:\\.\\d+)?)`, 'u').exec(expression);
    return match === null ? null : Number((match[1] as string).replace('¯', '-'));
  };

  const size = read('size');
  const modulus = read('modulus');
  const multiplier = read('multiplier') ?? 1;

  /*
   * Mandelbrot Field.
   *
   * Written to follow the preset's own step function: the escape test uses the
   * values from the start of the step, both new parts are computed from the old
   * ones, and the magnitude is clamped the same way. It matters that this
   * responds to the view assignments rather than returning a fixed picture —
   * a zoom that changed nothing on screen would let a broken drag pass.
   */
  const iterations = read('iterations');
  const centreX = readNumber('centreX');
  const centreY = readNumber('centreY');
  const zoomSpan = readNumber('zoom');
  if (
    size !== null &&
    size > 1 &&
    iterations !== null &&
    centreX !== null &&
    centreY !== null &&
    zoomSpan !== null
  ) {
    const clamp = (value: number) => Math.max(-9, Math.min(9, value));
    const axis = (centre: number, index: number) => centre + zoomSpan * (-1 + (2 * index) / (size - 1));

    const rows: number[][] = [];
    for (let row = 0; row < size; row += 1) {
      const ci = axis(centreY, row);
      const values: number[] = [];
      for (let column = 0; column < size; column += 1) {
        const cr = axis(centreX, column);
        let zr = 0;
        let zi = 0;
        let count = 0;
        for (let step = 0; step < iterations; step += 1) {
          if (zr * zr + zi * zi < 4) count += 1;
          const nextR = clamp(cr + zr * zr - zi * zi);
          const nextI = clamp(ci + 2 * zr * zi);
          zr = nextR;
          zi = nextI;
        }
        values.push(count);
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  // Truchet Grid: density|⌊10000×1|(seed×0.6180339887)+(⍳size)∘.×(⍳size)×0.7548776662
  const density = read('density');
  const seed = read('seed');
  if (size !== null && density !== null && density !== 0 && seed !== null) {
    const offset = seed * 0.618_033_988_7;
    const rows: number[][] = [];
    for (let row = 1; row <= size; row += 1) {
      const values: number[] = [];
      for (let column = 1; column <= size; column += 1) {
        const product = offset + row * (column * 0.754_877_666_2);
        values.push(Math.floor(10_000 * (product - Math.floor(product))) % density);
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  if (size === null || modulus === null) {
    return { error: ['VALUE ERROR: Undefined name: size', ` ${expression}`, '  ∧'] };
  }
  if (modulus === 0) {
    return { error: ['DOMAIN ERROR', ` ${expression}`, '  ∧'] };
  }

  const rows: number[][] = [];
  for (let row = 1; row <= size; row += 1) {
    const values: number[] = [];
    for (let column = 1; column <= size; column += 1) {
      values.push((multiplier * row * column) % modulus);
    }
    rows.push(values);
  }
  return fromNested(rows);
}

/**
 * Formats a reply the way the backend would.
 *
 * The runner asks for a shape before reading a high-resolution artwork in
 * bands, and the same helpers the in-process mock uses are reused here so the
 * two cannot disagree about the wire format.
 */
function reply(expression: string): readonly string[] {
  const evaluated = evaluate(expression);
  if ('error' in evaluated) return evaluated.error;

  return expression.includes(PROBE_MARKER)
    ? formatProbeReply(evaluated)
    : formatBandReply(evaluated, expression, TRYAPL_CAPABILITIES);
}

export async function stubTryApl(page: Page, options: StubOptions = {}): Promise<StubHandle> {
  const requests: string[] = [];

  await page.route(EXEC_URL, async (route: Route) => {
    const body = route.request().postDataJSON() as unknown;
    const expression = Array.isArray(body) && typeof body[3] === 'string' ? body[3] : '';
    requests.push(expression);

    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    if (options.failure === 'network') {
      await route.abort('failed');
      return;
    }
    if (options.failure === 'server') {
      await route.fulfill({ status: 503, body: 'unavailable' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(['state-blob', 4834, 'blob', reply(expression)]),
    });
  });

  return { requests };
}

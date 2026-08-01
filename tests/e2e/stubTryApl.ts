/**
 * Serves TryAPL's protocol from inside the browser test.
 *
 * The end-to-end journeys must be deterministic — CI cannot fail because a
 * public service is busy — but stubbing at the network boundary rather than
 * swapping in a mock service means the real `TryAplExecutionService` is still
 * the thing under test, wire format and all. No test-only code ships.
 */

import type { Page, Route } from '@playwright/test';

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
 * `modulus|multiplier×∘.×⍨⍳size`, and the Truchet hash — between them enough to
 * drive the whole interface, to prove a changed parameter reaches the backend
 * and changes the picture, and to exercise the tile renderer, which sizes its
 * output from the matrix rather than one pixel per cell.
 */
function evaluate(expression: string): string[] {
  const read = (name: string): number | null => {
    const match = new RegExp(`${name}←(¯?\\d+)`, 'u').exec(expression);
    return match === null ? null : Number((match[1] as string).replace('¯', '-'));
  };

  const size = read('size');
  const modulus = read('modulus');
  const multiplier = read('multiplier') ?? 1;

  // Truchet Grid: density|⌊10000×1|(seed×0.6180339887)+(⍳size)∘.×(⍳size)×0.7548776662
  const density = read('density');
  const seed = read('seed');
  if (size !== null && density !== null && density !== 0 && seed !== null) {
    const offset = seed * 0.618_033_988_7;
    const lines: string[] = [];
    for (let row = 1; row <= size; row += 1) {
      const values: number[] = [];
      for (let column = 1; column <= size; column += 1) {
        const product = offset + row * (column * 0.754_877_666_2);
        values.push(Math.floor(10_000 * (product - Math.floor(product))) % density);
      }
      lines.push(values.join(' '));
    }
    return lines;
  }

  if (size === null || modulus === null) {
    return ['VALUE ERROR: Undefined name: size', ` ${expression}`, '  ∧'];
  }
  if (modulus === 0) {
    return ['DOMAIN ERROR', ` ${expression}`, '  ∧'];
  }

  const lines: string[] = [];
  for (let row = 1; row <= size; row += 1) {
    const values: number[] = [];
    for (let column = 1; column <= size; column += 1) {
      values.push((multiplier * row * column) % modulus);
    }
    lines.push(values.join(' '));
  }
  return lines;
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
      body: JSON.stringify(['state-blob', 4834, 'blob', evaluate(expression)]),
    });
  });

  return { requests };
}
